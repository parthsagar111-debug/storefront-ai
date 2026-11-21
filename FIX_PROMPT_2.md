Round 2, from Parth's own testing and a review of the QA §9 stores. One commit per item, deploy after all items, re-run the core gate, then stop and report.

**1. Replace `SPEC.md` and `PROMPTS.md`** in the repo with the attached versions (SPEC v4.5, PROMPTS v3). The repo copy of SPEC.md is outdated: it's missing the S3 regenerate-overlay and S4 "Publish with / without WhatsApp" wording you already built.

**2. PROMPTS v3 → `prompts.ts`.** Copy the shared system prompt changes exactly (specific `tierReason`, live-format deliverables, finance "safe" wording, Hinglish gender). Keep your item-C final-round line (it's now in PROMPTS.md too). Check character for character, as before.

**3. Code check addition** (`checkClaims`, finance domain): also fail on `\b(safe|safely|risk[- ]free|secure|guaranteed)\b` within ~4 words of `invest|investing|investment|stock|stocks|returns`. Unit tests, positive and negative.

**4. T28, Edit answers & regenerate** (SPEC v4.5): editor top-bar **Edit answers** → S1 prefilled for the same store and token → confirmation → regenerate with the new input. Uses the existing generation pipeline and the shared per-store limit. The published page doesn't change until republish. Test E25.

**5. T29, Delete store** (SPEC v4.5): overflow menu → confirmation → server delete after the token check (events cascade) → "Store deleted" + **Create a new store**; removed from the device's store list; `/s/<slug>` shows not-found. Test E26, including a wrong token failing.

**6. Mini eval, 4 generations only** (free tier): cooking/Hinglish (Ananya), finance/Hinglish (stock market basics for college students), yoga for seniors/Hinglish with a gender-ambiguous name (e.g. "Kiran"), UPSC 100K+. Report for each: the `tierReason` of every product (do they mention the audience?), any "safe"-type finance wording, Hinglish gender consistency, live-format deliverables. Paste the 4 JSONs into `QA_REPORT.md` §10.

**7. Clean up:** delete the eval stores and the 13 old non-QA test stores ("Ananya Sharma", "Meera Iyer"…), so production has **0 stores** before Parth creates the demo stores. Confirm the counts.

**Reminder:** item 0 (key rotation) from the last round is still open. Parth will give you new keys when he's ready.
