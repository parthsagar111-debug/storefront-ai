import { z } from "zod";
import { db, logEvent } from "@/lib/server/db";
import { storeForToken, editorView, notFound } from "@/lib/server/store-access";
import { validateDraft, storeCounts } from "@/lib/server/rules";
import { Format } from "@/lib/ai/schemas";
import { priceFor } from "@/lib/pricing";
import { normalizeIndianMobile } from "@/lib/whatsapp";

export async function GET(_req: Request, ctx: RouteContext<"/api/stores/[token]">) {
  const { token } = await ctx.params;
  const store = await storeForToken(token);
  if (!store) return notFound();
  const counts = store.published ? await storeCounts(store.id) : null;
  return Response.json({ ...editorView(store), counts }, { headers: { "Cache-Control": "no-store" } });
}

const CreatorPatch = z
  .object({
    displayName: z.string().trim().min(2).max(60),
    headline: z.string().trim().min(8).max(70),
    bio: z.string().trim().min(20).max(320),
    instagramHandle: z
      .string()
      .trim()
      .transform((s) => s.replace(/^@/, ""))
      .refine((s) => s === "" || /^[A-Za-z0-9._]{1,30}$/.test(s), "invalid handle"),
    whatsapp: z.string().trim(),
  })
  .partial();

const ProductPatch = z.object({
  id: z.string(),
  availability: z.enum(["coming_soon", "available"]).optional(),
  title: z.string().trim().min(4).max(60).optional(),
  format: Format.optional(),
  price: z.number().int().min(49).max(99999).optional(),
  summary: z.string().trim().min(10).max(90).optional(),
  description: z.string().trim().min(40).max(420).optional(),
  whatYouGet: z.array(z.string().trim().min(3).max(70)).length(3).optional(),
});

const Body = z.object({
  creator: CreatorPatch.optional(),
  product: ProductPatch.optional(),
  theme: z.enum(["saffron", "teal", "plum", "indigo"]).optional(),
});

/** Manual edits (SPEC §9 PATCH): merged into the draft, then the whole draft is re-validated incl. T5. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/stores/[token]">) {
  const { token } = await ctx.params;
  const store = await storeForToken(token);
  if (!store) return notFound();
  if (store.status !== "ready" || !store.draft) return Response.json({ error: "not_ready" }, { status: 409 });

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    const i = body.error.issues[0];
    return Response.json({ error: "invalid", field: i.path.slice(1).join(".") || i.path.join(".") }, { status: 400 });
  }
  const draft = structuredClone(store.draft);
  const { creator, product, theme } = body.data;

  if (creator) {
    const { whatsapp, instagramHandle, ...rest } = creator;
    Object.assign(draft.creator, rest);
    if (instagramHandle !== undefined) draft.creator.instagramHandle = instagramHandle || undefined;
    if (whatsapp !== undefined) {
      if (whatsapp === "") draft.creator.whatsapp = undefined;
      else {
        const n = normalizeIndianMobile(whatsapp);
        if (!n) return Response.json({ error: "invalid_whatsapp", field: "whatsapp" }, { status: 400 });
        draft.creator.whatsapp = n;
      }
    }
  }
  if (product) {
    const p = draft.products.find((x) => x.id === product.id);
    if (!p) return Response.json({ error: "unknown_product" }, { status: 404 });
    const { id: _id, ...fields } = product;
    void _id;
    const formatChanged = Boolean(fields.format && fields.format !== p.format);
    Object.assign(p, fields);
    // New format at its typical table price → tier "typical" (S3: changing format re-prices to its typical tier).
    if (formatChanged && p.price === priceFor(p.format, "typical")) p.tier = "typical";
    // Price source: the table price for (format, tier) counts as AI; anything else is the creator's (D17).
    if (fields.format || fields.price !== undefined) {
      if (fields.format && fields.price === undefined) {
        p.tier = "typical";
        p.price = priceFor(p.format, "typical");
      }
      p.priceSource = p.price === priceFor(p.format, p.tier) ? "ai_tier" : "creator";
    }
  }
  if (theme) draft.theme = theme;

  const v = validateDraft(draft);
  if (!v.ok) return Response.json(v.err, { status: 400 });

  const { error } = await db()
    .from("stores")
    .update({ draft: v.draft, has_unpublished_changes: Boolean(store.published) })
    .eq("id", store.id);
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  await logEvent(store.id, "section_edited", { section: product ? "product" : creator ? "header" : "theme" });
  return Response.json({ draft: v.draft, hasUnpublishedChanges: Boolean(store.published) });
}
