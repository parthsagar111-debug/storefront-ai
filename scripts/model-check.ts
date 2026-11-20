// Slice 0 / T10 model check: real calls to both Gemini models with the exact production schemas + PROMPTS.md text.
// Run: npx tsx scripts/model-check.ts   (reads .env.local)
import { config } from "dotenv";
config({ path: ".env.local" });
import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig, type Schema } from "@google/genai";
import type { ZodType } from "zod";
import {
  GenerationResult,
  BioResult,
  ProductResult,
  GenerationResultUnionSchema,
  GenerationResultFlatSchema,
  BioResultSchema,
  ProductResultSchema,
  normalizeFlat,
} from "../src/lib/ai/schemas";
import { systemPrompt, generationUserPrompt, bioUserPrompt, productUserPrompt, type CreatorInput } from "../src/lib/ai/prompts";
import { writeFileSync, mkdirSync } from "node:fs";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const PRIMARY = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const FALLBACK = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";

const cooking: CreatorInput = {
  name: "Ananya Sharma",
  expertise: "Practical Indian vegetarian home cooking",
  audience: "Working professionals and beginners",
  outcome: "Tasty everyday meals without hours in the kitchen",
  audienceSize: "5K–20K followers",
  language: "hinglish",
};

function cfg(model: string, schema: Schema): GenerateContentConfig {
  return {
    systemInstruction: systemPrompt(cooking.language),
    temperature: 0.8,
    httpOptions: { timeout: 60_000 },
    responseMimeType: "application/json",
    responseSchema: schema,
    ...(model === PRIMARY ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
  };
}

type Row = { model: string; op: string; ok: boolean; ms: number; note: string };
const rows: Row[] = [];
mkdirSync("scripts/out", { recursive: true });

async function call(model: string, op: string, schema: Schema, user: string, zod: ZodType, flat = false) {
  const t0 = Date.now();
  try {
    const res = await ai.models.generateContent({ model, contents: user, config: cfg(model, schema) });
    const ms = Date.now() - t0;
    const text = res.text ?? "";
    writeFileSync(`scripts/out/${model}.${op}.json`, text);
    let parsed: unknown = JSON.parse(text);
    if (flat) parsed = normalizeFlat(parsed);
    const z = zod.safeParse(parsed);
    rows.push({
      model,
      op,
      ok: z.success,
      ms,
      note: z.success ? `zod ok; modelVersion=${res.modelVersion ?? "?"}` : `ZOD FAIL: ${z.error.message.slice(0, 300)}`,
    });
    return { text, parsed: z.success ? z.data : parsed };
  } catch (e) {
    rows.push({ model, op, ok: false, ms: Date.now() - t0, note: `ERROR: ${String((e as Error).message).slice(0, 400)}` });
    return null;
  }
}

async function main() {
  for (const model of [PRIMARY, FALLBACK]) {
    const gen = await call(model, "generation-union", GenerationResultUnionSchema, generationUserPrompt(cooking), GenerationResult);
    await call(model, "generation-flat", GenerationResultFlatSchema, generationUserPrompt(cooking), GenerationResult, true);
    await call(
      model,
      "generation-needs_more",
      GenerationResultUnionSchema,
      generationUserPrompt({ ...cooking, expertise: "fitness", audience: "people", outcome: "get fit", language: "en" }),
      GenerationResult,
    );
    const store = gen?.parsed as { status?: string; products?: { title: string; format: string }[] } | undefined;
    const storeJson = JSON.stringify(gen?.parsed ?? {});
    await call(model, "bio", BioResultSchema, bioUserPrompt(cooking, storeJson), BioResult);
    if (store?.status === "ok" && store.products?.length) {
      const target = store.products[0];
      const used = store.products.slice(1).map((p) => p.format);
      await call(model, "product", ProductResultSchema, productUserPrompt(cooking, storeJson, target.title, used, true), ProductResult);
    } else {
      rows.push({ model, op: "product", ok: false, ms: 0, note: "skipped: no ok store to regenerate from" });
    }
  }
  console.table(rows);
}
main();
