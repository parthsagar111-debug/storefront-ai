import { z } from "zod";
import { logEvent } from "@/lib/server/db";
import { writeDraft } from "@/lib/server/draft-write";
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

  let wa: string | undefined;
  if (body.data?.whatsapp) {
    const n = normalizeIndianMobile(body.data.whatsapp);
    if (!n) return Response.json({ error: "invalid_whatsapp", field: "whatsapp" }, { status: 400 });
    wa = n;
  }
  const now = new Date().toISOString();
  // IQA-01: publish the LATEST draft (re-read + re-applied on a lost race), and bump draft_rev with it.
  const w = await writeDraft(
    store,
    store.draft_rev ?? 0,
    (latest) => {
      if (wa) latest.creator.whatsapp = wa;
      const v = validateDraft(latest);
      return v.ok ? v.draft : Response.json(v.err, { status: 400 });
    },
    (draft) => ({ published: draft, published_at: now, has_unpublished_changes: false }),
  );
  if (!w.ok) return w.response;
  await logEvent(store.id, "store_published", { first: !store.published_at });

  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  return Response.json({ url: `${base}/s/${store.slug}`, slug: store.slug, publishedAt: now, draft: w.draft, draftRev: w.draftRev });
}
