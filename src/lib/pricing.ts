// SPEC §7.5 (v5, V7) — deterministic pricing. The model picks format + tier; code sets the rupee price.
import type { FORMATS } from "@/lib/ai/schemas";

type Format = (typeof FORMATS)[number];
type Tier = "low" | "typical" | "high";

export const PRICE_TABLE: Record<Format, Record<Tier, number>> = {
  ebook: { low: 149, typical: 299, high: 499 },
  template_pack: { low: 199, typical: 399, high: 699 },
  recorded_course: { low: 799, typical: 1499, high: 2499 },
  live_workshop: { low: 199, typical: 399, high: 799 },
  cohort_course: { low: 2499, typical: 4999, high: 7999 },
  one_on_one: { low: 299, typical: 699, high: 1499 },
  community: { low: 99, typical: 199, high: 399 },
};

export const ENTRY_MAX = 499;
const TIERS: Tier[] = ["low", "typical", "high"];

/** SPEC §7.5 v5 "Entry-eligible tiers" column, written out (a unit test checks it agrees with the prices). */
export const ENTRY_TIERS: Record<Format, Tier[]> = {
  ebook: ["low", "typical", "high"],
  template_pack: ["low", "typical"],
  recorded_course: [],
  live_workshop: ["low", "typical"],
  cohort_course: [],
  one_on_one: ["low"],
  community: ["low", "typical", "high"],
};
export const TIER_ORDER: readonly Tier[] = TIERS;

/** Entry-eligible tiers (price ≤ ₹499) per format. */
export const entryTiers = (f: Format): Tier[] => ENTRY_TIERS[f];

export const priceFor = (f: Format, t: Tier) => PRICE_TABLE[f][t];

export const rangeFor = (f: Format) => ({ min: PRICE_TABLE[f].low, max: PRICE_TABLE[f].high });

export const FORMAT_LABEL: Record<Format, string> = {
  ebook: "Ebook",
  template_pack: "Template pack",
  recorded_course: "Recorded course",
  live_workshop: "Live workshop",
  cohort_course: "Cohort course",
  one_on_one: "1:1 session",
  community: "Community",
};

/** ₹ with Indian digit grouping, e.g. ₹1,999 / ₹1,49,999. */
export const formatINR = (n: number) => "₹" + n.toLocaleString("en-IN");
