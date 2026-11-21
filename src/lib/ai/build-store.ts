import "server-only";
import { normalizeFlat } from "./response-schemas";
import {
  GenerationResult,
  type TModelProduct,
  type TProduct,
  type TStoreContent,
} from "./schemas";
import { CheckFailed } from "./pipeline";
import { entryTiers, priceFor, ENTRY_MAX } from "@/lib/pricing";
import { newProductId } from "@/lib/server/crypto";
import type { StoreInput } from "@/lib/server/input";

type Ok = Extract<import("./schemas").TGenerationResult, { status: "ok" }>;
type Domain = TStoreContent["sensitiveDomain"];

/** Parse the model's JSON into the Zod union (flat or union shape both accepted). */
export function parseGeneration(raw: unknown) {
  const r = GenerationResult.safeParse(normalizeFlat(raw));
  if (!r.success) throw new CheckFailed("zod: " + r.error.message.slice(0, 400));
  return r.data;
}

const inputText = (i: StoreInput) => [i.name, i.expertise, i.audience, i.outcome, i.direction ?? ""].join(" ");

// ---------- Deterministic checks (SPEC §7.4) ----------

/** Unique formats + titles. `others` = products kept from the current store (section regenerate). */
export function checkDistinct(products: Pick<TModelProduct, "format" | "title">[]) {
  if (new Set(products.map((p) => p.format)).size !== products.length) throw new CheckFailed("duplicate formats");
  if (new Set(products.map((p) => p.title.trim().toLowerCase())).size !== products.length)
    throw new CheckFailed("duplicate titles");
}

/** tierReason may not contain ₹ / Rs / 3+ digit numbers → those sentences are removed. */
export function scrubTierReason(reason: string): string {
  const bad = /₹|\bRs\.?\b|\bINR\b|\d{3,}|\d{1,3}(,\d{2,3})+/i;
  return reason
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !bad.test(s))
    .join(" ")
    .trim();
}

/**
 * Banned claims → the attempt fails. Catches obvious cases only; prompt rules + eval set carry the rest (T23).
 * "certified" / "SEBI" are allowed only when the creator's own input mentions them.
 */
/** QA-03: first-person backstory / credentials — fail unless the creator's input contains the same phrase. */
export const BACKSTORY_PATTERNS: RegExp[] = [
  /\bmy own (experience|journey|story)\b/gi,
  /\bas a (mother|mom|mum|doctor|nutritionist|certified|qualified)\b/gi,
  /\b\d+\+?\s*years?\b/gi,
];
/** QA-10: when the final domain is finance, these offers are advice, not education (SPEC §7.3). */
export const FINANCE_ADVICE_PATTERNS: RegExp[] = [
  /\bportfolio (review|audit|check|advice)\b/i,
  /\bfeedback on your (stocks|portfolio|holdings)\b/i,
  /\bsafe stocks?\b/i,
  /\b(which|best) stocks? to buy\b/i,
  /\bbuy[ /-]sell (call|tip)s?\b/i,
  /\bmultibaggers?\b/i,
  /\bstock tips?\b/i,
];

export function checkClaims(texts: string[], input: StoreInput, domain: Domain = "none") {
  const all = texts.join("\n");
  const src = inputText(input);
  const srcLower = src.toLowerCase().replace(/\s+/g, " ");
  for (const re of BACKSTORY_PATTERNS) {
    for (const m of all.matchAll(re)) {
      if (!srcLower.includes(m[0].toLowerCase().replace(/\s+/g, " "))) throw new CheckFailed(`invented backstory: "${m[0]}"`);
    }
  }
  if (domain === "finance") {
    for (const re of FINANCE_ADVICE_PATTERNS) {
      const m = all.match(re);
      if (m) throw new CheckFailed(`finance advice: "${m[0]}"`);
    }
  }
  const rules: [string, RegExp, boolean][] = [
    ["guaranteed", /\bguarantee(d|s)?\b/i, true],
    ["100%", /\b100\s?%|\bhundred percent\b/i, true],
    ["lakh/crore earnings", /\b(earn|earning|kamao|kamaye|income)\b[^.\n]{0,40}\b(lakh|lakhs|crore|crores)\b|\b(lakh|lakhs|crore|crores)\b[^.\n]{0,40}\b(earn|earning|kamao|kamaye|income)\b/i, true],
    ["certified", /\bcertifi(ed|cation)\b/i, !/\bcertifi(ed|cation)\b/i.test(src)],
    ["SEBI", /\bSEBI\b/i, !/\bSEBI\b/i.test(src)],
  ];
  for (const [name, re, active] of rules) if (active && re.test(all)) throw new CheckFailed(`banned claim: ${name}`);
}

const FINANCE = /\b(stocks?|share market|stock market|trading|trader|invest\w*|mutual funds?|sip|crypto\w*|tax\w*|loans?|insurance)\b/i;
const HEALTH = /\b(fitness|fit|diet\w*|weight|nutrition\w*|yoga|pcos|pcod|diabet\w*|thyroid|therap\w*|mental health)\b/i;

/** Final domain = model OR keyword match on the input (T8). Finance wins if both match. */
export function sensitiveDomain(model: Domain, input: StoreInput): Domain {
  const src = inputText(input);
  if (model === "finance" || FINANCE.test(src)) return "finance";
  if (model === "health" || HEALTH.test(src)) return "health";
  return "none";
}

export const DISCLAIMER: Record<Domain, string | undefined> = {
  finance: "For learning only. Not investment advice.",
  health: "For general wellness. Not medical advice.",
  none: undefined,
};

