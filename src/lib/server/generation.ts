import "server-only";
import { db, logEvent, type StoreRow, type FollowUp } from "./db";
import { toCreatorInput } from "./input";
import { runWithFallback } from "@/lib/ai/pipeline";
import { parseGeneration, buildStoreContent } from "@/lib/ai/build-store";
import { GenerationResultUnionSchema, type TStoreContent } from "@/lib/ai/schemas";
import { systemPrompt, generationUserPrompt } from "@/lib/ai/prompts";

export const GENERATION_BUDGET_MS = 50_000;

/** Atomic claim (migration 0002). Returns the row only if this caller won. */
export async function claimGeneration(storeId: string): Promise<StoreRow | null> {
  const { data, error } = await db().rpc("claim_generation", { p_id: storeId });
  if (error) throw new Error("claim failed: " + error.message);
  return (data as StoreRow[])?.[0] ?? null;
}

type GenOutcome =
  | { kind: "ok"; content: TStoreContent }
  | { kind: "needs_more"; question: string; directions: string[] }
  | { kind: "unclear"; reason: string };

/**
 * Full generation for a store. Safe to call from several places at once: only the claim winner runs.
 * Scheduled with after() from POST /api/stores, /answer and /retry.
 */
export async function runGeneration(storeId: string, preClaimed?: StoreRow): Promise<void> {
  const store = preClaimed ?? (await claimGeneration(storeId));
  if (!store) {
    console.log("[gen] claim lost, another run is active", storeId);
    return;
  }
  const claimedAt = store.gen_started_at!;
  await logEvent(storeId, "generation_started", { attempt: store.gen_attempts });

  const input = store.input;
  const out = await runWithFallback<GenOutcome>({
    label: `generate ${store.slug}`,
    budgetMs: GENERATION_BUDGET_MS,
    system: systemPrompt(input.language),
    user: generationUserPrompt(toCreatorInput(input)),
    schema: GenerationResultUnionSchema,
    accept: (raw) => {
      const r = parseGeneration(raw);
      if (r.status === "ok") return { kind: "ok", content: buildStoreContent(r, input, store.draft) };
      if (r.status === "needs_more") return { kind: "needs_more", question: r.question, directions: r.directions };
      return { kind: "unclear", reason: r.reason };
    },
  });

  // Only the run that still holds the claim may write (guards against a stale run finishing late).
  const finish = (patch: Partial<StoreRow>) =>
    db().from("stores").update(patch).eq("id", storeId).eq("status", "generating").eq("gen_started_at", claimedAt);

  if (!out.ok) {
    await finish({ status: "failed" });
    await logEvent(storeId, "generation_failed", { attempts: out.attempts, latencyMs: out.latencyMs });
    return;
  }

  const { value, model, attempts, latencyMs } = out.result;
  if (value.kind === "ok") {
    await finish({ status: "ready", draft: value.content, follow_up: null, model_used: model });
    await logEvent(storeId, "generation_completed", { model, attempts, latencyMs });
  } else {
    const prevRound = store.follow_up?.kind === "needs_more" ? store.follow_up.round : 0;
    const follow_up: FollowUp =
      value.kind === "needs_more"
        ? { kind: "needs_more", question: value.question, directions: value.directions, round: prevRound + 1 }
        : { kind: "unclear", reason: value.reason };
    await finish({ status: "needs_input", follow_up, model_used: model });
    if (value.kind === "needs_more") await logEvent(storeId, "followup_shown", { round: follow_up.kind === "needs_more" ? follow_up.round : 0 });
    await logEvent(storeId, "generation_completed", { model, attempts, latencyMs, outcome: value.kind });
  }
}
