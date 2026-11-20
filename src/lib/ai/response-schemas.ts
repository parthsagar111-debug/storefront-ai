// Gemini responseSchema objects (server only). Zod in ./schemas is the source of truth.
import "server-only";
import { Type, type Schema } from "@google/genai";
import { FORMATS } from "./schemas";

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
