# Storefront AI

A creator answers three quick questions and taps twice on their phone, and gets a published storefront (bio, 2–4 product ideas with INR prices) at a shareable link. The link also shows which idea gets the most interest. Built as a take-home for SuperProfile. See `SPEC.md`.

**Live:** _added after first deploy_

## Stack
Next.js 16 (App Router), TypeScript, Tailwind, Zod, `@google/genai` (Gemini), Supabase Postgres (server-side service-role key only), Vercel.

## Run locally
```bash
npm install
cp .env.example .env.local   # fill in values
node scripts/migrate.mjs     # create tables (needs SUPABASE_DB_URL), or paste supabase/migrations/*.sql into the Supabase SQL editor
npm run dev
```

## Env vars
| Var | Notes |
|---|---|
| `GEMINI_API_KEY` | server only |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` | primary / fallback model ids |
| `IP_HASH_SALT` | random string for hashing IPs |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | server only, never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL` | public base URL |
| `FORCE_AI_FAIL` | demo switch: `1` = primary model fails (fallback shown), `2` = both fail (retry screen) |
| `SUPABASE_DB_URL` | local only, for `scripts/migrate.mjs` |

## Model check
```bash
npx tsx scripts/model-check.ts
```
Real calls to both models with the production schemas; raw outputs go to `scripts/out/`.
