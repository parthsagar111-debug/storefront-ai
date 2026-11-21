# SPEC.md — Storefront AI

> Single source of truth. Claude Code builds from this, Claude Design designs from this, the decision doc explains this.
> Anything not in this file is out of scope unless Parth approves it and it gets added here.
> Owner: Parth (PM). **v4.4 — FROZEN**, Fri 20 Nov 2026 (after six ChatGPT reviews; v4.1–v4.4 = technical corrections only). From here, review comments go to Claude Code as issues, not into this file. Next review = the live app. Further review targets the built app, not this file. Deadline: Sun 22 Nov, 5:00 PM IST (target submit 2:00 PM).

---

## 0. Change log

### v5 — three-way review (Claude, ChatGPT, Gemini; all items agreed YES by all three, 21 Nov)

**V1. Input screen (replaces T30).** Headline "Turn what you know into a store in minutes." Subline "Tell us what you teach and who it's for. We'll suggest products and prices." Stacked full-width fields (no inputs inside a sentence) with labels that read as a sentence:
1. "I'm" [name], required
2. "I teach" [chips + free text], required
3. "to" [audience chips that depend on the niche + free text; general chips if the niche is unknown; typed text is never overwritten when the niche changes], required
4. "How many people follow you?" one tap, required
5. Language English / Hinglish, visible, English default
6. "More options" (collapsed): "What result do they get?" optional, niche-aware chips; Instagram handle optional, helper "Shown as a link on your store. We don't read your profile."
CTA "Create my store". A missing result never triggers a follow-up.

**V2. Prompt (PROMPTS v5).** Word targets instead of character targets (code trims at a word boundary when ≤ 15% over); tierReason never quotes "No audience yet"; needs_more only when BOTH expertise and audience are generic; niche examples kept but framed as illustrative; product regenerate keeps the whole set valid; optional creator hint passed as untrusted data.

**V3. Generating and side states.** Skeleton shows the creator's name + one personalised status line (using their audience; no "pricing for N followers" claim). Indeterminate indicator replaces the 4-step bar. "Taking a little longer…" at 12s. Interrupted/stale → "Generation was interrupted. Try again." 200–300ms fade into the editor + one-time tip "Tap Edit on anything to change it". Follow-up: compact editable summary of what they teach / who it's for + "Edit my answers"; edits re-run the clarity check; never generate from thin input. Failure: no extra silent retry (the fallback model already retries); offline → "You're offline. Reconnect to continue." Unclear unchanged.

**V4. Editor.** Everything current, plus: 10s "Regenerated. Undo" toast after any regenerate (restores format, price, availability); **Remove product** while more than 2 (entry-product rule still holds); optional "What should change?" hint on regenerate (bio or product); sheet + Save, no autosave; "Edit answers" relabelled **"Start over / Edit answers"** with a warning that manual edits will be replaced; changing format re-prices only if `priceSource` is still `ai_tier`, otherwise keeps the creator's price; Coming soon stays the default availability.

**V5. Publish.** One sheet (replaces the separate steps): "Any of these ready to sell today?" toggles above (copy "Buyers will contact you on WhatsApp. Payments aren't collected on this store."), WhatsApp below, optional until a product is Available now, then required with the reason shown; the privacy line appears when the WhatsApp field is focused or filled; sticky Publish on mobile. Republish: one tap **"Update live store"** when nothing needs asking; never silently changes availability. Success screen only after the publish is confirmed saved and the public URL loads (otherwise keep the draft, offer Retry, no duplicate). Success screen: native share sheet when supported + Copy fallback + "Paste this link into your Instagram bio."; **"Save my private edit link on WhatsApp"** (wa.me prefilled to themselves; they send it) + Copy, with "Private: anyone with this link can edit your store. Don't forward it." Custom store-link names: roadmap.

**V6. Public store.** Available-now products first (cheapest first), then a **"Coming soon"** subheading (cheapest first). Under "Enquire on WhatsApp": "Chat with <first name> to buy. No payment on this page." **No public interest counts** (counts only in the editor, labelled "interested taps"). Coming-soon cards: "Indicative price. Final price may change when available." WhatsApp prefill includes title + price, in the store's language. WhatsApp CTAs render only with a valid number. Disclaimers only when the domain applies. Initials avatar. Unobtrusive "Create your own store" footer.

**V7. Price table.** §7.5 updated: live_workshop ₹199/399/799; one_on_one ₹299/699/1,499; community ₹99/199/399; others unchanged; evidence column added. Community is now entry-eligible at every tier.

### v4.5: additions from Parth's own testing

| # | Change |
|---|---|
| T28 | **Edit answers & regenerate.** Editor top bar: **Edit answers**. Opens S1 prefilled with this store's input (name, 3 answers, audience size, language, Instagram) for the **same store/token**. Submit = confirmation ("This replaces your bio and all products. Your published page stays as it is until you publish again.") → generation runs with the new input, same pipeline and shared rate limit (T19). |
| T30 | **Input screen (option D).** Order: name → Instagram (optional, visible) → what you teach (required) → who it's for (required, chips depend on the niche) → result (**optional**, chips depend on the niche) → followers → language. Subline: "Your name and 2 quick answers." A missing result never triggers a follow-up. Rejected alternatives: one free-text box (blank-page freeze, vaguer output) and handle-only (we don't read Instagram, so a handle alone gives the AI nothing). |
| T29 | **Delete store.** Editor overflow menu: **Delete store**. Confirmation: "Delete this store? Its public page will stop working. This can't be undone." Server deletes the row (events cascade) after the token check; the device list drops it; the editor shows "Store deleted" + **Create a new store**. `/s/<slug>` then shows S6. Rate-limited like other writes. |

### v4.4 — final clarifications

| # | Correction |
|---|---|
| T24 | `visitor_id` required for **all three** public events (`store_viewed`, `interest_tapped`, `whatsapp_tapped`). WhatsApp taps are counted, not deduplicated. |
| T25 | Explicit output contracts per AI operation (§7.2): bio regenerate → `BioResult`; product regenerate → `ProductResult`; regenerate all → `GenerationResult`. |
| T26 | New must-pass test **E24**: publish, copy the public URL, open it in incognito / on another phone with no edit token, confirm it renders on mobile; make an unpublished edit and confirm the public page is unchanged until republish. |
| T27 | "Continue your store" reuses the saved `clientRequestId` + token. "Create a new store" (from S1 or the public footer) generates and saves a **new** pair before submitting. The device keeps a list of its stores' edit links. |

### v4.3 — event integrity patch (no product changes)

