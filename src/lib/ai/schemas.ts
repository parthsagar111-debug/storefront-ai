// SPEC §7.2 — Zod is the source of truth. Gemini response schemas below mirror the model-filled fields only.
import { z } from "zod";

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
  tierReason: z.string().max(200), // round 5b: trimmed to ≤ 200 in code, never fails for length
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
