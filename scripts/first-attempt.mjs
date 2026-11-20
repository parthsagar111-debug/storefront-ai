// Create one store on the live URL and report which model produced it and in how many attempts.
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import pg from "pg";
import { randomBytes, randomUUID } from "node:crypto";
const B = process.argv[2] || "https://storefront-ai-blush.vercel.app";
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } }); await c.connect();
await c.query("update stores set creator_ip_hash = null where created_at > now() - interval '1 hour'"); // test hygiene (5/hour limit)
const token = randomBytes(24).toString("base64url");
const input = { name: "Ananya Sharma", expertise: "Practical Indian vegetarian home cooking", audience: "Working professionals and beginners", outcome: "Tasty everyday meals without hours in the kitchen", audienceSize: "5k_20k", language: "hinglish" };
const t0 = Date.now();
const r = await fetch(B + "/api/stores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: randomUUID(), token, input }) });
let s; while (Date.now() - t0 < 60000) { s = await (await fetch(`${B}/api/stores/${token}`)).json(); if (!["pending","generating"].includes(s.status)) break; await new Promise(r => setTimeout(r, 1000)); }
const { rows } = await c.query("select s.model_used, e.meta from stores s join events e on e.store_id=s.id and e.type='generation_completed' where s.slug=$1", [s.slug]);
console.log(JSON.stringify({ create: r.status, status: s.status, readyAfterMs: Date.now() - t0, model: rows[0]?.model_used, attempts: rows[0]?.meta.attempts, latencyMs: rows[0]?.meta.latencyMs, products: s.draft?.products.map(p => `${p.format}=₹${p.price}`) }, null, 1));
await c.end();
