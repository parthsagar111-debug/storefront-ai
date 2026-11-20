// Live smoke test. Usage: node scripts/smoke.mjs [baseUrl]
import { randomBytes, randomUUID } from "node:crypto";

const BASE = process.argv[2] || "https://storefront-ai-blush.vercel.app";
const tok = () => randomBytes(24).toString("base64url");
const post = (path, body) =>
  fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const get = (path) => fetch(BASE + path, { cache: "no-store" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  if (!cond) failures++;
};

async function pollUntilSettled(token, maxMs = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await (await get(`/api/stores/${token}`)).json();
    if (!["pending", "generating"].includes(s.status) || s.isStale) return { s, ms: Date.now() - t0 };
    await sleep(2000);
  }
  return { s: null, ms: maxMs };
}

const cooking = {
  name: "Ananya Sharma",
  expertise: "Practical Indian vegetarian home cooking",
  audience: "Working professionals and beginners",
  outcome: "Tasty everyday meals without hours in the kitchen",
  audienceSize: "5k_20k",
  language: "hinglish",
};

// E1 happy path
{
  const token = tok(), id = randomUUID();
  const r = await post("/api/stores", { clientRequestId: id, token, input: cooking });
  const b = await r.json();
  check("E1 create returns 201 + slug", r.status === 201 && b.slug, JSON.stringify(b));
  const { s, ms } = await pollUntilSettled(token);
  check("E1 store ready", s?.status === "ready", `status=${s?.status} stale=${s?.isStale} after ${ms} ms`);
  if (s?.draft) {
    const ps = s.draft.products;
    check("E1 2–4 products", ps.length >= 2 && ps.length <= 4, `${ps.length} products`);
    check("E1 ladder: ≥1 product ≤ ₹499", ps.some((p) => p.price <= 499), ps.map((p) => `${p.format}/${p.tier}=₹${p.price}`).join(", "));
    check("E1 unique formats", new Set(ps.map((p) => p.format)).size === ps.length);
    check("E1 all coming_soon", ps.every((p) => p.availability === "coming_soon"));
    check("E1 name from input", s.draft.creator.displayName === cooking.name);
    console.log("      headline:", s.draft.creator.headline);
    console.log("      bio:", s.draft.creator.bio);
  }
  check("E1 response leaks no hashes", !JSON.stringify(s).match(/edit_token_hash|creator_ip_hash|client_request_id/));

  // E9 lost response: same ids again → same store, no new row
  const r2 = await post("/api/stores", { clientRequestId: id, token, input: cooking });
  const b2 = await r2.json();
  check("E9 retry same ids → same slug", r2.ok && b2.slug === b.slug, JSON.stringify(b2));
  // same id, different token → 409
  const r3 = await post("/api/stores", { clientRequestId: id, token: tok(), input: cooking });
  check("E9 same id, other token → 409", r3.status === 409);
}

// E9 double-tap: two concurrent POSTs with the same ids → one store
{
  const token = tok(), id = randomUUID();
  const [a, b] = await Promise.all([1, 2].map(() => post("/api/stores", { clientRequestId: id, token, input: cooking })));
  const [ja, jb] = [await a.json(), await b.json()];
  check("E9 double-tap → one slug", ja.slug && ja.slug === jb.slug, `${a.status}:${ja.slug} / ${b.status}:${jb.slug}`);
  const { s } = await pollUntilSettled(token);
  check("E9 double-tap store generates once and is ready", s?.status === "ready", `status=${s?.status}`);
}

// E11 bad token
{
  const r = await get(`/api/stores/${tok()}`);
  check("E11 unknown token → 404", r.status === 404);
  const r2 = await get(`/api/stores/not-a-token`);
  check("E11 malformed token → 404", r2.status === 404);
  const r3 = await post(`/api/stores/${tok()}/retry`, {});
  check("retry with unknown token → 404", r3.status === 404);
}

// Validation
{
  const r = await post("/api/stores", { clientRequestId: randomUUID(), token: tok(), input: { ...cooking, expertise: "aaaaa" } });
  check("S1 check: 'aaaaa' rejected (400)", r.status === 400);
  const r2 = await post("/api/stores", { clientRequestId: randomUUID(), token: "short", input: cooking });
  check("bad token format rejected (400)", r2.status === 400);
}

// E2 thin input → needs_more → pick direction → ready
{
  const token = tok();
  await post("/api/stores", {
    clientRequestId: randomUUID(),
    token,
    input: { name: "Ravi", expertise: "fitness", audience: "people", outcome: "get fit", audienceSize: "under_5k", language: "en" },
  });
  const { s } = await pollUntilSettled(token);
  check("E2 thin input → needs_input/needs_more", s?.status === "needs_input" && s.followUp?.kind === "needs_more", JSON.stringify(s?.followUp));
  if (s?.followUp?.kind === "needs_more") {
    const r = await post(`/api/stores/${token}/answer`, { direction: s.followUp.directions[0] });
    check("E2 answer accepted (202)", r.status === 202);
    const { s: s2, ms } = await pollUntilSettled(token);
    check("E2 store ready after direction", s2?.status === "ready", `status=${s2?.status} after ${ms} ms; direction="${s.followUp.directions[0]}"`);
  }
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
