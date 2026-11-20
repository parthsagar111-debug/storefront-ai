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
