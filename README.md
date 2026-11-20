# Storefront AI

A creator answers three quick questions and taps twice on their phone, and gets a published storefront (bio, 2–4 product ideas with INR prices) at a shareable link. The link also shows which idea gets the most interest. Built as a take-home for SuperProfile. See `SPEC.md`.

**Live:** https://storefront-ai-blush.vercel.app

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

## How it works (short)
- `/` → `POST /api/stores` (idempotent on a browser-generated `clientRequestId` + edit token) → generation runs server-side via `after()` with an atomic claim → `/edit/[token]` polls every 2 s.
- Gemini returns format + tier; code sets prices (§7.5), enforces the ≤ ₹499 entry rule, unique formats, claim and safety checks, and adds finance/health disclaimers.
- Primary model → fallback model within a 50 s budget (30 s for section regenerate). Stale runs (pending > 15 s, generating > 75 s) show **Try again**; the same SQL thresholds decide whether the server accepts it.
- `/s/[slug]` only ever reads the **published snapshot**; drafts change it only on Publish.
- Edit token: 192-bit, generated in the browser, stored as `sha256` only. The browser never talks to Supabase; the service-role and Gemini keys are server-only.

## `FORCE_AI_FAIL` demo switch
Set in Vercel → Project → Settings → Environment Variables (Production), then redeploy:
- `0` normal
- `1` attempt 1 (primary model) fails → the fallback model produces the store; the user sees no error (E5)
- `2` both attempts fail → "Our AI is busy right now. Your answers are saved." + **Try again** (E6)

## Tests
```bash
node scripts/core-gate.mjs        # core gate (SPEC §8) against the live URL, API level
node scripts/recovery-test.mjs    # stale pending/generating → Retry accepted; fresh → refused
node scripts/smoke.mjs            # E1/E2/E9/E11 smoke
npx tsx --conditions=react-server scripts/checks-test.ts    # deterministic checks (unit)
npx tsx --conditions=react-server scripts/model-check.ts    # real calls to both models with the production schemas
```
The DB-backed scripts need `SUPABASE_DB_URL` in `.env.local`.
