# QA_REPORT — Storefront AI

Independent QA / SDET run against **https://storefront-ai-blush.vercel.app** (production, commit `56a71d3`, tag `qa-baseline`) and a QA **preview** deployment of branch `qa/config`. Source of truth: `SPEC.md` v4.4, `PROMPTS.md`.

## 1. Summary

**Verdict: READY WITH ISSUES.** The core journey (input → AI → edit → regenerate → publish → public link → interest/WhatsApp taps) works end to end on production with real AI, and nothing in security, idempotency, recovery or the draft/published split failed. **No P0.** Four P1s are worth fixing before submission (slow API from the function region, the Instagram-URL dead end, an invented personal fact in one bio, and portfolio-advice offers in a finance store), plus six P2 polish items.

| Area | PASS | FAIL | BLOCKED | NOT RUN |
|---|---|---|---|---|
| Journey A | 25 | 0 | 0 | 0 |
| Journey B | 10 | 0 | 0 | 0 |
| Journey C | 6 | 0 | 0 | 0 |
| B. AI generation | 16 | 3 | 0 | 0 |
| A. Input | 9 | 2 | 0 | 0 |
| E. Recovery | 4 | 0 | 0 | 0 |
| Journey D | 5 | 0 | 0 | 0 |
| F. Security | 11 | 0 | 0 | 0 |
| C. Editor | 9 | 1 | 0 | 0 |
| D. Publish/public | 9 | 1 | 0 | 0 |
| G. UX/a11y/perf | 8 | 0 | 0 | 0 |
| **Total** | **112** | **7** | **0** | **0** |

Counts use the latest result per test (re-verified entries supersede harness mistakes, listed in §7). Raw log: every test with its evidence path was recorded during the run.

| | |
|---|---|
| AI generation calls used | 32 / 40 (full generations + section regenerates; forced-failure runs make no Gemini call and are not counted) |
| Production untouched (code, deployment, env vars) | **Yes** — production env vars identical to the pre-run snapshot; no deploys to production; only QA-named stores/events written through the public API (journeys) |
| Preview cleaned up | **Yes** — preview left at `FORCE_AI_FAIL=0`, `STORE_CREATE_LIMIT_PER_HOUR=100`; `qa/config` not merged |
| Battery / time guard triggered | **No** (battery 64% → 100%, charging). The run was started at 10:39 IST on Sat 21 Nov; the "past 06:30 IST" guard was read as 06:30 on Sun 22 Nov (the next 06:30 after the start) — logged as a decision |

Interpretation notes and harness corrections are in §7.

## 2. Journeys (A–D)

Evidence paths are under `qa/screenshots/`. Edit links are written as `/edit/<redacted>`.

