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

/**
 * SPEC v5 V2 / PROMPTS v5 "Length enforcement in code": schema limits stay as they are. A text field over its
 * limit by up to 15% is trimmed at a word boundary (whole sentences first for prose); beyond that it is left
 * as is, so Zod fails the attempt (→ fallback model).
 */
export const OVER_LIMIT_TOLERANCE = 0.15;
export const TIER_REASON_MAX = 160;

const DANGLING = /(?:[\s,;:–—&/-]+|\s+(?:and|or|for|with|to|of|in|on|the|a|an|aur|ke|ki|ka|se|mein))+$/i;

/** Trim `text` to `max` chars when it is at most 15% over; prose keeps whole sentences when they fill ≥ 50%. */
export function fitText(text: string, max: number, prose: boolean): string {
  const s = text.trim().replace(/\s+/g, " ");
  if (s.length <= max || s.length > Math.floor(max * (1 + OVER_LIMIT_TOLERANCE))) return s;
  if (prose) {
    let out = "";
    for (const sentence of s.split(/(?<=[.!?])\s+/)) {
      const next = out ? `${out} ${sentence}` : sentence;
      if (next.length > max) break;
      out = next;
    }
    if (out.length >= max * 0.5) return out;
  }
  const room = prose ? max - 1 : max;
  let cut = s.slice(0, room + 1);
  cut = cut.slice(0, Math.max(cut.lastIndexOf(" "), 1));
  for (let prev = ""; prev !== cut; ) { prev = cut; cut = cut.replace(DANGLING, ""); }
  return prose ? cut.replace(/[.!?]$/, "") + "…" : cut;
}

/** Back-compat name used by tests: tierReason trimming under the same 15% rule. */
export const fitTierReason = (reason: string) => fitText(reason, TIER_REASON_MAX, true);

const LIMITS = { title: [60, false], summary: [90, true], description: [420, true], tierReason: [160, true] } as const;

/** Normalise model output before Zod (full generation, bio and single product): the 15% trim on every text field. */
export function normalizeModelOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;
  const fixProduct = (p: unknown) => {
    if (!p || typeof p !== "object") return;
    const q = p as Record<string, unknown>;
    for (const [k, [max, prose]] of Object.entries(LIMITS)) if (typeof q[k] === "string") q[k] = fitText(q[k] as string, max, prose);
    if (Array.isArray(q.whatYouGet)) q.whatYouGet = q.whatYouGet.map((w) => (typeof w === "string" ? fitText(w, 70, false) : w));
  };
  if (typeof r.headline === "string") r.headline = fitText(r.headline, 70, false);
  if (typeof r.bio === "string") r.bio = fitText(r.bio, 320, true);
  if (Array.isArray(r.directions)) r.directions = r.directions.map((d) => (typeof d === "string" ? fitText(d, 60, false) : d));
  if (Array.isArray(r.products)) r.products.forEach(fixProduct);
  fixProduct(r.product);
  return raw;
}

/** Parse the model's JSON into the Zod union (flat or union shape both accepted). */
export function parseGeneration(raw: unknown) {
  const r = GenerationResult.safeParse(normalizeFlat(normalizeModelOutput(raw)));
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
  // Round 2: "safe"-type wording within ~4 words of an investment word, in either order (PROMPTS v3 finance rule).
  /\b(safe|safely|risk[- ]free|secure|guaranteed)\b(?:\W+\w+){0,4}?\W+(invest|investing|investments?|stocks?|returns)\b/i,
  /\b(invest|investing|investments?|stocks?|returns)\b(?:\W+\w+){0,4}?\W+(safe|safely|risk[- ]free|secure|guaranteed)\b/i,
];