| # | Correction |
|---|---|
| T18 | `interest_tapped` and `whatsapp_tapped` require `productId`. DB constraint: `check (type not in ('interest_tapped','whatsapp_tapped') or product_id is not null)`. |
| T19 | **One shared generation limit** inside the server's generation function: every LLM-triggering route (`/answer`, `/retry`, `/regenerate`) writes a server-side `generation_started` / `section_regenerated` event and is refused (429) past 30 per store per hour. Store creation keeps its own limit. |
| T20 | **Regenerated products get new ids** (single product and regenerate all). Old events stay on the old ids; the new product starts at zero taps. Manual edits keep the id. |
| T21 | `/api/events` validates server-side: the store is published; the product id exists in the **published** snapshot; `interest_tapped` only for a Coming soon product, `whatsapp_tapped` only when the store has a number. Anything else is ignored (204). |
| T22 | If localStorage is unavailable at submit, S1 shows "Your browser is blocking storage. Your edit link will only be shown once; copy it before leaving." The flow still works; only lost-response recovery is unavailable. |
| T23 | Safety classification (model OR keywords) reduces risk, it doesn't guarantee it. Stated in the decision doc. |

### v4.2 — technical patch (no product changes)

| # | Correction |
|---|---|
| T11 | **Edit token is generated in the browser** (`crypto.getRandomValues`, 24 bytes, base64url) and saved to localStorage **before** the request, together with `clientRequestId`. The server stores only `sha256(token)`. On a repeated `clientRequestId`, the server checks that `sha256(token)` matches and returns the same store (mismatch → 409). A lost response can no longer lose the edit link. |
| T12 | `POST /api/stores` order: (1) idempotency lookup by `clientRequestId` → return if found; (2) validate input and token format; (3) creation rate limit (new stores only); (4) insert. A concurrent duplicate hits the unique constraint and falls back to step 1. |
| T13 | All count-based rate limits (T3, T6) are **best-effort**: check-then-insert can let a few extra requests through under concurrency. Accepted for a prototype; documented. |
| T14 | Database check constraint: `visitor_id` must be non-null for `store_viewed` and `interest_tapped`, so the dedup indexes can't be bypassed with NULLs. |
| T15 | Core gate adds **E20** (Available now ⇒ WhatsApp, server-side). **E9** now explicitly includes a lost response (request succeeds, response dropped, client retries). |
| T16 | Spend-control wording (T9) made precise: Google's documented spend-based rate limits (rolling 10-minute, per usage tier) and the monthly caps shown in AI Studio for this project, plus our best-effort app limits. No stronger protection is claimed. |
| T17 | Copy: "Your name, three quick answers and two taps." Metric note: when localStorage is blocked, the visitor id is per page load, so refreshes can add taps. |

### v4.1 — technical corrections (no product changes)

| # | Correction |
|---|---|
| T1 | `events` gets an explicit `event_day date` column (UTC, set on insert). The daily view index uses it instead of `created_at::date`, which isn't a valid index expression on `timestamptz`. |
| T2 | `waitUntil` removed everywhere. Generation is scheduled with **`after()` from `next/server`; requires Next.js ≥ 15.1** (use the current stable release). |
| T3 | Anti-abuse claim corrected: client IDs can be rotated, so unique indexes only stop **repeat taps from one browser**. Added a server-side throttle: max 30 public events per hashed IP per store per hour. Scripted fake taps from rotating IPs remain possible; documented as a limitation and a reason the UI says "taps", not "demand". |
| T4 | Visitor identity = `visitor_id`: a random id in **localStorage (persists per browser, not per session)**; if storage is blocked, a per-page-load id. Required (non-null) for `store_viewed` and `interest_tapped`; the API rejects events without it. |
| T5 | Server enforces "Available now ⇒ WhatsApp number" on **PATCH and on publish** (including the Skip path). The Skip button is disabled, with a one-line reason, while any product is Available now. |
| T6 | Rate limits are DB counts, no extra service: store creation = `count(stores where creator_ip_hash = $1 and created_at > now() - 1h) >= 5` → 429. Regeneration = `count(events where store_id = $1 and type in ('generation_started','section_regenerated') and created_at > now() - 1h) >= 30` → 429. Those events are written by the server, not the client. |
| T7 | Core gate now includes the brief's explicit must-haves: field edit persists (E22), single-section regenerate (E8), regenerate all (E23), draft vs published (E14). |
| T8 | Finance / health detection no longer trusts the model alone: code also keyword-matches the input; final domain = model OR keywords. |
| T9 | Spend control is verified, not assumed: Google Cloud budgets only send alerts. See T16 for the precise wording of what Google enforces. |
| T10 | Slice 2 is done only when the **exact production schema** passes a real call on **both** models. If Gemini's `responseSchema` rejects the union, send a flat object (`status` + nullable fields) to Gemini and keep the discriminated union in Zod. |

### v4 (second review)

| Review point | Change |
|---|---|
| Double submit creates two stores | Client sends a `clientRequestId` (generated once per form; storage location updated in T11). Unique column; a repeat POST returns the existing store. |
| Abuse: generation spam, fake taps | Store creation rate-limited per hashed IP (5/hour); regenerations per store (30/hour). Interest taps and views deduplicated per session (unique index). Google spend cap set. Residual risk (an attacker clearing storage) documented. |
| "Demand test" overclaims | Renamed **interest signal**. Copy and doc say "taps, not purchases or validated demand". |
| "Launching soon" implies a commitment | Each product has an availability flag: **Coming soon** (default) or **Available now** (creator sets it). Visitor confirmation no longer promises a launch. |
| `waitUntil` overstated | Use Next.js `after()`. Wording fixed: generation continues after the tab closes, within the function limit; not a durable job queue. If killed, the store goes stale and the editor offers Retry. |
| Ladder repair impossible for course + cohort | Deterministic table of which (format, tier) pairs are ≤ ₹499. Prompt requires one entry-eligible format; if absent, the attempt fails over to the fallback model. |
| High-touch rule forces irrelevant offers | Removed from code. Now a prompt preference ("suggest a premium option if it fits the creator"). |
| Price override can be 0 / negative / break ladder | Price must be ₹49–₹99,999. Ladder applies to AI suggestions; if the creator's edits leave no product under ₹500, a soft hint (not a block). |
| Interest counts both core and cut-first | Moved into the core (slice 3). |
| Finance / health safety | Model returns `sensitiveDomain`; extra prompt rules; code adds a short disclaimer line to finance and health products. |
| Eval set shallow | Rubric with score anchors; 2 generations per input; checks distinct customer problems, feasibility, entry-to-premium progression. |
| Pricing scan ≠ willingness to pay | Doc labels it "observed list prices, directional only". |
| Fallback model blank | `gemini-3.5-flash-lite` (stable, structured outputs supported). Tested in slice 2. |
| `pending` can get stuck | `pending` > 15s without a claim also counts as stale → Retry. |
| "3 short answers" inaccurate | Copy: "A few quick answers. Your store in about a minute." |
| Colour picker vs build order | Niche default colour in core; picker cut-first; Claude Design marks it optional. |
| Product cards too dense | Card shows cover, title, price, one-line summary, CTA. Full description and "what you get" behind **See details**. |
| Scope still big | "Regenerate all" reuses the generation pipeline (no extra code). Core gate reduced to 8 must-pass tests (§8). |

