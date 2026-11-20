import { z } from "zod";
import { db, logEvent } from "@/lib/server/db";
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
import { parseGeneration, buildStoreContent, acceptBio, acceptProduct } from "@/lib/ai/build-store";
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

  const draft = store.draft;
  const input = store.input;
  const ci = toCreatorInput(input);
  const system = systemPrompt(input.language);
  const current = storeForPrompt(draft);
  let next: TStoreContent;
  let message: string | undefined;

  if (body.data.target === "bio") {
    const out = await runWithFallback({
      label: `regen bio ${store.slug}`,
      budgetMs: SECTION_BUDGET_MS,
      system,
      user: bioUserPrompt(ci, current),
      schema: BioResultSchema,
      accept: (raw) => {
        const r = BioResult.safeParse(raw);
        if (!r.success) throw new CheckFailed("zod: " + r.error.message.slice(0, 300));
        return acceptBio(r.data, input);
      },
    });
    if (!out.ok) return Response.json({ error: "ai_failed" }, { status: 502 });
    next = { ...draft, creator: { ...draft.creator, ...out.result.value } };
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
        const r = ProductResult.safeParse(raw);
        if (!r.success) throw new CheckFailed("zod: " + r.error.message.slice(0, 300));
        return acceptProduct(r.data.product, input, draft, productId);
      },
    });
    if (!out.ok) return Response.json({ error: "ai_failed" }, { status: 502 });
    next = { ...draft, products: out.result.value };
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
        if (r.status === "ok") return { content: buildStoreContent(r, input, draft) };
        return { message: r.status === "needs_more" ? r.question : r.reason };
      },
    });
    if (!out.ok) return Response.json({ error: "ai_failed" }, { status: 502 });
    if ("message" in out.result.value) {
      message = out.result.value.message;
      return Response.json({ draft, kept: true, message });
    }
    next = out.result.value.content;
  }

  const { error } = await db()
    .from("stores")
    .update({ draft: next, has_unpublished_changes: Boolean(store.published) })
    .eq("id", store.id)
    .eq("status", "ready");
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  return Response.json({ draft: next, hasUnpublishedChanges: Boolean(store.published) });
}
