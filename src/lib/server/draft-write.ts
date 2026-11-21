import "server-only";
import { db, type StoreRow } from "./db";
import type { TStoreContent } from "@/lib/ai/schemas";

/**
 * IQA-01 / QA-08: optimistic-concurrency draft writes.
 *
 * `apply` receives the LATEST draft and returns the new draft (or a Response to abort, e.g. 400/404).
 * The write is `UPDATE … SET draft_rev = draft_rev + 1 WHERE id = $1 AND draft_rev = $expected`.
 * If no row updates (someone else wrote first), re-read the latest draft and re-apply once.
 * If that also loses, return 409 so the UI can say "This store changed in another tab."
 */
export type DraftApply = (latest: TStoreContent, row: StoreRow) => TStoreContent | Response;

export const CHANGED_ELSEWHERE = { error: "changed_elsewhere", message: "This store changed in another tab. Refresh to see the latest." };
export const conflict = () => Response.json(CHANGED_ELSEWHERE, { status: 409 });

async function readRow(id: string): Promise<StoreRow | null> {
  const { data } = await db().from("stores").select("*").eq("id", id).maybeSingle<StoreRow>();
  return data;
}

export async function writeDraft(
  store: StoreRow,
  expectedRev: number,
  apply: DraftApply,
  extra: (draft: TStoreContent, row: StoreRow) => Partial<StoreRow> = (_d, row) => ({ has_unpublished_changes: Boolean(row.published) }),
): Promise<{ ok: true; draft: TStoreContent; draftRev: number; row: StoreRow } | { ok: false; response: Response }> {
  let row: StoreRow | null = store;
  let expected = expectedRev;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!row?.draft) return { ok: false, response: conflict() };
    const next = apply(structuredClone(row.draft), row);
    if (next instanceof Response) return { ok: false, response: next };
    const { data, error } = await db()
      .from("stores")
      .update({ draft: next, draft_rev: expected + 1, ...extra(next, row) })
      .eq("id", row.id)
      .eq("draft_rev", expected)
      .eq("status", "ready")
      .select("*")
      .maybeSingle<StoreRow>();
    if (error) return { ok: false, response: Response.json({ error: "server_error" }, { status: 500 }) };
    if (data) return { ok: true, draft: next, draftRev: expected + 1, row: data };
    // Lost the race: re-read the latest draft and re-apply the same change once.
    row = await readRow(store.id);
    if (!row || row.status !== "ready") return { ok: false, response: conflict() };
    expected = row.draft_rev;
  }
  return { ok: false, response: conflict() };
}
