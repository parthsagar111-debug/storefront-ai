// Implementation check 1: "the UI must never show Retry while the server refuses to run".
// Forces each state in the DB, then compares GET isStale (what the UI uses) with POST /retry (what the server does).
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import pg from "pg";
import { randomBytes, randomUUID } from "node:crypto";

const BASE = process.argv[2] || "https://storefront-ai-blush.vercel.app";
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const tok = () => randomBytes(24).toString("base64url");
const api = (p, m = "GET") => fetch(BASE + p, { method: m, cache: "no-store" });
let failures = 0;
const check = (n, ok, x = "") => (console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`), ok || failures++);

// Create a store row directly (no AI call) so each case starts from a known state.
async function makeStore(token) {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(token).digest("hex");
  const { rows } = await c.query(
    `insert into stores (slug, client_request_id, edit_token_hash, status, input)
     values ($1, $2, $3, 'failed', $4) returning id`,
    [`recovery-test-${randomBytes(3).toString("hex")}`, randomUUID(), hash,
     { name: "Ananya Sharma", expertise: "Practical Indian vegetarian home cooking", audience: "Working professionals", outcome: "Tasty meals in 20 minutes", audienceSize: "5k_20k", language: "en" }],
  );
  return rows[0].id;
}

// Set a state with explicit timestamps; the updated_at trigger is bypassed for this session only.
async function force(id, status, { pendingAgoS = 0, genAgoS = null } = {}) {
  await c.query("set session_replication_role = replica");
  await c.query(
    `update stores set status=$2, updated_at=now() - make_interval(secs => $3),
       gen_started_at = case when $4::int is null then null else now() - make_interval(secs => $4::int) end
     where id=$1`,
    [id, status, pendingAgoS, genAgoS],
  );
  await c.query("set session_replication_role = origin");
}

const cases = [
  { name: "pending fresh (5 s)", status: "pending", opts: { pendingAgoS: 5 }, uiRetry: false },
  { name: "pending stale (20 s, unclaimed)", status: "pending", opts: { pendingAgoS: 20 }, uiRetry: true },
  { name: "generating fresh (30 s)", status: "generating", opts: { genAgoS: 30 }, uiRetry: false },
  { name: "generating stale (80 s)", status: "generating", opts: { genAgoS: 80 }, uiRetry: true },
  { name: "failed", status: "failed", opts: {}, uiRetry: true },
];

for (const k of cases) {
  const token = tok();
  const id = await makeStore(token);
  await force(id, k.status, k.opts);
  const view = await (await api(`/api/stores/${token}`)).json();
  const uiShowsRetry = view.status === "failed" || view.isStale === true;
  check(`${k.name}: UI shows Retry = ${k.uiRetry}`, uiShowsRetry === k.uiRetry, `status=${view.status} isStale=${view.isStale}`);

  const r = await api(`/api/stores/${token}/retry`, "POST");
  const body = await r.json();
  if (uiShowsRetry) check(`${k.name}: Retry accepted by server`, r.status === 202 && body.started, `${r.status} ${JSON.stringify(body)}`);
  else if (k.status === "generating") check(`${k.name}: server refuses (run active)`, r.status === 409, `${r.status}`);
  else console.log(`info  ${k.name}: retry → ${r.status} (UI doesn't offer Retry here; claim may legitimately start the pending run)`);

  // Double retry right after: the second must not start a second run.
  if (uiShowsRetry) {
    const r2 = await api(`/api/stores/${token}/retry`, "POST");
    check(`${k.name}: second Retry doesn't double-run`, r2.status === 409, `${r2.status}`);
  }
  await c.query("delete from stores where id=$1", [id]);
}

await c.end();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
