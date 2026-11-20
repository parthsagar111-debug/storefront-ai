// Apply supabase/migrations/*.sql to the database in SUPABASE_DB_URL (.env.local). Idempotent SQL only.
import { config } from "dotenv";
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL missing in .env.local");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
  console.log("applying", f);
  await client.query(readFileSync(`supabase/migrations/${f}`, "utf8"));
}
const { rows } = await client.query(
  `select table_name, (select relrowsecurity from pg_class where relname = table_name) as rls
   from information_schema.tables where table_schema = 'public' order by 1`,
);
console.table(rows);
const { rows: cons } = await client.query(
  `select conname from pg_constraint where conrelid = 'events'::regclass and contype = 'c'`,
);
console.log("events check constraints:", cons.map((r) => r.conname).join(", "));
await client.end();
