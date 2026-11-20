import "server-only";
import { GoogleGenAI, ThinkingLevel, type Schema } from "@google/genai";

let ai: GoogleGenAI | null = null;
const client = () => (ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));

export const PRIMARY_MODEL = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const FALLBACK_MODEL = () => process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";

export interface ModelCall {
  model: string;
  system: string;
  user: string;
  schema: Schema;
  timeoutMs: number;
}

/**
 * One request, one attempt. The SDK's default is 5 retries with backoff (that caused a 180 s hang in slice 0);
 * our pipeline owns retries (primary → fallback), so the SDK must not retry.
 */
export async function callModel({ model, system, user, schema, timeoutMs }: ModelCall): Promise<string> {
  const isPrimary = model === PRIMARY_MODEL();
  const res = await client().models.generateContent({
    model,
    contents: user,
    config: {
      systemInstruction: system,
      temperature: 0.8,
      responseMimeType: "application/json",
      responseSchema: schema,
      // PROMPTS.md §5: thinking low on the 3.8 Flash primary; Flash-Lite keeps its default (minimal).
      ...(isPrimary && /3\.8-flash/.test(model) ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      abortSignal: AbortSignal.timeout(timeoutMs),
      httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } },
    },
  });
  const text = res.text;
  if (!text) throw new Error("empty response");
  return text;
}