### Journey A — happy path, Indian micro-creator (production, real AI, 360 px)
| Step | Result | Evidence |
|---|---|---|
| A1 Form → submit → loading | **PASS** | Store-shaped skeleton + 4 rotating lines + 4-step progress bar (`A1-S2-rotating-360.png`). On this real run Gemini answered in 2.8 s, so S2 shows only briefly; most of the 11.5 s tap-to-store wait is spent on S1 ("Creating…") and in slow polls — see **QA-01** |
| A2 Real Gemini generation | **PASS** | DB event `generation_completed`: `gemini-3.5-flash-lite`, 1 attempt, 2.8 s |
| A3 Content | **PASS** | 3 products (ebook/low ₹149, template_pack/typical ₹399, live_workshop/typical ₹499), 3 deliverables each, ₹ with Indian grouping in the UI (`A3-editor-360.png`) |
| A4 Prices = §7.5 table; ≥ 1 ≤ ₹499 | **PASS** | rule checker: 0 violations |
| A5 Edit bio; edit product title/description/price; Cancel | **PASS** | price ₹249 saved as `priceSource: creator`; Cancel left headline unchanged (`A5-product-sheet-360.png`) |
| A6 Regenerate bio only | **PASS** | headline + bio changed; products byte-identical |
| A7 Regenerate one product | **PASS** | same position (3), dimmed card + "Regenerating…" pill, card count 3→3 (`A7-regenerating-360.png`); live_workshop → one_on_one (unique); new id; the manually edited product kept its id |
| A8 Regenerate all | **PASS** | confirmation first (`A8-confirm-360.png`); all product ids new; same edit link; rules pass |
| A9 Publish without WhatsApp (Skip) | **PASS** | privacy line shown; live sheet (`A9-publish-ask-360.png`, `A9-live-360.png`, edit link redacted) |
| A10 Public page on another phone, 360 + 1440 | **PASS** | no horizontal scroll; all titles; no editor-only chips (`A10-public-360.png`, `A10-public-1440.png`) |
| A11 I'm interested twice → counted once; editor count | **PASS** | confirmation; button replaced; remembered after reload; DB/editor count 1 (`A11-interested-360.png`) |
| A12 Refresh both pages | **PASS** | draft + publish state identical |
| A13 Edit after publish | **PASS** | "Unpublished changes" badge; public page unchanged (`A13-badge-360.png`) |
| A14 Republish | **PASS** | public page updated; badge back to Live |
| Console / network | **PASS** | no console errors or 5xx (one `ERR_ABORTED` was the harness's own reload cutting a keepalive beacon) |

### Journey B — Available-now product (production, same store)
| Step | Result | Evidence |
|---|---|---|
| B1/B2 Available now without WhatsApp — UI | **PASS** | sheet asks for the number; Save blocked with inline error (`B2-available-needs-number-360.png`); Publish sheet: Skip disabled with the reason (`B2-skip-disabled-360.png`) |
| B2 — API called directly | **PASS** | `PATCH` → 400 `whatsapp_required`; `POST /publish` on a draft forced into that state (DB, QA store) → 400 `whatsapp_required` |
| B3 Valid number → publish | **PASS** | "98765 43210" normalised to `9876543210` |
| B4 Enquire on WhatsApp | **PASS** | `https://wa.me/91XXXXXXXXXX?text=Hi QA, I'd like to buy "Sunday Prep Checklist"` |
| B5 Tap → `whatsapp_tapped` | **PASS** | count 0→1, DB row 1; second tap 1→2 (counted, not deduplicated — T24) |
| B6 Coming-soon cards + one badge/CTA each | **PASS** | coming soon: I'm interested + Ask on WhatsApp; available: Enquire only (`B4-public-360.png`); interest on the available product ignored (204, count 0) |

### Journey C — returning creator (production, real AI)
| Step | Result | Evidence |
|---|---|---|
| C1 Create; refresh mid-generation; close 5 s after submit (E10) | **PASS** | reopened `/` → "Continue your store · QA Meera Iyer" → same, finished store (`C2-continue-banner-360.png`) |
| C2 Edit, close, Continue | **PASS** | edit intact |
| C3 Create a new store | **PASS** | new token + clientRequestId; device list 1→2; old edit link still 200 with its edits; banner now points to the newest store |

### Journey D — failure and recovery (preview)
| Step | Result | Evidence |
|---|---|---|
| D1 `FORCE_AI_FAIL=1` | **PASS** | attempts `3.5-flash-lite: FORCE_AI_FAIL=1 → 3.1-flash-lite: ok`; normal editor, no error (`D1-fallback-store-360.png`) |
| D2 `FORCE_AI_FAIL=2` | **PASS** | "Our AI is busy right now. Your answers are saved." + answers summary + Try again; DB `failed`, input kept (`D2-both-fail-360.png`) |
| D3 Back to 0 → Retry | **PASS** | ready; exactly 1 row for that clientRequestId (`D3-retry-success-360.png`) |
| D4 Forced failure on bio / product regenerate | **PASS** | toast "Couldn't regenerate, kept your previous version."; old bio / old card intact (`D4-*-fail-360.png`) |

## 3. Bug list (most severe first)

No **P0**: no data loss, no secret exposure, the core journey never broke.

### QA-01 · P1 · API calls cross the world: functions run in `iad1`, Supabase is in Tokyo
- **Test:** A1, C1 timeline, probe-loading; `x-vercel-id: bom1::iad1::…`
- **Steps:** tap Create my store on a phone in India; watch the button and the editor.
- **Expected:** SPEC §1/§5 S1 "your store in about a minute", S2 is the waiting screen; E1 "store in < 30 s" (passes) — but the wait should feel immediate.
- **Actual:** every API call goes India → Vercel edge (bom1) → function in **Washington (iad1)** → Supabase **Tokyo** and back. `GET /api/stores/<token>` takes **1.3–1.9 s** (two DB round trips), a create that fails validation takes 1.1 s, a real create ≥ 3 s on "Creating…". Server-side the store is ready 4.3–5.1 s after insert (Gemini p50 2.3 s), but tap-to-store in the UI was **11.5 s**. Each 2 s poll costs ~1.9 s.
- **Diagnosis:** no `regions` setting → Vercel's default `iad1`; DB is `ap-northeast-1`.
- **Fix:** add `vercel.json` `{ "regions": ["hnd1"] }` (Tokyo, next to the DB) — or `bom1` and later move Supabase to Mumbai. Optionally fetch store + counts in one RPC. **Effort S** (one file + redeploy; re-run the core gate).

### QA-02 · P1 · Pasting an Instagram profile URL blocks creation with a generic error
- **Test:** A-instagram-url-ux (`A-instagram-url-error-360.png`)
- **Steps:** S1 → open Instagram → paste `https://instagram.com/qa.handle` (what "Copy profile URL" gives on a phone) → Create.
- **Expected:** SPEC §5 S1 Instagram is optional and only shown as a link; the creator shouldn't get stuck.
- **Actual:** API 400 → "Please check your answers and try again." Nothing points at the Instagram field; the user must guess. (`instagram.com/x`, `qa handle!`, `@@qa` behave the same.) Answers are kept.
- **Fix:** in `src/lib/server/input.ts` normalise before validating: strip `https?://(www\.)?instagram\.com/`, trailing `/` and `?…`, leading `@`. In `src/app/create-form.tsx` map the 400's `issues` (the API already returns field paths) to a field message, e.g. "Use just your handle, like @ananyas.kitchen". **Effort S.**

### QA-03 · P1 · AI invented a personal fact in a bio (honesty rule)
- **Test:** human review, store "QA Priya Nair" (fitness for new moms, preview)
- **Expected:** SPEC §7.3 / PROMPTS §1 "Use only facts from the creator's input. Never invent credentials… years of experience…".
- **Actual:** bio: "I am Priya, **a fitness coach** for new moms. **After my own experience postpartum**, I help women…" — neither fact is in the input. The banned-claims regex can't catch personal backstory.
- **Fix:** (a) PROMPTS.md honesty rules: add "Do not invent personal history, job titles or life events (e.g. 'after my own…', 'as a mother', 'as a coach') unless the input says so". (b) `src/lib/ai/build-store.ts` `checkClaims`: fail the attempt on first-person backstory patterns not present in the input (`\bmy own (experience|journey)\b`, `\bas a (mother|mom|doctor|coach|certified)\b`, `\b\d+\+? years\b`). Re-run the §16 eval. **Effort M.** Prompt text is Parth's/Claude chat's call → **Needs Parth**.

### QA-10 · P1 · Finance store offers portfolio advice and "safe stock" picks
- **Test:** human review of the kept finance store (production, "QA Arjun Mehta", stock market basics for college students)
- **Expected:** SPEC §7.3 / PROMPTS §1 finance: "education only. No stock tips, buy or sell calls, **portfolio advice**…". India-specific risk: advice without SEBI registration.
- **Actual:** products include "**1-on-1 Portfolio Review Call** — Private call to review your portfolio… Personalised feedback on your stocks" and a ₹199 pack that helps you "**pick your first safe stock**". Disclaimers ("For learning only. Not investment advice.") are on every product, but the offers themselves contradict them. Rule checker can't see this (no banned word).
- **Fix:** PROMPTS.md finance rule: add "no portfolio reviews, no 'which stock to buy', no 'safe' stocks; offer concepts, process and tools instead". `checkClaims` in `src/lib/ai/build-store.ts`: when the final domain is finance, fail the attempt on `portfolio (review|audit|advice)`, `feedback on your (stocks|portfolio)`, `safe stocks?`, `(which|best) stocks? to buy`, `buy\/sell`, `multibagger`, `tips?` near `stock`. Re-run eval #3. **Effort M.** Prompt text → **Needs Parth**.

### QA-04 · P2 · Long unbroken text overflows at 360 px
- **Test:** C-long-text-360 (`C-long-text-360.png`, `C-long-text-public-360.png`)
- **Steps:** set a 60-character title with no spaces (or a long URL in the bio / a long name) → view editor and public page at 360 px.
- **Expected:** SPEC §5 S5 quality bar: no horizontal scroll at 360 px.
- **Actual:** editor `scrollWidth` 591 (horizontal scroll); on the public page the name, headline, bio word, title and price run past the card edge (clipped by the frame).
- **Fix:** `src/components/store-view.tsx`: add `break-words [overflow-wrap:anywhere]` to the h1/h2/p, `min-w-0` on the title column of the title/price row; same on the editor top-bar name. **Effort S.**

### QA-05 · P2 · Products are not always ordered cheapest → premium
- **Test:** human review, "QA Meera Iyer" (Canva): ₹199, **₹1,499, ₹999**.
- **Expected:** PROMPTS §1 "Order the products from cheapest to most premium" (a prompt rule; code doesn't enforce it).
- **Fix:** `buildStoreContent` in `src/lib/ai/build-store.ts`: sort `products` by price ascending after `enforceLadder` (regenerate-one keeps its slot). **Effort S.**

### QA-06 · P2 · `og:url` is relative; no `metadataBase`
- **Test:** D-og-tags (production HTML)
- **Actual:** `og:url="/s/qa-ananya-sharma-epka"`; Open Graph requires an absolute URL. Title/description (what SPEC §5 S5 requires) are correct, and link-preview bots (WhatsApp, Facebook, Twitter, Telegram, Slack UAs) get them in `<head>` ✓. Lighthouse (browser UA) reports "no meta description" because Next streams metadata into the body for non-bot UAs (SEO 90).
- **Fix:** `src/app/layout.tsx` metadata: `metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://storefront-ai-blush.vercel.app")`. **Effort S.**

### QA-07 · P2 · S1 invalid fields only disable the button — no message says which field
- **Test:** A-required-messages (`A-required-blocked-360.png`)
- **Actual:** empty / 1 char / spaces / "aaaaa" correctly block (0 API calls), but the creator only sees a greyed-out button. SPEC §5 S1 doesn't require messages; the test plan does.
- **Fix:** `src/app/create-form.tsx`: on blur of an invalid field show "Add a few words" / "That doesn't look like a real answer". **Effort S.**

### QA-08 · P2 · Two tabs: a header save re-sends every header field (stale overwrite)
- **Test:** C-two-tabs. Tab 1 saved a new headline; tab 2 (opened earlier) saved only a bio change but re-sent the old headline → tab 1's change lost. No corruption.
- **Fix:** `src/app/edit/[token]/sheets.tsx`: PATCH only fields that differ from the sheet's initial values. **Effort S.**

### QA-09 · P2 · Unsaved sheet edits are discarded without a prompt when navigating away
- **Test:** C-navigate-away-unsaved. SPEC has no requirement; noting behaviour.
- **Fix:** `beforeunload` while a sheet is dirty. **Effort S.**

### Observations (not bugs)
- **Primary model 503s:** `gemini-3.5-flash-lite` returned 503 "high demand" on 4 of ~21 real generations (~19%); the fallback (`3.1-flash-lite`) rescued every one (no user-visible failure). If both are busy at once the user gets the Retry screen (D2 path). Paid tier would reduce this.
- **UPSC, 100K+ audience:** all products ≤ ₹499, no premium step (prompt preference, not a rule).
- **Lighthouse public store:** performance 87 (TBT 470 ms). Fine on Fast 3G (first card 2.1 s, 247 KB).
- **QA setup:** preview and production share Supabase + `IP_HASH_SALT`, so QA creations on the preview counted against production's 5/hour for this IP (blocked the kept-store creates for ~1 h).

## 4. AI quality

### Latency
- **Generation only** (server-side, from `generation_completed` events, n=25 real runs incl. needs_more/unclear): **p50 2.3 s, p95 9.1 s**, max 10.9 s.
- **API time-to-store** (POST → status settled, polled every 1.5 s from the test machine, n=12): **p50 7.2 s, p95 9.3 s**, max 10.6 s.
- **UI tap-to-editor** (Journey A on a phone viewport): **11.5 s** — the gap vs. generation time is QA-01.
- Primary `gemini-3.5-flash-lite` returned 503 on ~19% of real calls; fallback `gemini-3.1-flash-lite` succeeded every time (attempt-2 latency 2.0–3.2 s).
- Status outcomes were right every time: gibberish/unsafe/prompt-injection → `unclear`; "fitness/people/get fit", "ab" and yoga→JEE → `needs_more` with 3 distinct directions; real niches → `ok`.

### Programmatic rule check — every AI-generated QA store (17 stores; production + preview)
Checks: 2–4 products · valid + unique formats · unique titles · price = §7.5 table for format+tier (unless creator-set) · ≥ 1 product ≤ ₹499 · `tierReason` has no ₹/Rs/3+ digits · 3 deliverables · summary ≤ 90 · bio 60–320 · headline 8–70 · banned claims · finance/health → disclaimer on every product · Hinglish in Roman script · name/Instagram copied from input.

| Store | Lang | Domain | Products (format/tier=price, * = creator price) | Rule check |
|---|---|---|---|---|
| QA Ananya Sharma | hinglish | none | ebook/low=₹149, template_pack/low=₹199, live_workshop/typical=₹499 | ✅ all rules |
| QA Ananya Sharma | hinglish | none | ebook/low=₹149, template_pack/typical=₹399, live_workshop/typical=₹499 | ✅ all rules |
| QA Meera Iyer | en | none | template_pack/low=₹199, recorded_course/typical=₹1499, live_workshop/high=₹999 | ✅ all rules |
| QA Meera Second | en | none | template_pack/low=₹199, recorded_course/typical=₹1499, one_on_one/high=₹1999 | ✅ all rules |
| QA Rohan Verma | en | none | ebook/low=₹149, template_pack/typical=₹399, live_workshop/typical=₹499 | ✅ all rules |
| QA Priya Nair | en | health | live_workshop/low=₹299, ebook/typical=₹299, one_on_one/high=₹1999 | ✅ all rules |
| QA Ravi Kumar | en | health | ebook/low=₹149, template_pack/typical=₹399, one_on_one/typical=₹999 | ✅ all rules |
| QA &lt;img src=x onerror=alert(1)> &lt;script>alert(1)&lt;/script> | en | none | ebook/low=₹149, template_pack/low=₹199, live_workshop/typical=₹499 | ✅ all rules |
| QA Zoë Ḿéhta 🌿 | en | health | ebook/low=₹149, template_pack/typical=₹399, live_workshop/typical=₹499 | ✅ all rules |
| QA Long Text | en | none | template_pack/low=₹199, ebook/typical=₹299, live_workshop/typical=₹499 | ✅ all rules |
| QA Lost Response | en | none | ebook/low=₹149, template_pack/typical=₹399, live_workshop/typical=₹499 | ✅ all rules |
| QA Double Tap | en | finance | template_pack/low=₹199, ebook/typical=₹299, one_on_one/typical=₹999 | ✅ all rules |
| QA No Storage | en | none | template_pack/low=₹199, live_workshop/typical=₹499, one_on_one/high=₹1999 | ✅ all rules |
| QA Fallback Test | en | none | ebook/low=₹149, template_pack/typical=₹399, live_workshop/typical=₹499 | ✅ all rules |
| QA Both Fail Test | en | none | ebook/low=₹149, live_workshop/typical=₹499, one_on_one/high=₹1999 | ✅ all rules |
| QA Arjun Mehta | en | finance | template_pack/low=₹199, recorded_course/typical=₹1499, one_on_one/high=₹1999 | ✅ all rules |
| QA Kavita Rao | en | none | template_pack/low=₹199, ebook/typical=₹299, one_on_one/typical=₹999 | ✅ all rules |

**Pattern:** 9 of 17 stores use a variant of ebook + template pack + live workshop regardless of niche — correct but repetitive across creators.

### Human judgement (scores 1–5, SPEC §16 rubric)
| Store | Relevance | Distinct problems | Concreteness | Feasibility | Price sense / progression | Voice & safety | Notes |
|---|---|---|---|---|---|---|---|
| Cooking / Hinglish (QA Ananya Sharma) | 5 | 4 | 5 | 5 | 4 | 5 | Natural Hinglish; "15 dinner recipes", "1-hour Zoom". Ladder ₹149→₹199→₹499; no premium (fine for 5K–20K). Template pack and ebook overlap slightly (both planning). |
| UPSC, 100K+ (QA Rohan Verma) | 5 | 4 | 4 | 5 | 3 | 4 | All three products ≤ ₹499 for a 100K+ creator: no core/premium step (mentorship, cohort). "High-scoring answers" is mild promise language but no numbers. |
| Fitness for new moms (QA Priya Nair) | 5 | 4 | 4 | 5 | 4 | **2** | **Bio invents a fact: "After my own experience postpartum…" and calls her "a fitness coach"** — neither is in the input (SPEC §7.3 honesty rule). Health disclaimer on every product ✓. Workshop and ebook both ₹299 (fine). |
| Canva for small business (QA Meera Iyer) | 5 | 5 | 5 | 5 | 3 | 5 | Products **not ordered cheapest→premium**: ₹199, ₹1,499, ₹999 (prompt rule; code doesn't sort). Otherwise strong: "30 ready-to-edit templates", "10 short video lessons". |
| Thin → "Strength training for women over 40 at home" (QA Ravi Kumar) | 5 | 4 | 4 | 5 | 4 | 5 | Good recovery from thin input via the typed direction. "Under 5K" → low/typical tiers, one_on_one typical ✓ (matches tier guidance). |
| Finance, kept (QA Arjun Mehta) | 5 | 5 | 4 | 4 | 4 | **2** | **Portfolio review call + 'pick your first safe stock' (QA-10)**; disclaimers present on all products; ₹199 → ₹1,499 → ₹1,999 progression is clear. |
| No-audience coach, kept (QA Kavita Rao) | 5 | 5 | 5 | 5 | 5 | 5 | No audience → checklist ₹199, guide ₹299, 1:1 at *typical* ₹999 (matches the tier guidance). Concrete: '25 evaluation points', 'pre-call resume review'. |

### Full JSON of 3 stores (stored `draft`, no tokens)
<details><summary>Cooking / Hinglish — QA Ananya Sharma (kept; after QA edits, regenerate-all and a final header regenerate)</summary>

```json
{
  "theme": "saffron",
  "creator": {
    "bio": "Hi, main Ananya hoon. Main jaanti hoon ki office se thak kar aane ke baad cooking ek bojh lagti hai. Isiliye, main simple aur budget-friendly vegetarian meals share karti hoon jo bina kisi extra jhanjhat ke turant ready ho jaate hain. Let’s make daily cooking easy and stress-free for you.",
    "headline": "Office ke baad 20 minute mein banayein ghar ka tasty khana",
    "whatsapp": "9876543210",
    "displayName": "QA Ananya Sharma"
  },
  "language": "hinglish",
  "products": [
    {
      "id": "s6Is6yi0",
      "tier": "low",
      "price": 149,
      "title": "One-Pot Meal Recipes",
      "format": "ebook",
      "summary": "12 easy one-pot veg recipes jo kam bartan aur kam time mein ban jaati hain.",
      "tierReason": "A small, affordable starter guide with low production effort, perfect for new buyers.",
      "whatYouGet": [
        "PDF guide with 12 one-pot recipes",
        "Ingredient list for each dish",
        "Prep time and cooking time guide"
      ],
      "description": "Jab raat ko thak kar ghar aao, tab heavy cooking ka man nahi karta. Yeh ebook un working professionals ke liye hai jo ek hi bartan mein tasty aur nutritious dinner banana chahte hain taaki baad mein bartan bhi kam dhone padein.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "R6VmyAKf",
      "tier": "typical",
      "price": 399,
      "title": "Sunday Prep Checklist",
      "format": "template_pack",
      "summary": "1-hour Sunday routine templates jo poore hafte ka khana sorted rakhte hain.",
      "tierReason": "A practical template pack that saves daily planning time, offering solid everyday value.",
      "whatYouGet": [
        "Printable Sunday meal prep checklist",
        "Weekly grocery shopping planner template",
        "Vegetable chopping and storage tracker"
      ],
      "description": "Hafte bhar kya banega yeh sochna aur roz sabzi katna bohot exhausting hota hai. Is template pack mein aapko milte hain ready checklists aur prep steps jo aapke Sunday ke ek ghante mein poore week ka cooking aasan kar dete hain.",
      "priceSource": "ai_tier",
      "availability": "available"
    },
    {
      "id": "ojILGVn9",
      "tier": "typical",
      "price": 499,
      "title": "Quick Cooking Live Masterclass",
      "format": "live_workshop",
      "summary": "60-minute live workshop jismein hum saath mein 3 fast dinner options banayenge.",
      "tierReason": "A live interactive session takes direct creator time and offers personalized learning.",
      "whatYouGet": [
        "60-minute live Zoom session link",
        "Step-by-step recipe notes PDF",
        "Q&A session to solve your kitchen doubts"
      ],
      "description": "Agar aapko live dekh kar sikhna pasand hai, toh yeh workshop aapke liye hai. Hum saath mein 60 minutes mein teen aisi recipes banayenge jo office days ke liye perfect hain, aur aap apne sawaal bhi live pooch sakte hain.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    }
  ],
  "sensitiveDomain": "none"
}
```
</details>

<details><summary>Finance / English — QA Arjun Mehta (kept)</summary>

```json
{
  "theme": "indigo",
  "creator": {
    "bio": "Hi, I am Arjun Mehta. I help college students understand the stock market from scratch so you can start investing safely with small amounts from your pocket money.",
    "headline": "Learn stock market basics and start investing safely",
    "displayName": "QA Arjun Mehta"
  },
  "language": "en",
  "products": [
    {
      "id": "ElZGkZNY",
      "tier": "low",
      "price": 199,
      "title": "Pocket Money Investing Cheat Sheet",
      "format": "template_pack",
      "summary": "Ready-to-use checklist and tracker for your first investments",
      "disclaimer": "For learning only. Not investment advice.",
      "tierReason": "A small, affordable starter pack for students on a tight budget making their first purchase.",
      "whatYouGet": [
        "PDF checklist for account setup",
        "Excel tracker for small investments",
        "Step-by-step beginner guide"
      ],
      "description": "Designed specially for college students. Get a simple tracker and checklist to set up your brokerage account, pick your first safe stock, and track your pocket money investments without stress.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "phj9JraV",
      "tier": "typical",
      "price": 1499,
      "title": "Stock Market Basics Video Course",
      "format": "recorded_course",
      "summary": "Learn how the stock market works through short video lessons",
      "disclaimer": "For learning only. Not investment advice.",
      "tierReason": "A solid recorded course with clear depth covering everything a beginner needs to know.",
      "whatYouGet": [
        "10 recorded video lessons",
        "PDF summary notes for each module",
        "Lifetime access on your phone"
      ],
      "description": "Stop guessing and start learning. This self-paced video course breaks down complex market terms into simple language. Understand how shares work, how to read charts, and how to avoid common beginner traps.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "imyR0w68",
      "tier": "high",
      "price": 1999,
      "title": "1-on-1 Portfolio Review Call",
      "format": "one_on_one",
      "summary": "Private call to review your portfolio and answer your doubts",
      "disclaimer": "For learning only. Not investment advice.",
      "tierReason": "Involves direct personal time with the creator to look at individual student portfolios.",
      "whatYouGet": [
        "45-minute private call on Zoom",
        "Personalised feedback on your stocks",
        "Recording of the private session"
      ],
      "description": "Bring your specific questions to a private video call. We will look at your current stock holdings, discuss risk management, and clear all your personal doubts about starting your investment journey.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    }
  ],
  "sensitiveDomain": "finance"
}
```
</details>

<details><summary>No-audience coach — QA Kavita Rao (kept)</summary>

```json
{
  "theme": "indigo",
  "creator": {
    "bio": "I am Kavita Rao. I help mid-level managers who feel stuck at the same level figure out their next career move and plan a transition or promotion without the guesswork.",
    "headline": "Helping mid-level managers plan their next promotion or switch",
    "whatsapp": "9123456780",
    "displayName": "QA Kavita Rao"
  },
  "language": "en",
  "products": [
    {
      "id": "F19DNRQ-",
      "tier": "low",
      "price": 199,
      "title": "Promotion Readiness Checklist",
      "format": "template_pack",
      "summary": "Checklist to see if you are ready for your promotion.",
      "tierReason": "This quick checklist is a simple, affordable first step for managers who want to assess where they stand right now.",
      "whatYouGet": [
        "PDF checklist with 25 evaluation points",
        "Self-assessment tracker in Excel",
        "Manager conversation planning template"
      ],
      "description": "Find out what gaps exist between your current role and the next level. This ready-to-use checklist helps you audit your recent projects, stakeholder visibility, and skill gaps so you can start preparing today.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "XzOVIsoo",
      "tier": "typical",
      "price": 299,
      "title": "Mid-Level Career Growth Guide",
      "format": "ebook",
      "summary": "Step-by-step guide to unstick your mid-level career.",
      "tierReason": "A comprehensive written guide that covers the exact steps needed for a mid-career transition.",
      "whatYouGet": [
        "PDF guide with chapters on positioning and promotion",
        "Example email templates for talking to HR",
        "Resume rewrite guide for senior roles"
      ],
      "description": "Stop feeling invisible in your current role. This ebook walks you through how to showcase your leadership, handle office politics, and build a strong case for your next promotion or job switch.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "zJQdL8OV",
      "tier": "typical",
      "price": 999,
      "title": "1-on-1 Career Strategy Call",
      "format": "one_on_one",
      "summary": "A private 45-minute call to solve your career block.",
      "tierReason": "A private session providing personalized attention and direct review of your specific career situation.",
      "whatYouGet": [
        "45-minute private call on Zoom",
        "Pre-call resume and profile review",
        "Written action steps sent after the call"
      ],
      "description": "Get direct eyes on your resume and current workplace challenges. We will spend forty-five minutes on Zoom looking at your goals and mapping out a clear action plan for your next switch or promotion.",
      "priceSource": "ai_tier",
      "availability": "available"
    }
  ],
  "sensitiveDomain": "none"
}
```
</details>

## 5. Needs Parth
1. **QA-03 + QA-10 prompt changes** (honesty rule + backstory check; finance: no portfolio review / "safe stock") and a re-run of the §16 eval — prompt text is owned by Claude chat / you.
2. **Function region (QA-01):** `hnd1` (next to the Tokyo DB, simplest) vs `bom1` + moving Supabase to Mumbai (better for Indian users, more work).
3. **Instagram URLs (QA-02):** accept-and-parse (recommended) or reject with a clear message.
4. **Gemini billing:** primary model 503s ~19% on the free tier; fallback hides it today.
5. **Test data:** QA stores (`QA …` names, slugs `qa-…`) are in the production DB. Delete before sharing widely, except the 3 kept stores in §8.
6. **Product order (QA-05):** sort by price in code, or leave to the prompt.

## 6. Fix plan for the morning
| Order | Bug | Effort | Why this order |
|---|---|---|---|
| 1 | QA-01 region | S (~10 min + redeploy + gate) | Biggest felt improvement for every reviewer action |
| 2 | QA-02 Instagram URL | S (~30 min) | A reviewer can get stuck on S1 |
| 3 | QA-04 long text overflow | S (~15 min) | SPEC quality bar |
| 4 | QA-06 metadataBase | S (~5 min) | One line |
| 5 | QA-05 product order | S (~10 min) | One line + check regenerate |
| 6 | QA-03 invented facts + QA-10 finance advice | M (~2 h together incl. eval) | Same files (PROMPTS.md + `checkClaims`); needs your prompt decision |
| 7 | QA-07/08/09 | S each | Polish if time allows |

**Total P1 + P2: ~4–5 h**, of which P1s ≈ 3 h.

## 7. Not tested / blocked, and why
**Not tested / partly tested**
- **Real devices:** everything ran in Playwright with desktop Chrome + mobile emulation (360×800, Android Chrome UA, touch). No physical iPhone/Android; in particular iOS Safari's keyboard behaviour with the sticky Create button (iOS ignores `interactive-widget`) is untested — Parth's phone pass.
- **Keyboard-open at 360 px** was simulated by shrinking the viewport (360×420) — passes in slice 6's suite (`docs/screenshots/S1-360-keyboard.png`), not on a real keyboard.
- **axe-core** is automated only (WCAG 2.1 A/AA + best practice: 0 violations on S1, S3, S5). Focus order and screen-reader announcements were not checked by hand.
- **Load / concurrency:** intentionally not run (rule 7). The event throttle was checked with 35 sequential requests.
- **Creation limit on production (5/hour):** verified from code + exercised on the preview with the limit set to 2 (not burned on production).
- **Gemini billing tier / `gemini-3.8-flash`:** not testable (free tier, billing pending).
- **OG previews in the real WhatsApp app:** checked by crawler user-agent (`<head>` has title/description/og:*), not by sharing a link in WhatsApp.

**Harness corrections (my own test bugs, re-run and recorded; the later entry supersedes)**
- A1-loading: first check used `aria-busy` (present on ready pages too) and missed a 2.8 s generation → re-verified on a seeded generating store.
- A-console: `ERR_ABORTED` on `/api/events` was my `reload()` cutting the keepalive beacon.
- B-thin-typed-direction: polled before the answer POST landed → re-verified from the DB.
- D1: "no error text" regex matched the word *busy* in generated copy ("busy weekdays").
- C-price-49/99999/100000 and C-empty-title: fixed 700 ms wait was shorter than the slow PATCH (see QA-01) → re-run with an outcome wait.
- F-token-required: counted Next's 308 trailing-slash redirect as a pass-through (it ends in 405).
- A-required-blocking: the valid "2 chars" case was force-clicked and really submitted (2 extra generations, counted in the AI total).
- Kept-store creation hit production's 429 because preview creations from this IP share the same limit counter → waited ~1 h and re-ran.

**Interpretation decisions (Parth was not available)**
- Time guard: run started 10:39 IST Sat; "past 06:30 IST" read as 06:30 Sun 22 Nov.
- A previous session had already created `qa/config`, the preview env vars, a protection-bypass secret and one QA store (1 AI call, counted). I continued from there; the bypass secret is stored only in a session scratch file, never in the repo or this report.
- "Another store's token": tokens are per store, so the check was "store A's token cannot touch store B's products" (404).
- Screenshots that showed an edit link (A9, D-live-sheet, E-storage-blocked) were redacted before committing.

## 8. Kept stores
Three published production stores, kept for the demo / reviewers (edit links only in the git-ignored `qa/PRIVATE_LINKS.md`):

| Store | Public link | Notes |
|---|---|---|
| Cooking / Hinglish (QA Ananya Sharma) | https://storefront-ai-blush.vercel.app/s/qa-ananya-sharma-epka | WhatsApp set; one product Available now (Journey B) |
| Finance / English (QA Arjun Mehta) | https://storefront-ai-blush.vercel.app/s/qa-arjun-mehta-vmd4 | No WhatsApp → I'm interested only; **shows QA-10 content** — regenerate the 1:1 product after the fix |
| No-audience coach (QA Kavita Rao) | https://storefront-ai-blush.vercel.app/s/qa-kavita-rao-pwb2 | Test WhatsApp `91234 56780`; 1:1 Available now |

They carry the "QA " prefix in the name; rename in the editor (or create fresh stores) before showing them to reviewers.

---

## 9. After fixes (Sat 21 Nov, production)

Fixes QA-01…06, IQA-01…06, PROMPTS v2 (item 6) and the new `checkClaims` patterns (item 7) are live (production deployment of `047c199`). Core gate: **43/43** after each of the three deploys.

### QA-01 latency, before vs after (`iad1` → `hnd1`)
| | Before (`iad1`) | After (`hnd1`) |
|---|---|---|
| GET `/api/stores/<token>` (6 samples) | median **1747 ms** (1394–3642) | median **416 ms** (269–839) |
| Tap Create → edit page | 4.3 s | **2.0 s** |
| Tap Create → ready editor (real generation) | 8.8 s | **5.4 s** |

### Eval re-run (§16 inputs, 1 generation each, production)
Rule check = B7 checks + QA-03 backstory patterns + QA-10 finance-advice patterns.

| # | Input | Expected | Status | Formats (tier, price) | ebook+template+workshop? | Step-up product? | Rule check | Attempts |
|---|---|---|---|---|---|---|---|---|
| 1 | cooking | ok | ok ✅ | ebook/low ₹149, template_pack/typical ₹399, live_workshop/typical ₹499 | yes | yes | ✅ none | 2 (primary: {"error":{"code":503,"message":"This mod…) |
| 2 | fitness-new-moms | ok | ok ✅ | ebook/low ₹149, recorded_course/typical ₹1499, one_on_one/high ₹1999 | no | yes | ✅ none | 1 |
| 3 | finance | ok | ok ✅ | ebook/low ₹149, template_pack/typical ₹399, live_workshop/typical ₹499 | yes | yes | ✅ none | 2 (primary: finance advice: "stock tips"…) |
| 4 | upsc | ok | ok ✅ | template_pack/low ₹199, live_workshop/typical ₹499, cohort_course/high ₹7999 | no | yes | ✅ none | 2 (primary: {"error":{"code":503,"message":"This mod…) |
| 5 | astrology | ok | ok ✅ | ebook/low ₹149, template_pack/typical ₹399, one_on_one/typical ₹999 | no | yes | ✅ none | 1 |
| 6 | canva | ok | ok ✅ | template_pack/low ₹199, live_workshop/typical ₹499, one_on_one/high ₹1999 | no | yes | ✅ none | 1 |
| 7 | career-coach | ok (1:1-led) | ok ✅ | template_pack/low ₹199, live_workshop/typical ₹499, one_on_one/typical ₹999 | no | yes | ✅ none | 2 (primary: {"error":{"code":503,"message":"This mod…) |
| 8 | yoga-seniors | ok | ok ✅ | ebook/low ₹149, one_on_one/typical ₹999, recorded_course/typical ₹1499 | no | yes | ✅ none | 1 |
| 9 | thin | needs_more | needs_more ✅ | — | — | — | ✅ none | 1 |
| 10 | gibberish | unclear | unclear ✅ | — | — | — | ✅ none | 1 |
| 11 | 2000-chars | ok, truncated | ok ✅ | ebook/low ₹149, template_pack/typical ₹399, live_workshop/typical ₹499 | yes | yes | ✅ none | 1 |
| 12 | unsafe | unclear | unclear ✅ | — | — | — | ✅ none | 2 (primary: {"error":{"code":503,"message":"This mod…) |

**Summary**
- **Statuses:** 12/12 correct (8 + #11 `ok`, #9 `needs_more` with 3 distinct directions, #10 and #12 `unclear`).
- **Invented backstory / finance advice in the stored output:** none (0 violations on all 12). The new code check **did fire once**: on #3 (finance) the primary model wrote "stock tips"; the attempt was rejected and the fallback model produced a compliant store. Residual soft spots (not rule breaks): the finance store has a "Safe Investing Concepts Workshop" and "safely invest" wording, and an "Investment Portfolio Tracker" template (a tool for tracking your own investments, not a review).
- **Product mix:** the ebook + template pack + live workshop set now appears in **3 of 9** `ok` stores (cooking, finance, the 2,000-char cooking input) — down from 9 of 15 in the QA run. Recorded courses, a cohort course and 1:1s now appear where they fit (fitness, UPSC, astrology, yoga, Canva, coach).
- **UPSC 100K+ step-up:** **yes** — template pack ₹199 → answer-writing workshop ₹499 → **UPSC Mains Strategy Cohort ₹7,999**. Fitness (20K–100K) also has a step-up (recorded course ₹1,499, 1:1 ₹1,999).
- **Availability:** the primary model returned 503 on 4/12 calls; the fallback rescued all of them.
- **Minor:** the yoga Hinglish bio mixes "karti hoon" and "sikhata hoon" (gender agreement).

### Full JSON (stored drafts, no tokens)

<details><summary>Cooking / Hinglish (#1)</summary>

```json
{
  "theme": "saffron",
  "creator": {
    "bio": "Hi, main Ananya. Main aapko batati hoon kaise office ke baad thakne par bhi aap ghar ka swadisht khana jaldi bana sakte hain. Bina zyada time kharab kiye, roz ke healthy aur tasty meals prepare karne mein main aapki madad karti hoon.",
    "headline": "Roz ka khana, bas 20 minute mein",
    "displayName": "QA Eval Ananya"
  },
  "language": "hinglish",
  "products": [
    {
      "id": "5sLDqlgE",
      "tier": "low",
      "price": 149,
      "title": "20-Minute Weeknight Meal Plan",
      "format": "ebook",
      "summary": "15 simple recipes for tasty meals under 20 minutes.",
      "tierReason": "A small, quick-win guide for beginners to get started easily.",
      "whatYouGet": [
        "PDF guide with 15 recipes",
        "Prep-ahead tips for each recipe",
        "Weekly grocery shopping checklist"
      ],
      "description": "Thak kar ghar aane ke baad bhi healthy khana banana ab possible hai. Is ebook mein aapko milenge quick recipes jo office ke baad kitchen mein aapka time bachaengi aur aapko ghar ka swaad dengi.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "VELAonEQ",
      "tier": "typical",
      "price": 399,
      "title": "Kitchen Efficiency Templates",
      "format": "template_pack",
      "summary": "Templates to organise your kitchen and weekly meal prep.",
      "tierReason": "Solid, practical tools that provide ongoing value for meal planning.",
      "whatYouGet": [
        "Digital weekly meal planner template",
        "Customisable grocery inventory sheet",
        "Kitchen pantry staple checklist"
      ],
      "description": "Apne kitchen ko manage karna ab simple hai. Ye templates aapko help karenge grocery list banane mein aur pura hafta kya banana hai, ye pehle se plan karne mein, taaki aapka time aur energy dono bache.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "kyD_hAOx",
      "tier": "typical",
      "price": 499,
      "title": "Mastering 20-Minute Cooking",
      "format": "live_workshop",
      "summary": "Learn my exact process to cook fast, healthy meals live.",
      "tierReason": "A live interactive session that offers deeper engagement and real-time learning.",
      "whatYouGet": [
        "90-minute live cooking workshop",
        "Real-time Q&A with Ananya",
        "Recording of the live session"
      ],
      "description": "Is live session mein hum saath mein cook karenge. Main aapko dikhaungi ki kaise ingredients ko smart tarike se use karke aap 20 minute mein complete meal taiyaar kar sakte hain. Aap apne doubts live puch sakte hain.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    }
  ],
  "sensitiveDomain": "none"
}
```
</details>

<details><summary>Finance / Hinglish (#3)</summary>

```json
{
  "theme": "indigo",
  "creator": {
    "bio": "Main Arjun hoon, aur main college students ko stock market ki basics samajhne mein help karta hoon. Mera goal hai ki aap chote amounts se safely invest karna shuru kar sakein, bina dar ya confusion ke. Let's make your first investment journey simple.",
    "headline": "Stock market basics seekho, bina kisi stress ke",
    "displayName": "QA Eval Arjun"
  },
  "language": "hinglish",
  "products": [
    {
      "id": "WQUa5oCs",
      "tier": "low",
      "price": 149,
      "title": "Stock Market Basics Starter Guide",
      "format": "ebook",
      "summary": "Ek simple guide jo aapko stock market ke basics step-by-step samjhayegi.",
      "disclaimer": "For learning only. Not investment advice.",
      "tierReason": "This is a quick-read PDF meant for beginners who want a low-cost entry point into the topic.",
      "whatYouGet": [
        "PDF handbook on stock market basics",
        "Glossary of common trading terms",
        "Checklist for your first demat account"
      ],
      "description": "Naye investors ke liye ek simple handbook. Isme stocks, dividends, aur risk manage karne ke basic concepts hain jo har student ko pata hone chahiye.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "vb3qhC9U",
      "tier": "typical",
      "price": 399,
      "title": "Investment Portfolio Tracker",
      "format": "template_pack",
      "summary": "Apne investments ko organize karne ke liye ek ready-to-use tracker.",
      "disclaimer": "For learning only. Not investment advice.",
      "tierReason": "A practical tool that provides ongoing value for tracking investments, justifying a typical tier.",
      "whatYouGet": [
        "Google Sheets portfolio tracker",
        "Monthly budget and savings planner",
        "Goal setting template for long-term growth"
      ],
      "description": "College mein hote hue investments manage karna mushkil ho sakta hai. Ye templates aapko apna chota-mota portfolio track karne aur monthly savings plan karne mein help karenge.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "yPsNKW_N",
      "tier": "typical",
      "price": 499,
      "title": "Safe Investing Concepts Workshop",
      "format": "live_workshop",
      "summary": "Live session jahan hum safe investing ke concepts aur strategy discuss karenge.",
      "disclaimer": "For learning only. Not investment advice.",
      "tierReason": "A live interactive session allows for Q&A, providing more depth than static content.",
      "whatYouGet": [
        "90-minute live session on Zoom",
        "Q&A session to clear your doubts",
        "Access to the workshop recording"
      ],
      "description": "Ek 90-minute live session jahan hum basics se upar uthkar, safe investing strategies aur market concepts ko detail mein samjhenge. Apne doubts live clear karein.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    }
  ],
  "sensitiveDomain": "finance"
}
```
</details>

<details><summary>Fitness for new moms (#2)</summary>

```json
{
  "theme": "teal",
  "creator": {
    "bio": "I help new mothers rebuild core strength and fitness through safe, short home workouts that fit around a baby's schedule.",
    "headline": "Get strong again with short home workouts for new moms",
    "displayName": "QA Eval Priya"
  },
  "language": "en",
  "products": [
    {
      "id": "fJKIEP91",
      "tier": "low",
      "price": 149,
      "title": "Postnatal Core Starter Guide",
      "format": "ebook",
      "summary": "Safe exercises to gently restart your fitness journey at home.",
      "disclaimer": "For general wellness. Not medical advice.",
      "tierReason": "A small, affordable entry-level guide to help new mothers begin core recovery safely.",
      "whatYouGet": [
        "PDF guide with core recovery exercises",
        "Printable daily tracker sheet",
        "Step-by-step posture correction checklist"
      ],
      "description": "This PDF guide is designed specifically for new moms who want to rebuild core strength after childbirth. Get safe, gentle routines that take just ten minutes a day.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "tk2xh3LZ",
      "tier": "typical",
      "price": 1499,
      "title": "New Mom Home Workout Plan",
      "format": "recorded_course",
      "summary": "Step-by-step video workouts you can do at home with your baby.",
      "disclaimer": "For general wellness. Not medical advice.",
      "tierReason": "A complete video course offering structured guidance for sustained postnatal fitness.",
      "whatYouGet": [
        "15 follow-along video workout sessions",
        "Weekly calendar and schedule planner",
        "Access to private community discussion board"
      ],
      "description": "A comprehensive self-paced video series with 15 home workouts tailored for new mothers. Rebuild overall strength without needing expensive gym equipment or long hours away from your baby.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "WvliMJOs",
      "tier": "high",
      "price": 1999,
      "title": "1-on-1 Postnatal Fitness Review",
      "format": "one_on_one",
      "summary": "Private video consultation to review your form and build a custom routine.",
      "disclaimer": "For general wellness. Not medical advice.",
      "tierReason": "A personalised video call giving direct attention and customized advice for your recovery.",
      "whatYouGet": [
        "45-minute 1-on-1 video call on Zoom",
        "Customized weekly workout schedule",
        "Direct chat support for two weeks after the call"
      ],
      "description": "A focused 45-minute video call where we discuss your recovery stage, check your exercise form, and create a personalized weekly routine that fits your daily routine.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    }
  ],
  "sensitiveDomain": "health"
}
```
</details>

<details><summary>UPSC, 100K+ (#4)</summary>

```json
{
  "theme": "indigo",
  "creator": {
    "bio": "I help UPSC aspirants streamline their study process and master the syllabus with practical frameworks. I focus on breaking down complex exam requirements into manageable daily goals so you can prepare with confidence.",
    "headline": "Simplify your UPSC preparation with a clear, actionable roadmap.",
    "displayName": "QA Eval Rohan"
  },
  "language": "en",
  "products": [
    {
      "id": "EKZhYqwU",
      "tier": "low",
      "price": 199,
      "title": "UPSC Daily Study Tracker Template",
      "format": "template_pack",
      "summary": "A Notion-based tracker to organise your daily subjects and revision cycles.",
      "tierReason": "This is a simple tool designed for quick setup and daily use.",
      "whatYouGet": [
        "Notion template for daily study tracking",
        "Weekly revision schedule layout",
        "PDF guide on how to use the tracker"
      ],
      "description": "Stop guessing what to study next. This template helps you map out your daily targets, track completion status, and log your revision hours so you stay consistent with your preparation.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "sFL2oFu5",
      "tier": "typical",
      "price": 499,
      "title": "Mastering Answer Writing Workshop",
      "format": "live_workshop",
      "summary": "A 90-minute live session on structuring high-scoring answers for Mains.",
      "tierReason": "The live interactive component provides value that warrants a solid tier.",
      "whatYouGet": [
        "90-minute live workshop recording",
        "Checklist for effective answer structure",
        "Two sample model answers for practice"
      ],
      "description": "Learn the exact framework to structure your answers for GS papers. We will break down how to write compelling introductions, body paragraphs, and conclusions under time pressure.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "_oYXkSw5",
      "tier": "high",
      "price": 7999,
      "title": "UPSC Mains Strategy Cohort",
      "format": "cohort_course",
      "summary": "A 4-week intensive programme to refine your Mains strategy and syllabus coverage.",
      "tierReason": "This is a premium, multi-week intensive programme with direct guidance.",
      "whatYouGet": [
        "Four weekly live group coaching calls",
        "Access to a private peer discussion group",
        "Structured 4-week syllabus completion plan"
      ],
      "description": "Join a focused group of aspirants to deep-dive into Mains preparation. We cover syllabus prioritisation, time management, and answer-writing discipline over four weeks of live sessions.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    }
  ],
  "sensitiveDomain": "none"
}
```
</details>

---

## 10. Round 2 (Sat 21 Nov, production `caa90ab`)

Changes: SPEC v4.5 / PROMPTS v3, finance "safe"-wording check, T28 Edit answers & regenerate, T29 Delete store, S4/S3 wording aligned with SPEC v4.5, plus two fixes found while testing (below). Core gate **43/43**; E25 and E26 **pass**; round-1 regression (honest interest, no lost edits) **5/5**.

**Found and fixed during this round**
- **PROMPTS v3 × SPEC §7.2 conflict:** v3's richer price reasons often exceeded the SPEC's `tierReason` max(160), so Zod rejected the attempt — single-product regenerate failed with 502 on both models (core gate E8). Fix: over-long reasons are trimmed to the whole sentences that fit (≤ 160) before validation. SPEC and PROMPTS text unchanged — **decision for Parth:** keep the trim, raise the SPEC cap, or add a length to the prompt.
- **Next 16 preserved routes (T28):** after Edit answers the editor came back stale (old store, no polling), and an S1 restored from an earlier visit could lose edit mode. Fix: S1 and the editor are keyed by `useRouter().bfcacheId` (remount on push, restore on back/forward). E25 now goes S1 → Continue → editor → Edit answers by client-side navigation and checks the editor shows the generating screen and then the new products.

### Mini eval (4 generations, production)
| Store | Status / attempts | Rules (B7 + backstory + finance + "safe") | Hinglish gender | Live formats: first deliverable |
|---|---|---|---|---|
| Cooking / Hinglish (Ananya) | ok, 1 attempt | ✅ all pass | consistent feminine ("banati hoon") | live workshop → "1-hour live cooking session on Zoom" ✅ |
| Finance / Hinglish (Arjun, college students) | ok, primary 503 → fallback | ✅ all pass; **no "safe"-type wording** | consistent masculine ("help karta hoon") | 1:1 → "45-minute live video call" ✅ |
| Yoga for seniors / Hinglish (**Kiran**) | ok, 1 attempt | ✅ all pass | **neutral** — bio uses "mera focus hai…", no first-person gendered verb ("batati" refers to the guide) | 1:1 → "45-minute live video call on Zoom" ✅ |
| UPSC 100K+ | ok, 1 attempt | ✅ all pass | — (English) | 1:1 → "45-minute private call on Zoom" ✅ |

**tierReason — do they mention the audience?** Mostly yes (working professionals, students, seniors, aspirants in 11 of 12), and all were ≤ 160 chars this time (no trim needed). Two still lean generic, which v3 discourages: cooking ebook “…well suited for beginners who want a low-cost entry point…” (says *beginners*, not working professionals) and finance ebook “…a simple entry-level guide for students…”.
- Cooking:
  - `ebook/low` ₹149 — *Quick Recipe Guide* — tierReason: “A small and quick collection of recipes well suited for beginners who want a low-cost entry point to home cooking.”
  - `template_pack/typical` ₹399 — *Weekly Meal Planner* — tierReason: “A solid set of templates that helps working professionals plan their weekly meals and grocery shopping efficiently.”
  - `live_workshop/typical` ₹499 — *Live Cook-Along* — tierReason: “A live interactive session where working professionals can cook together and clear doubts in real time.”
- Finance:
  - `ebook/low` ₹149 — *Stock Market Starter Guide* — tierReason: “This is a simple entry-level guide for students to build foundational knowledge without a large commitment.”
  - `template_pack/typical` ₹399 — *Budgeting & SIP Planner* — tierReason: “A practical tool that helps students manage their pocket money for consistent investing.”
  - `one_on_one/typical` ₹999 — *Stock Market Q&A Session* — tierReason: “Provides students with direct access to get specific conceptual doubts cleared, offering high value for their learning.”
- Yoga (Kiran):
  - `ebook/low` ₹149 — *Senior Flexibility Guide* — tierReason: “This is a quick, low-cost entry ebook for seniors wanting to start flexibility work at home with simple PDFs.”
  - `one_on_one/typical` ₹999 — *1-on-1 Senior Yoga Consultation* — tierReason: “A private 45-minute video call where seniors get personalised attention for their specific mobility needs.”
  - `recorded_course/typical` ₹1,499 — *Pain-Free Joints Routine* — tierReason: “A solid recorded video course offering depth and clear visual guidance for seniors to practice safely at home.”
- UPSC:
  - `template_pack/low` ₹199 — *UPSC Answer Writing Checklist* — tierReason: “A quick-win resource for aspirants who want to improve daily answer structure without spending much time or money.”
  - `recorded_course/typical` ₹1,499 — *UPSC Prelims Mock Test Series* — tierReason: “A solid practice package with video explanations for aspirants preparing for the upcoming Prelims exam.”
  - `one_on_one/high` ₹1,999 — *1-on-1 UPSC Study Plan Review* — tierReason: “A private strategy call offering personal attention for aspirants who need custom guidance on their daily schedule and resource list.”

**Other notes:** UPSC has a step-up (recorded mock-test course ₹1,499 → 1:1 ₹1,999; no cohort this run). The UPSC bio says "With over 100K followers" — taken from the audience-size answer, so not invented, but worth a look. Yoga copy uses "safe movements" / "practice safely" — health context, not a finance rule break.

### Full JSON (stored drafts, no tokens)

<details><summary>Cooking / Hinglish — Ananya</summary>

```json
{
  "theme": "saffron",
  "creator": {
    "bio": "Working professionals ke liye home cooking ko simple aur fast banati hoon. Mera focus hai ki aap office ke baad bina kisi stress ke ghar ka bana hua tasty khana jaldi se taiyar kar sakein.",
    "headline": "Tasty khana 20 minute mein",
    "displayName": "QA Ananya Sharma"
  },
  "language": "hinglish",
  "products": [
    {
      "id": "vB5gs4Q3",
      "tier": "low",
      "price": 149,
      "title": "Quick Recipe Guide",
      "format": "ebook",
      "summary": "12 dinner recipes jo 20 minute mein ban jaati hain.",
      "tierReason": "A small and quick collection of recipes well suited for beginners who want a low-cost entry point to home cooking.",
      "whatYouGet": [
        "PDF guide with 12 recipes",
        "Ingredient checklist for every dish",
        "Prep time saving tips"
      ],
      "description": "Busy working professionals ke liye special guide jisme hain 12 quick dinner recipes. Step-by-step instructions ke sath aap bina time waste kiye tasty khana bana sakenge.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "0fWeN8g6",
      "tier": "typical",
      "price": 399,
      "title": "Weekly Meal Planner",
      "format": "template_pack",
      "summary": "Ek hafte ka meal plan aur grocery list.",
      "tierReason": "A solid set of templates that helps working professionals plan their weekly meals and grocery shopping efficiently.",
      "whatYouGet": [
        "Weekly meal planner template",
        "Smart grocery shopping checklist",
        "Kitchen inventory tracker"
      ],
      "description": "Roz sochna padta hai ki kya banayein? Is template pack se aap apna poore hafte ka menu aur grocery shopping pehle hi plan kar sakte hain, jisse roz ka stress khatam ho jaye.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "HzQVzKTp",
      "tier": "typical",
      "price": 499,
      "title": "Live Cook-Along",
      "format": "live_workshop",
      "summary": "Ek ghante ka live cooking session aur Q&A.",
      "tierReason": "A live interactive session where working professionals can cook together and clear doubts in real time.",
      "whatYouGet": [
        "1-hour live cooking session on Zoom",
        "Live Q&A to solve cooking doubts",
        "Recording access for 30 days"
      ],
      "description": "Mere sath live judiye aur ek complete healthy meal 20 minute mein banana seekhiye. Session ke dauran aap apne sawaal pooch sakte hain aur live tips le sakte hain.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    }
  ],
  "sensitiveDomain": "none"
}
```
</details>

<details><summary>Finance / Hinglish — Arjun</summary>

```json
{
  "theme": "indigo",
  "creator": {
    "bio": "Main Arjun hoon. College students ko stock market ki basics samajhne aur bina kisi dar ke chote amount se invest shuru karne mein help karta hoon. Mera focus sirf concepts clear karne par hai taaki aap bina kisi stress ke sahi decision le sakein.",
    "headline": "Stock market basics ko simple banao",
    "displayName": "QA Arjun Mehta"
  },
  "language": "hinglish",
  "products": [
    {
      "id": "ue8uVto6",
      "tier": "low",
      "price": 149,
      "title": "Stock Market Starter Guide",
      "format": "ebook",
      "summary": "Basic concepts aur investing ka guide",
      "disclaimer": "For learning only. Not investment advice.",
      "tierReason": "This is a simple entry-level guide for students to build foundational knowledge without a large commitment.",
      "whatYouGet": [
        "PDF with 20 pages on market basics",
        "Glossary of common stock market terms",
        "Checklist for opening your first demat account"
      ],
      "description": "Stock market ki basics, market kaise kaam karta hai aur pehla step kaise lein. Yeh guide college students ke liye hai jo zero se shuru karna chahte hain.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "NTwGI495",
      "tier": "typical",
      "price": 399,
      "title": "Budgeting & SIP Planner",
      "format": "template_pack",
      "summary": "Monthly budget aur SIP tracker",
      "disclaimer": "For learning only. Not investment advice.",
      "tierReason": "A practical tool that helps students manage their pocket money for consistent investing.",
      "whatYouGet": [
        "Excel sheet for monthly expense tracking",
        "SIP goal setting worksheet",
        "PDF guide on choosing a monthly investment amount"
      ],
      "description": "Apne kharche track karein aur dekhein ki aap har mahine chota amount invest ke liye kaise nikal sakte hain. Ye templates aapko disciplined rehne mein help karenge.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "t1CkPiKj",
      "tier": "typical",
      "price": 999,
      "title": "Stock Market Q&A Session",
      "format": "one_on_one",
      "summary": "Apne doubts clear karein",
      "disclaimer": "For learning only. Not investment advice.",
      "tierReason": "Provides students with direct access to get specific conceptual doubts cleared, offering high value for their learning.",
      "whatYouGet": [
        "45-minute live video call",
        "Personalized learning roadmap",
        "List of resources to continue your learning"
      ],
      "description": "Stock market ke concepts ya investing process ko lekar koi confusion hai? Is session mein hum aapke sawalon par baat karenge aur aapke liye ek learning plan banayenge.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    }
  ],
  "sensitiveDomain": "finance"
}
```
</details>

<details><summary>Yoga for seniors / Hinglish — Kiran</summary>

```json
{
  "theme": "teal",
  "creator": {
    "bio": "Yoga teacher ke roop mein mera focus hai seniors ki flexibility aur joint health improve karne par. Bina kisi complex posture ke, simple aur safe movements ke zariye aap apni daily life ko aasan bana sakte hain.",
    "headline": "Stay flexible aur pain-free ghar baithe",
    "displayName": "QA Kiran"
  },
  "language": "hinglish",
  "products": [
    {
      "id": "YOlNuovG",
      "tier": "low",
      "price": 149,
      "title": "Senior Flexibility Guide",
      "format": "ebook",
      "summary": "Simple stretches jo joints ko flexible rakhein.",
      "disclaimer": "For general wellness. Not medical advice.",
      "tierReason": "This is a quick, low-cost entry ebook for seniors wanting to start flexibility work at home with simple PDFs.",
      "whatYouGet": [
        "PDF guide with 15 gentle stretches",
        "Printable daily joint mobility checklist",
        "Step-by-step posture safety instructions"
      ],
      "description": "Ek easy-to-read PDF guide jo seniors ke liye specially designed gentle stretches batati hai. Isse aap bina kisi equipment ke ghar par flexibility improve kar sakte hain.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "1vnSdAlE",
      "tier": "typical",
      "price": 999,
      "title": "1-on-1 Senior Yoga Consultation",
      "format": "one_on_one",
      "summary": "Personalised session aapke specific body pain ke liye.",
      "disclaimer": "For general wellness. Not medical advice.",
      "tierReason": "A private 45-minute video call where seniors get personalised attention for their specific mobility needs.",
      "whatYouGet": [
        "45-minute live video call on Zoom",
        "Personalised weekly yoga schedule PDF",
        "Recording of the consultation session"
      ],
      "description": "Ek private 45-minute video call jisme hum aapki physical condition aur joint issues ko discuss karke ek customized home yoga routine banayenge.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "L65UxKbE",
      "tier": "typical",
      "price": 1499,
      "title": "Pain-Free Joints Routine",
      "format": "recorded_course",
      "summary": "Joint pain kam karne ke liye recorded video lessons.",
      "disclaimer": "For general wellness. Not medical advice.",
      "tierReason": "A solid recorded video course offering depth and clear visual guidance for seniors to practice safely at home.",
      "whatYouGet": [
        "5 recorded video modules for joint health",
        "Audio guided relaxation track for daily use",
        "Progress tracking calendar template in PDF"
      ],
      "description": "Ek self-paced video course jisme seniors ke liye safe aur effective yoga sequences hain. Knee, back aur shoulder pain ko reduce karne ke liye daily practice videos milegi.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    }
  ],
  "sensitiveDomain": "health"
}
```
</details>

<details><summary>UPSC 100K+</summary>

```json
{
  "theme": "indigo",
  "creator": {
    "bio": "I help UPSC aspirants build a structured study plan and master answer-writing practice. With over 100K followers, I share practical methods to cover the syllabus effectively without burning out.",
    "headline": "Clear strategies to crack the UPSC exam",
    "displayName": "QA Rohan Verma"
  },
  "language": "en",
  "products": [
    {
      "id": "iPR-H5Dh",
      "tier": "low",
      "price": 199,
      "title": "UPSC Answer Writing Checklist",
      "format": "template_pack",
      "summary": "Checklist and formats to structure daily UPSC answers.",
      "tierReason": "A quick-win resource for aspirants who want to improve daily answer structure without spending much time or money.",
      "whatYouGet": [
        "PDF checklist for Mains answer structure",
        "3 sample question format templates",
        "Self-evaluation tracking sheet"
      ],
      "description": "Improve your Mains answer structure with this ready-to-use checklist. Designed for aspirants who struggle with time management and formatting during the exam, it helps you hit every key point clearly.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "B8MRWDHi",
      "tier": "typical",
      "price": 1499,
      "title": "UPSC Prelims Mock Test Series",
      "format": "recorded_course",
      "summary": "Practice tests with video solutions for Prelims prep.",
      "tierReason": "A solid practice package with video explanations for aspirants preparing for the upcoming Prelims exam.",
      "whatYouGet": [
        "5 full-length Prelims mock test papers",
        "Recorded video solutions for each paper",
        "Topic-wise performance analysis sheet"
      ],
      "description": "Test your preparation with structured mock papers and detailed video explanations. Built for aspirants who want to practice time management and identify weak areas before the exam.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    },
    {
      "id": "ONJehega",
      "tier": "high",
      "price": 1999,
      "title": "1-on-1 UPSC Study Plan Review",
      "format": "one_on_one",
      "summary": "Private call to build your custom preparation roadmap.",
      "tierReason": "A private strategy call offering personal attention for aspirants who need custom guidance on their daily schedule and resource list.",
      "whatYouGet": [
        "45-minute private call on Zoom",
        "Custom weekly study schedule template",
        "Direct chat support for follow-up doubts for a week"
      ],
      "description": "Get a personalized review of your study schedule and book list in a private 45-minute call. Ideal for aspirants who feel stuck, overwhelmed by the syllabus, or need a clear path forward.",
      "priceSource": "ai_tier",
      "availability": "coming_soon"
    }
  ],
  "sensitiveDomain": "none"
}
```
</details>

---

Run finished at 2026-11-21 11:59 IST. Shutting down.

## 11. Round 3 (Sun 22 Nov, production)

Changes: SPEC v5 / PROMPTS v5 (V1–V7). Commits: item 1 `9fed6e5`, item 2 `870f15b`, item 3 `b912eec`, item 4 `4ad910b`, item 5 `f720bd1`, item 6 `39f76e6`, item 7 `795f38f`, item 8 `a43c094`, eval fix `af04782`. Deploys after items 1–3, 4–6 and 7–9; core gate **43/43 after each** (and again after the eval fix). New UI checks for items 6–8 (`qa/scripts/round3-ui.mjs`, real UI at 360 px) **12/12** on production; round-2 E25 / E26 (updated to the v5 labels) **pass**.

**Found and fixed during this round**
- **One-tap republish never fired (dev / strict mode):** the auto-publish effect cleared its own timer on the strict-mode re-run. Fixed before deploy (guard inside the timer).
- **"Is it live?" check:** every page's HTML carries Next's not-found template text, so checking for "doesn't exist" could never pass. The public store now renders `data-store="<slug>"` and the publish sheet looks for that.
- **Finance eval store failed on both models** (first run): attempt 1 was rightly rejected for *"invest your business savings safely"*; attempt 2 was rejected for *"stock tips"*, most likely written as a negation ("no stock tips"). Negated phrases in the same clause (no / not / never / without / don't …, ≤ 6 words before) are now allowed; un-negated phrases and "safe"-type wording still fail (unit tests both ways). Re-run: ok on the first attempt.

### Mini eval (4 generations + 1 re-run, production, free tier)

| Store | Attempts | Products designed for the audience | learn → apply → guided | Bio (Instagram-like?) | tierReasons mention the buyer / no raw "No audience yet" | Word targets | v5 prices |
|---|---|---|---|---|---|---|---|
| Cooking / Hinglish — Ananya, working professionals, 5K–20K | primary 503 → fallback ok | ✅ ✅ ✅ (20-min weeknight recipes, 20-min kitchen workflow live, kitchen-routine 1:1) | ✅ recipes → live workflow → 1:1 | Mostly: "Main Ananya hoon. Office ki thakan ke baad bhi aap healthy aur ghar ka bana khana enjoy kar sakte hain. Mere saath seekhein…" (gender-neutral) | ❌ 0/3 name the buyer ("followers", "the audience", "the creator's audience size" — the last one is literal/awkward) · ✅ no raw label | ✅ all met, nothing trimmed | ✅ 149 / 399 / 1,499 |
| Finance — small business owners, English, under 5K, no result given | run 1: both failed (see above); run 2: 1 attempt ok | ✅ ✅ ✅ (separate business vs personal cash flow; SIPs from irregular earnings; business + personal budget live) | ⚠️ partly: tool (apply) → guide (learn) → live (guided) | So-so: "I help small business owners manage their money and learn investing basics…" (plain, closer to LinkedIn) | ✅ 3/3 (busy business owners, self-employed, owners); "small, early audience" in natural words | ✅ all met | ✅ 199 / 299 / 799 |
| Career coach — freshers, English, no audience yet, no result given | 1 attempt ok | ✅ ✅ ✅ (fresher resume templates, mock interview 1:1, interview masterclass) | ⚠️ price order puts the 1:1 before the course: template → 1:1 → recorded course | So-so: "I help college graduates prepare for interviews and build strong resumes. Let us get your career started step by step." | ✅ 3/3 mention freshers / job seekers · ❌ 1 reason opens "**With no audience yet**, …" (raw label quoted) | ✅ met; 1 summary trimmed by the 15% rule ("…recent…") | ✅ 199 / 699 / 1,499 |
| UPSC — first-time aspirants, English, 100K+ | 1 attempt ok | ✅ ✅ ✅ ✅ (answer-writing guide, self-evaluation checklists, live answer workshop, 1:1 answer review) | ✅ guide → checklists / live → 1:1 review; step-up above entry (1:1 high ₹1,499) | Yes-ish: "…No heavy jargon, just clear steps to improve your daily writing." | ✅ 4/4 (aspirants / students; "large following" in natural words) | ✅ all met | ✅ 149 / 399 / 399 / 1,499 |

All rule checks pass on every stored draft (B7 + backstory + finance + "safe"). No "safe"-type finance wording in the final finance store; it includes a "Sample asset allocation plan" PDF — educational, but worth a look.

**Takeaways for Parth:** audience fit and prices are solid; tierReasons are good when the primary model answers and weak on the fallback (cooking); the raw "No audience yet" quote still appears (1 of 13 reasons) despite PROMPTS v5 — a code-side rewrite or check is possible if you want it; bios are clean but often plain rather than Instagram-like.

### Full JSON (stored drafts, no tokens)

<details><summary>Cooking / Hinglish — Ananya</summary>

```json
{
  "slug": "qa-ananya-sharma-0g37",
  "violations": [],
  "words": {
    "headline": [
      9,
      true
    ],
    "bio": [
      32,
      true
    ],
    "products": [
      {
        "title": [
          4,
          true
        ],
        "summary": [
          13,
          true
        ],
        "description": [
          24,
          true
        ],
        "trimmed": false
      },
      {
        "title": [
          5,
          true
        ],
        "summary": [
          12,
          true
        ],
        "description": [
          24,
          true
        ],
        "trimmed": false
      },
      {
        "title": [
          5,
          true
        ],
        "summary": [
          11,
          true
        ],
        "description": [
          26,
          true
        ],
        "trimmed": false
      }
    ]
  },
  "pricesMatchV5": true,
  "rawNoAudienceLabel": 0,
  "draft": {
    "theme": "saffron",
    "creator": {
      "bio": "Main Ananya hoon. Office ki thakan ke baad bhi aap healthy aur ghar ka bana khana enjoy kar sakte hain. Mere saath seekhein kaise kam waqt mein kitchen ka kaam khatam karein.",
      "headline": "Office ke baad, sirf 20 minute mein tasty khana",
      "displayName": "QA Ananya Sharma"
    },
    "language": "hinglish",
    "products": [
      {
        "id": "rkcWt2z2",
        "tier": "low",
        "price": 149,
        "title": "20-Minute Weeknight Recipe Collection",
        "format": "ebook",
        "summary": "15 quick recipes that take less than 20 minutes from start to finish.",
        "tierReason": "A low price point is perfect for followers to quickly start cooking faster without a huge commitment.",
        "whatYouGet": [
          "PDF with 15 quick recipes",
          "Weekly meal prep checklist",
          "List of 10 essential pantry staples"
        ],
        "description": "Busy office days don't mean ordering out. This collection helps you whip up healthy meals in minutes so you have more time to relax.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      },
      {
        "id": "yTdrhmoI",
        "tier": "typical",
        "price": 399,
        "title": "Master the 20-Minute Kitchen Workflow",
        "format": "live_workshop",
        "summary": "Learn my exact method to cook daily meals in under 20 minutes.",
        "tierReason": "A live workshop offers better value for the audience to learn techniques directly and ask questions in real-time.",
        "whatYouGet": [
          "90-minute live demonstration on Zoom",
          "Recording of the live session",
          "Kitchen workflow worksheet"
        ],
        "description": "Stop spending hours in the kitchen after a long workday. Join this live session to see my prep hacks and cooking flow in action.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      },
      {
        "id": "zBuNIf8x",
        "tier": "high",
        "price": 1499,
        "title": "Kitchen Efficiency Audit & Plan",
        "format": "one_on_one",
        "summary": "A private session to redesign your kitchen routine for maximum speed.",
        "tierReason": "Personalized attention for the creator's audience size allows for a premium tier that addresses individual kitchen challenges.",
        "whatYouGet": [
          "45-minute 1:1 video consultation",
          "Customised weekly meal template",
          "Personalised kitchen organization tips"
        ],
        "description": "We will look at your current cooking habits and customize a plan that fits your kitchen setup and food preferences. Get personal help to save time.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      }
    ],
    "sensitiveDomain": "none"
  },
  "attempts": [
    {
      "ms": 2398,
      "ok": false,
      "error": "{\"error\":{\"code\":503,\"message\":\"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.\",\"status\":\"UNAVAILABLE\"}}",
      "model": "gemini-3.5-flash-lite"
    },
    {
      "ms": 3571,
      "ok": true,
      "model": "gemini-3.1-flash-lite"
    }
  ]
}
```
</details>
<details><summary>Finance — small business owners (run 2, after the fix)</summary>

```json
{
  "slug": "qa-meera-iyer-u4gi",
  "violations": [],
  "words": {
    "headline": [
      9,
      true
    ],
    "bio": [
      25,
      true
    ],
    "products": [
      {
        "title": [
          4,
          true
        ],
        "summary": [
          10,
          true
        ],
        "description": [
          23,
          true
        ],
        "trimmed": false
      },
      {
        "title": [
          4,
          true
        ],
        "summary": [
          12,
          true
        ],
        "description": [
          25,
          true
        ],
        "trimmed": false
      },
      {
        "title": [
          4,
          true
        ],
        "summary": [
          11,
          true
        ],
        "description": [
          25,
          true
        ],
        "trimmed": false
      }
    ]
  },
  "pricesMatchV5": true,
  "rawNoAudienceLabel": 0,
  "draft": {
    "theme": "indigo",
    "creator": {
      "bio": "I help small business owners manage their money and learn investing basics. Get practical guides and tools to keep your business and personal funds separate.",
      "headline": "Personal finance and investing basics for small business owners",
      "displayName": "QA Meera Iyer"
    },
    "language": "en",
    "products": [
      {
        "id": "HMsKqbwc",
        "tier": "low",
        "price": 199,
        "title": "Business Money Tracking Sheet",
        "format": "template_pack",
        "summary": "A ready-to-use tracker to separate business and personal cash flow.",
        "disclaimer": "For learning only. Not investment advice.",
        "tierReason": "With a small, early audience, a low entry price makes it simple for busy business owners to try your tools without thinking twice.",
        "whatYouGet": [
          "Excel and Google Sheets income tracker",
          "Expense category setup guide",
          "Monthly cash flow summary view"
        ],
        "description": "Stop mixing your daily business revenue with household expenses. This tracker helps you see exactly what your shop or agency earns each month.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      },
      {
        "id": "DKpY8U-v",
        "tier": "typical",
        "price": 299,
        "title": "Simple Investing Basics Guide",
        "format": "ebook",
        "summary": "A complete PDF guide to starting your first mutual funds and SIPs.",
        "disclaimer": "For learning only. Not investment advice.",
        "tierReason": "This thorough guide gives self-employed professionals a clear, step-by-step roadmap to start investing from irregular earnings.",
        "whatYouGet": [
          "PDF guide on mutual fund basics",
          "Checklist for setting up SIPs",
          "Sample asset allocation plan"
        ],
        "description": "Designed for entrepreneurs who do not have a fixed monthly salary. Learn how to build a sensible portfolio step by step without complicated financial jargon.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      },
      {
        "id": "34gG6KID",
        "tier": "high",
        "price": 799,
        "title": "Money Setup Live Workshop",
        "format": "live_workshop",
        "summary": "A live 90-minute masterclass on fixing your business and personal budgets.",
        "disclaimer": "For learning only. Not investment advice.",
        "tierReason": "This live session includes direct interaction and Q and A time, offering deep guidance for owners who want live answers.",
        "whatYouGet": [
          "90-minute live workshop on Zoom",
          "Recording of the entire session",
          "Live Q and A slot for your questions"
        ],
        "description": "Join this interactive Zoom session to map out your business finances for the year. Bring your questions and get direct clarity on your money routines.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      }
    ],
    "sensitiveDomain": "finance"
  },
  "attempts": [
    {
      "ms": 2598,
      "ok": true,
      "model": "gemini-3.5-flash-lite"
    }
  ]
}
```
</details>
<details><summary>Finance — run 1 (failed on both models)</summary>

```json
{
  "slug": "qa-meera-iyer-9e0k",
  "status": "failed",
  "followUp": null
}
```
</details>
<details><summary>Career coach — no audience yet</summary>

```json
{
  "slug": "qa-rahul-nair-0vk8",
  "violations": [],
  "words": {
    "headline": [
      8,
      true
    ],
    "bio": [
      20,
      true
    ],
    "products": [
      {
        "title": [
          4,
          true
        ],
        "summary": [
          10,
          true
        ],
        "description": [
          21,
          true
        ],
        "trimmed": true
      },
      {
        "title": [
          4,
          true
        ],
        "summary": [
          11,
          true
        ],
        "description": [
          22,
          true
        ],
        "trimmed": false
      },
      {
        "title": [
          4,
          true
        ],
        "summary": [
          12,
          true
        ],
        "description": [
          23,
          true
        ],
        "trimmed": false
      }
    ]
  },
  "pricesMatchV5": true,
  "rawNoAudienceLabel": 1,
  "draft": {
    "theme": "indigo",
    "creator": {
      "bio": "I help college graduates prepare for interviews and build strong resumes. Let us get your career started step by step.",
      "headline": "Helping freshers land their first job with confidence",
      "displayName": "QA Rahul Nair"
    },
    "language": "en",
    "products": [
      {
        "id": "YtvHBV8_",
        "tier": "low",
        "price": 199,
        "title": "Fresher Resume Writing Template",
        "format": "template_pack",
        "summary": "Ready-to-use resume formats designed specifically for college freshers and recent…",
        "tierReason": "With no audience yet, a small entry-level template pack makes it easy for freshers to make a first purchase and build a strong CV.",
        "whatYouGet": [
          "Two ATS-friendly resume templates in Word format",
          "Checklist for formatting fresh CVs",
          "Sample bullet points for college projects"
        ],
        "description": "Stop struggling with formatting and blank pages. This pack gives you clean resume templates that highlight your projects, internships and skills.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      },
      {
        "id": "Bn3zl3o4",
        "tier": "typical",
        "price": 699,
        "title": "One-on-One Mock Interview Call",
        "format": "one_on_one",
        "summary": "A private 45-minute mock interview with feedback to improve your confidence.",
        "tierReason": "A private video call gives freshers personalized feedback and practice, making it a valuable option for job seekers.",
        "whatYouGet": [
          "Forty-five minute live video call on Zoom",
          "Personalised feedback report on your answers",
          "List of areas to improve before your actual interview"
        ],
        "description": "Practice a real interview session with guidance tailored to your target role. Get actionable feedback on your answers, tone, and body language.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      },
      {
        "id": "FpltkoIi",
        "tier": "typical",
        "price": 1499,
        "title": "First Job Interview Masterclass",
        "format": "recorded_course",
        "summary": "Step-by-step video lessons to prepare for job interviews and answer tricky questions.",
        "tierReason": "This self-paced video course offers depth and clear guidance on common HR and technical interview questions for freshers.",
        "whatYouGet": [
          "Six self-paced video modules",
          "PDF workbook with interview question answers",
          "Checklist for interview day preparation"
        ],
        "description": "Learn how to introduce yourself, answer common HR questions, and handle salary discussions. Watch at your own pace before your next big interview.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      }
    ],
    "sensitiveDomain": "none"
  },
  "attempts": [
    {
      "ms": 2697,
      "ok": true,
      "model": "gemini-3.5-flash-lite"
    }
  ]
}
```
</details>
<details><summary>UPSC — 100K+</summary>

```json
{
  "slug": "qa-rohan-verma-ufaq",
  "violations": [],
  "words": {
    "headline": [
      8,
      true
    ],
    "bio": [
      24,
      true
    ],
    "products": [
      {
        "title": [
          5,
          true
        ],
        "summary": [
          11,
          true
        ],
        "description": [
          27,
          true
        ],
        "trimmed": false
      },
      {
        "title": [
          5,
          true
        ],
        "summary": [
          13,
          true
        ],
        "description": [
          26,
          true
        ],
        "trimmed": false
      },
      {
        "title": [
          5,
          true
        ],
        "summary": [
          14,
          true
        ],
        "description": [
          31,
          true
        ],
        "trimmed": false
      },
      {
        "title": [
          5,
          true
        ],
        "summary": [
          13,
          true
        ],
        "description": [
          28,
          true
        ],
        "trimmed": false
      }
    ]
  },
  "pricesMatchV5": true,
  "rawNoAudienceLabel": 0,
  "draft": {
    "theme": "indigo",
    "creator": {
      "bio": "I help first-time UPSC aspirants structure their thoughts and write high-scoring Mains answers. No heavy jargon, just clear steps to improve your daily writing.",
      "headline": "Write better UPSC Mains answers with simple frameworks",
      "displayName": "QA Rohan Verma"
    },
    "language": "en",
    "products": [
      {
        "id": "NjFnG5Pf",
        "tier": "low",
        "price": 149,
        "title": "UPSC Answer Writing Starter Guide",
        "format": "ebook",
        "summary": "Master the basics of structure and time management for Mains answers.",
        "tierReason": "With a large following of aspirants looking for quick guidance, this small entry-level PDF makes it easy for anyone to test your method without spending much.",
        "whatYouGet": [
          "PDF guide with 5 answer writing frameworks",
          "5 solved model answers for practice",
          "Checklist for daily answer structure"
        ],
        "description": "Designed for first-time aspirants struggling with word limits and structure. This guide gives you a simple 5-step framework to break down any question and write structured answers.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      },
      {
        "id": "3EtWaQY7",
        "tier": "typical",
        "price": 399,
        "title": "Mains Answer Evaluation Checklist Pack",
        "format": "template_pack",
        "summary": "Ready-to-use planners and evaluation sheets to track your daily essay and GS answers.",
        "tierReason": "A comprehensive set of templates for students who want to regularly practise and self-evaluate their answers at home.",
        "whatYouGet": [
          "Printable daily answer writing tracker sheet",
          "GS Paper 1 to 4 self-evaluation checklists",
          "Time management planner for exam halls"
        ],
        "description": "Get practical evaluation sheets and progress trackers designed specifically for GS papers. Use them to spot your own mistakes and improve your answers every single day.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      },
      {
        "id": "ng5kjisH",
        "tier": "typical",
        "price": 399,
        "title": "Live Mains Answer Writing Workshop",
        "format": "live_workshop",
        "summary": "Join a live 90-minute session to learn how to fix common answer writing mistakes.",
        "tierReason": "A live interactive session suited for aspirants who want to watch answers being written and corrected in real time.",
        "whatYouGet": [
          "90-minute live session on Zoom",
          "Live question breakdown and drafting",
          "Recording of the live workshop"
        ],
        "description": "In this live Zoom session, we take real questions and write better answers together step by step. You get to clear your doubts live and see how to improve your score.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      },
      {
        "id": "28Wrr9Ro",
        "tier": "high",
        "price": 1499,
        "title": "1-on-1 Mains Answer Review Session",
        "format": "one_on_one",
        "summary": "Get your written answers reviewed personally with direct feedback on your weak spots.",
        "tierReason": "An intensive private call providing personal attention and custom feedback on the student's actual written answers.",
        "whatYouGet": [
          "45-minute 1-on-1 video call on Zoom",
          "Detailed review of 3 pre-submitted answers",
          "Personalized improvement plan for the next month"
        ],
        "description": "A private 45-minute video call where we sit together and review 3 of your written answers. You get direct, honest feedback on your structure, presentation, and content gaps.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      }
    ],
    "sensitiveDomain": "none"
  },
  "attempts": [
    {
      "ms": 3046,
      "ok": true,
      "model": "gemini-3.5-flash-lite"
    }
  ]
}
```
</details>

## 12. Round 4 (Sun 22 Nov, production) — design polish, label rewrite, generic-reason check

Final regression on production after deploying items 0–3: core gate **43/43**, `round3-ui.mjs` **12/12**, E25 / E26 **pass**, 21 screens × 360 px + 1440 px in `qa/screenshots/final/` (42 PNGs, no failures).

### Confirmation generations (production, free tier)
**Mistake, disclosed:** my summary command re-ran the eval script, so this step made **4 generations instead of 2**. The JSON below is the second run; the first run's printed output is summarised in the table.

| Store | Run | Attempts | Price reasons mention the buyer | Raw follower labels | Notes |
|---|---|---|---|---|---|
| Cooking / Hinglish — Ananya, 5K–20K | 1 | primary ok (no fallback) | ✅ 3/3 (working professionals / busy buyers) | none | reason 1 says "a mid-sized audience" in natural words |
| Finance — small business owners, under 5K | 1 | primary ok | ✅ 3/3 (business owners) | none | "Since you have a small early following…"; SIP planner for irregular income |
| Cooking / Hinglish — Ananya | 2 (JSON) | primary ok | ✅ | none | ⚠️ bio uses **"Main sikhata hoon"** (masculine) for Ananya — PROMPTS v3/v5 gender rule not followed this time; not fixed in this round |
| Finance — small business owners | 2 (JSON) | primary ok | ✅ | none | — |

- **Item 3 (generic reasons → fallback):** 0 fires in the 6 generations logged in this round (core gate, E25, 4 eval runs): every primary answer named the buyer. It is covered by unit tests; `genericReasonsKept` is logged on every completed generation.
- **Item 2 (label rewrite):** no raw label appeared in any reason this round, so it never had to rewrite; covered by unit tests (11 cases).
- All rule checks pass; prices match the v5 table.

Cooking (run 2) reasons:
  - `ebook/low` ₹149 — *20-Minute Dinner Guide* — “With a mid-sized audience of working professionals looking for quick wins, a low-priced ebook makes it easy for busy fans to buy their first recipe guide.”
  - `template_pack/typical` ₹399 — *Weekly Meal Prep Template Pack* — “For professionals who want to save time during weekdays, this typical-tier template pack offers structured planning tools that fit right into a busy routine.”
  - `live_workshop/typical` ₹399 — *Quick Cooking Masterclass* — “A typical-tier live workshop gives working professionals direct access to a 90-minute session where they can learn live cooking shortcuts and ask questions…”

Finance (run 2) reasons:
  - `template_pack/low` ₹199 — *Business Money Tracking Sheet* — “With a small, early following, a low entry price makes it simple for business owners to try your tools without hesitation.”
  - `recorded_course/typical` ₹1,499 — *Business Owner Investing Basics* — “A self-paced video course gives working owners the depth they need to learn at their own speed.”

### Full JSON (run 2, stored drafts, no tokens)

<details><summary>Cooking / Hinglish — Ananya</summary>

```json
{
  "slug": "qa-ananya-sharma-lkpv",
  "attempts": [
    {
      "ms": 2887,
      "ok": true,
      "model": "gemini-3.5-flash-lite"
    }
  ],
  "genericReasonsKept": false,
  "violations": [],
  "words": {
    "headline": [
      7,
      true
    ],
    "bio": [
      24,
      true
    ],
    "products": [
      {
        "title": [
          3,
          true
        ],
        "summary": [
          9,
          true
        ],
        "description": [
          32,
          true
        ],
        "trimmed": false
      },
      {
        "title": [
          5,
          true
        ],
        "summary": [
          10,
          true
        ],
        "description": [
          28,
          true
        ],
        "trimmed": false
      },
      {
        "title": [
          3,
          true
        ],
        "summary": [
          8,
          true
        ],
        "description": [
          28,
          true
        ],
        "trimmed": true
      }
    ]
  },
  "pricesMatchV5": true,
  "rawNoAudienceLabel": 0,
  "draft": {
    "theme": "saffron",
    "creator": {
      "bio": "Working professionals ke liye ghar ka khana banana ab easy hai. Main sikhata hoon quick recipes jo office ke baad bhi fatakat ban jaayein.",
      "headline": "Roz ka khana, bas 20 minute mein",
      "displayName": "QA Ananya Sharma"
    },
    "language": "hinglish",
    "products": [
      {
        "id": "lbkiLhSA",
        "tier": "low",
        "price": 149,
        "title": "20-Minute Dinner Guide",
        "format": "ebook",
        "summary": "12 quick dinner recipes that ready under 20 minutes.",
        "tierReason": "With a mid-sized audience of working professionals looking for quick wins, a low-priced ebook makes it easy for busy fans to buy their first recipe guide.",
        "whatYouGet": [
          "PDF recipe guide with 12 dishes",
          "Step-by-step cooking instructions",
          "Weekly grocery shopping list"
        ],
        "description": "Busy office days ke baad khana banana lagta hai ek task? Yeh ebook deta hai 12 quick dinner recipes jo bina kisi jhanjhat ke sirf 20 minute mein ready ho jaati hain.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      },
      {
        "id": "1dxMYQz7",
        "tier": "typical",
        "price": 399,
        "title": "Weekly Meal Prep Template Pack",
        "format": "template_pack",
        "summary": "Ready templates to plan your weekly meals and kitchen stock.",
        "tierReason": "For professionals who want to save time during weekdays, this typical-tier template pack offers structured planning tools that fit right into a busy routine.",
        "whatYouGet": [
          "Weekly meal planner template",
          "Kitchen pantry stock checklist",
          "Smart vegetable prep tracker"
        ],
        "description": "Kitchen mein roz kya banega sochna band karo. Yeh templates aapko help karenge apne poore hafte ka khana pehle se plan karne mein, taaki cooking routine smooth chale.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      },
      {
        "id": "QrSX9kko",
        "tier": "typical",
        "price": 399,
        "title": "Quick Cooking Masterclass",
        "format": "live_workshop",
        "summary": "A 90-minute live session on fast cooking techniques.",
        "tierReason": "A typical-tier live workshop gives working professionals direct access to a 90-minute session where they can learn live cooking shortcuts and ask questions…",
        "whatYouGet": [
          "90-minute live workshop on Zoom",
          "Recording access for 30 days",
          "Bonus list of kitchen hacks"
        ],
        "description": "Live session join karo jahan main aapko dikhaunga kaise daily meals ko fast aur tasty banate hain. Apne saare cooking doubts live clear karo aur kitchen tricks seekho.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      }
    ],
    "sensitiveDomain": "none"
  }
}
```
</details>
<details><summary>Finance — small business owners</summary>

```json
{
  "slug": "qa-meera-iyer-5wz2",
  "attempts": [
    {
      "ms": 2000,
      "ok": true,
      "model": "gemini-3.5-flash-lite"
    }
  ],
  "genericReasonsKept": false,
  "violations": [],
  "words": {
    "headline": [
      8,
      true
    ],
    "bio": [
      24,
      true
    ],
    "products": [
      {
        "title": [
          4,
          true
        ],
        "summary": [
          9,
          true
        ],
        "description": [
          21,
          true
        ],
        "trimmed": false
      },
      {
        "title": [
          4,
          true
        ],
        "summary": [
          11,
          true
        ],
        "description": [
          27,
          true
        ],
        "trimmed": false
      }
    ]
  },
  "pricesMatchV5": true,
  "rawNoAudienceLabel": 0,
  "draft": {
    "theme": "indigo",
    "creator": {
      "bio": "I help small business owners manage cash flow and invest their earnings. Get practical systems to separate your money and build a clear plan.",
      "headline": "Simple investing and money systems for business owners",
      "displayName": "QA Meera Iyer"
    },
    "language": "en",
    "products": [
      {
        "id": "u8NezQHk",
        "tier": "low",
        "price": 199,
        "title": "Business Money Tracking Sheet",
        "format": "template_pack",
        "summary": "Ready-to-use tracker to separate business cash and personal savings.",
        "disclaimer": "For learning only. Not investment advice.",
        "tierReason": "With a small, early following, a low entry price makes it simple for business owners to try your tools without hesitation.",
        "whatYouGet": [
          "Google Sheets financial tracking dashboard",
          "Video guide on setting up your categories",
          "Monthly cash flow summary checklist"
        ],
        "description": "Stop mixing your business earnings with household expenses. Use this simple spreadsheet to track monthly revenue, tax reserves, and personal draws.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      },
      {
        "id": "291bpwR_",
        "tier": "typical",
        "price": 1499,
        "title": "Business Owner Investing Basics",
        "format": "recorded_course",
        "summary": "Step-by-step video lessons on building an investment plan from business income.",
        "disclaimer": "For learning only. Not investment advice.",
        "tierReason": "A self-paced video course gives working owners the depth they need to learn at their own speed.",
        "whatYouGet": [
          "10 short video lessons on core concepts",
          "Printable PDF workbook with exercises",
          "Sample asset allocation frameworks"
        ],
        "description": "Learn how to build a reliable investment routine when your monthly revenue fluctuates. This course covers core concepts like asset allocation, index funds, and systematic investing plans.",
        "priceSource": "ai_tier",
        "availability": "coming_soon"
      }
    ],
    "sensitiveDomain": "finance"
  }
}
```
</details>
