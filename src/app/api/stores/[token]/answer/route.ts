import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { storeForToken, notFound } from "@/lib/server/store-access";
import { runGeneration } from "@/lib/server/generation";
import { generationLimited, tooMany } from "@/lib/server/rules";

export const maxDuration = 60;

const Body = z.object({ direction: z.string().trim().min(2).max(500) });

/** S2b: the creator picks a direction chip (or types one) → add it to the input and regenerate. */
export async function POST(req: Request, ctx: RouteContext<"/api/stores/[token]/answer">) {
  const { token } = await ctx.params;
  const store = await storeForToken(token);
  if (!store) return notFound();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });
  if (store.status !== "needs_input" || store.follow_up?.kind !== "needs_more")
    return Response.json({ error: "not_waiting_for_input", status: store.status }, { status: 409 });

  // S2b: after 2 rounds the creator must pick one of the chips (never generate from thin input).
  if (store.follow_up.round >= 2 && !store.follow_up.directions.includes(body.data.direction))
    return Response.json({ error: "pick_a_direction" }, { status: 400 });
  if (await generationLimited(store.id)) return tooMany(); // T19 shared limit

  const { error } = await db()
    .from("stores")
    .update({ status: "pending", input: { ...store.input, direction: body.data.direction } })
    .eq("id", store.id)
    .eq("status", "needs_input");
  if (error) return Response.json({ error: "server_error" }, { status: 500 });

  after(() => runGeneration(store.id));
  return Response.json({ started: true }, { status: 202 });
}
