Update the "Haldi & Ink" design for Storefront AI. Keep the visual direction, colours, type and components exactly as they are. Only update the screens below to match the attached SPEC.md v5 (§0 "v5 — three-way review", items V1, V3–V6). Don't add anything not listed. Mobile 360px first, plus the two 1440px desktop frames.

**1. Input screen (V1), new layout.**
- Headline "Turn what you know into a store in minutes." Subline "Tell us what you teach and who it's for. We'll suggest products and prices."
- Stacked full-width fields whose labels read as one sentence: **I'm** [name] / **I teach** [chips + text] / **to** [chips + text].
- Then "How many people follow you?" (one-tap chips), Language (English / Hinglish), a collapsed **More options** (result + Instagram with "Shown as a link on your store. We don't read your profile."), and the Create my store button.
- Show two states: default, and "Stock market basics" selected (audience chips change to College students · Salaried beginners · Small business owners).
- Make the sentence feel conversational through type and spacing, not by placing fields inside a line of text.

**2. Generating (V3).** The skeleton with the creator's name in the header, one personalised line ("Finding products for working professionals…"), an indeterminate indicator (no step bar). Also: the "Taking a little longer…" state; "Generation was interrupted. Try again."; "You're offline. Reconnect to continue."

**3. Follow-up (V3).** A compact summary card ("I teach fitness · to people", with an Edit link), the AI question, 3 direction chips, "or describe it yourself", "Use this", and "Edit my answers".

**4. Editor (V4).**
- Label "Your store preview".
- The muted pricing line above the products.
- Phone top bar: name + badge + Publish only, with a "⋯" menu open showing Start over / Edit answers, Regenerate all, View as buyer, Delete store.
- The regenerate action with an optional "What should change?" field.
- The "Regenerated. Undo" toast.
- The product sheet with **Remove product**.
- The one-time tip "Tap Edit on anything to change it".
- The "Start over" confirmation dialog.

**5. View as buyer.** The draft shown like the public store, with a small bar at the top: "Buyer view of your draft · Back to editing".

**6. Publish sheet (V5), now one sheet.**
- "Any of these ready to sell today?" toggles per product, with the line "Buyers will contact you on WhatsApp. Payments aren't collected on this store."
- WhatsApp field below. Show two states: optional (no product Available now); required (one product Available now, with the reason, and the privacy line under the field).
- Sticky Publish button.
- Also: the one-tap **"Update live store"** button for republishing.

**7. Success screen (V5).** "Your store is live" with:
- the public link, a native Share button and Copy, and "Paste this link into your Instagram bio.";
- a private section with **Save my private edit link on WhatsApp** and Copy, plus "Private: anyone with this link can edit your store. Don't forward it."

**8. Public store (V6).**
- An "Available now" group first, then a **Coming soon** subheading.
- Under Enquire on WhatsApp: "Chat with Ananya to buy. No payment on this page."
- On coming-soon cards: "Indicative price. Final price may change when available."
- No interest counts anywhere.
- Update the 1440px desktop frame too.

**Sample content:** Ananya Sharma, home cooking for working professionals, Hinglish. Recipe ebook ₹299 (Available now), live weekend cooking workshop ₹399 (Coming soon), 1:1 meal-planning call ₹699 (Coming soon). Mark all sample text as sample.

**Hand-off:** export the updated HTML plus an updated tokens list only if any tokens changed.
