import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Service-role client. Server only — the browser never talks to Supabase (SPEC §6). */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase env missing");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

export type StoreStatus = "pending" | "generating" | "needs_input" | "ready" | "failed";

export interface StoreRow {
  id: string;
  slug: string;
  client_request_id: string;
  creator_ip_hash: string | null;
  edit_token_hash: string;
  status: StoreStatus;
  input: import("./input").StoreInput;
  follow_up: FollowUp | null;
  draft: import("@/lib/ai/schemas").TStoreContent | null;
  published: import("@/lib/ai/schemas").TStoreContent | null;
  published_at: string | null;
  has_unpublished_changes: boolean;
  gen_started_at: string | null;
  gen_attempts: number;
  model_used: string | null;
  created_at: string;
  updated_at: string;
  is_stale?: boolean;
}

/** needs_input covers both the follow-up question (S2b) and the "unclear" state (S2c). */
export type FollowUp =
  | { kind: "needs_more"; question: string; directions: string[]; round: number }
  | { kind: "unclear"; reason: string };

export async function logEvent(storeId: string, type: string, meta?: Record<string, unknown>) {
  const { error } = await db().from("events").insert({ store_id: storeId, type, meta: meta ?? null });
  if (error) console.error("logEvent failed", type, error.message);
}
