import "server-only";
import { db } from "./db";
import { StoreContent, type TStoreContent } from "@/lib/ai/schemas";
import { normalizeIndianMobile } from "@/lib/whatsapp";

const HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

/** T6: store creation — max 5 per hashed IP per hour (best-effort, T13). */
export async function creationLimited(ipHash: string): Promise<boolean> {
  const { count } = await db()
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("creator_ip_hash", ipHash)
    .gt("created_at", HOUR_AGO());
  return (count ?? 0) >= 5;
}

/** T19: one shared limit for every LLM-triggering route — 30 per store per hour. */
export async function generationLimited(storeId: string): Promise<boolean> {
  const { count } = await db()
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .in("type", ["generation_started", "section_regenerated"])
    .gt("created_at", HOUR_AGO());
  return (count ?? 0) >= 30;
}

/** T3: public events — max 30 per hashed IP per store per hour. */
export async function publicEventsLimited(storeId: string, ipHash: string): Promise<boolean> {
  const { count } = await db()
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("ip_hash", ipHash)
    .gt("created_at", HOUR_AGO());
  return (count ?? 0) >= 30;
}

export const tooMany = () => Response.json({ error: "rate_limited" }, { status: 429 });

export type DraftError = { error: string; field?: string; productId?: string };

/** Full draft validation used by PATCH and publish: Zod + "Available now ⇒ WhatsApp" (T5). */
export function validateDraft(draft: unknown): { ok: true; draft: TStoreContent } | { ok: false; err: DraftError } {
  const r = StoreContent.safeParse(draft);
  if (!r.success) {
    const issue = r.error.issues[0];
    const path = issue.path;
    const productId =
      path[0] === "products" && typeof path[1] === "number"
        ? (draft as TStoreContent).products?.[path[1]]?.id
        : undefined;
    return { ok: false, err: { error: "invalid", field: path.slice(productId ? 2 : 0).join("."), productId } };
  }
  const d = r.data;
  if (d.creator.whatsapp && !normalizeIndianMobile(d.creator.whatsapp))
    return { ok: false, err: { error: "invalid_whatsapp", field: "creator.whatsapp" } };
  if (d.products.some((p) => p.availability === "available") && !d.creator.whatsapp)
    return { ok: false, err: { error: "whatsapp_required", field: "creator.whatsapp" } };
  return { ok: true, draft: d };
}

export async function storeCounts(storeId: string): Promise<{ views: number; products: Record<string, { interested: number; whatsapp: number }> }> {
  const { data } = await db().rpc("store_counts", { p_store: storeId });
  return data ?? { views: 0, products: {} };
}
