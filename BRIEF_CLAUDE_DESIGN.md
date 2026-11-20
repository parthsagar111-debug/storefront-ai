# Brief for Claude Design

> Paste below the line into Claude Design, attaching SPEC.md. Time box: about 40 minutes.

---

Design the mobile screens for **Storefront AI**, a web app where an Indian creator types a few answers and gets a published storefront with AI-suggested products and INR prices. Full spec attached (SPEC.md); the screens are in **§5**. Design only what's there. Don't add features, fields or screens.

**Who it's for:** Indian micro-creators (cooking, fitness, finance, exam prep, astrology, design) setting this up on a phone between other work. Not technical. English or Hinglish.

**Frame:** 360 × 800 mobile first. Public store max-width 480px, centred on desktop. One strong visual direction, not several concepts.

**Screens:**
1. **S1 Input:** name, 3 questions with tap-to-fill chips, audience-size chips, English/Hinglish toggle, collapsed Instagram field, CTA.
2. **S2 Generating:** store-shaped skeleton + rotating status line.
3. **S2b Pick a direction:** one question, 3 direction chips, "or describe it yourself".
4. **S2c** Unclear input / AI busy states.
5. **S3 Editor:** the store preview with Edit · ↻ per section, "Why ₹299?" chip, sticky bar (↻ Regenerate all · Publish), "Unpublished changes" badge, tap counts per product.
6. **S3 Edit bottom sheet:** product version (availability toggle, title, format, price with suggested range, summary, description, 3 "what you get" items).
7. **S4 Publish:** WhatsApp step (with the privacy line and Skip), then "Your store is live" with public link, Share on WhatsApp, edit link warning.
8. **S5 Public store:** header (initials avatar, name, headline, Instagram), bio, 3 compact product cards (cover by format, Coming soon badge, title, price, summary, CTA, See details), footer. Show both CTA states: Enquire on WhatsApp, and I'm interested → "✓ Thanks!".
9. **S6 Not found.**

**Also design (needed for the decision doc):**
- **Rejected alternative (D7):** the same editor as an always-visible form beside/above a small preview, at 360px, so the comparison is obvious.

**Visual system:**
- 4 accent colours: saffron, teal, plum, indigo (one store per mock is fine; show the picker as optional).
- 7 format covers (ebook, template pack, recorded course, live workshop, cohort, 1:1, community): gradient + simple icon + format label. No photos.
- Prices with Indian grouping (₹1,999). Tap targets ≥ 44px. No horizontal scroll at 360px.
- It must look like something a creator would proudly share on WhatsApp: warm, clean, trustworthy; not a generic SaaS template.

**Demo content:** Ananya Sharma, home cooking for working professionals, Hinglish. Example products: a recipe ebook (₹299), a live weekend cooking workshop (₹499), a 1:1 meal-planning call (₹999). Label all content as sample text.

**Hand-off:** export screens + a short design-tokens list (colours, type scale, spacing, radius) that Claude Code can match in Tailwind.
