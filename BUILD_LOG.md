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

---

## Slices 2–5 (Sat 21 Nov, built straight through at Parth's request)

### Slice 2 — deterministic checks, safety, demo switch
- `build-store.ts`: unique formats + titles; §7.5 pricing; ladder repair (move one entry-capable product to its highest ≤ ₹499 tier, else fail the attempt); `tierReason` sentences with ₹ / Rs / INR / 3+ digit numbers removed; banned claims (guaranteed, 100%, lakh/crore + earn, "certified"/"SEBI" unless in the input) fail the attempt; sensitive domain = model OR input keywords (T8) → disclaimer on every product.
- Product regenerate uses the same checks against the kept products; if the replaced product was the only entry product, the replacement is forced to an entry tier or the attempt fails (PROMPTS.md `mustBeEntry`).
- `FORCE_AI_FAIL` 1/2 in the pipeline.
- `scripts/checks-test.ts`: 24 unit checks, all pass.

### Slice 3 — publish, public store, CTAs, events, tap counts
- `POST /publish`: optional WhatsApp (normalized to 10 digits), full draft re-validation, T5 (Available now ⇒ number, incl. Skip) → `published` snapshot.
- `/s/[slug]`: reads only `published`; OG/Twitter meta (title = name · headline, description = bio); CTAs: Available now → Enquire on WhatsApp (`wa.me/91…?text=Hi <name>, I'd like to buy "<title>"`); Coming soon → I'm interested (once per browser, confirmation) + Ask on WhatsApp if a number exists, else Follow on Instagram if a handle exists; footer link to `/`.
- `POST /api/events`: visitorId required for all three (T24), productId for taps (T18); store must be published, product must be in the published snapshot, interest only for Coming soon, WhatsApp tap only with a number (T21); 30/hashed IP/store/hour (T3); duplicates dropped by the unique indexes.
- Editor: page views + "N interested · N WhatsApp taps" per product, "Taps show interest, not purchases." shown the first time.

### Slice 4 — editor
- Sheet component: bottom sheet on phones, side panel ≥ 768 px (D6). Header sheet (name, headline, bio, Instagram, WhatsApp + privacy line). Product sheet (availability, title, format select with used formats disabled → re-prices to typical, price ₹49–₹99,999 with suggested range + soft warning (D17), summary, description, 3 deliverables). Available now without a number asks for it inside the sheet.
- `PATCH`: merges into the draft, re-validates the whole draft incl. T5, `priceSource` = `creator` unless the price equals the table price for (format, tier); sets `has_unpublished_changes` only once published.
- `POST /regenerate` (bio / product / all), synchronous with inline pulse on that block only; failure → toast "Couldn't regenerate, kept your previous version." Regenerate all: confirm dialog; needs_more/unclear keep the draft and show the message (T25). Regenerated products get new ids (T20).
- "Why ₹X?" chip (tier reason or "You set this price" + typical range), soft hint when no product is under ₹500, Draft / Live / Unpublished changes badge, View live.

### Slice 5 — states, limits, not-found
- Creation limit 5/hashed IP/hour (after validation, before insert, T12); shared generation limit 30/store/hour on answer, retry, regenerate (T19).
- S2b: after 2 rounds the free-text box is hidden and the server only accepts one of the offered directions.
- S6 not-found for `/s/unknown`, `/edit/badtoken` and any unknown route.

### Tests (live URL)
- `scripts/core-gate.mjs` — **43/43 after the fix below**: E1, E8, E14 (edit + regenerate don't reach `/s/`; republish does), E15, E16, E17 (two taps → 1, second browser → 2), E18, E20, E21 (seeded 5 stores → 6th = 429, no AI call), E22, E23 (new ids, bio changed, name/WhatsApp kept, same edit link), E24 (public HTML renders with no token, OG tags, no token/hashes in HTML), E11, T5, T18, T19 (seeded 30 → 429), T21, T24, and check 3 (PATCH/regenerate/answer/retry/publish → 404 without the real token).
- **E5** (`FORCE_AI_FAIL=1`): store ready via `gemini-3.5-flash-lite`, logged attempts `[3.8-flash: FORCE_AI_FAIL=1, flash-lite: ok]`. **E6** (`=2`): `failed`, input kept → Try again. Switch reset to 0.
- UI at 360 px (in-app browser, live): editor, product sheet (used formats disabled, ₹2,999 soft warning, Cancel), Why ₹399 chip, Publish with a number → "Your store is live" + edit-link warning, Publish without a number → invalid "12345" inline error + privacy line + Skip → live, public page I'm interested → "✓ Thanks! Meera will see that you're interested.", no Ask on WhatsApp without a number, no horizontal scroll, store height 1.7 screens, "Continue your store" banner, S6 page.
- Check 3 re-run: 2.5 MB of HTML + client JS for `/`, `/edit`, `/s/…`, `/s/unknown` — no Gemini key, Supabase key, salt, Supabase host or Gemini endpoint.

### Problems hit
- **Gemini rejects deadlines < 10 s** (400 INVALID_ARGUMENT). On the 30 s section budget, a slow primary left the fallback 7 s → bio regenerate 502. Fix: attempt 1 is capped at `min(22 s, remaining − 13 s)` so the fallback always gets ≥ 10 s. Full generation is unchanged (22 s / ≤ 25 s); section regenerate becomes 17 s / ≤ 10 s. Small deviation from the §7.4 wording, same intent.
- Client components imported `schemas.ts`, which also held the Gemini `responseSchema` objects → would ship the Gemini SDK to phones. Split into `response-schemas.ts` (server-only).
- Public footer link was 18 px tall → 44 px.
- In-app browser pane was hidden during testing, so `requestAnimationFrame` never fired and React's streamed Suspense reveal didn't run (page stuck on "Loading…"). The server HTML was correct; verified by client-side navigation instead. **Needs Parth's real-phone check.**

### Decisions
- Regenerate endpoints are synchronous (≤ 30 s / 50 s inside `maxDuration = 60`) instead of going through the status/polling path: simpler, and the rest of the store stays usable.
- The current store sent to the model for regenerate contains no prices (PROMPTS.md: never insert rupee numbers).
- `/retry` and `/answer` can return 429 from the shared limit even when Retry is visible; the UI then says "Too many tries for this store." (the only case where Retry is shown but refused; documented).

### Not done / open
- Real-phone pass by Parth on the live URL (core gate requires it).
- Gemini billing/tier decision (Saturday evening): until then every generation spends 0.1–20 s on a failing 3.8 Flash call before Flash-Lite answers.
- Slice 6+ (Claude Design screens, remaining edge cases, colour picker).
