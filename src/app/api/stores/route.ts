import { after } from "next/server";
import { z } from "zod";
import { db, type StoreRow } from "@/lib/server/db";
import { isValidToken, tokenHash, ipHash, makeSlug } from "@/lib/server/crypto";
import { StoreInputSchema } from "@/lib/server/input";
import { runGeneration } from "@/lib/server/generation";

export const maxDuration = 60;

const Body = z.object({
  clientRequestId: z.string().uuid(),
  token: z.string(),
  input: z.unknown(),
});

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Step 1 (T12): idempotency lookup. Same id + same token → same store; same id + other token → 409. */
async function lookup(clientRequestId: string, hash: string) {
  const { data } = await db()
    .from("stores")
    .select("slug, edit_token_hash")
    .eq("client_request_id", clientRequestId)
    .maybeSingle<Pick<StoreRow, "slug" | "edit_token_hash">>();
  if (!data) return null;
  return data.edit_token_hash === hash ? json({ slug: data.slug, existing: true }) : json({ error: "conflict" }, 409);
}

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "bad_request" }, 400);
  const { clientRequestId, token } = body.data;
  if (!isValidToken(token)) return json({ error: "bad_token" }, 400);
  const hash = tokenHash(token);

  const found = await lookup(clientRequestId, hash);
  if (found) return found;

  // Step 2: validate input.
  const input = StoreInputSchema.safeParse(body.data.input);
  if (!input.success) return json({ error: "invalid_input", issues: input.error.issues.map((i) => i.path.join(".")) }, 400);

  // Step 3: creation rate limit — slice 5.

  // Step 4: insert. Unique violation on client_request_id → concurrent duplicate → back to step 1.
  for (let i = 0; i < 3; i++) {
    const { data, error } = await db()
      .from("stores")
      .insert({
        slug: makeSlug(input.data.name),
        client_request_id: clientRequestId,
        creator_ip_hash: ipHash(req),
        edit_token_hash: hash,
        status: "pending",
        input: input.data,
      })
      .select("id, slug")
      .single<{ id: string; slug: string }>();
    if (data) {
      after(() => runGeneration(data.id));
      return json({ slug: data.slug }, 201);
    }
    if (error?.code === "23505") {
      if (/client_request_id|edit_token_hash/.test(error.message + error.details)) {
        const again = await lookup(clientRequestId, hash);
        if (again) return again;
        return json({ error: "conflict" }, 409);
      }
      continue; // slug collision: new random suffix
    }
    console.error("insert store failed", error);
    return json({ error: "server_error" }, 500);
  }
  return json({ error: "server_error" }, 500);
}
