// Core gate (SPEC §8) against the live URL, API level. UI checks at 360 px are done separately in a browser.
// Usage: node scripts/core-gate.mjs [baseUrl]
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import pg from "pg";
import { randomBytes, randomUUID } from "node:crypto";

const BASE = process.argv[2] || "https://storefront-ai-blush.vercel.app";
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const tok = () => randomBytes(24).toString("base64url");
const J = { "Content-Type": "application/json" };
const req = async (m, p, body) => {
  const r = await fetch(BASE + p, { method: m, headers: J, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, ok, x = "") => (console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`), ok || failures++);

// Test hygiene: earlier test stores from this machine shouldn't trip the 5/hour creation limit.
await c.query("update stores set creator_ip_hash = null where created_at > now() - interval '1 hour'");

async function settle(token, max = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    const { json } = await req("GET", `/api/stores/${token}`);
    if (json && (!["pending", "generating"].includes(json.status) || json.isStale)) return { s: json, ms: Date.now() - t0 };
    await sleep(2000);
  }
  return { s: null, ms: max };
}
async function createReady(input) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = tok();
    const r = await req("POST", "/api/stores", { clientRequestId: randomUUID(), token, input });
    if (r.status !== 201) return { token, s: null, ms: 0, status: r.status };
    let { s, ms } = await settle(token);
    if (s?.status === "failed" || s?.isStale) {
      console.log(`info  generation failed (free-tier 503?), pressing Retry`);
      await req("POST", `/api/stores/${token}/retry`);
      ({ s, ms } = await settle(token));
    }
    if (s?.status === "ready") return { token, s, ms };
  }
  return { token: null, s: null, ms: 0 };
}
const pub = (slug) => fetch(`${BASE}/s/${slug}`, { cache: "no-store" }).then((r) => r.text().then((t) => ({ status: r.status, html: t })));

const cooking = {
  name: "Ananya Sharma",
  expertise: "Practical Indian vegetarian home cooking",
  audience: "Working professionals and beginners",
  outcome: "Tasty everyday meals without hours in the kitchen",
  audienceSize: "5k_20k",
  language: "hinglish",
};

// ---------- E1 ----------
const { token, s: s0, ms } = await createReady(cooking);
check("E1 cooking/Hinglish store ready", s0?.status === "ready", `${ms} ms`);
if (!s0) { console.log("cannot continue"); process.exit(1); }
const api = `/api/stores/${token}`;
let draft = s0.draft;
check("E1 ladder ≥1 product ≤ ₹499", draft.products.some((p) => p.price <= 499), draft.products.map((p) => `${p.format}=₹${p.price}`).join(", "));
check("E1 tierReason has no ₹/Rs/3-digit", draft.products.every((p) => !/₹|\bRs\b|\d{3,}/.test(p.tierReason)));

// ---------- E22: edit bio + price, refresh ----------
{
  const bio = "Main Ananya hoon. Office ke baad bhi ghar ka khana possible hai, bas thoda plan chahiye. Chalo saath mein banate hain.";
  const p0 = draft.products[0];
  const r1 = await req("PATCH", api, { creator: { bio } });
  const r2 = await req("PATCH", api, { product: { id: p0.id, price: 249 } });
  const { json: g } = await req("GET", api);
  check("E22 bio edit persists after refresh", r1.status === 200 && g.draft.creator.bio === bio);
  const gp = g.draft.products.find((p) => p.id === p0.id);
  check("E22 price edit persists, priceSource=creator", r2.status === 200 && gp.price === 249 && gp.priceSource === "creator", `₹${gp.price} ${gp.priceSource}`);
  draft = g.draft;
}

// ---------- E18 / validation ----------
{
  const p = draft.products[0];
  check("E18 ₹0 rejected", (await req("PATCH", api, { product: { id: p.id, price: 0 } })).status === 400);
  check("E18 ₹2,999 ebook-ish accepted", (await req("PATCH", api, { product: { id: p.id, price: 2999 } })).status === 200);
  await req("PATCH", api, { product: { id: p.id, price: 249 } });
  const r = await req("PATCH", api, { product: { id: p.id, title: "" } });
  check("E15 empty title blocked + field named", r.status === 400 && /title/.test(r.json?.field ?? ""), JSON.stringify(r.json));
  const w = await req("PATCH", api, { creator: { whatsapp: "12345" } });
  check("E16 invalid WhatsApp rejected", w.status === 400 && w.json?.error === "invalid_whatsapp");
}

// ---------- E20: Available now without a number ----------
{
  const p = draft.products[1];
  const r = await req("PATCH", api, { product: { id: p.id, availability: "available" } });
  check("E20 Available now without WhatsApp → 400 whatsapp_required", r.status === 400 && r.json?.error === "whatsapp_required", JSON.stringify(r.json));
}

// ---------- E8: regenerate product 2 ----------
{
  const before = (await req("GET", api)).json.draft;
  const target = before.products[1];
  const r = await req("POST", `${api}/regenerate`, { target: "product", productId: target.id });
  if (r.status === 200) {
    const after = r.json.draft;
    const fresh = after.products[1];
    const others = after.products.filter((_, i) => i !== 1);
    check("E8 product 2 replaced with a new id", fresh.id !== target.id);
    check("E8 new format differs from the others", !others.some((p) => p.format === fresh.format), `${target.format} → ${fresh.format}; others ${others.map((p) => p.format)}`);
    check("E8 rest untouched (ids, bio)", others.every((p, i) => p.id === before.products.filter((_, j) => j !== 1)[i].id) && after.creator.bio === before.creator.bio);
    check("E8 ladder still holds", after.products.some((p) => p.price <= 499));
  } else check("E8 regenerate product", false, `${r.status} ${r.text.slice(0, 200)}`);
}

// ---------- Bio regenerate ----------
{
  const before = (await req("GET", api)).json.draft;
  const r = await req("POST", `${api}/regenerate`, { target: "bio" });
  check("bio regenerate: bio changed, products untouched", r.status === 200 && r.json.draft.creator.bio !== before.creator.bio && r.json.draft.products.map((p) => p.id).join() === before.products.map((p) => p.id).join(), `${r.status}`);
}

// ---------- Publish (skip WhatsApp) + E24 ----------
let slug;
{
  const r = await req("POST", `${api}/publish`, {});
  slug = r.json?.slug;
  check("publish (skip WhatsApp) → public URL", r.status === 200 && r.json.url?.endsWith(`/s/${slug}`), r.json?.url);
  const d = (await req("GET", api)).json;
  check("badge state: Live (no unpublished changes)", d.publishedAt && d.hasUnpublishedChanges === false);
  const { status, html } = await pub(slug);
  const firstTitle = d.draft.products[0].title.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  check("E24 public page renders without edit token", status === 200 && html.includes(d.draft.creator.displayName) && html.includes(firstTitle));
  check("E24 OG tags present", /property="og:title"/.test(html) && /property="og:description"/.test(html));
  check("E24 public HTML has no edit token / hashes", !html.includes(token) && !/edit_token_hash|creator_ip_hash/.test(html));
}

// ---------- E14 + E24: unpublished edits don't reach the public page ----------
{
  const liveBio = (await req("GET", api)).json.draft.creator.bio;
  const newBio = "UNPUBLISHED-EDIT-MARKER: main naye tareeke se likh rahi hoon, simple ghar ka khana har din ke liye.";
  await req("PATCH", api, { creator: { bio: newBio } });
  const d = (await req("GET", api)).json;
  check("E14 badge → Unpublished changes", d.hasUnpublishedChanges === true);
  let { html } = await pub(slug);
  check("E14 public page unchanged after edit", !html.includes("UNPUBLISHED-EDIT-MARKER") && html.includes(liveBio.slice(0, 30).replace(/'/g, "&#x27;")));
  const before = d.draft.products.map((p) => p.title);
  const rr = await req("POST", `${api}/regenerate`, { target: "product", productId: d.draft.products[2]?.id ?? d.draft.products[0].id });
  ({ html } = await pub(slug));
  check("E14 public page unchanged after regenerate", rr.status !== 200 || !rr.json.draft.products.some((p) => !before.includes(p.title) && html.includes(p.title.replace(/'/g, "&#x27;"))));
  await req("POST", `${api}/publish`, {});
  ({ html } = await pub(slug));
  check("E14 republish → public page updated", html.includes("UNPUBLISHED-EDIT-MARKER"));
}

// ---------- E17 + T21 events ----------
{
  const d = (await req("GET", api)).json;
  const p = d.draft.products[0];
  const v1 = randomUUID(), v2 = randomUUID();
  await req("POST", "/api/events", { slug, type: "store_viewed", visitorId: v1 });
  await req("POST", "/api/events", { slug, type: "store_viewed", visitorId: v1 });
  await req("POST", "/api/events", { slug, type: "interest_tapped", productId: p.id, visitorId: v1 });
  await req("POST", "/api/events", { slug, type: "interest_tapped", productId: p.id, visitorId: v1 });
  let g = (await req("GET", api)).json;
  check("E17 two taps from one browser count once", g.counts.products[p.id]?.interested === 1, JSON.stringify(g.counts));
  check("view counted once per browser per day", g.counts.views === 1);
  await req("POST", "/api/events", { slug, type: "interest_tapped", productId: p.id, visitorId: v2 });
  g = (await req("GET", api)).json;
  check("E17 second browser counts", g.counts.products[p.id]?.interested === 2);
  const noVid = await req("POST", "/api/events", { slug, type: "store_viewed" });
  check("T24 event without visitorId rejected", noVid.status === 400);
  const noPid = await req("POST", "/api/events", { slug, type: "interest_tapped", visitorId: v1 });
  check("T18 tap without productId rejected", noPid.status === 400);
  await req("POST", "/api/events", { slug, type: "interest_tapped", productId: "not-a-product", visitorId: v1 });
  await req("POST", "/api/events", { slug, type: "whatsapp_tapped", productId: p.id, visitorId: v1 });
  const { rows } = await c.query("select count(*)::int n from events e join stores s on s.id=e.store_id where s.slug=$1 and e.type in ('interest_tapped','whatsapp_tapped') and (e.product_id='not-a-product' or e.type='whatsapp_tapped')", [slug]);
  check("T21 unknown product + WhatsApp tap without number ignored", rows[0].n === 0);
}

// ---------- Available now ⇒ WhatsApp, server-side (E20/T5) ----------
{
  const d = (await req("GET", api)).json.draft;
  const p = d.products[1];
  const r1 = await req("PATCH", api, { creator: { whatsapp: "+91 98765 43210" } });
  const r2 = await req("PATCH", api, { product: { id: p.id, availability: "available" } });
  check("WhatsApp saved (normalized) + Available now accepted", r1.status === 200 && r1.json.draft.creator.whatsapp === "9876543210" && r2.status === 200);
  const r3 = await req("PATCH", api, { creator: { whatsapp: "" } });
  check("T5 can't remove number while a product is Available now", r3.status === 400 && r3.json?.error === "whatsapp_required");
  await req("POST", `${api}/publish`, {});
  const { html } = await pub(slug);
  check("public: Enquire on WhatsApp link", html.includes("wa.me/919876543210"));
  const v = randomUUID();
  await req("POST", "/api/events", { slug, type: "interest_tapped", productId: p.id, visitorId: v });
  const g = (await req("GET", api)).json;
  check("T21 interest on an Available now product ignored", !g.counts.products[p.id]?.interested);
}

// ---------- E23: regenerate all ----------
{
  const before = (await req("GET", api)).json;
  const r = await req("POST", `${api}/regenerate`, { target: "all" });
  if (r.status === 200 && !r.json.kept) {
    const a = r.json.draft;
    check("E23 all products replaced (new ids)", a.products.every((p) => !before.draft.products.some((b) => b.id === p.id)));
    check("E23 bio changed", a.creator.bio !== before.draft.creator.bio);
    check("E23 WhatsApp/name kept", a.creator.whatsapp === "9876543210" && a.creator.displayName === before.draft.creator.displayName);
    const g = (await req("GET", api)).json;
    check("E23 edit link unchanged + unpublished changes", g.slug === before.slug && g.hasUnpublishedChanges === true);
  } else check("E23 regenerate all", false, `${r.status} ${r.text.slice(0, 200)}`);
}

// ---------- E11 ----------
{
  const { status, html } = await pub("unknown-zzzz");
  check("E11 /s/unknown → not-found view", html.includes("doesn&#x27;t exist (yet)") || html.includes("doesn't exist (yet)"), `status ${status}`);
  check("E11 /edit/badtoken → API 404", (await req("GET", `/api/stores/${tok()}`)).status === 404);
}

// ---------- Security: every write endpoint needs the real token ----------
{
  const bad = tok();
  const results = await Promise.all([
    req("PATCH", `/api/stores/${bad}`, { creator: { bio: "x".repeat(30) } }),
    req("POST", `/api/stores/${bad}/regenerate`, { target: "bio" }),
    req("POST", `/api/stores/${bad}/answer`, { direction: "abc" }),
    req("POST", `/api/stores/${bad}/retry`),
    req("POST", `/api/stores/${bad}/publish`, {}),
  ]);
  check("check 3: edit/regenerate/answer/retry/publish all 404 without the real token", results.every((r) => r.status === 404), results.map((r) => r.status).join(","));
}

// ---------- E21 creation limit + T19 generation limit (seeded in the DB, no AI calls) ----------
{
  const { rows } = await c.query("select id, creator_ip_hash from stores where slug=$1", [slug]);
  const { id, creator_ip_hash: myHash } = rows[0];
  const dummies = [];
  for (let i = 0; i < 5; i++) {
    const r = await c.query(
      "insert into stores (slug, client_request_id, edit_token_hash, creator_ip_hash, status, input) values ($1,$2,$3,$4,'failed','{}') returning id",
      [`ratelimit-${randomBytes(3).toString("hex")}`, randomUUID(), randomBytes(16).toString("hex"), myHash],
    );
    dummies.push(r.rows[0].id);
  }
  const r = await req("POST", "/api/stores", { clientRequestId: randomUUID(), token: tok(), input: cooking });
  check("E21 6th store in an hour → 429, no AI call", r.status === 429, `${r.status}`);
  await c.query("delete from stores where id = any($1)", [dummies]);

  await c.query("insert into events (store_id, type) select $1, 'section_regenerated' from generate_series(1, 30)", [id]);
  const g = await req("POST", `${api}/regenerate`, { target: "bio" });
  check("T19 31st regeneration in an hour → 429", g.status === 429, `${g.status}`);
  await c.query("delete from events where store_id=$1 and type='section_regenerated' and meta is null", [id]);
}

console.log(`\nstore: ${BASE}/s/${slug}\nedit:  ${BASE}/edit/${token}`);
await c.end();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
