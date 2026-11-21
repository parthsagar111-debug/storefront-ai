import { after } from "next/server";
import { z } from "zod";
import { db, logEvent } from "@/lib/server/db";
import { storeForToken, notFound } from "@/lib/server/store-access";
import { StoreInputSchema } from "@/lib/server/input";
import { generationLimited, tooMany } from "@/lib/server/rules";
import { runGeneration } from "@/lib/server/generation";
import { themeFor } from "@/lib/ai/build-store";
import { CHANGED_ELSEWHERE } from "@/lib/server/draft-write";

export const maxDuration = 60;

const Body = z.object({ input: z.unknown() });

/**
 * T28 Edit answers & regenerate (SPEC v4.5): new S1 answers for the SAME store/token → full generation
 * with the existing pipeline and the shared per-store limit (T19). The published snapshot is untouched
 * until the creator publishes again.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/stores/[token]/answers">) {
  const { token } = await ctx.params;
  const store = await storeForToken(token);
  if (!store) return notFound();
  if ((store.status === "generating" || store.status === "pending") && !store.is_stale)
    return Response.json({ error: "busy", message: "Your store is being generated. Try again in a moment." }, { status: 409 });

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const input = StoreInputSchema.safeParse(body.data.input);
  if (!input.success) return Response.json({ error: "invalid_input", issues: input.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  if (await generationLimited(store.id)) return tooMany(); // T19 shared limit

  // Identity fields come from the new answers (the pipeline keeps the draft's name/Instagram/WhatsApp/theme).
  const draft = store.draft
    ? {
        ...store.draft,
        creator: { ...store.draft.creator, displayName: input.data.name, instagramHandle: input.data.instagramHandle || undefined },
        theme: themeFor(input.data),
      }
    : null;
  const { data, error } = await db()
    .from("stores")
    .update({
      status: "pending",
      input: input.data,
      follow_up: null,
      draft,
      draft_rev: (store.draft_rev ?? 0) + 1,
      has_unpublished_changes: Boolean(store.published),
    })
    .eq("id", store.id)
    .eq("draft_rev", store.draft_rev ?? 0)
    .in("status", ["ready", "needs_input", "failed", "pending", "generating"])
    .select("id");
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  if (!data?.length) return Response.json(CHANGED_ELSEWHERE, { status: 409 });

  await logEvent(store.id, "answers_edited", {});
  after(() => runGeneration(store.id));
  return Response.json({ started: true }, { status: 202 });
}
