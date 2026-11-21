// Unit checks for the deterministic rules (SPEC §7.4). Run: npx tsx --conditions=react-server scripts/checks-test.ts
import { scrubTierReason, checkClaims, sensitiveDomain, enforceLadder, toStoredProduct, checkDistinct, acceptProduct, buildStoreContent, acceptGeneration, fitTierReason, parseGeneration, fitText, normalizeModelOutput, rewriteAudienceLabels, reasonsMentionBuyer, checkBuyerInReasons } from "../src/lib/ai/build-store";
import { generationUserPrompt } from "../src/lib/ai/prompts";
import { normalizeIndianMobile, waText, waLink } from "../src/lib/whatsapp";
import { parseInstagram } from "../src/lib/instagram";
import { PRICE_TABLE, ENTRY_TIERS, ENTRY_MAX, TIER_ORDER, rangeFor, formatINR } from "../src/lib/pricing";
import { FORMATS } from "../src/lib/ai/schemas";
import { StoreInputSchema, type StoreInput } from "../src/lib/server/input";
import type { TModelProduct, TStoreContent } from "../src/lib/ai/schemas";

let fail = 0;
const t = (name: string, cond: boolean, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name} ${extra}`); if (!cond) fail++; };
const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };
const input = (o: Partial<StoreInput> = {}): StoreInput => ({ name: "Asha", expertise: "home cooking", audience: "students", outcome: "cook fast", audienceSize: "5k_20k", language: "en", ...o });
const mp = (format: TModelProduct["format"], tier: TModelProduct["tier"], title: string = format): TModelProduct => ({ title: title + " title", format, tier, tierReason: "Fits.", summary: "A good summary line", description: "x".repeat(50), whatYouGet: ["aaa", "bbb", "ccc"] });

t("tierReason: ₹ sentence removed", scrubTierReason("Great depth. Priced at ₹499 for value.") === "Great depth.");
t("tierReason: Rs and 3-digit removed", scrubTierReason("Rs 299 is fair. It saves 120 minutes. Simple.") === "Simple.");
t("tierReason: clean kept", scrubTierReason("Short and practical. Good first buy.") === "Short and practical. Good first buy.");
t("claims: guaranteed fails", throws(() => checkClaims(["Guaranteed results"], input())));
t("claims: 100% fails", throws(() => checkClaims(["100% success"], input())));
t("claims: earn lakhs fails", throws(() => checkClaims(["Earn 2 lakh a month"], input())));
t("claims: SEBI fails when not in input", throws(() => checkClaims(["SEBI registered advisor"], input())));
t("claims: SEBI ok when in input", !throws(() => checkClaims(["SEBI registered advisor"], input({ expertise: "SEBI registered advisor" }))));
t("claims: clean passes", !throws(() => checkClaims(["Simple recipes for busy days"], input())));
t("domain: finance by keyword", sensitiveDomain("none", input({ expertise: "Stock market basics" })) === "finance");
t("domain: health by keyword", sensitiveDomain("none", input({ expertise: "Yoga for seniors" })) === "health");
t("domain: model wins", sensitiveDomain("health", input()) === "health");
t("domain: none", sensitiveDomain("none", input()) === "none");
t("disclaimer: finance", toStoredProduct(mp("ebook", "low"), "finance").disclaimer === "For learning only. Not investment advice.");
t("disclaimer: none", toStoredProduct(mp("ebook", "low"), "none").disclaimer === undefined);
t("price: ebook typical 299", toStoredProduct(mp("ebook", "typical"), "none").price === 299);
t("distinct: duplicate format fails", throws(() => checkDistinct([mp("ebook", "low", "a"), mp("ebook", "high", "b")])));
{
  const ps = [toStoredProduct(mp("recorded_course", "low"), "none"), toStoredProduct(mp("live_workshop", "high"), "none")];
  enforceLadder(ps);
  t("ladder: workshop high → typical ₹399", ps[1].price === 399 && ps[1].tier === "typical", `${ps[1].tier} ${ps[1].price}`);
}
t("ladder: course + cohort fails", throws(() => enforceLadder([toStoredProduct(mp("recorded_course", "low"), "none"), toStoredProduct(mp("cohort_course", "low"), "none")])));
{
  const store: TStoreContent = { creator: { displayName: "A", headline: "h", bio: "b" }, language: "en", theme: "saffron", sensitiveDomain: "none",
    products: [toStoredProduct(mp("ebook", "low"), "none"), toStoredProduct(mp("recorded_course", "typical"), "none")] };
  const entryId = store.products[0].id;
  // Round 3 item 3: the whole set is validated; no silent re-tiering of a non-entry replacement.
  t("product regen: replacing the only entry with one_on_one high → set invalid", throws(() => acceptProduct(mp("one_on_one", "high"), input(), store, entryId)));
  const next = acceptProduct(mp("one_on_one", "low"), input(), store, entryId);
  const fresh = next.find((p) => p.format === "one_on_one")!;
  t("product regen: one_on_one low (₹299) is a valid entry replacement", fresh.tier === "low" && fresh.price === 299, `${fresh.tier} ${fresh.price}`);
  t("product regen: community high (₹399) is a valid entry replacement", !throws(() => acceptProduct(mp("community", "high"), input(), store, entryId)));
  t("product regen: duplicate title rejected", throws(() => acceptProduct(mp("template_pack", "low", "recorded_course"), input(), store, entryId)));
  t("product regen: non-entry replacement fine when another entry remains", !throws(() => acceptProduct(mp("cohort_course", "high", "c2"), input(), { ...store, products: [...store.products, toStoredProduct(mp("template_pack", "low"), "none")] }, store.products[1].id)));
  t("product regen: new id (T20)", fresh.id !== entryId);
  t("product regen: other product untouched", next[1].id === store.products[1].id);
  t("product regen: used format rejected", throws(() => acceptProduct(mp("recorded_course", "low", "z"), input(), store, entryId)));
  t("product regen: entry-ineligible replacement fails", throws(() => acceptProduct(mp("cohort_course", "low", "q"), input(), store, entryId)));
}
// QA-05 product order: sorted by price after the ladder; product regenerate keeps its slot
{
  const ok = { status: "ok" as const, headline: "Headline here", bio: "b".repeat(80), sensitiveDomain: "none" as const,
    products: [mp("template_pack", "low", "a"), mp("recorded_course", "typical", "b"), mp("live_workshop", "high", "c")] }; // ₹199, ₹1,499, ₹799
  const s = buildStoreContent(ok, input());
  t("order: sorted cheapest → premium", s.products.map((p) => p.price).join(",") === "199,799,1499", s.products.map((p) => p.price).join(","));
  const tie = buildStoreContent({ ...ok, products: [mp("community", "high", "y"), mp("ebook", "typical", "x"), mp("one_on_one", "low", "z")] }, input()); // ₹399, ₹299, ₹299
  t("order: equal prices keep model order", tie.products.map((p) => p.format).join(",") === "ebook,one_on_one,community", tie.products.map((p) => p.format).join(","));
  const replaced = acceptProduct(mp("cohort_course", "typical", "new"), input(), s, s.products[1].id);
  t("order: product regenerate keeps its slot (no re-sort)", replaced[1].format === "cohort_course" && replaced.map((p) => p.price).join(",") === "199,4999,1499" && replaced[0].id === s.products[0].id, replaced.map((p) => p.price).join(","));
}
// IQA-03 follow-up rounds can't loop
{
  const nm = { status: "needs_more", question: "Fitness for whom?", directions: ["Home workouts for new moms", "Desk-worker fat loss", "Strength for beginners"] };
  t("rounds: needs_more allowed before the last round", acceptGeneration(nm, input({ direction: "fitness" }), null, false).kind === "needs_more");
  t("rounds: needs_more on the final round fails the attempt", throws(() => acceptGeneration(nm, input({ direction: "fitness" }), null, true)));
  t("rounds: unclear on the final round is still allowed", acceptGeneration({ status: "unclear", reason: "x" }, input(), null, true).kind === "unclear");
  const ci = { name: "A", expertise: "fitness", audience: "people", outcome: "fit", audienceSize: "Under 5K followers", language: "en" as const, direction: "Strength for beginners" };
  t("rounds: final-round prompt forbids needs_more", /This is the last clarification round\. You must return status "ok" using the chosen direction; do not return needs_more\./.test(generationUserPrompt(ci, undefined, { finalRound: true })));
  t("rounds: earlier rounds keep the normal instruction", /Only return needs_more if the input is still impossible/.test(generationUserPrompt(ci)));
}
// IQA-06 WhatsApp: letters rejected before normalising; separators allowed
for (const [raw, want] of [
  ["9876543210", "9876543210"], ["+91 98765 43210", "9876543210"], ["098765 43210", "9876543210"],
  ["(+91) 98765-43210", "9876543210"], ["+91-98765-43210", "9876543210"],
] as const) t(`whatsapp: "${raw}" → ${want}`, normalizeIndianMobile(raw) === want, String(normalizeIndianMobile(raw)));
for (const raw of ["abc9876543210xyz", "98765abcde", "9876543210x", "+91 98765 4321O", "98765.43210", "12345", "+1 415 555 2671", "5876543210"])
  t(`whatsapp: "${raw}" rejected`, normalizeIndianMobile(raw) === null, String(normalizeIndianMobile(raw)));
// QA-03 backstory patterns (positive + negative)
for (const [txt, inp] of [
  ["After my own experience postpartum, I help moms.", {}],
  ["My own journey taught me this.", {}],
  ["As a mother of two, I know the struggle.", {}],
  ["As a certified nutritionist I plan meals.", {}],
  ["I have 10 years of experience in yoga.", {}],
  ["Coaching for 5+ years now.", {}],
] as const) t(`backstory blocked: "${txt.slice(0, 40)}"`, throws(() => checkClaims([txt], input(inp))));
for (const [txt, inp] of [
  ["I have 10 years of experience in yoga.", { outcome: "I have taught for 10 years" }],
  ["As a mother of two, I cook for busy families.", { expertise: "Cooking, as a mother of two" }],
  ["Simple recipes for busy weeknights.", {}],
  ["A 4-week plan with 20 recipes.", {}],
  ["My journey with food started at home.", {}],
] as const) t(`backstory allowed: "${txt.slice(0, 40)}"`, !throws(() => checkClaims([txt], input(inp))));
// QA-10 finance advice patterns (only when the final domain is finance)
for (const txt of ["1-on-1 Portfolio Review Call", "Personalised feedback on your stocks", "Pick your first safe stock", "Which stocks to buy this year", "Daily buy/sell calls", "Find the next multibagger", "Weekly stock tips", "Portfolio audit session", "best stock to buy now", "buy-sell tips on WhatsApp"])
  t(`finance blocked: "${txt}"`, throws(() => checkClaims([txt], input({ expertise: "Stock market basics" }), "finance")));
for (const txt of ["How the stock market works", "Build a habit of investing small amounts", "Understand mutual funds and SIPs", "Read a company balance sheet", "Avoid common beginner traps"])
  t(`finance allowed: "${txt}"`, !throws(() => checkClaims([txt], input({ expertise: "Stock market basics" }), "finance")));
// Round 2: finance "safe"-type wording near investment words (both orders, ≤ ~4 words apart)
for (const txt of ["Safe Investing Concepts Workshop", "Start investing safely with small amounts", "safely invest your pocket money", "Risk-free returns every month", "secure investment options for students", "stocks that are completely safe", "Guaranteed returns on your SIP", "risk free stock picks", "Chote amounts se safely invest karo"])
  t(`finance safe-wording blocked: "${txt}"`, throws(() => checkClaims([txt], input({ expertise: "Stock market basics" }), "finance")));
for (const txt of ["Invest carefully, step by step, with a clear plan", "A safe space to ask your doubts", "Keep your demat login secure while you slowly learn about stocks", "Learn how the stock market works", "Build a budget before you start investing", "Returns are never certain; learn the risks"])
  t(`finance safe-wording allowed: "${txt}"`, !throws(() => checkClaims([txt], input({ expertise: "Stock market basics" }), "finance")));
t("safe-wording check inactive outside finance", !throws(() => checkClaims(["A safe home workout to invest 20 minutes in yourself"], input({ expertise: "Fitness" }), "health")));
t("finance patterns inactive outside finance", !throws(() => checkClaims(["Portfolio review of your design work"], input({ expertise: "Graphic design" }), "none")));
// Round 2: PROMPTS v3 tierReasons longer than SPEC's 160 chars are trimmed, not rejected
{
  const short = "A light starter guide for college students who are new to investing.";
  t("tierReason: short unchanged", fitTierReason(short) === short);
  const two = "A short PDF for college students who have never invested before and want the basics first. It is light reading that they can finish in one evening before class starts.";
  t("tierReason: keeps whole sentences ≤ 160", fitTierReason(two) === "A short PDF for college students who have never invested before and want the basics first." && fitTierReason(two).length <= 160, fitTierReason(two));
  const one = "This is a single very long sentence written for working professionals who cook after office hours and want a deeper weekly plan with shopping lists and prep timings and swaps";
  const f = fitTierReason(one);
  t("tierReason: one long sentence cut at a word with …", f.length <= 160 && f.endsWith("…") && one.startsWith(f.slice(0, -1)), `${f.length}: ${f}`);
  const raw = { status: "ok", headline: "Headline here", bio: "b".repeat(80), sensitiveDomain: "none",
    products: [{ ...mp("ebook", "low", "a"), tierReason: two + " " + two }, mp("template_pack", "low", "b")] };
  t("tierReason: > 15% over (300+ chars) fails the attempt (SPEC v5 V2)", throws(() => parseGeneration(raw)));
}
// Round 3 item 1: every text field ≤ 15% over its limit is trimmed at a word boundary; beyond that, Zod fails.
{
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i % 10}`).join(" ");
  const t66 = "Ghar Ka Khana in Twenty Minutes for Working Professionals Daily"; // 63 chars
  const ft = fitText(t66, 60, false);
  t("title 63/60 → word boundary, no …", ft.length <= 60 && t66.startsWith(ft) && !ft.endsWith(" ") && !/\bfor$/.test(ft), ft);
  t("title 70/60 (> 15%) unchanged → fails", fitText("x".repeat(70), 60, false).length === 70);
  const bio = "Main ghar ka simple khana sikhati hoon. Office ke baad bhi 20 minute mein dinner ready. " + words(40);
  const fb = fitText(bio.slice(0, 350), 320, true);
  t("bio 350/320 → ≤ 320, ends with …", fb.length <= 320 && fb.endsWith("…"), `${fb.length}`);
  const sent = "Short first sentence that is clear and long enough to keep here for the buyer reading it. " .repeat(3) + "Last bit.";
  const fs = fitText(sent.slice(0, 100), 90, true);
  t("summary ≤ 15% over keeps whole sentence when ≥ 50%", fs.length <= 90 && fs.endsWith("."), fs);
  t("exact limit unchanged", fitText("y".repeat(60), 60, false) === "y".repeat(60));
  const raw = { status: "ok", headline: "Cook dinner fast after a long day at the office, every day of the week now", bio: "b ".repeat(170).trim(), sensitiveDomain: "none",
    products: [{ ...mp("ebook", "low", "a"), summary: "A clear summary line for this product that runs a little bit over the ninety limit ok", whatYouGet: ["Weekly grocery list template with swaps for every single dish here", "bbb", "ccc"] }, mp("template_pack", "low", "b")] };
  normalizeModelOutput(raw);
  t("generation: headline/bio/summary/whatYouGet trimmed → parses", !throws(() => parseGeneration(raw)));
  t("directions trimmed to 60", (normalizeModelOutput({ status: "needs_more", question: "q", directions: ["Home workouts for new moms who have very little time each morning", "b", "c"] }) as { directions: string[] }).directions[0].length <= 60);
}
// QA-02 Instagram parsing
for (const [raw, want] of [
  ["https://instagram.com/qa.handle", "qa.handle"], ["https://www.instagram.com/qa_handle/", "qa_handle"],
  ["instagram.com/qa.handle?igsh=abc123", "qa.handle"], ["http://m.instagram.com/QA.Handle/#x", "QA.Handle"],
  ["@ananyas.kitchen", "ananyas.kitchen"], ["  ananyas.kitchen  ", "ananyas.kitchen"], ["", ""],
] as const) t(`instagram: "${raw}" → "${want}"`, parseInstagram(raw) === want, String(parseInstagram(raw)));
for (const raw of ["qa handle!", "@@qa", "qa#handle", "https://instagram.com/", "https://facebook.com/qa", "a".repeat(31)])
  t(`instagram: "${raw.slice(0, 32)}" rejected`, parseInstagram(raw) === null, String(parseInstagram(raw)));
