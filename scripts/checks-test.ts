// Unit checks for the deterministic rules (SPEC §7.4). Run: npx tsx --conditions=react-server scripts/checks-test.ts
import { scrubTierReason, checkClaims, sensitiveDomain, enforceLadder, toStoredProduct, checkDistinct, acceptProduct, buildStoreContent, acceptGeneration } from "../src/lib/ai/build-store";
import { generationUserPrompt } from "../src/lib/ai/prompts";
import { normalizeIndianMobile } from "../src/lib/whatsapp";
import { parseInstagram } from "../src/lib/instagram";
import type { StoreInput } from "../src/lib/server/input";
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
  t("ladder: workshop high → typical ₹499", ps[1].price === 499 && ps[1].tier === "typical", `${ps[1].tier} ${ps[1].price}`);
}
t("ladder: course + cohort fails", throws(() => enforceLadder([toStoredProduct(mp("recorded_course", "low"), "none"), toStoredProduct(mp("cohort_course", "low"), "none")])));
{
  const store: TStoreContent = { creator: { displayName: "A", headline: "h", bio: "b" }, language: "en", theme: "saffron", sensitiveDomain: "none",
    products: [toStoredProduct(mp("ebook", "low"), "none"), toStoredProduct(mp("recorded_course", "typical"), "none")] };
  const entryId = store.products[0].id;
  const next = acceptProduct(mp("one_on_one", "high"), input(), store, entryId);
  const fresh = next.find((p) => p.format === "one_on_one")!;
  t("product regen: entry replaced → forced entry tier", fresh.tier === "low" && fresh.price === 499, `${fresh.tier} ${fresh.price}`);
  t("product regen: new id (T20)", fresh.id !== entryId);
  t("product regen: other product untouched", next[1].id === store.products[1].id);
  t("product regen: used format rejected", throws(() => acceptProduct(mp("recorded_course", "low", "z"), input(), store, entryId)));
  t("product regen: entry-ineligible replacement fails", throws(() => acceptProduct(mp("cohort_course", "low", "q"), input(), store, entryId)));
}
// QA-05 product order: sorted by price after the ladder; product regenerate keeps its slot
{
  const ok = { status: "ok" as const, headline: "Headline here", bio: "b".repeat(80), sensitiveDomain: "none" as const,
    products: [mp("template_pack", "low", "a"), mp("recorded_course", "typical", "b"), mp("live_workshop", "high", "c")] }; // ₹199, ₹1,499, ₹999
  const s = buildStoreContent(ok, input());
  t("order: sorted cheapest → premium", s.products.map((p) => p.price).join(",") === "199,999,1499", s.products.map((p) => p.price).join(","));
  const tie = buildStoreContent({ ...ok, products: [mp("ebook", "typical", "x"), mp("community", "typical", "y"), mp("one_on_one", "typical", "z")] }, input());
  t("order: equal prices keep model order", tie.products.map((p) => p.format).join(",") === "ebook,community,one_on_one", tie.products.map((p) => p.format).join(","));
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
  t("rounds: final-round prompt forbids needs_more", /Do NOT return needs_more: return status "ok"/.test(generationUserPrompt(ci, undefined, { finalRound: true })));
  t("rounds: earlier rounds keep the normal instruction", /Only return needs_more if the input is still impossible/.test(generationUserPrompt(ci)));
}
// IQA-06 WhatsApp: letters rejected before normalising; separators allowed
for (const [raw, want] of [
  ["9876543210", "9876543210"], ["+91 98765 43210", "9876543210"], ["098765 43210", "9876543210"],
  ["(+91) 98765-43210", "9876543210"], ["+91-98765-43210", "9876543210"],
] as const) t(`whatsapp: "${raw}" → ${want}`, normalizeIndianMobile(raw) === want, String(normalizeIndianMobile(raw)));
for (const raw of ["abc9876543210xyz", "98765abcde", "9876543210x", "+91 98765 4321O", "98765.43210", "12345", "+1 415 555 2671", "5876543210"])
  t(`whatsapp: "${raw}" rejected`, normalizeIndianMobile(raw) === null, String(normalizeIndianMobile(raw)));
// QA-02 Instagram parsing
for (const [raw, want] of [
  ["https://instagram.com/qa.handle", "qa.handle"], ["https://www.instagram.com/qa_handle/", "qa_handle"],
  ["instagram.com/qa.handle?igsh=abc123", "qa.handle"], ["http://m.instagram.com/QA.Handle/#x", "QA.Handle"],
  ["@ananyas.kitchen", "ananyas.kitchen"], ["  ananyas.kitchen  ", "ananyas.kitchen"], ["", ""],
] as const) t(`instagram: "${raw}" → "${want}"`, parseInstagram(raw) === want, String(parseInstagram(raw)));
for (const raw of ["qa handle!", "@@qa", "qa#handle", "https://instagram.com/", "https://facebook.com/qa", "a".repeat(31)])
  t(`instagram: "${raw.slice(0, 32)}" rejected`, parseInstagram(raw) === null, String(parseInstagram(raw)));
console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exit(fail ? 1 : 0);
