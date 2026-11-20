import "server-only";
import { db, type StoreRow } from "./db";
import { isValidToken, tokenHash } from "./crypto";

/**
 * Every token route goes through here: format check, then lookup by sha256(token) (implementation check 3).
 * Returns null for a malformed or unknown token.
 */
export async function storeForToken(token: string): Promise<StoreRow | null> {
  if (!isValidToken(token)) return null;
  const { data, error } = await db().rpc("get_store_by_token_hash", { p_hash: tokenHash(token) });
  if (error) throw new Error("store lookup failed: " + error.message);
  return (data as StoreRow | null) ?? null;
}

/** What the editor sees. Never includes token hashes, IP hashes or the client request id. */
export function editorView(s: StoreRow) {
  return {
    slug: s.slug,
    status: s.status,
    isStale: Boolean(s.is_stale),
    followUp: s.follow_up,
    input: s.input,
    draft: s.draft,
    publishedAt: s.published_at,
    hasUnpublishedChanges: s.has_unpublished_changes,
    genStartedAt: s.gen_started_at,
    updatedAt: s.updated_at,
  };
}
export type EditorView = ReturnType<typeof editorView>;

export const notFound = () => Response.json({ error: "not_found" }, { status: 404 });
