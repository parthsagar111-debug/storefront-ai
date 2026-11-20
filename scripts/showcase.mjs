// Create a clean, published showcase store on the live URL (1 AI call). Prints token + slug.
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import pg from "pg";
import { randomBytes, randomUUID } from "node:crypto";
const B = process.argv[2] || "https://storefront-ai-blush.vercel.app";
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } }); await c.connect();
await c.query("update stores set creator_ip_hash = null where created_at > now() - interval '1 hour'"); await c.end();
const token = randomBytes(24).toString("base64url"), J = { "Content-Type": "application/json" };
const input = { name: "Ananya Sharma", expertise: "Practical Indian vegetarian home cooking", audience: "Working professionals and beginners", outcome: "Tasty everyday meals without hours in the kitchen", audienceSize: "5k_20k", language: "hinglish", instagramHandle: "ananyas.kitchen" };
await fetch(B + "/api/stores", { method: "POST", headers: J, body: JSON.stringify({ clientRequestId: randomUUID(), token, input }) });
let s; for (let i = 0; i < 40; i++) { s = await (await fetch(`${B}/api/stores/${token}`)).json(); if (s.status === "ready") break; await new Promise(r => setTimeout(r, 1500)); }
const api = `${B}/api/stores/${token}`;
await fetch(api, { method: "PATCH", headers: J, body: JSON.stringify({ creator: { whatsapp: "9876543210" } }) });
await fetch(api, { method: "PATCH", headers: J, body: JSON.stringify({ product: { id: s.draft.products[1].id, availability: "available" } }) });
const p = await (await fetch(`${api}/publish`, { method: "POST", headers: J, body: "{}" })).json();
console.log(JSON.stringify({ token, slug: p.slug, url: p.url, products: s.draft.products.map(x => `${x.format}=₹${x.price}`) }));
