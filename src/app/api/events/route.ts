import { z } from "zod";
import { db } from "@/lib/server/db";
import { ipHash } from "@/lib/server/crypto";
import { publicEventsLimited } from "@/lib/server/rules";
import type { TStoreContent } from "@/lib/ai/schemas";

const Body = z.object({
  slug: z.string().min(3).max(80),
  type: z.enum(["store_viewed", "interest_tapped", "whatsapp_tapped"]),
  productId: z.string().max(40).optional(),
  visitorId: z.string().min(8).max(64), // required for all three (T4, T24)
});

const ignored = () => new Response(null, { status: 204 });

/**
 * Public events (SPEC §9, T18, T21, T3). Anything invalid is ignored with 204 so the page never breaks:
 * store must be published; product must exist in the PUBLISHED snapshot; interest only for Coming soon;
 * WhatsApp only when the store has a number; max 30 per hashed IP per store per hour; duplicates
 * dropped by the unique indexes.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { slug, type, productId, visitorId } = parsed.data;
  if (type !== "store_viewed" && !productId) return Response.json({ error: "product_required" }, { status: 400 });

  const { data: store } = await db()
    .from("stores")
    .select("id, published")
    .eq("slug", slug)
    .not("published", "is", null)
    .maybeSingle<{ id: string; published: TStoreContent }>();
  if (!store) return ignored();

  if (type !== "store_viewed") {
    const p = store.published.products.find((x) => x.id === productId);
    if (!p) return ignored();
    if (type === "interest_tapped" && p.availability !== "coming_soon") return ignored();
    if (type === "whatsapp_tapped" && !store.published.creator.whatsapp) return ignored();
  }

  const ip = ipHash(req);
  if (await publicEventsLimited(store.id, ip)) return ignored();

  const { error } = await db()
    .from("events")
    .insert({ store_id: store.id, type, product_id: productId ?? null, visitor_id: visitorId, ip_hash: ip });
  if (error && error.code !== "23505") console.error("event insert failed", error.message);
  return ignored();
}
