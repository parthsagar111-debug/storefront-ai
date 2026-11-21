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

Run finished at 2026-11-21 11:59 IST. Shutting down.