/** A negation shortly before a finance-advice phrase in the same clause: "no stock tips", "we don't give buy/sell calls or stock tips". */
/** Scope = same clause (no , . ; : ! ? in between), up to 6 words back. */
const NEGATION_BEFORE = /\b(no|not|never|without|zero|don'?t|do not|won'?t|isn'?t|aren'?t|bina)\b(?:[^\w,.;:!?]+[\w/'-]+){0,6}[^\w,.;:!?]*$/i;

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
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      for (const m of all.matchAll(g)) {
        // Round 3 eval: "no stock tips" / "without buy-sell calls" promise the opposite of advice → allowed.
        const before = all.slice(Math.max(0, m.index! - 40), m.index).toLowerCase();
        if (NEGATION_BEFORE.test(before)) continue;
        throw new CheckFailed(`finance advice: "${m[0]}"`);
      }
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

/**
 * Round 4 item 2: price reasons never quote a raw follower label. Each label (with or without "with" / "followers")
 * becomes natural words; "the creator's audience size" becomes "your audience". Capitalised at a sentence start.
 */
const LABEL_REWRITES: [RegExp, string][] = [
  [/\bhave no audience yet\b/gi, "are a new creator"],
  [/\bhas no audience yet\b/gi, "is a new creator"],
  [/\b(?:with\s+)?(?:an?\s+)?(?:audience\s+(?:size\s+)?(?:of\s+)?)?no audience yet\b/gi, "as a new creator"],
  [/\b(?:with\s+)?(?:an?\s+)?(?:audience\s+(?:size\s+)?(?:of\s+)?)?20\s*k\s*[–—-]\s*100\s*k(?:\s+followers)?/gi, "with an established following"],
  [/\b(?:with\s+)?(?:an?\s+)?(?:audience\s+(?:size\s+)?(?:of\s+)?)?100\s*k\s*\+(?:\s+followers)?/gi, "with an established following"],
  [/\b(?:with\s+)?(?:an?\s+)?(?:audience\s+(?:size\s+)?(?:of\s+)?)?5\s*k\s*[–—-]\s*20\s*k(?:\s+followers)?/gi, "with a growing following"],
  [/\b(?:with\s+)?(?:an?\s+)?(?:audience\s+(?:size\s+)?(?:of\s+)?)?under\s*5\s*k(?:\s+followers)?\b/gi, "with a small, early following"],
  [/\bthe creator(?:'|’)s audience size\b/gi, "your audience"],
];
export function rewriteAudienceLabels(reason: string): string {
  let out = reason;
  for (const [re, words] of LABEL_REWRITES)
    out = out.replace(re, (m: string, offset: number, whole: string) => {
      // After a preposition, "with a … following" reads as "for a … following".
      const prev = whole.slice(0, offset).match(/(\w+)\s*$/)?.[1]?.toLowerCase();
      let w = prev && ["for", "to", "at", "of", "on"].includes(prev) && words.startsWith("with ") ? words.slice(5) : words;
      if (/^[A-Z]/.test(m)) w = w[0].toUpperCase() + w.slice(1); // keep the original capitalisation
      return w;
    });
  return out.replace(/\s{2,}/g, " ");
}

/** Model product → stored product: new id, scrubbed reason, table price, coming soon, disclaimer. */
export function toStoredProduct(p: TModelProduct, domain: Domain): TProduct {
  return {
    ...p,
    tierReason: rewriteAudienceLabels(scrubTierReason(p.tierReason)),
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
 * SPEC v5 V2 / PROMPTS v5 §4: a set is valid when every format is unique, titles are distinct and at least
 * one product is an entry product (≤ ₹499).
 */
export function checkProductSet(products: TProduct[]) {
  checkDistinct(products);
  if (!products.some((x) => x.price <= ENTRY_MAX)) throw new CheckFailed("set: no entry product after replacement");
}

/**
 * Product regenerate: same checks as full generation (T25) — claims and tier mapping on the new product, then
 * the WHOLE set after replacement (unique formats, an entry product). No silent re-tiering: an invalid set fails
 * the attempt (→ fallback model); if that fails too, the route keeps the old product. New id (T20).
 */
export function acceptProduct(p: TModelProduct, input: StoreInput, store: TStoreContent, replaceId: string): TProduct[] {
  checkClaims(productTexts(p), input, store.sensitiveDomain);
  const fresh = toStoredProduct(p, store.sensitiveDomain);
  const next = store.products.map((x) => (x.id === replaceId ? fresh : x));
  checkProductSet(next);
  return next;
}

/**
 * Round 4 item 3: does any tierReason mention the buyer — the audience text, or a word from it longer than 3 letters
 * (a trailing plural "s" ignored)? Generic reasons fail the PRIMARY attempt only (→ fallback); the fallback's answer
 * is accepted either way (a store never fails over this). Each fire is logged.
 */
const NOT_BUYER_WORDS = new Set(["with", "from", "that", "their", "them", "they", "into", "about", "want", "wants", "your", "this", "those", "these", "who", "like"]);
export function reasonsMentionBuyer(reasons: string[], audience: string): boolean {
  const text = reasons.join(" ").toLowerCase();
  const aud = audience.trim().toLowerCase();
  if (aud && text.includes(aud)) return true;
  const words = (aud.match(/[a-z\u00C0-\u024F]+/g) ?? []).filter((w) => w.length > 3 && !NOT_BUYER_WORDS.has(w));
  return words.some((w) => new RegExp(`\\b${w.replace(/s$/, "")}`, "i").test(text));
}
export function checkBuyerInReasons(products: Pick<TModelProduct, "tierReason">[], input: StoreInput, primary: boolean, label = "generation") {
  if (reasonsMentionBuyer(products.map((p) => p.tierReason), input.audience)) return;
  if (primary) {
    console.warn(`[checks] generic tierReasons on primary (${label}) → fallback`);
    throw new CheckFailed("generic tier reasons: none mention the buyer");
  }
  console.warn(`[checks] generic tierReasons accepted on fallback (${label})`);
}

/** S2b: at most this many clarification rounds; after the last one, generation must return "ok". */
export const MAX_FOLLOW_UP_ROUNDS = 2;

export type GenOutcome =
  | { kind: "ok"; content: TStoreContent; genericReasons?: boolean }
  | { kind: "needs_more"; question: string; directions: string[] }
  | { kind: "unclear"; reason: string };

/**
 * Full-generation accept step. IQA-03: on the final round (`finalRound`), a needs_more answer is a failed
 * attempt (→ fallback model → Retry state), so a third question screen can never appear.
 */
export function acceptGeneration(raw: unknown, input: StoreInput, existing: TStoreContent | null, finalRound: boolean, primary = false): GenOutcome {
  const r = parseGeneration(raw);
  if (r.status === "ok") {
    const content = buildStoreContent(r, input, existing);
    checkBuyerInReasons(r.products, input, primary);
    // Logged in the generation_completed event (round 4 item 3: how often the fallback's generic reasons are kept).
    return { kind: "ok", content, genericReasons: !reasonsMentionBuyer(r.products.map((p) => p.tierReason), input.audience) };
  }
  if (r.status === "needs_more") {
    if (finalRound) throw new CheckFailed("needs_more after the last allowed follow-up round");
    return { kind: "needs_more", question: r.question, directions: r.directions };
  }
  return { kind: "unclear", reason: r.reason };
}

