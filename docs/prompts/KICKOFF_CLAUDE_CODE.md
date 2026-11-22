# Kickoff message for Claude Code

> Paste everything below the line into Claude Code, with SPEC.md and PROMPTS.md added to the repo root first.

---

You are the engineering lead for **Storefront AI**, a take-home assignment for a PM role at SuperProfile. You are the only tool that writes to this repo. Deadline: **Sunday 22 Nov, 5:00 PM IST**; working target: deployed and passing the core tests by **Saturday evening**.

## Read first
1. `SPEC.md` (v4.4, frozen). It is the source of truth. Don't add features that aren't in it. If something in it is impossible or wrong, stop and tell me; don't silently change it.
2. `PROMPTS.md`: the exact Gemini prompt text. Use it as written; tell me if you have to change it.

## Stack
Next.js ≥ 15.1 (App Router, current stable), TypeScript, Tailwind, Zod, `@google/genai`, Supabase (Postgres, server-side service-role key only), Vercel. Deploy from GitHub to Vercel.

## How to work
- Build **vertical slices in order** (SPEC §13). After each slice: deploy, run the slice's checks, then **stop and report** to me: what works, what you tested, the live URL, anything you had to decide. Wait for my go before the next slice.
- Ask me for env values when you need them (SPEC §14). Never commit keys; commit `.env.example` with empty values.
- Keep a `BUILD_LOG.md` in the repo: per slice, what you built, problems hit, decisions made, and how AI tools were used. It feeds the decision doc.
- Don't spend time on visual polish until slice 5 passes. Claude Design's screens arrive separately and are applied in slice 6.

## First task: slice 0 + model check
1. Create the repo structure, Supabase tables from SPEC §6 (with the v4.1–v4.4 constraints), `.env.example`, and a deployed hello-world on Vercel.
2. **Before any generation pipeline code:** make real API calls to `gemini-3.8-flash` and `gemini-3.5-flash-lite` with the **exact production schemas** (`GenerationResult`, `BioResult`, `ProductResult`) and the PROMPTS.md text, using the cooking persona. Report: do both model ids work, does `responseSchema` accept the union (otherwise use the flat schema, PROMPTS.md §5), latency per call, and paste one raw output from each model.

Then stop and report.

## Implementation checks (from the final review; verify these explicitly and report on each)
1. **Generation recovery:** the atomic claim's WHERE clause must accept stale `pending` (> 15s, unclaimed) **and** stale `generating` (> 75s). Test it: the UI must never show Retry while the server refuses to run.
2. **Model availability:** both model ids and the structured-output schemas verified with real calls before the rest of the pipeline is built (first task above).
3. **Security:** every edit, regenerate, answer, retry and publish endpoint validates `sha256(token)` server-side. The Supabase service-role key and Gemini key are server-only (never `NEXT_PUBLIC_`, never in client bundles). Check the built client bundle for them.
4. **Published snapshot:** editing or regenerating a draft must never change `/s/[slug]` until Publish is clicked (test E14 and E24).
5. **Time management:** the full journey S1 → AI → Editor → Publish → public URL must be deployed before any polish or secondary feature.

## Priority tests
After slice 5, report results for the **core gate** in SPEC §8, with special attention to **E1, E2, E8, E9 (including the lost-response case), E14 and E24**. Test on a real phone width (360px) against the live URL, not localhost.

## Finally
A short `README.md`: what it is, the live URL, setup steps, env vars, how to run locally, and the `FORCE_AI_FAIL` demo switch.