// Round 3 item 2 (V7): SPEC §7.5 v5 price table, entry-eligibility map and the ladder rule
{
  const want: Record<string, [number, number, number]> = { ebook: [149, 299, 499], template_pack: [199, 399, 699], recorded_course: [799, 1499, 2499], live_workshop: [199, 399, 799], cohort_course: [2499, 4999, 7999], one_on_one: [299, 699, 1499], community: [99, 199, 399] };
  for (const f of FORMATS) {
    const row = PRICE_TABLE[f];
    t(`price table ${f} = ${want[f].join("/")}`, row.low === want[f][0] && row.typical === want[f][1] && row.high === want[f][2]);
    t(`entry map ${f} matches ≤ ₹${ENTRY_MAX}`, JSON.stringify(ENTRY_TIERS[f]) === JSON.stringify(TIER_ORDER.filter((x) => row[x] <= ENTRY_MAX)), ENTRY_TIERS[f].join(","));
    t(`prices ${f} end in 49/99`, [row.low, row.typical, row.high].every((n) => n % 100 === 49 || n % 100 === 99));
  }
  t("range shown: live_workshop ₹199–₹799", `${formatINR(rangeFor("live_workshop").min)}–${formatINR(rangeFor("live_workshop").max)}` === "₹199–₹799");
  t("range shown: one_on_one ₹299–₹1,499", `${formatINR(rangeFor("one_on_one").min)}–${formatINR(rangeFor("one_on_one").max)}` === "₹299–₹1,499");
  t("range shown: community ₹99–₹399", `${formatINR(rangeFor("community").min)}–${formatINR(rangeFor("community").max)}` === "₹99–₹399");
  // ladder: community high (₹399) is now itself an entry product
  const c = enforceLadder([toStoredProduct(mp("community", "high"), "none"), toStoredProduct(mp("cohort_course", "typical"), "none")]);
  t("ladder: community high counts as entry (no change)", c[0].tier === "high" && c[0].price === 399);
  // ladder: no entry product → live_workshop high moves to typical (₹399)
  const l = enforceLadder([toStoredProduct(mp("live_workshop", "high"), "none"), toStoredProduct(mp("recorded_course", "low"), "none")]);
  t("ladder: live_workshop high → typical ₹399", l[0].tier === "typical" && l[0].price === 399);
  // ladder: one_on_one typical (₹699) → low (₹299)
  const o = enforceLadder([toStoredProduct(mp("one_on_one", "typical"), "none"), toStoredProduct(mp("cohort_course", "low"), "none")]);
  t("ladder: one_on_one typical → low ₹299", o[0].tier === "low" && o[0].price === 299);
  t("ladder: recorded + cohort only → fails", throws(() => enforceLadder([toStoredProduct(mp("recorded_course", "low"), "none"), toStoredProduct(mp("cohort_course", "low"), "none")])));
}
// Round 3 item 4 (V1): the result is optional end to end
{
  const base = { name: "Asha", expertise: "Home cooking", audience: "New moms", audienceSize: "5k_20k", language: "en" };
  const a = StoreInputSchema.safeParse(base);
  t("input: missing result accepted", a.success && a.data.outcome === "");
  t("input: empty result accepted", StoreInputSchema.safeParse({ ...base, outcome: "  " }).success);
  t("input: audience still required", !StoreInputSchema.safeParse({ ...base, audience: "" }).success);
  t("prompt: missing result → 'not given' line", generationUserPrompt({ ...base, outcome: "", audienceSize: "5K–20K followers", language: "en" }).includes("What their audience gets from them: not given; infer a realistic result"));
}
// Round 3 item 8 (V6): WhatsApp prefill = title + price, in the store's language
t("wa buy en", waText("buy", "Ananya", "Tiffin Plan", 1499, "en") === 'Hi Ananya, I\'d like to buy "Tiffin Plan" (₹1,499).');
t("wa ask en", waText("ask", "Ananya", "Tiffin Plan", 299, "en") === 'Hi Ananya, I have a question about "Tiffin Plan" (₹299).');
t("wa buy hinglish", waText("buy", "Ananya", "Tiffin Plan", 1499, "hinglish") === 'Hi Ananya, mujhe "Tiffin Plan" (₹1,499) lena hai.');
t("wa ask hinglish", waText("ask", "Ananya", "Tiffin Plan", 299, "hinglish") === 'Hi Ananya, "Tiffin Plan" (₹299) ke baare mein ek sawaal hai.');
t("wa link encodes text + 91", waLink("9876543210", "A", "T", 199).startsWith("https://wa.me/919876543210?text=Hi%20A"));
// Round 3 eval finding: negated advice phrases are not advice
for (const txt of ["No stock tips, only concepts.", "We don't give buy/sell calls or stock tips", "Learn the basics without stock tips", "Koi stock tips nahi"])
  t(`finance negated allowed: "${txt}"`, txt === "Koi stock tips nahi" ? throws(() => checkClaims([txt], input({ expertise: "Stock market basics" }), "finance")) : !throws(() => checkClaims([txt], input({ expertise: "Stock market basics" }), "finance")));
