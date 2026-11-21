import "server-only";
import { db, logEvent, type StoreRow, type FollowUp } from "./db";
import { toCreatorInput } from "./input";
import { runWithFallback } from "@/lib/ai/pipeline";
import { acceptGeneration, MAX_FOLLOW_UP_ROUNDS, type GenOutcome } from "@/lib/ai/build-store";
import { GenerationResultUnionSchema } from "@/lib/ai/response-schemas";
import { systemPrompt, generationUserPrompt } from "@/lib/ai/prompts";

export const GENERATION_BUDGET_MS = 50_000;

/** Atomic claim (migration 0002). Returns the row only if this caller won. */
export async function claimGeneration(storeId: string): Promise<StoreRow | null> {
  const { data, error } = await db().rpc("claim_generation", { p_id: storeId });
  if (error) throw new Error("claim failed: " + error.message);
  return (data as StoreRow[])?.[0] ?? null;
}


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
  // IQA-03: the creator has answered the last allowed follow-up round → the model must return "ok".
  const finalRound = store.follow_up?.kind === "needs_more" && store.follow_up.round >= MAX_FOLLOW_UP_ROUNDS && Boolean(input.direction);
  const out = await runWithFallback<GenOutcome>({
    label: `generate ${store.slug}`,
    budgetMs: GENERATION_BUDGET_MS,
    system: systemPrompt(input.language),
    user: generationUserPrompt(toCreatorInput(input), undefined, { finalRound }),
    schema: GenerationResultUnionSchema,
    accept: (raw, { primary }) => acceptGeneration(raw, input, store.draft, finalRound, primary),
  });

  // Only the run that still holds the claim may write (guards against a stale run finishing late).
  // IQA-05: report whether the row was really written, so events are only logged for writes that happened.
  const finish = async (patch: Partial<StoreRow>): Promise<"written" | "claim_lost" | "error"> => {
    const { data, error } = await db()
      .from("stores")
      .update(patch)
      .eq("id", storeId)
      .eq("status", "generating")
      .eq("gen_started_at", claimedAt)
      .select("id");
    if (error) {
      console.error("[gen] final write failed", storeId, error.message);
      return "error";
    }
    return data && data.length > 0 ? "written" : "claim_lost";
  };
  /** A failed final write: log it; on a DB error also mark the store failed (still claim-guarded) so the UI offers Retry. */
  const writeFailed = async (result: "claim_lost" | "error", meta: Record<string, unknown>) => {
    if (result === "error") {
      await db().from("stores").update({ status: "failed" }).eq("id", storeId).eq("status", "generating").eq("gen_started_at", claimedAt);
    }
    await logEvent(storeId, "generation_failed", { ...meta, reason: result === "error" ? "db_write" : "claim_lost" });
  };

  if (!out.ok) {
    const w = await finish({ status: "failed" });
    await logEvent(storeId, "generation_failed", { attempts: out.attempts, latencyMs: out.latencyMs, ...(w === "written" ? {} : { write: w }) });
    return;
  }

  const { value, model, attempts, latencyMs } = out.result;
  if (value.kind === "ok") {
    const w = await finish({ status: "ready", draft: value.content, draft_rev: (store.draft_rev ?? 0) + 1, follow_up: null, model_used: model });
    if (w !== "written") return writeFailed(w, { model, attempts, latencyMs });
    // Round 4 item 3: primary fires show up as a failed attempt "generic tier reasons…"; this marks the kept ones.
    await logEvent(storeId, "generation_completed", { model, attempts, latencyMs, genericReasonsKept: Boolean(value.genericReasons) });
  } else {
    const prevRound = store.follow_up?.kind === "needs_more" ? store.follow_up.round : 0;
    const follow_up: FollowUp =
      value.kind === "needs_more"
        ? { kind: "needs_more", question: value.question, directions: value.directions, round: prevRound + 1 }
        : { kind: "unclear", reason: value.reason };
    const w = await finish({ status: "needs_input", follow_up, model_used: model });
    if (w !== "written") return writeFailed(w, { model, attempts, latencyMs, outcome: value.kind });
    if (value.kind === "needs_more") await logEvent(storeId, "followup_shown", { round: follow_up.kind === "needs_more" ? follow_up.round : 0 });
    await logEvent(storeId, "generation_completed", { model, attempts, latencyMs, outcome: value.kind });
  }
}
