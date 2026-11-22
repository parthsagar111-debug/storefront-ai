// QA harness: results log, AI-call budget, API/DB helpers, rule checker. Never logs secrets.
import { config } from "dotenv";
config({ path: new URL("../../.env.local", import.meta.url).pathname, quiet: true });
import pg from "pg";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { chromium } from "playwright-core";

export const ROOT = new URL("../../", import.meta.url).pathname;
export const PROD = "https://storefront-ai-blush.vercel.app";
export const PREVIEW = process.env.QA_PREVIEW || "https://storefront-r23m7smyb-parth-pm.vercel.app";
// Preview protection-bypass secret: optional, kept outside the repo (QA_BYPASS_FILE). Production tests don't need it.
const BYPASS_FILE = process.env.QA_BYPASS_FILE ?? "";
const BYPASS = BYPASS_FILE && existsSync(BYPASS_FILE) ? readFileSync(BYPASS_FILE, "utf8").trim() : "";
export const SHOTS = ROOT + "qa/screenshots/";
const RESULTS = ROOT + "qa/results/results.jsonl";
const AI = ROOT + "qa/results/ai-calls.json";
const STORES = ROOT + "qa/results/stores.jsonl"; // slug + base + token hash prefix only (no raw tokens)
const PRIVATE = ROOT + "qa/PRIVATE_LINKS.md";
mkdirSync(SHOTS, { recursive: true });

