// Unit checks for the deterministic rules (SPEC §7.4). Run: npx tsx --conditions=react-server scripts/checks-test.ts
import { scrubTierReason, checkClaims, sensitiveDomain, enforceLadder, toStoredProduct, checkDistinct, acceptProduct } from "../src/lib/ai/build-store";
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
console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exit(fail ? 1 : 0);
