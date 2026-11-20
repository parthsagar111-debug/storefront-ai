import "server-only";
import {
  GenerationResult,
  normalizeFlat,
  type TModelProduct,
  type TProduct,
  type TStoreContent,
} from "./schemas";
import { CheckFailed } from "./pipeline";
import { entryTiers, priceFor, ENTRY_MAX } from "@/lib/pricing";
import { newProductId } from "@/lib/server/crypto";
import type { StoreInput } from "@/lib/server/input";

type Ok = Extract<import("./schemas").TGenerationResult, { status: "ok" }>;

/** Parse the model's JSON into the Zod union (flat or union shape both accepted). */
export function parseGeneration(raw: unknown) {
  const r = GenerationResult.safeParse(normalizeFlat(raw));
  if (!r.success) throw new CheckFailed("zod: " + r.error.message.slice(0, 400));
  return r.data;
}

/** Unique formats + titles (SPEC §7.4). */
export function checkDistinct(products: TModelProduct[]) {
  if (new Set(products.map((p) => p.format)).size !== products.length) throw new CheckFailed("duplicate formats");
  if (new Set(products.map((p) => p.title.trim().toLowerCase())).size !== products.length)
    throw new CheckFailed("duplicate titles");
}

/**
 * Price products from the §7.5 table and enforce the ladder (D5): ≥ 1 product ≤ ₹499.
 * If none: move one entry-capable product to its highest entry-eligible tier. If no format can → attempt fails.
 */
export function priceAndLadder(products: TModelProduct[]): TProduct[] {
  const priced: TProduct[] = products.map((p) => ({
    ...p,
    id: newProductId(),
    price: priceFor(p.format, p.tier),
    priceSource: "ai_tier",
    availability: "coming_soon",
  }));
  if (!priced.some((p) => p.price <= ENTRY_MAX)) {
    const fix = priced.find((p) => entryTiers(p.format).length > 0);
    if (!fix) throw new CheckFailed("ladder: no entry-eligible format");
    const tiers = entryTiers(fix.format);
    fix.tier = tiers[tiers.length - 1];
    fix.price = priceFor(fix.format, fix.tier);
  }
  return priced;
}

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

/** Build the stored StoreContent: code sets ids, prices, availability, identity fields and theme. */
export function buildStoreContent(ok: Ok, input: StoreInput, existing?: TStoreContent | null): TStoreContent {
  checkDistinct(ok.products);
  const products = priceAndLadder(ok.products);
  return {
    creator: {
      displayName: input.name,
      headline: ok.headline,
      bio: ok.bio,
      instagramHandle: existing?.creator.instagramHandle ?? (input.instagramHandle || undefined),
      whatsapp: existing?.creator.whatsapp,
    },
    products,
    language: input.language,
    theme: existing?.theme ?? themeFor(input),
    sensitiveDomain: ok.sensitiveDomain,
  };
}
