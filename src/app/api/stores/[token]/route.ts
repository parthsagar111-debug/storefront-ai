import { z } from "zod";
import { db, logEvent } from "@/lib/server/db";
import { storeForToken, editorView, notFound } from "@/lib/server/store-access";
import { validateDraft, storeCounts } from "@/lib/server/rules";
import { Format, Product, SensitiveDomain, type TStoreContent } from "@/lib/ai/schemas";
import { writeDraft, conflict } from "@/lib/server/draft-write";
import { priceFor, ENTRY_MAX } from "@/lib/pricing";
import { normalizeIndianMobile } from "@/lib/whatsapp";
import { normalizeInstagram, HANDLE_RE } from "@/lib/instagram";

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
      .transform((s) => normalizeInstagram(s))
      .refine((s) => s === "" || HANDLE_RE.test(s), "invalid handle"),
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

/**
 * SPEC v5 V4 "Regenerated. Undo": put back exactly what a regenerate replaced (format, price, availability…).
 * bio → headline + bio; product → swap the regenerated product (by its new id) for the old one; all → everything.
 */
const Restore = z.object({
  headline: z.string().trim().min(8).max(70).optional(),
  bio: z.string().trim().min(20).max(320).optional(),
  product: z.object({ replaceId: z.string(), value: Product }).optional(),
  products: z.array(Product).min(2).max(4).optional(),
  sensitiveDomain: SensitiveDomain.optional(),
});

const Body = z.object({
  draftRev: z.number().int().min(0).optional(),
  creator: CreatorPatch.optional(),
  product: ProductPatch.optional(),
  theme: z.enum(["saffron", "teal", "plum", "indigo"]).optional(),
  restore: Restore.optional(),
  // SPEC v5 V4: Remove product while more than 2; never the only entry product.
  removeProductId: z.string().optional(),
});

/**
 * Manual edits (SPEC §9 PATCH). IQA-01/QA-08: the client sends only the fields it changed plus the
 * draftRev it loaded; the server merges them into the LATEST draft (writeDraft re-reads and re-applies
 * once on a lost race), then re-validates the whole draft incl. T5.
 */
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
  const { creator, product, theme, draftRev, restore, removeProductId } = body.data;

  const merge = (draft: TStoreContent): TStoreContent | Response => {
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
      // The product was regenerated/replaced in another tab: don't write into a product that no longer exists.
      if (!p) return conflict();
      const { id: _id, ...fields } = product;
      void _id;
      const formatChanged = Boolean(fields.format && fields.format !== p.format);
      const wasAiPrice = p.priceSource === "ai_tier";
      Object.assign(p, fields);
      // New format at its typical table price → tier "typical" (S3: changing format re-prices to its typical tier).
      if (formatChanged && p.price === priceFor(p.format, "typical")) p.tier = "typical";
      // Price source: the table price for (format, tier) counts as AI; anything else is the creator's (D17).
      if (fields.format || fields.price !== undefined) {
        // SPEC v5 V4: a format change re-prices only an AI price; a price the creator set is kept.
        if (fields.format && fields.price === undefined && wasAiPrice) {
          p.tier = "typical";
          p.price = priceFor(p.format, "typical");
        }
        p.priceSource = p.price === priceFor(p.format, p.tier) ? "ai_tier" : "creator";
        // IQA-04: the AI's tier reason described the old format/price — drop it so it can't contradict the new one.
        p.tierReason = "";
      }
    }
    if (theme) draft.theme = theme;
    if (restore) {
      if (restore.headline) draft.creator.headline = restore.headline;
      if (restore.bio) draft.creator.bio = restore.bio;
      if (restore.products) draft.products = restore.products;
      if (restore.sensitiveDomain) draft.sensitiveDomain = restore.sensitiveDomain;
      if (restore.product) {
        const i = draft.products.findIndex((x) => x.id === restore.product!.replaceId);
        if (i < 0) return conflict(); // changed meanwhile: nothing to undo
        draft.products[i] = restore.product.value;
      }
      // Another product took this format meanwhile → the old version can't come back as is.
      if (new Set(draft.products.map((x) => x.format)).size !== draft.products.length)
        return Response.json({ error: "format_taken" }, { status: 400 });
    }
    if (removeProductId) {
      const target = draft.products.find((x) => x.id === removeProductId);
      if (!target) return conflict();
      if (draft.products.length <= 2) return Response.json({ error: "min_products" }, { status: 400 });
      const othersEntry = draft.products.some((x) => x.id !== removeProductId && x.price <= ENTRY_MAX);
      if (target.price <= ENTRY_MAX && !othersEntry) return Response.json({ error: "only_entry" }, { status: 400 });
      draft.products = draft.products.filter((x) => x.id !== removeProductId);
    }
    const v = validateDraft(draft);
    if (!v.ok) return Response.json(v.err, { status: 400 });
    return v.draft;
  };

  const w = await writeDraft(store, draftRev ?? store.draft_rev ?? 0, merge);
  if (!w.ok) return w.response;
  await logEvent(store.id, "section_edited", {
    section: restore ? "undo" : removeProductId ? "remove_product" : product ? "product" : creator ? "header" : "theme",
  });
  return Response.json({ draft: w.draft, draftRev: w.draftRev, hasUnpublishedChanges: Boolean(w.row.published) });
}

/**
 * T29 Delete store (SPEC v4.5): token check, then delete the row; events go with it (ON DELETE CASCADE).
 * /s/<slug> shows S6 afterwards. A wrong or malformed token gets 404 and deletes nothing.
 */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/stores/[token]">) {
  const { token } = await ctx.params;
  const store = await storeForToken(token);
  if (!store) return notFound();
  const { data, error } = await db().from("stores").delete().eq("id", store.id).select("id");
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  if (!data?.length) return notFound();
  return Response.json({ deleted: true });
}
