import { after } from "next/server";
import { storeForToken, notFound } from "@/lib/server/store-access";
import { claimGeneration, runGeneration } from "@/lib/server/generation";

export const maxDuration = 60;

/**
 * Retry runs the same atomic claim as the first run. Accepted states (DB clock, migration 0002):
 * failed, any pending (incl. stale > 15 s), generating stale > 75 s. The UI only offers Retry when
 * is_stale or failed, which are a subset of these — so a visible Retry is never refused.
 */
export async function POST(_req: Request, ctx: RouteContext<"/api/stores/[token]/retry">) {
  const { token } = await ctx.params;
  const store = await storeForToken(token);
  if (!store) return notFound();

  const retryable = store.status === "failed" || store.status === "pending" || store.is_stale;
  if (!retryable) return Response.json({ started: false, status: store.status }, { status: 409 });

  // Claim now (synchronously) so the response tells the truth; the claimed run continues in after().
  const claimed = await claimGeneration(store.id);
  if (!claimed) return Response.json({ started: false, status: "generating" }, { status: 409 });
  after(() => runGeneration(store.id, claimed));
  return Response.json({ started: true, status: "generating" }, { status: 202 });
}
