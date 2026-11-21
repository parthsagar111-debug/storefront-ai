import { z } from "zod";
import { normalizeInstagram, HANDLE_RE } from "@/lib/instagram";
import type { CreatorInput } from "@/lib/ai/prompts";

export const AUDIENCE_SIZES = {
  none: "No audience yet",
  under_5k: "Under 5K followers",
  "5k_20k": "5K–20K followers",
  "20k_100k": "20K–100K followers",
  "100k_plus": "100K+ followers",
} as const;
export type AudienceSize = keyof typeof AUDIENCE_SIZES;

// SPEC S1 client check: block empty, < 2 chars, or one character repeated 5+ times. Everything else → model.
const answer = z
  .string()
  .trim()
  .min(2)
  .refine((s) => {
    const c = s.replace(/\s/g, "").toLowerCase();
    return !(c.length >= 5 && new Set(c).size === 1);
  }, "repeated")
  .transform((s) => s.slice(0, 500));

export const StoreInputSchema = z.object({
  name: answer,
  expertise: answer,
  audience: answer,
  outcome: answer,
  audienceSize: z.enum(Object.keys(AUDIENCE_SIZES) as [AudienceSize, ...AudienceSize[]]),
  language: z.enum(["en", "hinglish"]).default("en"),
  // QA-02: profile URLs, "@handle" and "handle" are all accepted and reduced to the handle.
  instagramHandle: z
    .string()
    .transform((s) => normalizeInstagram(s))
    .refine((s) => s === "" || HANDLE_RE.test(s), "invalid handle")
    .optional(),
  direction: z.string().trim().max(500).optional(),
});
export type StoreInput = z.infer<typeof StoreInputSchema>;

export function toCreatorInput(i: StoreInput): CreatorInput {
  return {
    name: i.name,
    expertise: i.expertise,
    audience: i.audience,
    outcome: i.outcome,
    audienceSize: AUDIENCE_SIZES[i.audienceSize],
    language: i.language,
    instagramHandle: i.instagramHandle || undefined,
    direction: i.direction || undefined,
  };
}
