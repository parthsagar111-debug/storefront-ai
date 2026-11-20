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
  /** Parse + validate + deterministic checks. Throw to fail the attempt. */
  accept: (raw: unknown) => T;
  label: string;
}): Promise<{ ok: true; result: PipelineResult<T> } | { ok: false; attempts: AttemptLog[]; latencyMs: number }> {
  const t0 = Date.now();
  const remaining = () => opts.budgetMs - (Date.now() - t0);
  const plan = [
    { model: PRIMARY_MODEL(), timeout: () => Math.min(22_000, remaining()) },
    { model: FALLBACK_MODEL(), timeout: () => remaining() - 3_000 },
  ];
  const attempts: AttemptLog[] = [];

  for (const step of plan) {
    const timeoutMs = step.timeout();
    if (timeoutMs < 2_000) break;
    const a0 = Date.now();
    let text = "";
    try {
      text = await callModel({ model: step.model, system: opts.system, user: opts.user, schema: opts.schema, timeoutMs });
      const value = opts.accept(JSON.parse(text));
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
