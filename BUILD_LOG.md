# BUILD_LOG — Storefront AI

Per slice: what was built, problems hit, decisions made, how AI tools were used. Feeds the decision doc.

---

## Slice 0 — repo, schema, env, hello world, model check (Fri 20 – Sat 21 Nov)

### Built
- Next.js **16.4.6** (current stable; satisfies ≥ 15.1 for `after()`), React 19.3, TypeScript, Tailwind 4, `@google/genai` 3.6.1, Zod 4.6.7, `@supabase/supabase-js` 2.119.
- `supabase/migrations/0001_init.sql`: SPEC §6 exactly, plus v4.1–v4.4 constraints: `event_day` column (T1), `public_events_need_visitor` covering all three public events (T14/T24), `product_events_need_product` (T18), partial unique indexes for interest taps and daily views. RLS enabled on both tables with no policies; `anon`/`authenticated` grants revoked. Added (not in spec, harmless): `updated_at` trigger, an index on `(creator_ip_hash, created_at)` for the creation rate-limit query.
- `src/lib/ai/schemas.ts`: Zod schemas from SPEC §7.2 (source of truth) + Gemini `responseSchema` objects for the model-filled fields only (PROMPTS.md §5). Union sent as `anyOf`; flat fallback also defined.
- `src/lib/ai/prompts.ts`: PROMPTS.md v1 text verbatim as template functions; 500-char truncation per field.
- `scripts/model-check.ts`: real calls with the exact production schemas + prompt text, cooking persona (Hinglish). Raw outputs saved in `scripts/out/`.
- `scripts/migrate.mjs`: applies migrations via the session pooler (local only).
- `/api/health`: reports whether server env vars are present (booleans only).

### Model check results (Sat 21 Nov, ~00:30 IST)

| Model | Union schema | Flat schema | needs_more | Bio | Product | Latency |
|---|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | ✅ Zod ok | ✅ | ✅ | ✅ | ✅ | 1.7–4.1 s |
| `gemini-3.8-flash` | ❌ 503 | ❌ 503 | ❌ 503 | ❌ 503 | skipped | n/a — 503 "high demand" / 504 on every call, including a 2-word prompt, over ~3 runs |
| `gemini-3.7-flash` (probe) | ❌ 503 | ❌ 503 | ❌ 503 | ❌ 503 | skipped | n/a |
| `gemini-3.5-flash` (probe) | ✅ | ✅ | ✅ | ✅ | ✅ | 38–58 s (served as `gemini-3.6-flash`) — too slow for the 22 s primary budget |

- `responseSchema` **accepts the union** (`anyOf`) — no need for the flat schema so far (confirmed on Flash-Lite; to re-confirm on 3.8 Flash).
- `gemini-3.8-flash` exists in `models.list()`; the failures are capacity, not a bad id.

### Problems hit
- npm install on the Windows-mounted drive (`/mnt/d`) is slow (~10 min).
- One 3.8 Flash call hung **180 s** before returning 503. **Pipeline must pass an explicit per-call timeout** (`httpOptions.timeout` / AbortSignal) — the SDK's own retry/timeout won't respect our 22 s budget.
- `.env.local`: pooler string was pasted into `SUPABASE_URL`; moved to `SUPABASE_DB_URL`.
- Supabase project region is `ap-northeast-1` (Tokyo), not Mumbai. Fine for a prototype; adds ~100 ms per DB round-trip from India.

### Decisions
- Extra local-only env var `SUPABASE_DB_URL` (not in SPEC §14) for applying migrations; never set on Vercel.
- **Root cause found:** the Gemini key's project is on the **Free Tier** (429 `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, limit 20/day for 3.8 Flash, exhausted by the retries). Free-tier traffic is also the first to get 503 under load. SPEC §7.1 already requires billing → Parth to enable billing on the AI Studio project, then re-run `scripts/model-check.ts`.
- **Open (Parth):** if 3.8 Flash still 503s on the paid tier, choose a primary model (spec change).

### AI tools
- Claude Code: scaffold, schema, prompt wiring, model-check script, running real calls.

### Deploy
- GitHub: https://github.com/parthsagar111-debug/storefront-ai (public). Commits use the GitHub noreply address.
- Vercel: https://storefront-ai-blush.vercel.app (`storefront-ai.vercel.app` was taken). Git-connected; pushes to `main` deploy.
- Env vars on Vercel (production + preview), all marked sensitive except `NEXT_PUBLIC_APP_URL`. `SUPABASE_DB_URL` is not on Vercel.
- Checks: `/` returns 200; `/api/health` shows gemini/supabase/salt present; the client JS bundle (~570 KB) contains neither the Gemini key nor the Supabase secret key (implementation check 3, re-run after each slice).

---

## Slice 1 — S1 → POST /api/stores → after() generation → /edit/[token] with polling (Sat 21 Nov)

