// Model benchmark with the exact production path: system prompt + generation prompt + union responseSchema
// → JSON → Zod → deterministic checks (buildStoreContent). Cooking persona, 3 calls per model.
// Stops a model early on a quota error to save free-tier requests.
// Run: npx tsx --conditions=react-server scripts/model-bench.ts model1 model2 ...
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { writeFileSync, mkdirSync } from "node:fs";
import { systemPrompt, generationUserPrompt } from "../src/lib/ai/prompts";
import { GenerationResultUnionSchema } from "../src/lib/ai/response-schemas";
import { parseGeneration, buildStoreContent } from "../src/lib/ai/build-store";
import { toCreatorInput, type StoreInput } from "../src/lib/server/input";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const input: StoreInput = {
  name: "Ananya Sharma",
  expertise: "Practical Indian vegetarian home cooking",
  audience: "Working professionals and beginners",
  outcome: "Tasty everyday meals without hours in the kitchen",
  audienceSize: "5k_20k",
  language: "hinglish",
};
const models = process.argv.slice(2);
const CALLS = 3;
mkdirSync("scripts/out", { recursive: true });
const rows: Record<string, string | number>[] = [];

// Same rule as production (src/lib/ai/gemini.ts): thinking "low" for 3.x Flash (non-lite); others keep their default.
const thinking = (m: string) => (/^gemini-3\.\d-flash$/.test(m) ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {});

for (const model of models) {
  const lat: number[] = [];
  let ok = 0, notes: string[] = [], saved = false;
  for (let i = 0; i < CALLS; i++) {
    const t0 = Date.now();
    try {
      const res = await ai.models.generateContent({
        model,
        contents: generationUserPrompt(toCreatorInput(input)),
        config: {
          systemInstruction: systemPrompt(input.language),
          temperature: 0.8,
          responseMimeType: "application/json",
          responseSchema: GenerationResultUnionSchema,
          ...thinking(model),
          abortSignal: AbortSignal.timeout(30_000),
          httpOptions: { timeout: 30_000, retryOptions: { attempts: 1 } },
        },
      });
      const ms = Date.now() - t0;
      const text = res.text ?? "";
      const r = parseGeneration(JSON.parse(text));
      if (r.status !== "ok") throw new Error(`status=${r.status}`);
      const store = buildStoreContent(r, input);
      lat.push(ms);
      ok++;
      notes.push(`ok ${ms}ms ${store.products.map((p) => `${p.format}/${p.tier}`).join(",")}`);
      if (!saved) {
        writeFileSync(`scripts/out/bench-${model}.json`, JSON.stringify(JSON.parse(text), null, 2));
        saved = true;
      }
    } catch (e) {
      const msg = String((e as Error).message);
      const code = (msg.match(/"code":(\d+)/) || [])[1] ?? (msg.includes("aborted") || msg.includes("timeout") ? "timeout" : "check");
      notes.push(`FAIL ${Date.now() - t0}ms ${code}: ${msg.replace(/\s+/g, " ").slice(0, 90)}`);
      if (code === "429" || code === "404") break; // quota / unavailable: don't burn more calls
    }
  }
  const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0;
  rows.push({ model, ok: `${ok}/${notes.length}`, avgMs: avg, minMs: lat.length ? Math.min(...lat) : 0, maxMs: lat.length ? Math.max(...lat) : 0 });
  console.log(`\n${model}\n  ${notes.join("\n  ")}`);
}
console.log();
console.table(rows);