### v3 (first review)

| Review point | Change |
|---|---|
| No working action without WhatsApp | The AI's product ideas don't exist yet, so the store doubles as a **demand test**. No WhatsApp → **I'm interested** button that counts taps per product; the editor shows which idea to build first. |
| Scope too big | Clear **must-ship core** vs **cut-first list** (§13). JSON repair call removed. Add/remove product, colours, counters moved out of the core. |
| Pricing contradictions | The model no longer outputs a price. It picks a **tier** (low / typical / high); **code maps the tier to a fixed rupee price.** The rationale explains the tier and never contains a number, so price and reason can't contradict. Ladder checks are deterministic. Creator override is a stated decision (D17). |
| "3 questions" is really 7 fields | Copy now says "3 short answers + 2 taps". Every field is justified in §5 S1. |
| Thin input still produces generic stores | We **never** generate from thin input. The follow-up always offers 3 concrete direction chips; the creator picks one (D12). |
| Generation not truly recoverable | Generation runs server-side (`after()` since v4.1), with an atomic claim (no double runs), stale-run detection, and the edit link remembered on the device (§7.4). |
| Retries can exceed 60s | Fixed 50s budget: primary (≤ 22s) → fallback model (remaining time). No third call. |
| Validates structure, not quality | Each product must list 3 concrete "what you get" items; deterministic distinctness checks; plus an **offline eval set** scored before submission (§16). Runtime LLM judge rejected (latency). |
| WhatsApp privacy | Explicit copy: "This number will be visible to anyone who opens your store." |
| Analytics overclaims | Labels are literal: "page views", "WhatsApp taps", "interested taps". Anonymous session id added. |
| Edit-link security | 192-bit random token, stored hashed. Rotation and rate limiting are documented as not built. |
| Pricing ranges unsupported | Ranges to be checked against ~20 real Indian creator offers before submission; evidence goes in the decision doc (§7.5). |
| Gibberish heuristic too aggressive | Client check reduced to empty / too short / one repeated character. Everything else goes to the model. |
| Model unclear | `gemini-3.8-flash` (GA), thinking level low. Fallback: Flash-Lite. |
| Name not distinctive | Kept "Storefront AI" (Parth's decision; doesn't affect the product). |

## 1. Product in one line

A creator gives their name, three quick answers and two taps on their phone and, in under 5 minutes, gets a published storefront (bio, 2–4 sellable product ideas with INR prices and descriptions) at a link they can share, which also shows which idea gets the most interest from their audience.

## 2. Problem and user

**Problem.** New creators land on an empty store and stall. They don't know (1) what to sell, (2) how to price it, (3) what to write. Activation, and everything after it, depends on getting from blank page to a shareable store.

**Primary user (default): Indian micro-creator.** 5K–100K followers; niches like fitness, finance, cooking, exam prep, astrology, design. Sets things up on a phone, between other work. English, Hindi or Hinglish. Has never priced a product. Price-sensitive audience.

**Secondary user: expert without an audience.** Coach, teacher or professional with skills and little or no following. Served by the same flow via the "No audience yet" chip.

**Key insight behind the design.** The AI suggests products the creator **hasn't made yet**. So a store isn't only a shop window; it's also a cheap early **interest signal** on which idea to make first. It is a signal (taps), not validated demand (purchases); the creator still decides. The store's main job remains activation: getting from blank page to a published, shareable store. This shapes the CTA (D13) and the analytics (§10).

**Demo persona (Loom only; the product must work for all niches):**
Ananya Sharma, practical Indian vegetarian home cooking, for working professionals and beginners; outcome: tasty everyday meals without hours in the kitchen. 5K–20K followers. Hinglish.

## 3. Locked decisions

| # | Decision | Why |
|---|---|---|
| D1 | Self-description is the main input. Instagram handle is optional and **shown on the page as a link, never read or scraped.** | Scraping is blocked, against terms and fragile. We never claim to have analysed a profile. |
| D2 | Input = 3 typed answers (expertise → audience → outcome) with tap-to-fill example chips, plus 2 taps (audience size, language). | Each one changes the output (see S1). Chips cut typing on a phone. |
| D3 | Guided flow, not a chat. | The creator's job is to publish, not converse. Predictable output, fewer steps. |
| D4 | **Pricing is deterministic.** The model picks a format and a tier (low / typical / high) with a reason. Code maps format + tier to a fixed price from §7.5. | "The AI recommends; the product sets the price." An invalid AI price cannot enter the system because the AI never outputs one. |
| D5 | Ladder rules for AI suggestions, **checked in code**: ≥ 1 product priced ≤ ₹499 (an entry-eligible format, §7.5); no duplicate formats. A premium option (1:1 or cohort) is a **prompt preference only**, used when it fits the creator. | A cheap first purchase builds trust. Forcing a cohort on a template seller would make the store worse. |
| D6 | Editor = preview-first. Each section has **Edit** and **↻ Regenerate**. Edit opens a **bottom sheet** on mobile (side panel ≥ 768px). | The creator edits while seeing the result. Bottom sheets are a familiar pattern (Swiggy, Zomato, UPI apps). |
| D7 | Rejected alternative (for the doc and Claude Design): always-visible form beside a preview. | Takes up the phone screen; splits attention between fields and result. |
| D8 | English and Hinglish. Hindi (Devanagari) not in scope. | Hinglish is how the persona speaks; Hindi needs a font and a higher quality bar. |
| D9 | No login. Public `/s/[slug]` and private `/edit/[token]`. Token: 192-bit random, stored as SHA-256 hash, checked server-side. Basic abuse limits (§9). | No sign-up friction; strangers can't edit. |
| D10 | Draft and published are separate. The public page changes only on Publish. "Unpublished changes" badge. | A half-edited store is never public. |
| D11 | Store record is created before the AI call; generation runs server-side via `after()` and continues after the tab closes (within the function time limit); stale runs are detected and retryable; the edit link is remembered on the device. Not a durable job queue. | Input is never lost, and every failure path ends in a working Retry. |
| D12 | **Never generate from thin input.** Thin ("fitness") → one follow-up question **with 3 concrete direction chips** ("Home workouts for new moms" …). The creator taps one or types their own. Gibberish → a separate "couldn't understand that" state. | The real problem is "I don't know what to offer". Picking a direction is help; a generic store is not. |
| D13 | Each product is **Coming soon** (default) or **Available now** (creator sets it). WhatsApp number asked **at Publish** (recommended, skippable) and required to mark a product Available now. CTAs: Available now → **Enquire on WhatsApp**. Coming soon → **I'm interested** (+ **Ask on WhatsApp** if a number exists). The editor shows interested taps per product, labelled as taps. | Every store ends in a working action and never implies a product exists when it doesn't. Taps give the creator an early interest signal without collecting buyer data. |
| D14 | No pre-written fallback store. If the AI fails within budget → retry screen, input kept. | The brief forbids mocked outputs. |
| D15 | Product covers are generated visuals by format (gradient + icon + label). No image generation or uploads. | Consistent and good-looking with no extra risk. |
| D16 | 4 accent colours per store, picked in the editor; default chosen by code from the niche. (Cut-first item.) | Cheap personalisation. |
| D17 | A creator's **manually typed price is not clamped** to the suggested range (it must be ₹49–₹99,999); the editor shows the suggested range and a soft warning. | The product controls what it *recommends*; the creator owns their store. Blocking a creator who knows their audience pays ₹799 for an ebook would be overriding the person with the most information. |

