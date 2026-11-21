import "server-only";
import type { Schema } from "@google/genai";
import { callModel, PRIMARY_MODEL, FALLBACK_MODEL } from "./gemini";

export class CheckFailed extends Error {}

export interface AttemptLog {
  model: string;
  ms: number;
  ok: boolean;
  error?: string;
}

export interface PipelineResult<T> {
  value: T;
  model: string;
  attempts: AttemptLog[];
  latencyMs: number;
}

/**
 * SPEC §7.4 time budget: attempt 1 = primary, timeout min(22 s, remaining);
 * attempt 2 = fallback, timeout = remaining − 3 s. Any failure (timeout, 429, 5xx, bad JSON, Zod, checks) → next attempt.
 * No third attempt, no JSON-repair call.
 */
export async function runWithFallback<T>(opts: {
  budgetMs: number;
  system: string;
  user: string;
  schema: Schema;
  /** Parse + validate + deterministic checks. Throw to fail the attempt. `primary` = attempt 1 (round 4 item 3). */
  accept: (raw: unknown, ctx: { primary: boolean }) => T;
  label: string;
}): Promise<{ ok: true; result: PipelineResult<T> } | { ok: false; attempts: AttemptLog[]; latencyMs: number }> {
  const t0 = Date.now();
  const remaining = () => opts.budgetMs - (Date.now() - t0);
  // Gemini rejects deadlines < 10 s (400 INVALID_ARGUMENT), so attempt 1 always leaves the fallback
  // ≥ 10 s + 3 s margin. Full generation (50 s): 22 s / ≤ 25 s. Section regenerate (30 s): 17 s / ≤ 10 s.
  const MIN_DEADLINE = 10_000;
  const plan = [
    { model: PRIMARY_MODEL(), timeout: () => Math.min(22_000, remaining() - MIN_DEADLINE - 3_000) },
    { model: FALLBACK_MODEL(), timeout: () => remaining() - 3_000 },
  ];
  const attempts: AttemptLog[] = [];

  // Demo switch (SPEC §7.4): 1 = attempt 1 fails (shows fallback), 2 = both fail (shows S2c).
  const forceFail = Number(process.env.FORCE_AI_FAIL || 0);

  for (const [i, step] of plan.entries()) {
    const timeoutMs = step.timeout();
    if (timeoutMs < MIN_DEADLINE) continue; // not enough time left for a valid Gemini deadline
    const a0 = Date.now();
    let text = "";
    try {
      if (forceFail >= i + 1) throw new Error(`FORCE_AI_FAIL=${forceFail}`);
      text = await callModel({ model: step.model, system: opts.system, user: opts.user, schema: opts.schema, timeoutMs });
      const value = opts.accept(JSON.parse(text), { primary: i === 0 });
      attempts.push({ model: step.model, ms: Date.now() - a0, ok: true });
      console.log(`[ai] ${opts.label} ok`, JSON.stringify({ model: step.model, attempts }));
      return { ok: true, result: { value, model: step.model, attempts, latencyMs: Date.now() - t0 } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      attempts.push({ model: step.model, ms: Date.now() - a0, ok: false, error: msg.slice(0, 300) });
      // PROMPTS.md §5: raw text on validation failure, server logs only.
      console.warn(`[ai] ${opts.label} attempt failed`, step.model, msg.slice(0, 300), text ? `raw=${text.slice(0, 2000)}` : "");
    }
  }
  console.warn(`[ai] ${opts.label} failed`, JSON.stringify(attempts));
  return { ok: false, attempts, latencyMs: Date.now() - t0 };
}