### Built
- **S1** (`/`): 4 typed answers with tap-to-fill chips, audience size + language chips, optional Instagram. Client check only blocks empty / < 2 chars / one char ×5. Token (24 random bytes, base64url) + `clientRequestId` generated in the browser and saved to localStorage **before** the POST (T11); a new pair on every Create (T27). Unconfirmed submissions are re-sent with the same ids on the next visit (lost-response recovery). Storage blocked → the T22 message and a one-time edit link. "Continue your store" banner.
- **POST /api/stores** in T12 order: idempotency lookup (same id + same token → same store; other token → 409) → validate (Zod, 500-char truncation) → insert → `after(runGeneration)`. A concurrent duplicate hits the unique constraint and falls back to the lookup. Creation rate limit deferred to slice 5 (spec order).
- **runGeneration**: atomic claim (`claim_generation` SQL function, migration 0002) → primary → fallback within the 50 s budget (22 s cap on attempt 1, remaining − 3 s on attempt 2) → Zod → unique formats/titles → §7.5 pricing + ladder repair → write **only if this run still holds the claim** (`gen_started_at` match).
- **Stale detection on the DB clock**: `get_store_by_token_hash` returns `is_stale` from the same SQL thresholds the claim uses (pending > 15 s, generating > 75 s). The UI shows Retry only when `failed || isStale`.
- **GET /api/stores/[token]**, **POST /retry** (claims synchronously, so its response is truthful), **POST /answer** (S2b direction → pending → regenerate).
- **/edit/[token]**: polls every 2 s; skeleton + rotating lines + "Taking a little longer" after 20 s; S2b direction chips + free text; S2c unclear (back to S1 prefilled) and failed/stale (Try again); ready → `StoreView` (shared with the public page in slice 3); unknown token → "This store doesn't exist (yet)".
- Events written server-side: `generation_started`, `generation_completed` (model, attempts, latency), `generation_failed`, `followup_shown`.

### Tests (live URL)
- `scripts/smoke.mjs`: **E1** ready in 26 s (3 products: ebook ₹149 / template pack ₹399 / live workshop ₹499, Hinglish, unique formats, name from input, no hashes in the response); **E9** same ids → same slug, other token → 409, two concurrent POSTs → one row and **one** `generation_started`; **E11** unknown/malformed token → 404; `aaaaa` and bad token → 400; **E2** "fitness/people/get fit" → 3 directions → tap → ready in 10 s. 19/20 passed — the 1 failure was **both** models returning 503 (free tier); the store correctly went to `failed` → Retry.
- `scripts/recovery-test.mjs` (**implementation check 1**): forces 5 states in the DB and compares UI vs server. pending 5 s → no Retry; pending 20 s → Retry shown and accepted; generating 30 s → no Retry, server refuses (409); generating 80 s → Retry shown and accepted; failed → accepted. A second Retry never double-runs (409). **All passed.**
- Real UI at 360 px (in-app browser, live URL): chips → Create → generating → Hinglish store. No horizontal scroll (scrollWidth 360). Edit link saved and confirmed in localStorage.
- **Implementation check 3**: client JS for `/` and `/edit` (1.17 MB) contains none of the Gemini key, the Supabase secret key, the IP salt, or even the Supabase hostname.

### Problems hit
- `permission denied for table stores`: this Supabase project doesn't auto-grant new tables to API roles. Migration 0003 grants **only** `service_role`; anon/authenticated stay locked out.
- `@google/genai` retries **5×** with backoff by default (explains the 180 s hang in slice 0). Set `retryOptions.attempts = 1`; the pipeline owns retries.
- Free tier: 3.8 Flash returns 503/504/429 on almost every call, so every store currently comes from Flash-Lite after a 1–20 s wasted primary attempt. Billing is pending Google's identity verification; provider decision Saturday evening (Parth).
- Template dark-mode CSS made text unreadable on dark phones; pinned light theme until the slice 6 design handoff.
- React 19 lint (`set-state-in-effect`): polling/storage reads moved into callbacks.

### Decisions
- `unclear` is stored as `status = needs_input` + `follow_up.kind = "unclear"` (the status enum has no `unclear`; avoids a schema change). Retry isn't offered for it; the creator goes back to S1 with answers prefilled.
- `updated_at` marks when a row entered `pending` (insert / answer); nothing else updates a pending row, so it's the "unclaimed since" clock for the 15 s rule.
- Pulled from slice 2 because slice 1 can't work without them: fallback model, time budget, pricing + ladder. Left for slice 2: tierReason scrub, banned-claims regex, sensitive-domain keywords + disclaimers, `FORCE_AI_FAIL`.
- Max 2 needs_more rounds (S2b) is tracked (`follow_up.round`) but not enforced yet (slice 5).

### AI tools
- Claude Code: read the bundled Next 16 docs (`after`, Cache Components + Route Handlers, async params), wrote all code and SQL, ran the live smoke and recovery tests, drove the in-app browser at 360 px, read Vercel logs to find the grants issue.
