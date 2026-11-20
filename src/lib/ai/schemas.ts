// SPEC §7.2 — Zod is the source of truth. Gemini response schemas below mirror the model-filled fields only.
import { z } from "zod";
import { Type, type Schema } from "@google/genai";

export const FORMATS = [
  "ebook",
  "template_pack",
  "recorded_course",
  "live_workshop",
  "cohort_course",
  "one_on_one",
  "community",
] as const;
export const Format = z.enum(FORMATS);
export const Tier = z.enum(["low", "typical", "high"]);
export const SensitiveDomain = z.enum(["none", "finance", "health"]);

export const ModelProduct = z.object({
  title: z.string().min(4).max(60),
  format: Format,
  tier: Tier,
  tierReason: z.string().max(160),
  summary: z.string().min(10).max(90),
  description: z.string().min(40).max(420),
  whatYouGet: z.array(z.string().min(3).max(70)).length(3),
});

export const GenerationResult = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    headline: z.string().min(8).max(70),
    bio: z.string().min(60).max(320),
    sensitiveDomain: SensitiveDomain,
    products: z.array(ModelProduct).min(2).max(4),
  }),
  z.object({
    status: z.literal("needs_more"),
    question: z.string(),
    directions: z.array(z.string().max(60)).length(3),
  }),
  z.object({ status: z.literal("unclear"), reason: z.string() }),
]);

export const BioResult = z.object({
  headline: z.string().min(8).max(70),
  bio: z.string().min(60).max(320),
});

export const ProductResult = z.object({ product: ModelProduct });

export const Product = ModelProduct.extend({
  id: z.string(),
  price: z.number().int().min(49).max(99999),
  priceSource: z.enum(["ai_tier", "creator"]),
  availability: z.enum(["coming_soon", "available"]).default("coming_soon"),
  disclaimer: z.string().optional(),
});

export const StoreContent = z.object({
  creator: z.object({
    displayName: z.string(),
    headline: z.string(),
    bio: z.string(),
    instagramHandle: z.string().optional(),
    whatsapp: z.string().optional(),
  }),
  products: z.array(Product).min(2).max(4),
  language: z.enum(["en", "hinglish"]),
  theme: z.enum(["saffron", "teal", "plum", "indigo"]),
  sensitiveDomain: SensitiveDomain,
});

export type TModelProduct = z.infer<typeof ModelProduct>;
export type TGenerationResult = z.infer<typeof GenerationResult>;
export type TBioResult = z.infer<typeof BioResult>;
export type TProductResult = z.infer<typeof ProductResult>;
export type TProduct = z.infer<typeof Product>;
export type TStoreContent = z.infer<typeof StoreContent>;

// ---------- Gemini responseSchema (OpenAPI subset). Length limits are enforced by Zod, not here. ----------

const str = (description?: string): Schema => ({ type: Type.STRING, ...(description ? { description } : {}) });
const strEnum = (values: readonly string[]): Schema => ({ type: Type.STRING, format: "enum", enum: [...values] });

export const ModelProductSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: str("4 to 60 characters"),
    format: strEnum(FORMATS),
    tier: strEnum(["low", "typical", "high"]),
    tierReason: str("no prices, no ₹, no Rs, no numbers with 3+ digits"),
    summary: str("one line, up to 90 characters"),
    description: str("40 to 420 characters"),
    whatYouGet: { type: Type.ARRAY, items: str("a concrete deliverable"), minItems: "3", maxItems: "3" },
  },
  required: ["title", "format", "tier", "tierReason", "summary", "description", "whatYouGet"],
  propertyOrdering: ["title", "format", "tier", "tierReason", "summary", "description", "whatYouGet"],
};

/** Discriminated union as anyOf (preferred). */
export const GenerationResultUnionSchema: Schema = {
  anyOf: [
    {
      type: Type.OBJECT,
      properties: {
        status: strEnum(["ok"]),
        headline: str(),
        bio: str(),
        sensitiveDomain: strEnum(["none", "finance", "health"]),
        products: { type: Type.ARRAY, items: ModelProductSchema, minItems: "2", maxItems: "4" },
      },
      required: ["status", "headline", "bio", "sensitiveDomain", "products"],
      propertyOrdering: ["status", "headline", "bio", "sensitiveDomain", "products"],
    },
    {
      type: Type.OBJECT,
      properties: {
        status: strEnum(["needs_more"]),
        question: str(),
        directions: { type: Type.ARRAY, items: str("under 60 characters"), minItems: "3", maxItems: "3" },
      },
      required: ["status", "question", "directions"],
      propertyOrdering: ["status", "question", "directions"],
    },
    {
      type: Type.OBJECT,
      properties: { status: strEnum(["unclear"]), reason: str() },
      required: ["status", "reason"],
      propertyOrdering: ["status", "reason"],
    },
  ],
};

/** Flat fallback (PROMPTS.md §5): status + nullable fields; the union is enforced in Zod. */
export const GenerationResultFlatSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    status: strEnum(["ok", "needs_more", "unclear"]),
    reason: { ...str(), nullable: true },
    question: { ...str(), nullable: true },
    directions: { type: Type.ARRAY, items: str(), nullable: true },
    headline: { ...str(), nullable: true },
    bio: { ...str(), nullable: true },
    sensitiveDomain: { ...strEnum(["none", "finance", "health"]), nullable: true },
    products: { type: Type.ARRAY, items: ModelProductSchema, nullable: true },
  },
  required: ["status"],
  propertyOrdering: ["status", "reason", "question", "directions", "headline", "bio", "sensitiveDomain", "products"],
};

export const BioResultSchema: Schema = {
  type: Type.OBJECT,
  properties: { headline: str("8 to 70 characters"), bio: str("60 to 320 characters, first person") },
  required: ["headline", "bio"],
  propertyOrdering: ["headline", "bio"],
};

export const ProductResultSchema: Schema = {
  type: Type.OBJECT,
  properties: { product: ModelProductSchema },
  required: ["product"],
};

/** Strip nulls from the flat shape so Zod's discriminated union can validate it. */
export function normalizeFlat(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => v !== null));
}