## 4. User flow

```
[S1 Input] ──submit──> POST /api/stores: create row (pending) + schedule generation (after()) ──> /edit/[token]
                                                                                │  (polls every 2s)
                                                                       [S2 Generating]
                                         ┌──────────────────────────────────────┼──────────────────────────┐
                                  needs_input                                 ready                       failed / stale
                           [S2b Pick a direction]                       [S3 Editor] ◄── Edit / ↻ section / ↻ all
                           chip or answer ─> regenerate                       │                    [S2c Retry, input kept]
                                                                           Publish
                                                                  [S4 WhatsApp ask → Live sheet]
                                                                              │
                                                                   [S5 Public store /s/slug]
```

## 5. Screens

### S1 — Landing + Input (`/`)
- Headline: "Turn what you know into a store people buy from." Subline: "A few quick answers. Your store in about a minute."
- If stores are remembered on this device: a banner "Continue your store →" (most recent) linking to its edit page. **Create my store** always generates a new `clientRequestId` + token (T27).
- Fields (each one earns its place):

| Field | Required | Why it's needed |
|---|---|---|
| Your name | Yes | Shown on the store; the bio is written about this person. |
| What are you good at? | Yes | Decides what can be sold. |
| Who do you help? | Yes | Decides format and price tier (students ≠ business owners). |
| What do they get from you? | Yes | Product titles and descriptions are built around the outcome. |
| Audience size (chips: No audience yet · Under 5K · 5K–20K · 20K–100K · 100K+) | Yes, one tap | Changes tiers and the product mix (no audience → lean on 1:1 and low-ticket). Self-reported because we don't read Instagram. |
| Language (English · Hinglish) | Default English, one tap | Changes all copy. |
| Instagram handle | Optional, collapsed | Shown as a link on the store. |

- Example chips under each typed field (tap fills, still editable): e.g. "Home cooking", "Fitness for women", "Stock market basics", "UPSC prep", "Vedic astrology", "Canva design" / "Working professionals", "College students", "New moms", "Small business owners" / "Cook in 20 minutes", "Lose weight without a gym", "Crack the exam", "Start investing".
- CTA **Create my store**, disabled until the required fields are filled; disabled after tap. The form generates a `clientRequestId` and the edit token once, saves both to localStorage before sending (T11), and sends them with the POST.
- Client check only blocks: empty, < 2 characters, or one character repeated 5+ times ("aaaaa"). Everything else is judged by the model.
- Input truncated to 500 characters per field before it reaches the prompt.

### S2 — Generating (status = pending | generating)
- A store-shaped skeleton (header, bio lines, 3 card placeholders), not a spinner.
- Rotating lines every ~2.5s: "Reading what you do…" → "Finding products your audience will pay for…" → "Pricing for Indian buyers…" → "Writing your page…".
- After 20s: "Taking a little longer than usual…". After 75s in `generating`, or 15s in `pending` without a claim: treat as stale → S2c with Retry.

### S2b — Pick a direction (status = needs_input)
- The AI's one question, e.g. "Fitness for whom?", with **3 direction chips** written by the AI ("Home workouts for new moms", "Fat-loss plans for desk workers", "Strength training for beginners") and a text box "or describe it yourself".
- Tapping a chip or submitting text → regenerate. If the answer is still thin, show new directions again (max 2 rounds), then the creator must pick a chip; we never generate from thin input.

### S2c — Unclear input / failure
- Unclear: "We couldn't understand that. Try something like 'I teach home cooking to working women.'" Back to S1 with input prefilled.
- Failure / stale: "Our AI is busy right now. Your answers are saved." **Try again**. Never a blank or broken page.

### S3 — Editor (status = ready)
- Top bar: store name, badge ("Draft" / "Live" / "Unpublished changes"), **View live** (if published).
- Body: the actual public store component (same as S5) with controls:
  - Header/bio block: **Edit** · **↻**
  - Each product: **Edit** · **↻** · a "Why ₹299?" chip that expands: the tier rationale + "Typical range for ebooks: ₹149–₹499" (editor only).
  - Per product, once live: "N interested · N WhatsApp taps" with a one-line note the first time: "Taps show interest, not purchases."
  - If the creator's edits leave no product under ₹500: soft hint "Most first-time buyers start with something under ₹500." (Not a block.)
- Sticky bottom bar: **↻ Regenerate all** (confirm: "This replaces your bio and all products"; reuses the full generation pipeline) · **Publish** (primary).
- Edit sheet:
  - Header: name, headline, bio, Instagram handle, WhatsApp number (with the privacy line), accent colour (4 swatches, *cut-first*).
  - Product: availability (Coming soon / Available now; Available now asks for WhatsApp if missing), title, format (select; changing format re-prices to its typical tier), price (₹49–₹99,999; shows "Suggested ₹149–₹499" and a soft warning outside it; D17), one-line summary, description, 3 "what you get" items.
  - **Save** / **Cancel**.
- Section regenerate: the existing card stays in place, dimmed, with a small loading overlay (not a separate skeleton card); on success the card is replaced, on failure the original stays. The rest of the editor stays usable. Icon-only buttons have accessible names ("Regenerate bio", "Regenerate product: <title>"). On failure: toast "Couldn't regenerate, kept your previous version."

