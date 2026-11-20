import { storeForToken, editorView, notFound } from "@/lib/server/store-access";

export async function GET(_req: Request, ctx: RouteContext<"/api/stores/[token]">) {
  const { token } = await ctx.params;
  const store = await storeForToken(token);
  if (!store) return notFound();
  return Response.json(editorView(store), { headers: { "Cache-Control": "no-store" } });
}