export const headersFor = (base) => (base === PREVIEW ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-skip-toolbar": "1" } : {});
export const tok = () => randomBytes(24).toString("base64url");
export const sha = (s) => createHash("sha256").update(s).digest("hex");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const redact = (s) => String(s).replace(/\/edit\/[A-Za-z0-9_-]{32}/g, "/edit/<redacted>").replace(/[A-Za-z0-9_-]{32}(?=\/|"|$)/g, (m) => (/^[A-Za-z0-9_-]{32}$/.test(m) ? "<redacted>" : m));

// ---------- results ----------
let counts = { PASS: 0, FAIL: 0, BLOCKED: 0, "NOT RUN": 0 };
export function result(area, id, status, detail = "", evidence = "") {
  counts[status] = (counts[status] ?? 0) + 1;
  const line = { area, id, status, detail: redact(detail).slice(0, 600), evidence, at: new Date().toISOString() };
  appendFileSync(RESULTS, JSON.stringify(line) + "\n");
  console.log(`${status.padEnd(7)} ${id}  ${line.detail}`);
}
export const check = (area, id, cond, detail = "", evidence = "") => (result(area, id, cond ? "PASS" : "FAIL", detail, evidence), cond);
export const summary = () => console.log("\n" + JSON.stringify(counts));

// ---------- AI budget ----------
export function aiUsed() {
  return existsSync(AI) ? JSON.parse(readFileSync(AI, "utf8")).total : 0;
}
export function aiSpend(n, what) {
  const d = existsSync(AI) ? JSON.parse(readFileSync(AI, "utf8")) : { total: 0, log: [] };
  if (d.total + n > 40) throw new Error(`AI budget exceeded: ${d.total}+${n} > 40 (${what})`);
  d.total += n;
  d.log.push({ at: new Date().toISOString(), n, what });
  writeFileSync(AI, JSON.stringify(d, null, 2));
  return d.total;
}

// ---------- API ----------
export async function api(base, method, path, body, extraHeaders = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...headersFor(base), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
    cache: "no-store",
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text };
}

export async function settle(base, token, max = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    const { json } = await api(base, "GET", `/api/stores/${token}`);
    if (json && (!["pending", "generating"].includes(json.status) || json.isStale)) return { s: json, ms: Date.now() - t0 };
    await sleep(1500);
  }
  return { s: null, ms: max };
}

/** Create via API (1 AI call). Returns { token, slug, s, ms }. */
export async function createStore(base, input, what) {
  aiSpend(1, what);
  const token = tok();
  const t0 = Date.now();
  const r = await api(base, "POST", "/api/stores", { clientRequestId: randomUUID(), token, input });
  if (r.status !== 201) return { token, slug: null, s: null, ms: 0, status: r.status, body: r.json };
  const { s } = await settle(base, token);
  const ms = Date.now() - t0;
  remember(base, token, r.json.slug, what);
  return { token, slug: r.json.slug, s, ms, status: r.status };
}

export function remember(base, token, slug, what) {
  appendFileSync(STORES, JSON.stringify({ base: base === PROD ? "prod" : "preview", slug, what, tokenHash8: sha(token).slice(0, 8) }) + "\n");
}
export function privateLink(label, base, token, slug) {
  if (!existsSync(PRIVATE)) writeFileSync(PRIVATE, "# PRIVATE — edit links for kept QA stores. Git-ignored. Never commit.\n\n");
  appendFileSync(PRIVATE, `- ${label}: public ${base}/s/${slug} · edit ${base}/edit/${token}\n`);
}

// ---------- DB ----------
let client;
export async function db(sql, params = []) {
  if (!client) {
    client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
  }
  return (await client.query(sql, params)).rows;
}
export const dbEnd = () => client?.end();
export const storeRow = async (slug) => (await db("select * from stores where slug=$1", [slug]))[0];

// ---------- browser ----------
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
let browser;
export async function launch() {
  browser ??= await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  return browser;
}
export async function context(base, { width = 360, height = 800, mobile = true } = {}) {
  const b = await launch();
  const ctx = await b.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    userAgent: mobile ? ANDROID_UA : undefined,
    extraHTTPHeaders: headersFor(base),
  });
  const errors = [];
  ctx.on("page", (p) => {
    p.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 200)}`));
    p.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
    p.on("requestfailed", (r) => !/vercel-insights|_vercel/.test(r.url()) && errors.push(`requestfailed: ${redact(r.url())} ${r.failure()?.errorText}`));
    p.on("response", (r) => r.status() >= 500 && errors.push(`http ${r.status()}: ${redact(r.url())}`));
  });
  return { ctx, errors };
}
export const closeBrowser = () => browser?.close();
export async function shot(page, name, full = false) {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path, fullPage: full });
  return `qa/screenshots/${name}.png`;
}

// ---------- rule checker (§5.B) ----------
const TABLE = {
  ebook: { low: 149, typical: 299, high: 499 },
  template_pack: { low: 199, typical: 399, high: 699 },
  recorded_course: { low: 799, typical: 1499, high: 2499 },
  live_workshop: { low: 199, typical: 399, high: 799 },
  cohort_course: { low: 2499, typical: 4999, high: 7999 },
  one_on_one: { low: 299, typical: 699, high: 1499 },
  community: { low: 99, typical: 199, high: 399 },
};
const FIN = /\b(stocks?|share market|stock market|trading|invest\w*|mutual funds?|sip|crypto\w*|tax\w*|loans?|insurance)\b/i;
const HEALTH = /\b(fitness|fit|diet\w*|weight|nutrition\w*|yoga|pcos|pcod|diabet\w*|thyroid|therap\w*|mental health)\b/i;
export function ruleCheck(d, input) {
  const v = [];
  const ps = d.products ?? [];
  if (ps.length < 2 || ps.length > 4) v.push(`products=${ps.length}`);
  for (const p of ps) {
    if (!TABLE[p.format]) v.push(`bad format ${p.format}`);
    else if (p.priceSource !== "creator" && TABLE[p.format][p.tier] !== p.price) v.push(`price ${p.format}/${p.tier}=${p.price}≠${TABLE[p.format][p.tier]}`);
    if (/₹|\bRs\b|\d{3,}/.test(p.tierReason)) v.push(`tierReason has number/₹: "${p.tierReason}"`);
    if (p.whatYouGet?.length !== 3) v.push(`whatYouGet=${p.whatYouGet?.length}`);
    if (p.summary.length > 90) v.push(`summary ${p.summary.length}>90`);
  }
  if (new Set(ps.map((p) => p.format)).size !== ps.length) v.push("duplicate formats");
  if (new Set(ps.map((p) => p.title.toLowerCase())).size !== ps.length) v.push("duplicate titles");
  if (!ps.some((p) => p.price <= 499)) v.push("no product ≤ ₹499");
  const c = d.creator;
  if (c.bio.length < 60 || c.bio.length > 320) v.push(`bio length ${c.bio.length}`);
  if (c.headline.length < 8 || c.headline.length > 70) v.push(`headline length ${c.headline.length}`);
  const all = [c.headline, c.bio, ...ps.flatMap((p) => [p.title, p.summary, p.description, p.tierReason, ...p.whatYouGet])].join("\n");
  const src = [input.name, input.expertise, input.audience, input.outcome, input.direction ?? ""].join(" ");
  if (/\bguarantee(d|s)?\b/i.test(all)) v.push("banned: guaranteed");
  if (/\b100\s?%/.test(all)) v.push("banned: 100%");
  if (/\b(lakh|crore)s?\b/i.test(all) && /\b(earn|income|kamao)\b/i.test(all)) v.push("banned: lakh/crore earnings");
  if (/\bcertifi(ed|cation)\b/i.test(all) && !/\bcertifi(ed|cation)\b/i.test(src)) v.push("banned: certified");
  if (/\bSEBI\b/i.test(all) && !/\bSEBI\b/i.test(src)) v.push("banned: SEBI");
  const sensitive = FIN.test(src) ? "finance" : HEALTH.test(src) ? "health" : null;
  if (sensitive && !ps.every((p) => p.disclaimer)) v.push(`${sensitive} input but missing disclaimer`);
  if (input.language === "hinglish" && /[ऀ-ॿ]/.test(all)) v.push("Devanagari in Hinglish store");
  // v2 patterns (QA-03 backstory, QA-10 finance advice) — same as checkClaims in build-store.ts
  const srcL = src.toLowerCase().replace(/\s+/g, " ");
  for (const re of [/\bmy own (experience|journey|story)\b/gi, /\bas a (mother|mom|mum|doctor|nutritionist|certified|qualified)\b/gi, /\b\d+\+?\s*years?\b/gi])
    for (const m of all.matchAll(re)) if (!srcL.includes(m[0].toLowerCase().replace(/\s+/g, " "))) v.push(`backstory: "${m[0]}"`);
  if (d.sensitiveDomain === "finance")
    for (const re of [/\bportfolio (review|audit|check|advice)\b/i, /\bfeedback on your (stocks|portfolio|holdings)\b/i, /\bsafe stocks?\b/i, /\b(which|best) stocks? to buy\b/i, /\bbuy[ /-]sell (call|tip)s?\b/i, /\bmultibaggers?\b/i, /\bstock tips?\b/i, /\b(safe|safely|risk[- ]free|secure|guaranteed)\b(?:\W+\w+){0,4}?\W+(invest|investing|investments?|stocks?|returns)\b/i, /\b(invest|investing|investments?|stocks?|returns)\b(?:\W+\w+){0,4}?\W+(safe|safely|risk[- ]free|secure|guaranteed)\b/i]) {
      const m = all.match(re);
      if (m) v.push(`finance advice: "${m[0]}"`);
    }
  if (c.displayName !== input.name.trim().slice(0, 500)) v.push(`name not copied: "${c.displayName}"`);
  const ig = (input.instagramHandle || "").replace(/^@/, "") || undefined;
  if ((c.instagramHandle || undefined) !== ig) v.push(`instagram mismatch: ${c.instagramHandle} vs ${ig}`);
  return v;
}

export const qaInput = (o) => ({ audienceSize: "5k_20k", language: "en", ...o });