### S4 — Publish
- **Step 1 (only if no WhatsApp number yet): "How should buyers reach you?"**
  - WhatsApp number (10-digit Indian mobile, +91 prefilled).
  - Privacy line under the field: **"This number will be visible to anyone who opens your store."**
  - **Publish with WhatsApp** (primary) · **Publish without WhatsApp** (secondary). One line under both: "Coming-soon products always show an I'm interested button. WhatsApp adds an Ask on WhatsApp option." **Publish without WhatsApp** is disabled, with a reason, while any product is Available now (T5).
- **Step 2: "Your store is live 🎉"**
  - Public link: **Copy** · **Share on WhatsApp**.
  - Private edit link with warning: "Save this link. It's the only way to edit your store." **Copy edit link.** (Also remembered on this device.)

### S5 — Public store (`/s/[slug]`)
- Mobile-first, max-width ~480px, centred on desktop. Accent colour from the store theme.
- Header: initials avatar, name, headline, Instagram link (if any).
- Bio.
- Product cards (compact): format cover with a **Coming soon** badge where relevant, title, price (₹ with Indian digit grouping, e.g. ₹1,999), one-line summary, CTA. **See details** expands the full description and the 3 "what you get" items.
- CTAs:
  - Available now (WhatsApp always present): **Enquire on WhatsApp** → `wa.me/91XXXXXXXXXX?text=Hi <name>, I'd like to buy "<title>"`.
  - Coming soon: **I'm interested** → records `interest_tapped` (once per browser per product) → "✓ Thanks! <first name> will see that you're interested." Plus a secondary **Ask on WhatsApp** link if a number exists, and "Follow on Instagram" if a handle exists. No buyer data collected.
- Footer: "Made with Storefront AI · Create your own store" (link to `/`).
- OG meta tags (title = name + headline, description = bio) for WhatsApp link previews.
- **Quality bar** (Claude Design owns the visuals; these are pass/fail): no horizontal scroll at 360px; tap targets ≥ 44px; price and CTA visible without expanding a card; whole store readable in < 3 scrolls with 3 products; looks finished with no Instagram handle and no WhatsApp.

### S6 — Not found
- `/s/unknown`, `/edit/badtoken`: "This store doesn't exist (yet)." CTA **Create your own store**.

## 6. Data model (Supabase / Postgres)

```sql
create table stores (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,            -- kebab(name)-xxxx (4 random base36 chars)
  client_request_id text unique not null,          -- idempotency for POST /api/stores
  creator_ip_hash  text,                            -- sha256(ip + salt), for rate limiting only
  edit_token_hash  text unique not null,            -- sha256(token); raw token only ever in the URL
  status           text not null default 'pending'
                   check (status in ('pending','generating','needs_input','ready','failed')),
  input            jsonb not null,                  -- S1 answers + direction chosen
  follow_up        jsonb,                           -- { question, directions[3], round }
  draft            jsonb,                           -- StoreContent (§7.2)
  published        jsonb,                           -- snapshot at last publish
  published_at     timestamptz,
  has_unpublished_changes boolean not null default false,
  gen_started_at   timestamptz,                     -- for the atomic claim + stale detection
  gen_attempts     int not null default 0,
  model_used       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table events (
  id          bigserial primary key,
  store_id    uuid references stores(id) on delete cascade,
  visitor_id  text,                                 -- random id in localStorage (per browser); required for public events
  ip_hash     text,                                 -- sha256(ip + salt), for throttling only
  type        text not null,                        -- §10
  product_id  text,
  meta        jsonb,
  created_at  timestamptz not null default now(),
  event_day   date not null default ((now() at time zone 'utc')::date),
  constraint public_events_need_visitor
    check (type not in ('store_viewed','interest_tapped','whatsapp_tapped') or visitor_id is not null),
  constraint product_events_need_product
    check (type not in ('interest_tapped','whatsapp_tapped') or product_id is not null)
);
create index on events (store_id, type);
create index on events (store_id, ip_hash, created_at);
-- one interest tap per session per product; one view per session per day
create unique index events_interest_once on events (store_id, product_id, visitor_id) where type = 'interest_tapped';
create unique index events_view_daily on events (store_id, visitor_id, event_day) where type = 'store_viewed';
```

- RLS enabled on both tables with **no** anon policies. All access via Next.js server code with the service-role key. The browser never talks to Supabase.
- Token: generated **in the browser** with `crypto.getRandomValues` (24 bytes, base64url) and saved to localStorage before submit (T11). The server validates its format and stores only `sha256(token)`. Lookups by `sha256(token)`.

## 7. AI design

