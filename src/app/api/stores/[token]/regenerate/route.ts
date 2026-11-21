import { z } from "zod";
import { logEvent } from "@/lib/server/db";
import { writeDraft, conflict, type DraftApply } from "@/lib/server/draft-write";
import { storeForToken, notFound } from "@/lib/server/store-access";
import { generationLimited, tooMany } from "@/lib/server/rules";
import { toCreatorInput } from "@/lib/server/input";
import { runWithFallback } from "@/lib/ai/pipeline";
import {
  BioResult,
  ProductResult,
  type TStoreContent,
} from "@/lib/ai/schemas";
import { BioResultSchema, ProductResultSchema, GenerationResultUnionSchema } from "@/lib/ai/response-schemas";
import { systemPrompt, bioUserPrompt, productUserPrompt, generationUserPrompt } from "@/lib/ai/prompts";
import { parseGeneration, buildStoreContent, acceptBio, acceptProduct, normalizeModelOutput } from "@/lib/ai/build-store";
import { CheckFailed } from "@/lib/ai/pipeline";
import { ENTRY_MAX } from "@/lib/pricing";

export const maxDuration = 60;

const Body = z.discriminatedUnion("target", [
  z.object({ target: z.literal("bio") }),
  z.object({ target: z.literal("product"), productId: z.string() }),
  z.object({ target: z.literal("all") }),
]);

/** Current store for the prompt: model-facing fields only. Never prices (PROMPTS.md: no rupee numbers in prompts). */
const storeForPrompt = (d: TStoreContent) =>
  JSON.stringify({
    headline: d.creator.headline,
    bio: d.creator.bio,
    products: d.products.map((p) => ({ title: p.title, format: p.format, tier: p.tier, summary: p.summary })),
  });

const SECTION_BUDGET_MS = 30_000;
const FULL_BUDGET_MS = 50_000;

export async function POST(req: Request, ctx: RouteContext<"/api/stores/[token]/regenerate">) {
  const { token } = await ctx.params;
  const store = await storeForToken(token);
  if (!store) return notFound();
  if (store.status !== "ready" || !store.draft) return Response.json({ error: "not_ready" }, { status: 409 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });
  if (await generationLimited(store.id)) return tooMany(); // T19 shared limit
  await logEvent(store.id, "section_regenerated", { target: body.data.target });

  // The AI sees (and validates against) the draft as it was when the request started…
  const draft = store.draft;
  const input = store.input;
  const ci = toCreatorInput(input);
  const system = systemPrompt(input.language);
  const current = storeForPrompt(draft);
  // …and after it returns, IQA-01: re-read the LATEST draft and replace only the target (bio / that one product / all).
  let apply: DraftApply;

  if (body.data.target === "bio") {
    const out = await runWithFallback({
      label: `regen bio ${store.slug}`,
      budgetMs: SECTION_BUDGET_MS,
      system,
      user: bioUserPrompt(ci, current),
      schema: BioResultSchema,
      accept: (raw) => {
        const r = BioResult.safeParse(normalizeModelOutput(raw));
        if (!r.success) throw new CheckFailed("zod: " + r.error.message.slice(0, 300));
        return acceptBio(r.data, input, draft.sensitiveDomain);
      },
    });
    if (!out.ok) return Response.json({ error: "ai_failed" }, { status: 502 });
    const bio = out.result.value;
    apply = (latest) => ({ ...latest, creator: { ...latest.creator, headline: bio.headline, bio: bio.bio } });
  } else if (body.data.target === "product") {
    const productId = body.data.productId;
    const target = draft.products.find((p) => p.id === productId);
    if (!target) return Response.json({ error: "unknown_product" }, { status: 404 });
    const others = draft.products.filter((p) => p.id !== productId);
    const mustBeEntry = target.price <= ENTRY_MAX && !others.some((p) => p.price <= ENTRY_MAX);
    const out = await runWithFallback({
      label: `regen product ${store.slug}`,
      budgetMs: SECTION_BUDGET_MS,
      system,
      user: productUserPrompt(ci, current, target.title, others.map((p) => p.format), mustBeEntry),
      schema: ProductResultSchema,
      accept: (raw) => {
        const r = ProductResult.safeParse(normalizeModelOutput(raw));
        if (!r.success) throw new CheckFailed("zod: " + r.error.message.slice(0, 300));
        acceptProduct(r.data.product, input, draft, productId); // checks → fallback model on failure
        return r.data.product;
      },
    });
    if (!out.ok) return Response.json({ error: "ai_failed" }, { status: 502 });
    const modelProduct = out.result.value;
    apply = (latest) => {
      // Edited in another tab meanwhile: keep those edits, swap only this product (same slot, new id — T20).
      if (!latest.products.some((p) => p.id === productId)) return conflict();
      try {
        return { ...latest, products: acceptProduct(modelProduct, input, latest, productId) };
      } catch {
        return conflict(); // e.g. another tab changed a format so the new one now collides
      }
    };
  } else {
    // Regenerate all reuses the full generation pipeline; needs_more / unclear keep the draft (T25).
    const out = await runWithFallback({
      label: `regen all ${store.slug}`,
      budgetMs: FULL_BUDGET_MS,
      system,
      user: generationUserPrompt(ci, current),
      schema: GenerationResultUnionSchema,
      accept: (raw) => {
        const r = parseGeneration(raw);
        if (r.status === "ok") {
          buildStoreContent(r, input, draft); // checks → fallback model on failure
          return { ok: r };
        }
        return { message: r.status === "needs_more" ? r.question : r.reason };
      },
    });
    if (!out.ok) return Response.json({ error: "ai_failed" }, { status: 502 });
    const v = out.result.value;
    if ("message" in v) return Response.json({ draft, draftRev: store.draft_rev, kept: true, message: v.message });
    apply = (latest) => buildStoreContent(v.ok, input, latest); // keeps the latest name / Instagram / WhatsApp / theme
  }

  const w = await writeDraft(store, store.draft_rev ?? 0, apply);
  if (!w.ok) return w.response;
  return Response.json({ draft: w.draft, draftRev: w.draftRev, hasUnpublishedChanges: Boolean(w.row.published) });
}
