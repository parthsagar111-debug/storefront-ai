import { z } from "zod";
import { db, logEvent } from "@/lib/server/db";
import { storeForToken, notFound } from "@/lib/server/store-access";
import { validateDraft } from "@/lib/server/rules";
import { normalizeIndianMobile } from "@/lib/whatsapp";

const Body = z.object({ whatsapp: z.string().trim().optional() }).nullable();

/**
 * Draft → published snapshot (D10). Optional { whatsapp }. Rejects 400 when any product is Available now
 * and no number exists (T5), including the Skip path.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/stores/[token]/publish">) {
  const { token } = await ctx.params;
  const store = await storeForToken(token);
  if (!store) return notFound();
  if (store.status !== "ready" || !store.draft) return Response.json({ error: "not_ready" }, { status: 409 });

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const draft = structuredClone(store.draft);
  if (body.data?.whatsapp) {
    const n = normalizeIndianMobile(body.data.whatsapp);
    if (!n) return Response.json({ error: "invalid_whatsapp", field: "whatsapp" }, { status: 400 });
    draft.creator.whatsapp = n;
  }
  const v = validateDraft(draft);
  if (!v.ok) return Response.json(v.err, { status: 400 });

  const now = new Date().toISOString();
  const { error } = await db()
    .from("stores")
    .update({ draft: v.draft, published: v.draft, published_at: now, has_unpublished_changes: false })
    .eq("id", store.id);
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  await logEvent(store.id, "store_published", { first: !store.published_at });

  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  return Response.json({ url: `${base}/s/${store.slug}`, slug: store.slug, publishedAt: now, draft: v.draft });
}
