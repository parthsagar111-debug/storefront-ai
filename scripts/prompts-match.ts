// Character-for-character check: prompts.ts output vs the code blocks in PROMPTS.md (v5). Run: npx tsx scripts/prompts-match.ts
import { readFileSync } from "node:fs";
import { systemPrompt, generationUserPrompt, bioUserPrompt, productUserPrompt, type CreatorInput } from "../src/lib/ai/prompts";

const md = readFileSync("PROMPTS.md", "utf8");
const blocks = [...md.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ""));
const [SYS, EN, HI, GEN, REGEN_ALL, BIO, PRODUCT] = blocks;
let fail = 0;
const eq = (name: string, a: string, b: string) => {
  if (a === b) return console.log(`PASS  ${name}`);
  fail++;
  let i = 0;
  while (a[i] === b[i]) i++;
  console.log(`FAIL  ${name} at char ${i}\n  code: ${JSON.stringify(a.slice(i - 40, i + 60))}\n  md:   ${JSON.stringify(b.slice(i - 40, i + 60))}`);
};
/** Render a PROMPTS.md template: {{#if x}}…{{/if}}, {{outcome or "…"}}, {{x}}; drop "  // …" annotations. */
function render(t: string, v: object): string {
  let s = t.replace(/ {2,}\/\/ (e\.g\.|added by).*$/gm, "");
  // An {{#if}} block that fills its line(s) (after "  " or "- ") disappears with its line when false.
  s = s.replace(/^( *(?:- )?)\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}(\n|$)/gm, (_m, pre, k, body, nl) => ((v as Record<string, unknown>)[k] ? pre + body + nl : ""));
  s = s.replace(/\n$/, "");
  s = s.replace(/\{\{outcome or "(.*?)"\}\}/g, (_m, d) => ((v as { outcome?: string }).outcome) || d);
  s = s.replace(/\{\{(\w+)\}\}/g, (_m, k) => String((v as Record<string, unknown>)[k] ?? ""));
  return s;
}
for (const lang of ["en", "hinglish"] as const) eq(`system ${lang}`, systemPrompt(lang), SYS.replace("{{LANGUAGE_BLOCK}}", lang === "en" ? EN : HI));

const base: CreatorInput = { name: "Asha", expertise: "Home cooking", audience: "Working professionals", outcome: "Cook in 20 minutes", audienceSize: "5K–20K followers", language: "en" };
const cases: [string, CreatorInput, { finalRound?: boolean }][] = [
  ["gen", base, {}],
  ["gen no outcome", { ...base, outcome: "" }, {}],
  ["gen direction", { ...base, direction: "Tiffin recipes" }, {}],
  ["gen direction finalRound", { ...base, direction: "Tiffin recipes" }, { finalRound: true }],
];
for (const [name, i, o] of cases) {
  const v = { ...i, direction: i.direction, finalRound: o.finalRound };
  eq(name, generationUserPrompt(i, undefined, o), render(GEN, v));
}
eq("regenerate all", generationUserPrompt(base, '{"x":1}'), render(GEN, base) + "\n\n" + render(REGEN_ALL, { currentStoreJson: '{"x":1}' }));
for (const hint of [undefined, "make it shorter"]) {
  eq(`bio hint=${hint ?? "none"}`, bioUserPrompt({ ...base, outcome: "" }, "{}", hint), render(BIO, { ...base, outcome: "", currentStoreJson: "{}", hint }));
  for (const mustBeEntry of [false, true])
    eq(`product entry=${mustBeEntry} hint=${hint ?? "none"}`, productUserPrompt(base, "{}", "Old title", ["ebook", "one_on_one"], mustBeEntry, hint),
      render(PRODUCT, { ...base, currentStoreJson: "{}", productTitle: "Old title", usedFormats: "ebook, one_on_one", mustBeEntry, hint }));
}
process.exit(fail ? 1 : 0);