const productTexts = (p: TModelProduct) => [p.title, p.summary, p.description, p.tierReason, ...p.whatYouGet];

/** Model product → stored product: new id, scrubbed reason, table price, coming soon, disclaimer. */
export function toStoredProduct(p: TModelProduct, domain: Domain): TProduct {
  return {
    ...p,
    tierReason: scrubTierReason(p.tierReason),
    id: newProductId(),
    price: priceFor(p.format, p.tier),
    priceSource: "ai_tier",
    availability: "coming_soon",
    ...(DISCLAIMER[domain] ? { disclaimer: DISCLAIMER[domain] } : {}),
  };
}

/** Ladder (D5): ≥ 1 product ≤ ₹499; else move one entry-capable product to its highest entry tier; else fail. */
export function enforceLadder(products: TProduct[]): TProduct[] {
  if (products.some((p) => p.price <= ENTRY_MAX)) return products;
  const fix = products.find((p) => p.priceSource === "ai_tier" && entryTiers(p.format).length > 0);
  if (!fix) throw new CheckFailed("ladder: no entry-eligible format");
  const tiers = entryTiers(fix.format);
  fix.tier = tiers[tiers.length - 1];
  fix.price = priceFor(fix.format, fix.tier);
  return products;
}

/** Price ascending; equal prices keep the model's order. */
export const sortByPrice = (products: TProduct[]): TProduct[] =>
  products.map((p, i) => [p, i] as const).sort((a, b) => a[0].price - b[0].price || a[1] - b[1]).map(([p]) => p);

const THEME_KEYWORDS: [TStoreContent["theme"], RegExp][] = [
  ["teal", /fitness|yoga|diet|nutrition|health|wellness|gym|workout|weight/i],
  ["indigo", /stock|market|financ|invest|trading|money|tax|upsc|exam|career|coding|tech/i],
  ["plum", /astrolog|tarot|vedic|design|canva|art|music|fashion|beauty|makeup/i],
  ["saffron", /cook|recipe|food|kitchen|baking/i],
];

export function themeFor(input: StoreInput): TStoreContent["theme"] {
  const text = `${input.expertise} ${input.direction ?? ""}`;
  return THEME_KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "saffron";
}

/** Full generation / regenerate all → StoreContent. Creator identity fields always come from input/current store. */
export function buildStoreContent(ok: Ok, input: StoreInput, existing?: TStoreContent | null): TStoreContent {
  checkDistinct(ok.products);
  const domain = sensitiveDomain(ok.sensitiveDomain, input);
  checkClaims([ok.headline, ok.bio, ...ok.products.flatMap(productTexts)], input, domain);
  // QA-05: code-enforced order — cheapest → most premium, after the ladder repair (stable for equal prices).
  // Single-product regenerate (acceptProduct) keeps its slot and does not re-sort.
  const products = sortByPrice(enforceLadder(ok.products.map((p) => toStoredProduct(p, domain))));
  return {
    creator: {
      displayName: existing?.creator.displayName ?? input.name,
      headline: ok.headline,
      bio: ok.bio,
      instagramHandle: existing ? existing.creator.instagramHandle : input.instagramHandle || undefined,
      whatsapp: existing?.creator.whatsapp,
    },
    products,
    language: input.language,
    theme: existing?.theme ?? themeFor(input),
    sensitiveDomain: domain,
  };
}

/** Bio regenerate: claims check only (no prices involved). */
export function acceptBio(r: { headline: string; bio: string }, input: StoreInput, domain: Domain = "none") {
  checkClaims([r.headline, r.bio], input, domain);
  return r;
}

/**
 * Product regenerate: same checks as full generation (T25) — unique format/title vs the kept products,
 * claims, tier mapping, and the ladder across the whole store. New id (T20).
 */
export function acceptProduct(p: TModelProduct, input: StoreInput, store: TStoreContent, replaceId: string): TProduct[] {
  const others = store.products.filter((x) => x.id !== replaceId);
  checkDistinct([...others, p]);
  checkClaims(productTexts(p), input, store.sensitiveDomain);
  const fresh = toStoredProduct(p, store.sensitiveDomain);
  const next = store.products.map((x) => (x.id === replaceId ? fresh : x));
  if (!next.some((x) => x.price <= ENTRY_MAX)) {
    // The replaced product was the entry product: the new one must be entry-eligible itself.
    const tiers = entryTiers(fresh.format);
    if (!tiers.length) throw new CheckFailed("ladder: replacement not entry-eligible");
    fresh.tier = tiers[tiers.length - 1];
    fresh.price = priceFor(fresh.format, fresh.tier);
  }
  return next;
}

/** S2b: at most this many clarification rounds; after the last one, generation must return "ok". */
export const MAX_FOLLOW_UP_ROUNDS = 2;

export type GenOutcome =
  | { kind: "ok"; content: TStoreContent }
  | { kind: "needs_more"; question: string; directions: string[] }
  | { kind: "unclear"; reason: string };

/**
 * Full-generation accept step. IQA-03: on the final round (`finalRound`), a needs_more answer is a failed
 * attempt (→ fallback model → Retry state), so a third question screen can never appear.
 */
export function acceptGeneration(raw: unknown, input: StoreInput, existing: TStoreContent | null, finalRound: boolean): GenOutcome {
  const r = parseGeneration(raw);
  if (r.status === "ok") return { kind: "ok", content: buildStoreContent(r, input, existing) };
  if (r.status === "needs_more") {
    if (finalRound) throw new CheckFailed("needs_more after the last allowed follow-up round");
    return { kind: "needs_more", question: r.question, directions: r.directions };
  }
  return { kind: "unclear", reason: r.reason };
}