### 7.1 Model
- Google Gemini via `@google/genai`. `GEMINI_MODEL=gemini-3.8-flash` (GA). Thinking level **low** (speed; "minimal" isn't supported on 3.8 Flash). `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite` (stable; structured outputs supported; defaults to minimal thinking, which suits a fast fallback). Both verified with the exact production schema in slice 2 (T10).
- Structured output: `responseMimeType: "application/json"` + `responseSchema`, then **Zod validation in our code anyway**.
- Temperature ~0.8 (variety). Billing enabled on the Google project (free-tier limits are a real risk when reviewers test), with spend limits checked in AI Studio during setup (T16): Google's spend-based rate limits and monthly caps for the project's tier; Cloud budgets only alert.

### 7.2 Output schema (Zod, source of truth)

```ts
const Format = z.enum([
  "ebook", "template_pack", "recorded_course", "live_workshop",
  "cohort_course", "one_on_one", "community",
]);
const Tier = z.enum(["low", "typical", "high"]);

// What the model returns for one product
const ModelProduct = z.object({
  title: z.string().min(4).max(60),
  format: Format,
  tier: Tier,
  tierReason: z.string().max(160),          // must not contain ₹, Rs or numbers ≥ 3 digits
  summary: z.string().min(10).max(90),       // one line shown on the compact card
  description: z.string().min(40).max(420),
  whatYouGet: z.array(z.string().min(3).max(70)).length(3), // concrete deliverables
});

// What the model returns for a full generation
const GenerationResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"),
             headline: z.string().min(8).max(70),
             bio: z.string().min(60).max(320),
             sensitiveDomain: z.enum(["none", "finance", "health"]),
             products: z.array(ModelProduct).min(2).max(4) }),
  z.object({ status: z.literal("needs_more"),
             question: z.string(),
             directions: z.array(z.string().max(60)).length(3) }),
  z.object({ status: z.literal("unclear"), reason: z.string() }),
]);

// Section regeneration contracts (T25)
const BioResult = z.object({
  headline: z.string().min(8).max(70),
  bio: z.string().min(60).max(320),
});
const ProductResult = z.object({ product: ModelProduct }); // same checks as full generation: unique format, tier mapping, claims
// Regenerate all → GenerationResult (if it returns needs_more / unclear, keep the current draft and show the message)

// What we store (built by our code from the model output + input)
const Product = ModelProduct.extend({
  id: z.string(),
  price: z.number().int().min(49).max(99999), // from the §7.5 table, or the creator's manual edit
  priceSource: z.enum(["ai_tier", "creator"]),
  availability: z.enum(["coming_soon", "available"]).default("coming_soon"),
  disclaimer: z.string().optional(),            // added by code for finance / health
});
const StoreContent = z.object({
  creator: z.object({
    displayName: z.string(), headline: z.string(), bio: z.string(),
    instagramHandle: z.string().optional(), whatsapp: z.string().optional(),
  }),
  products: z.array(Product).min(2).max(4),
  language: z.enum(["en", "hinglish"]),
  theme: z.enum(["saffron", "teal", "plum", "indigo"]),
  sensitiveDomain: z.enum(["none", "finance", "health"]),
});
```

### 7.3 Prompting (Claude chat writes the final prompt text; this is the contract)
**The system prompt includes:**
- Role: Indian creator-economy strategist and copywriter.
- The creator's 3 answers, audience size, language, and Indian buyer context (UPI, price sensitivity).
- The allowed formats, what each tier means, and the ladder rules (D5): at least one product must use an entry-eligible format + tier (§7.5); suggest a premium 1:1 or cohort option only if it fits the creator. **No rupee numbers in the prompt's output instructions**; the model reasons in tiers.
- Tier guidance: weigh depth of the product, delivery effort (live / 1:1 costs the creator time), how specific the outcome is, and audience size **as one factor, not the only one**. No audience → favour 1:1 and low tiers for digital products.
- Writing rules: concrete over vague ("12 recipes under 20 minutes", not "delicious recipes"); `whatYouGet` lists deliverables the buyer actually receives; bio in first person, ≤ 320 characters, sounds like a person, not an ad.
- **Must not** invent credentials, certifications, years of experience, follower counts, earnings, testimonials or results claims ("guaranteed", "lose 10 kg in 7 days"). Only use facts in the input.
- **Finance:** education only. No stock tips, buy/sell calls, portfolio advice, return figures, or "SEBI-registered" claims unless stated in the input. Set `sensitiveDomain: "finance"`.
- **Health / fitness / diet:** no diagnosing or treating conditions, no medical claims, no specific weight-loss or results numbers. Set `sensitiveDomain: "health"`.
- Hinglish: Roman-script Hindi-English mix as urban Indian creators write it ("Roz ka khana, 20 minute mein"). Titles may stay mostly English.
- `needs_more` when the niche is too broad to choose products (no audience or outcome, or a single generic word); always return 3 specific, different directions. `unclear` for gibberish, offensive input, or input that isn't a skill.

**Section regenerate prompt:** same context + current store + "Regenerate only the bio" or "Replace product N. Formats already used: [..]. Use a different format and angle."

### 7.4 Generation pipeline (server)

**Durability**
1. `POST /api/stores` runs in this order (T12): idempotency lookup by `clientRequestId` (if found and `sha256(token)` matches, return the same store); validate; creation rate limit; insert the row (`pending`) with the client-generated token's hash; schedules `runGeneration(storeId)` with Next.js `after()`, and returns the token immediately. Generation continues after the tab closes, but only within the function's time limit; it is not a durable queue.
2. `runGeneration` first **claims** the store atomically:
   `UPDATE stores SET status='generating', gen_started_at=now(), gen_attempts=gen_attempts+1 WHERE id=$1 AND (status IN ('pending','failed') OR (status='generating' AND gen_started_at < now() - interval '75 seconds')) RETURNING *`
   No row returned → another run is active → exit. This prevents double runs from double taps, refreshes or retries.
3. The edit page polls `GET /api/stores/[token]` every 2s. Stale = `generating` for > 75s, or `pending` for > 15s → shown as failed with **Try again** (`POST /retry` runs the same claim, whose WHERE clause also accepts a stale `pending`).
4. The token is saved in `localStorage`; S1 offers "Continue your store".

**Time budget: 50s total (`maxDuration = 60`)**
```
attempt 1: GEMINI_MODEL, timeout min(22s, remaining)
  → parse JSON → Zod → deterministic checks (below)
  any failure (timeout, 429, 5xx, invalid JSON, schema fail, check fail)
attempt 2: GEMINI_FALLBACK_MODEL, timeout = remaining − 3s, same checks
  any failure → status=failed (S2c), input kept
```
No JSON-repair call and no third attempt; a fallback-model retry fixes the same problems and fits the budget.

**Deterministic checks (code, every attempt)**
- Zod schema passes.
- Formats are unique; titles are unique (case-insensitive).
- Ladder (D5) after pricing: ≥ 1 product ≤ ₹499. If none: find a product whose format has an entry-eligible tier (§7.5) and set it to the highest such tier. If no product's format is entry-eligible (e.g. only recorded_course + cohort_course) → counts as a failed attempt.
- `tierReason` contains no ₹ / Rs / 3+ digit numbers → otherwise that sentence is removed (the rationale can never contradict the price).
- Banned claims (regex: guaranteed, 100%, lakh/crore + earn, "certified" / "SEBI" when not in the input) → counts as a failed attempt. This catches obvious cases only; the prompt rules and the eval set carry the rest, and that residual risk is stated in the doc.
- Sensitive domain = model's `sensitiveDomain` **OR** a code keyword match on the input (finance: stock, share market, trading, invest, mutual fund, SIP, crypto, tax, loan, insurance; health: fitness, diet, weight, nutrition, yoga, PCOS, diabetes, thyroid, therapy, mental health). (T8)
- Then code assigns ids, maps format + tier → price (§7.5), sets every product to `coming_soon`, copies name / Instagram / WhatsApp from the input (never from the model), sets the theme from the niche, and adds a disclaimer to each product when the sensitive domain is finance ("For learning only. Not investment advice.") or health ("For general wellness. Not medical advice.").

**Section regenerate** uses the same two-attempt pattern with a 30s budget. Failure keeps the old version. Regenerated products get new ids (T20).

**Logging:** model used, attempts, latency, which check failed. Used for the decision doc.

**Demo switch:** `FORCE_AI_FAIL=1` makes attempt 1 fail, to show the fallback; `FORCE_AI_FAIL=2` makes both fail, to show S2c.

### 7.5 Pricing table (v5, agreed by Claude, ChatGPT and Gemini; directional, not validated willingness to pay)

| Format | Low | Typical | High | Range shown to creator | Entry-eligible tiers (≤ ₹499) | Evidence |
|---|---|---|---|---|---|---|
| ebook | ₹149 | ₹299 | ₹499 | ₹149–₹499 | low, typical, high | Supported: SuperProfile ebook pages at ₹149 and ₹299 |
| template_pack | ₹199 | ₹399 | ₹699 | ₹199–₹699 | low, typical | None found (hypothesis) |
| recorded_course | ₹799 | ₹1,499 | ₹2,499 | ₹799–₹2,499 | none | None found (hypothesis) |
| live_workshop | ₹199 | ₹399 | ₹799 | ₹199–₹799 | low, typical | Partial: Topmate webinar median ₹259 (a webinar isn't identical to a 60–120 min workshop) |
| cohort_course | ₹2,499 | ₹4,999 | ₹7,999 | ₹2,499–₹7,999 | none | Supported: Indian live cohorts at ₹4,999, ₹5,999, ₹6,999 |
| one_on_one (per session) | ₹299 | ₹699 | ₹1,499 | ₹299–₹1,499 | low | Strong: Topmate paid bookings Nov 2025–Oct 2026, 1:1 middle half ₹259–₹1,106; medians ₹510 (data science), ₹709 (PM); creator coaches ₹1,800 |
| community (per month) | ₹99 | ₹199 | ₹399 | ₹99–₹399 | low, typical, high | Weakest (hypothesis) |

- All prices are Indian "charm" points ending in 49 / 99.
- **Decision-doc wording (agreed):** prices are deterministic starting recommendations, not AI-generated amounts or validated willingness to pay. Directional bands triangulated from Topmate paid-booking data, observed SuperProfile ebook listings and published cohort prices; these differ in transaction type, creator expertise and audience. Evidence strength is stated per format. Creators can override every price. Real willingness to pay needs live price tests (two-week roadmap). The tiers explain when a higher price is reasonable.

## 8. Edge cases (acceptance tests)

**Core gate:** E1, E2, E5, E6, E8, E9, E10, E11, E14, E17, E20, E22, E23, E24 must pass on a real phone against the live URL before any cut-first work. The rest are checked if time allows.

| # | Scenario | Expected behaviour | In Loom? |
|---|---|---|---|
| E1 | Happy path, cooking persona, Hinglish | Store in < 30s, 3 products, ladder respected, Hinglish copy | ✅ |
| E2 | "fitness" / "people" / "get fit" | S2b with 3 direction chips → tap one → good store | ✅ |
| E3 | "asdkjh qwe zzz" | `unclear` → S2c with example, input prefilled | |
| E4 | Instagram `@this_does_not_exist_123` | Nothing breaks; shown as a link; no claims about the profile | |
| E5 | Primary model fails (`FORCE_AI_FAIL=1`) | Fallback model produces the store; user sees no error | ✅ |
| E6 | Both fail (`FORCE_AI_FAIL=2`) | S2c retry, input kept | |
| E7 | Model returns duplicate formats or no entry product | Check fires → tier adjustment or fallback attempt | |
| E8 | Regenerate product 2 | Different format from the others; rest untouched | |
| E9 | Double-tap "Create my store"; **and** lost response (server creates the store, response dropped, client retries with the same ids) | One store; the retry returns it and the edit link works; atomic claim prevents a second run | |
| E10 | Close the tab 5s after submitting, reopen `/` | "Continue your store" → finished store | ✅ |
| E11 | `/s/unknown`, `/edit/badtoken` | S6 not-found | |
| E12 | 2,000-character input | Truncated to 500 per field; works | |
| E13 | Offensive / unsafe niche | `unclear`, neutral message, nothing generated | |
| E14 | Edit after publish | "Unpublished changes"; public page unchanged until republish | |
| E15 | Publish with an empty title | Publish blocked, field highlighted | |
| E16 | Invalid WhatsApp ("12345") at publish | Inline error; Skip still available | |
| E17 | Tester skips WhatsApp, taps "I'm interested" twice on the public page | Confirmation shown; the editor counts it once | ✅ |
| E18 | Creator types ₹2,999 for an ebook / ₹0 | ₹2,999 allowed with a soft warning; ₹0 rejected (min ₹49) | |
| E19 | Finance niche ("stock market basics") | No tips or return claims; disclaimer line on products | |
| E20 | Creator marks a product Available now without a WhatsApp number | Sheet asks for the number first | |
| E21 | 6th store from the same IP within an hour | Friendly "Too many stores created, try again later"; no AI call | |
| E22 | Edit the bio and a product price, save, refresh | Edits persist in the draft | ✅ |
| E23 | Regenerate all | New bio and products; confirmation shown first; edit link unchanged | ✅ |
| E25 | Edit answers → change the niche → confirm | New store content for the same edit link; public page unchanged until republish | |
| E26 | Delete store → confirm | Editor shows "Store deleted"; public link shows not-found; device list no longer offers it; wrong token can't delete | |
| E24 | Publish → copy public URL → open in incognito / another phone (no edit token) → then make an unpublished edit | Store renders correctly on mobile; public page unchanged until republish | ✅ |

## 9. API routes (Next.js App Router)

| Method | Route | Does |
|---|---|---|
| POST | `/api/stores` | Body includes `clientRequestId` and the client-generated `token`. Order (T12): idempotency lookup → validate → rate-limit new stores only (5/hour per hashed IP, best-effort) → insert → schedule generation via `after()` → return `{ slug }` (the client already has the token). |
| GET | `/api/stores/[token]` | Status, follow-up, draft, publish state, tap counts. |
| POST | `/api/stores/[token]/answer` | `{ direction }` → add to input, status=pending, start generation (shared limit, T19). |
| POST | `/api/stores/[token]/retry` | Re-run generation (atomic claim; shared limit, T19). |
| PATCH | `/api/stores/[token]` | Save manual edits (Zod validated; Available now requires a WhatsApp number, T5); sets `has_unpublished_changes`. |
| POST | `/api/stores/[token]/regenerate` | `{ target: "bio" }` · `{ target: "product", productId }` · `{ target: "all" }` (rate-limited 30/hour per store, T6) |
| POST | `/api/stores/[token]/publish` | Optional `{ whatsapp }` (validated). Rejects (400) if any product is Available now and no number exists (T5). Draft → published. Returns the public URL. |
| POST | `/api/events` | `{ slug, type, productId?, visitorId }` (visitorId required; productId required for tap events, T18; checked against the published store, T21). Only `store_viewed`, `whatsapp_tapped`, `interest_tapped` accepted; duplicates ignored via unique indexes; max 30 per hashed IP per store per hour (T3). |

Pages: `/`, `/edit/[token]`, `/s/[slug]`, not-found.

## 10. Metrics and events

**North star (for SuperProfile):** share of new sign-ups who publish a store in their first session. Illustrative baseline 15% → target 35% (a hypothesis; measure the real baseline first).
**Supporting:** median time from first input to first publish < 5 minutes.
**Quality guardrail:** share of published stores that get ≥ 1 WhatsApp tap or interested tap within 14 days.

**How the interest signal fits:** it strengthens activation (a creator who sees taps comes back, picks a product and makes it) rather than replacing it. In production the real proof is the first sale through SuperProfile checkout; taps are only an early, cheap proxy.

Events: `generation_started`, `generation_completed` (latency, model, attempts), `generation_failed`, `followup_shown`, `section_edited`, `section_regenerated`, `store_published`, `store_viewed`, `whatsapp_tapped`, `interest_tapped`. Public events carry a required anonymous `visitor_id` (per browser, T4).

**What each event does and doesn't prove:** `store_viewed` = at most one per browser per day (not a unique person). `whatsapp_tapped` = WhatsApp opened (not a message sent). `interest_tapped` = at most one per browser per product (a signal, not a purchase; the same person on two browsers counts twice; if localStorage is blocked, a refresh counts again; a determined script can still fake taps, T3, T13). The UI labels say exactly that: "page views", "WhatsApp taps", "interested taps".

## 11. Not building (and why)

| Not building | Why |
|---|---|
| Instagram scraping | Blocked and against terms. Two-week roadmap item via official APIs with the creator's consent. |
| Payments / checkout | SuperProfile already has it; not needed to test the hypothesis. WhatsApp + interest taps stand in. |
| Login / accounts | Secret edit link covers the need with zero friction. |
| Edit-link rotation, bot protection beyond basic limits | Real production needs; basic per-IP and per-store limits only. Documented. |
| Runtime "LLM judge" quality check | Adds 5–10s per generation; replaced by deterministic checks + an offline eval set (§16). |
| Buyer contact capture on "I'm interested" | Would need consent and privacy handling; tap counts give the demand signal without it. |
| Image generation / photo upload | Risk and time; format covers look consistent. |
| Hindi (Devanagari) | Hinglish covers the persona. |
| Chat-based builder | Slower, less predictable, harder to edit on a phone. |
| Full analytics dashboard | Per-product tap counts are enough to show the loop. |

## 12. Open questions
None. (WhatsApp at Publish + "I'm interested" demand test, name and accent colours are decided.)

## 13. Build order and scope

**Must-ship core (the product fails without these):**

| Slice | Done when |
|---|---|
| 0 | Repo, Next.js ≥ 15.1 + Tailwind + TS, Supabase tables, env vars, deployed hello-world on Vercel |
| 1 | S1 → `/api/stores` → generation via `after()` → validated store visible on `/edit/[token]` with polling |
| 2 | Pricing table mapping, ladder + deterministic checks, fallback model, time budget, `FORCE_AI_FAIL`; production schema passes a real call on both models (T10) |
| 3 | Public store (S5) + publish (S4, including the WhatsApp step) + availability + both CTAs + event logging + per-product tap counts in the editor + `/s/[slug]` |
| 4 | Editor: edit sheet, PATCH, section regenerate, regenerate all, unpublished-changes badge |
| 5 | S2 / S2b / S2c / S6 states, "Continue your store", rate limits, the **core gate** tests (§8) pass on a real phone against the live URL |

**Cut-first list (build in this order only after slice 5 passes; drop from the bottom if time runs out):**
6. Visual polish from the Claude Design handoff + OG tags
7. Remaining edge cases (§8)
8. Accent colour picker (D16; the niche default ships with slice 3; Claude Design marks the picker optional)

**Already cut:** add/remove product, JSON repair call, Hindi.

## 14. Environment variables

```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
IP_HASH_SALT=                        # random string
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=                 # e.g. https://storefront-ai.vercel.app
FORCE_AI_FAIL=0                      # 1 = primary fails (shows fallback), 2 = both fail (shows retry)
```
`.env.local` is git-ignored; `.env.example` committed with empty values.

## 15. Who does what

| Owner | Responsible for |
|---|---|
| Parth | Decisions, accounts and keys, phone testing, Loom recording, final approval |
| Claude chat | This spec, final prompt text, pricing evidence, eval set, decision doc, Loom script, interview prep |
| ChatGPT | Independent review of each artefact; red-team of the live app |
| Claude Design | S1–S6 mobile screens, the D7 rejected alternative, format covers, colours/type |
| Claude Code | Only tool that writes to the repo. Builds the slices, README |

## 16. Offline eval set (run before submission)

12 inputs, each generated **twice** on the live app (24 stores), scored 1–5 by Parth with ChatGPT as second scorer.

| Dimension | 5 = | 3 = | 1 = |
|---|---|---|---|
| Relevance | Every product clearly fits this creator's skill and this audience | Fits the niche, generic for the audience | Wrong niche or audience |
| Distinct problems | Each product solves a different buyer problem | Two overlap | Same product in different formats |
| Concreteness | Titles and "what you get" name real deliverables (counts, topics, durations) | Some vague items | Fluff ("unlock your potential") |
| Feasibility | A creator like this could deliver all of it within weeks | One product is a stretch | Needs skills or resources they don't have |
| Price sense and progression | A clear entry → core (→ premium) path at prices this audience would pay | Prices fine, no clear path | Prices or order make no sense |
| Voice and safety | Bio sounds like a person; no invented claims; finance/health rules respected | Slightly generic | Invented credentials or unsafe claims |

| # | Input | Expect |
|---|---|---|
| 1 | Home cooking, working professionals, 5K–20K, Hinglish | ok |
| 2 | Women's fitness, new moms, 20K–100K, English | ok |
| 3 | Stock market basics, college students, 5K–20K, Hinglish | ok |
| 4 | UPSC prep, aspirants, 100K+, English | ok |
| 5 | Vedic astrology, working women, under 5K, Hinglish | ok |
| 6 | Canva design, small business owners, 5K–20K, English | ok |
| 7 | Career coach, mid-level managers, no audience yet, English | ok (1:1-led) |
| 8 | Yoga teacher, seniors, under 5K, Hinglish | ok |
| 9 | "fitness" / "people" / "fit" | needs_more |
| 10 | "asdf" / "qwer" / "zxcv" | unclear (or blocked client-side) |
| 11 | 2,000-character rambling description | ok, truncated |
| 12 | An unsafe niche | unclear |

Target: average ≥ 4 on every dimension for 1–8, no score of 1 on voice and safety, and correct status for 9–12 on both runs. Results table goes in the decision doc, with an honest note that 24 stores is a smoke test, not proof of consistency.
