// SPEC §7.5 — deterministic pricing. The model picks format + tier; code sets the rupee price.
import type { FORMATS } from "@/lib/ai/schemas";

type Format = (typeof FORMATS)[number];
type Tier = "low" | "typical" | "high";

export const PRICE_TABLE: Record<Format, Record<Tier, number>> = {
  ebook: { low: 149, typical: 299, high: 499 },
  template_pack: { low: 199, typical: 399, high: 699 },
  recorded_course: { low: 799, typical: 1499, high: 2499 },
  live_workshop: { low: 299, typical: 499, high: 999 },
  cohort_course: { low: 2499, typical: 4999, high: 7999 },
  one_on_one: { low: 499, typical: 999, high: 1999 },
  community: { low: 149, typical: 299, high: 599 },
};

export const ENTRY_MAX = 499;
const TIERS: Tier[] = ["low", "typical", "high"];

/** Entry-eligible tiers (price ≤ ₹499) per format, derived from the table. */
export const entryTiers = (f: Format): Tier[] => TIERS.filter((t) => PRICE_TABLE[f][t] <= ENTRY_MAX);

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