for (const txt of ["Daily stock tips for you", "Get stock tips and multibaggers", "Invest your business savings safely", "No jargon, just safe stocks"])
  t(`finance still blocked: "${txt}"`, throws(() => checkClaims([txt], input({ expertise: "Stock market basics" }), "finance")));
// Round 4 item 2: raw audience labels in price reasons are rewritten
for (const [inp, want] of [
  ["With no audience yet, a small template pack makes it easy to buy.", "As a new creator, a small template pack makes it easy to buy."],
  ["A low price works because you have no audience yet.", "A low price works because you are a new creator."],
  ["With Under 5K followers, start low.", "With a small, early following, start low."],
  ["Priced low for an audience under 5k.", "Priced low for a small, early following."],
  ["With 5K–20K followers, this core product fits.", "With a growing following, this core product fits."],
  ["with 5k-20k this works", "with a growing following this works"],
  ["With 20K–100K followers, a premium tier works.", "With an established following, a premium tier works."],
  ["With 100K+ followers, a cohort fits.", "With an established following, a cohort fits."],
  ["Fits the creator's audience size and depth.", "Fits your audience and depth."],
  ["A light guide for working professionals.", "A light guide for working professionals."],
] as const) t(`labels: "${inp.slice(0, 40)}"`, rewriteAudienceLabels(inp) === want, rewriteAudienceLabels(inp));
t("labels: stored product gets the rewrite", toStoredProduct({ ...mp("ebook", "low"), tierReason: "With no audience yet, start small." }, "none").tierReason === "As a new creator, start small.");
// Round 4 item 3: generic price reasons fail the primary attempt only
t("buyer: audience word found", reasonsMentionBuyer(["A light guide for working people.", "Deep."], "Working professionals"));
t("buyer: plural ignored (fresher ← freshers)", reasonsMentionBuyer(["Built for a fresher's first job hunt."], "Freshers looking for their first job"));
t("buyer: full audience text", reasonsMentionBuyer(["Great for small business owners."], "Small business owners"));
t("buyer: generic reasons → false", !reasonsMentionBuyer(["A low price point is perfect for followers.", "Better value for the audience."], "Working professionals"));
t("buyer: short words (≤ 3 letters) don't count", !reasonsMentionBuyer(["Good for new users."], "New moms"));
t("buyer: primary throws", throws(() => checkBuyerInReasons([{ tierReason: "A low price is easy." }], input({ audience: "Working professionals" }), true)));
t("buyer: fallback accepts", !throws(() => checkBuyerInReasons([{ tierReason: "A low price is easy." }], input({ audience: "Working professionals" }), false)));
{
  const ok = { status: "ok", headline: "Headline here", bio: "b".repeat(80), sensitiveDomain: "none", products: [mp("ebook", "low", "a"), mp("template_pack", "low", "b")] };
  t("acceptGeneration: generic on primary fails", throws(() => acceptGeneration(structuredClone(ok), input({ audience: "Working professionals" }), null, false, true)));
  t("acceptGeneration: generic on fallback ok", !throws(() => acceptGeneration(structuredClone(ok), input({ audience: "Working professionals" }), null, false, false)));
}
console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exit(fail ? 1 : 0);
