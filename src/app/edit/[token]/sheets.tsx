"use client";
import { useEffect, useRef, useState } from "react";
import { Sheet, Field } from "@/components/sheet";
import { Button, Segmented, SectionLabel, btnClass, inputCls } from "@/components/ui";
import { IconAlert, IconChat, IconCheck, IconCopy, IconEye, IconLock } from "@/components/icons";
import type { TStoreContent, TProduct } from "@/lib/ai/schemas";
import { FORMATS } from "@/lib/ai/schemas";
import { FORMAT_LABEL, PRICE_TABLE, rangeFor, formatINR, ENTRY_MAX } from "@/lib/pricing";
import { normalizeIndianMobile } from "@/lib/whatsapp";

/** QA-09: warn before leaving the page while a sheet has unsaved changes. */
function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

export type PatchFn = (body: unknown) => Promise<{ ok: true } | { ok: false; field?: string; error?: string }>;

const CONFLICT_MSG = "This store changed in another tab. Refresh to see the latest.";
const PRIVACY = "This number will be visible to anyone who opens your store.";

const FIELD_MSG: Record<string, string> = {
  displayName: "2–60 characters",
  headline: "8–70 characters",
  bio: "20–320 characters",
  instagramHandle: "Letters, numbers, . and _ only",
  whatsapp: "Enter a 10-digit Indian mobile number",
  title: "4–60 characters",
  summary: "10–90 characters",
  description: "40–420 characters",
  price: "₹49 – ₹99,999",
  whatYouGet: "Each item 3–70 characters",
};

function SaveBar({ busy, onCancel, onSave }: { busy: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <div className="flex gap-2">
      <Button variant="secondary" className="flex-1" onClick={onCancel}>
        Cancel
      </Button>
      <Button className="flex-1" disabled={busy} onClick={onSave}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function Privacy() {
  return (
    <p className="flex items-start gap-1.5 text-xs font-semibold text-ink/80">
      <IconEye size={16} className="mt-px shrink-0" />
      {PRIVACY}
    </p>
  );
}

/** +91 prefixed phone input. */
function PhoneInput({ id, value, onChange, bad, autoFocus }: { id: string; value: string; onChange: (v: string) => void; bad?: boolean; autoFocus?: boolean }) {
  return (
    <div className={`flex overflow-hidden rounded-xl border bg-surface focus-within:border-teal ${bad ? "border-danger" : "border-line-input"}`}>
      <span className="flex items-center border-r border-line bg-sand/60 px-3 font-bold text-ink/80">+91</span>
      <input
        id={id}
        className="min-h-12 w-full px-3 text-base outline-none"
        inputMode="tel"
        autoComplete="tel-national"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function HeaderSheet({ draft, onClose, patch }: { draft: TStoreContent; onClose: () => void; patch: PatchFn }) {
  const c = draft.creator;
  const [initial] = useState(() => ({
    displayName: c.displayName,
    headline: c.headline,
    bio: c.bio,
    instagramHandle: c.instagramHandle ?? "",
    whatsapp: c.whatsapp ?? "",
  }));
  const [v, setV] = useState(initial);
  const [bad, setBad] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useUnsavedGuard(JSON.stringify(v) !== JSON.stringify(initial));
  const needsWa = draft.products.some((p) => p.availability === "available");

  const save = async () => {
    if (v.whatsapp && !normalizeIndianMobile(v.whatsapp)) return setBad("whatsapp");
    if (!v.whatsapp && needsWa) return setBad("whatsapp");
    // IQA-01/QA-08: send only the fields this sheet changed, so another tab's edits to other fields survive.
    const changed = Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== initial[k as keyof typeof initial]));
    if (Object.keys(changed).length === 0) return onClose();
    setBusy(true);
    const r = await patch({ creator: changed });
    setBusy(false);
    if (r.ok) onClose();
    else setBad(r.error === "changed_elsewhere" ? "conflict" : r.field?.replace(/^creator\./, "") || "form");
  };
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => {
    setV({ ...v, [k]: e.target.value });
    if (bad === k) setBad(null);
  };

  return (
    <Sheet open onClose={onClose} title="Edit your header" footer={<SaveBar busy={busy} onCancel={onClose} onSave={save} />}>
      <Field label="Name" htmlFor="h-name" error={bad === "displayName" ? FIELD_MSG.displayName : null}>
        <input id="h-name" className={inputCls(bad === "displayName")} value={v.displayName} onChange={set("displayName")} maxLength={60} />
      </Field>
      <Field label="Headline" htmlFor="h-headline" aside={`${v.headline.length}/70`} error={bad === "headline" ? FIELD_MSG.headline : null}>
        <input id="h-headline" className={inputCls(bad === "headline")} value={v.headline} onChange={set("headline")} maxLength={70} />
      </Field>
      <Field label="Bio" htmlFor="h-bio" aside={`${v.bio.length}/320`} error={bad === "bio" ? FIELD_MSG.bio : null}>
        <textarea id="h-bio" className={inputCls(bad === "bio")} rows={5} value={v.bio} onChange={set("bio")} maxLength={320} />
      </Field>
      <Field label="Instagram handle (optional)" htmlFor="h-insta" error={bad === "instagramHandle" ? FIELD_MSG.instagramHandle : null}>
        <input
          id="h-insta"
          className={inputCls(bad === "instagramHandle")}
          value={v.instagramHandle}
          onChange={set("instagramHandle")}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </Field>
      <Field
        label={needsWa ? "WhatsApp number (needed for Available now)" : "WhatsApp number (optional)"}
        htmlFor="h-wa"
        error={bad === "whatsapp" ? FIELD_MSG.whatsapp : null}
        hint={<Privacy />}
      >
        <PhoneInput
          id="h-wa"
          value={v.whatsapp}
          bad={bad === "whatsapp"}
          onChange={(x) => {
            setV({ ...v, whatsapp: x });
            if (bad === "whatsapp") setBad(null);
          }}
        />
      </Field>
      {bad === "form" && <p className="text-sm text-danger">Couldn&apos;t save. Please check the fields.</p>}
      {bad === "conflict" && <p className="text-sm font-semibold text-danger">{CONFLICT_MSG}</p>}
    </Sheet>
  );
}

export function ProductSheet({
  draft,
  product,
  index,
  onClose,
  patch,
  onRemove,
}: {
  draft: TStoreContent;
  product: TProduct;
  index: number;
  onClose: () => void;
  patch: PatchFn;
  /** V4: Remove product (while more than 2). Resolves to an error message, or null when removed. */
  onRemove?: (id: string) => Promise<string | null>;
}) {
  const [initial] = useState(() => ({
    availability: product.availability,
    title: product.title,
    format: product.format,
    price: String(product.price),
    summary: product.summary,
    description: product.description,
    whatYouGet: [...product.whatYouGet],
  }));
  const [v, setV] = useState(initial);
  const [whatsapp, setWhatsapp] = useState(draft.creator.whatsapp ?? "");
  useUnsavedGuard(JSON.stringify(v) !== JSON.stringify(initial) || whatsapp !== (draft.creator.whatsapp ?? ""));
  const [bad, setBad] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const range = rangeFor(v.format);
  const price = Number(v.price);
  const priceValid = Number.isInteger(price) && price >= 49 && price <= 99999;
  const outside = priceValid && (price < range.min || price > range.max);
  const needsNumber = v.availability === "available" && !draft.creator.whatsapp;
  const usedFormats = draft.products.filter((p) => p.id !== product.id).map((p) => p.format);
  const formatName = FORMAT_LABEL[v.format].toLowerCase();
  // V4: a format change re-prices only an AI price the creator hasn't touched in this sheet.
  const aiPrice = product.priceSource === "ai_tier" && v.price === initial.price;
  const [removeStep, setRemoveStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [removeErr, setRemoveErr] = useState<string | null>(null);
  const canRemove = Boolean(onRemove) && draft.products.length > 2;
  const onlyEntry = product.price <= ENTRY_MAX && !draft.products.some((p) => p.id !== product.id && p.price <= ENTRY_MAX);

  const save = async () => {
    if (!priceValid) return setBad("price");
    if (needsNumber && !normalizeIndianMobile(whatsapp)) return setBad("whatsapp");
    setBusy(true);
    // Available now without a number: save the number first (T5), then the product.
    if (needsNumber) {
      const r0 = await patch({ creator: { whatsapp } });
      if (!r0.ok) {
        setBusy(false);
        return setBad("whatsapp");
      }
    }
    // IQA-01/QA-08: only the fields this sheet changed.
    const changed: Record<string, unknown> = {};
    for (const k of Object.keys(v) as (keyof typeof v)[]) {
      if (JSON.stringify(v[k]) !== JSON.stringify(initial[k])) changed[k] = k === "price" ? price : v[k];
    }
    if (Object.keys(changed).length === 0) {
      setBusy(false);
      return onClose();
    }
    const r = await patch({ product: { id: product.id, ...changed } });
    setBusy(false);
    if (r.ok) onClose();
    else
      setBad(
        r.error === "changed_elsewhere"
          ? "conflict"
          : r.field?.replace(/^products\.\d+\./, "").replace(/^product\./, "").replace(/\.\d+$/, "") || "form",
      );
  };
  const set = (k: "title" | "summary" | "description" | "price") => (e: { target: { value: string } }) => {
    setV({ ...v, [k]: e.target.value });
    if (bad === k) setBad(null);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit product"
      subtitle={`Product ${index + 1} of ${draft.products.length}`}
      footer={<SaveBar busy={busy} onCancel={onClose} onSave={save} />}
    >
      <SectionLabel>Basics</SectionLabel>
      <Field label="Availability" hint="Available now needs your WhatsApp number so buyers can reach you.">
        <Segmented
          label="Availability"
          value={v.availability}
          onChange={(a) => setV({ ...v, availability: a })}
          options={[
            ["coming_soon", "Coming soon"],
            ["available", "Available now"],
          ]}
        />
      </Field>
      {needsNumber && (
        <Field label="Your WhatsApp number" htmlFor="p-wa" error={bad === "whatsapp" ? FIELD_MSG.whatsapp : null} hint={<Privacy />}>
          <PhoneInput id="p-wa" value={whatsapp} onChange={setWhatsapp} bad={bad === "whatsapp"} autoFocus />
        </Field>
      )}
      <Field label="Title" htmlFor="p-title" error={bad === "title" ? FIELD_MSG.title : null}>
        <input id="p-title" className={inputCls(bad === "title")} value={v.title} onChange={set("title")} maxLength={60} />
      </Field>
      <Field
        label="Format"
        htmlFor="p-format"
        hint={product.priceSource === "ai_tier" ? "Changing format moves the price to the new format's typical price." : "Your price stays when you change format. Check the suggested range below."}
      >
        <select
          id="p-format"
          className={`${inputCls()} appearance-none bg-[length:16px] bg-[right_1rem_center] bg-no-repeat`}
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23221A14' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
          value={v.format}
          onChange={(e) => {
            const f = e.target.value as TProduct["format"];
            setV({ ...v, format: f, price: aiPrice ? String(PRICE_TABLE[f].typical) : v.price });
          }}
        >
          {FORMATS.map((f) => (
            <option key={f} value={f} disabled={usedFormats.includes(f)}>
              {FORMAT_LABEL[f]}
              {usedFormats.includes(f) ? " (used)" : ""}
            </option>
          ))}
        </select>
      </Field>

      <SectionLabel>Price</SectionLabel>
      <Field label="Price" htmlFor="p-price" aside={`Suggested ${formatINR(range.min)}–${formatINR(range.max)}`} error={bad === "price" ? FIELD_MSG.price : null}>
        <div className={`flex overflow-hidden rounded-xl border bg-surface focus-within:border-saffron ${bad === "price" ? "border-danger" : outside ? "border-warn-ink/40" : "border-line-input"}`}>
          <span className="flex items-center border-r border-line bg-sand/60 px-4 font-bold text-ink/80">₹</span>
          <input id="p-price" className="min-h-12 w-full px-3 text-base outline-none" inputMode="numeric" value={v.price} onChange={set("price")} />
        </div>
        {outside && (
          <p className="flex gap-2 rounded-xl border border-warn-ink/15 bg-warn-bg px-3 py-2 text-sm text-warn-ink">
            <IconAlert size={18} className="shrink-0" />
            {price > range.max ? `Higher than most ${formatName}s.` : `Lower than most ${formatName}s.`} You can keep it if your audience pays this.
          </p>
        )}
      </Field>

      <SectionLabel>Details</SectionLabel>
      <Field label="One-line summary" htmlFor="p-summary" aside={`${v.summary.length}/90`} error={bad === "summary" ? FIELD_MSG.summary : null}>
        <input id="p-summary" className={inputCls(bad === "summary")} value={v.summary} onChange={set("summary")} maxLength={90} />
      </Field>
      <Field label="Description" htmlFor="p-desc" aside={`${v.description.length}/420`} error={bad === "description" ? FIELD_MSG.description : null}>
        <textarea id="p-desc" className={inputCls(bad === "description")} rows={5} value={v.description} onChange={set("description")} maxLength={420} />
      </Field>
      <Field label="What you get" error={bad === "whatYouGet" ? FIELD_MSG.whatYouGet : null}>
        <div className="space-y-2">
          {v.whatYouGet.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-saffron-soft text-xs font-bold text-saffron-ink">{i + 1}</span>
              <input
                aria-label={`What you get, item ${i + 1}`}
                className={inputCls(bad === "whatYouGet")}
                value={w}
                maxLength={70}
                onChange={(e) => {
                  const next = [...v.whatYouGet];
                  next[i] = e.target.value;
                  setV({ ...v, whatYouGet: next });
                  if (bad === "whatYouGet") setBad(null);
                }}
              />
            </div>
          ))}
        </div>
      </Field>
      {bad === "form" && <p className="text-sm text-danger">Couldn&apos;t save. Please check the fields.</p>}
      {bad === "conflict" && <p className="text-sm font-semibold text-danger">{CONFLICT_MSG}</p>}

      {canRemove && (
        <div className="space-y-2 border-t border-line pt-4">
          {onlyEntry ? (
            <p className="text-sm text-muted">
              You can&apos;t remove this product: it&apos;s your only one under ₹500, and new buyers usually start with something cheap.
            </p>
          ) : removeStep === "idle" ? (
            <button type="button" className="min-h-11 text-sm font-bold text-danger underline underline-offset-4" onClick={() => setRemoveStep("confirm")}>
              Remove product
            </button>
          ) : (
            <div className="space-y-3 rounded-2xl border border-danger/20 bg-red-50 p-3">
              <p className="text-sm font-semibold text-ink">Remove “{product.title}” from your store?</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" disabled={removeStep === "busy"} onClick={() => setRemoveStep("idle")}>
                  Keep it
                </Button>
                <button
                  type="button"
                  disabled={removeStep === "busy"}
                  className={btnClass("primary", "sm", "flex-1 bg-danger! shadow-none!")}
                  onClick={async () => {
                    setRemoveStep("busy");
                    const err = await onRemove!(product.id);
                    if (err) {
                      setRemoveErr(err);
                      setRemoveStep("idle");
                    }
                  }}
                >
                  {removeStep === "busy" ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          )}
          {removeErr && <p className="text-sm font-semibold text-danger" role="alert">{removeErr}</p>}
        </div>
      )}
    </Sheet>
  );
}

/** V5 switch row for the readiness toggles. */
function ReadyToggle({ on, onChange, title, price }: { on: boolean; onChange: (v: boolean) => void; title: string; price: number }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${title}: ${on ? "Available now" : "Coming soon"}`}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2 text-left"
      onClick={() => onChange(!on)}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug [overflow-wrap:anywhere]">{title}</span>
        <span className="text-sm text-muted">
          {formatINR(price)} · {on ? "Available now" : "Coming soon"}
        </span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-teal" : "bg-line-input"}`} aria-hidden>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

const PRIVATE_WARNING = "Private: anyone with this link can edit your store. Don't forward it.";

/**
 * S4 Publish (SPEC v5 V5). `form` = first publish: readiness toggles + WhatsApp + sticky Publish, one request.
 * `update` = republish with nothing to ask (one tap "Update live store"). `share` = already live, no changes.
 * "Your store is live" only after the publish response confirms the save AND the public URL loads; otherwise the
 * draft stays and Retry re-sends the same (idempotent) request.
 */
export function PublishSheet({
  draft,
  token,
  slug,
  mode,
  onClose,
  onPublished,
}: {
  draft: TStoreContent;
  token: string;
  slug: string;
  mode: "form" | "update" | "share";
  onClose: () => void;
  onPublished: (draft: TStoreContent, publishedAt: string, draftRev?: number) => void;
}) {
  const publicUrl = typeof window !== "undefined" ? `${location.origin}/s/${slug}` : "";
  const [step, setStep] = useState<"form" | "working" | "retry" | "live">(mode === "form" ? "form" : mode === "share" ? "live" : "working");
  const [ready, setReady] = useState<Record<string, boolean>>(() => Object.fromEntries(draft.products.map((p) => [p.id, p.availability === "available"])));
  const [wa, setWa] = useState(draft.creator.whatsapp ?? "");
  const [waFocus, setWaFocus] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const lastBody = useRef<object>({});
  const started = useRef(false);
  const anyReady = Object.values(ready).some(Boolean);
  const waValid = Boolean(normalizeIndianMobile(wa));

  useEffect(() => {
    const t = setTimeout(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), 0);
    return () => clearTimeout(t);
  }, []);

  /** Publish, then confirm the public page actually loads (200 and not the "doesn't exist" view). */
  const publish = async (body: object) => {
    lastBody.current = body;
    setStep("working");
    setErr(null);
    let res: Response;
    let out: { error?: string; url?: string; draft?: TStoreContent; publishedAt?: string; draftRev?: number } = {};
    try {
      res = await fetch(`/api/stores/${encodeURIComponent(token)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      out = await res.json().catch(() => ({}));
    } catch {
      setErr("Couldn't reach the server. Your draft is safe.");
      return setStep("retry");
    }
    if (!res.ok) {
      const msg =
        out.error === "invalid_whatsapp"
          ? "Enter a 10-digit Indian mobile number."
          : out.error === "whatsapp_required"
            ? "A product is Available now, so buyers need your WhatsApp number."
            : out.error === "invalid"
              ? "Some fields are incomplete. Fix the highlighted product and try again."
              : out.error === "changed_elsewhere"
                ? CONFLICT_MSG
                : null;
      setErr(msg ?? "Couldn't publish. Your draft is safe.");
      return setStep(msg && mode === "form" && out.error !== "changed_elsewhere" ? "form" : "retry");
    }
    onPublished(out.draft!, out.publishedAt!, out.draftRev);
    let live = false;
    for (let i = 0; i < 3 && !live; i++) {
      try {
        const page = await fetch(`/s/${slug}?v=${Date.now()}`, { cache: "no-store" });
        const html = page.ok ? await page.text() : "";
        // The rendered store carries data-store="<slug>" (the not-found view never does).
        live = page.ok && html.includes(`data-store="${slug}"`);
      } catch {}
      if (!live) await new Promise((r) => setTimeout(r, 800));
    }
    if (!live) {
      setErr("Saved, but we couldn't load your public page yet.");
      return setStep("retry");
    }
    setStep("live");
  };

  // V5 republish: one tap, nothing to ask.
  useEffect(() => {
    if (mode !== "update") return;
    // Guard inside the timer: a strict-mode effect re-run must not cancel the only publish.
    const t = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      void publish({});
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (anyReady && !waValid) return setErr(wa ? "Enter a 10-digit Indian mobile number." : "Add your WhatsApp number so buyers can reach you.");
    if (wa && !waValid) return setErr("Enter a 10-digit Indian mobile number.");
    const availability = Object.fromEntries(Object.entries(ready).map(([id, on]) => [id, on ? "available" : "coming_soon"]));
    publish({ availability, ...(wa && waValid ? { whatsapp: wa } : {}) });
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this link:", text);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: draft.creator.displayName, url: publicUrl });
    } catch {}
  };
  const editUrl = typeof window !== "undefined" ? `${location.origin}/edit/${token}` : "";
  const title = step === "form" ? "Publish your store" : step === "live" ? "Your store is live 🎉" : step === "retry" ? "Not published yet" : "Publishing…";

  if (step === "form") {
    return (
      <Sheet
        open
        onClose={onClose}
        title={title}
        footer={
          <Button size="lg" className="w-full" onClick={submit}>
            Publish
          </Button>
        }
      >
        <div className="space-y-3">
          <h3 className="font-display text-lg font-bold">Any of these ready to sell today?</h3>
          <p className="text-sm text-muted">Buyers will contact you on WhatsApp. Payments aren&apos;t collected on this store.</p>
          <div className="space-y-2">
            {draft.products.map((p) => (
              <ReadyToggle
                key={p.id}
                title={p.title}
                price={p.price}
                on={ready[p.id]}
                onChange={(on) => {
                  setReady({ ...ready, [p.id]: on });
                  setErr(null);
                }}
              />
            ))}
          </div>
          <p className="text-xs text-muted">Not ready yet? Leave it as Coming soon. Buyers can still tap I&apos;m interested.</p>
        </div>
        <Field
          label={anyReady ? "WhatsApp number (needed)" : "WhatsApp number (optional)"}
          htmlFor="pub-wa"
          error={err}
          hint={
            <div className="space-y-1">
              {anyReady && <p className="text-xs font-semibold text-ink/80">Needed because a product is Available now: buyers message you to buy.</p>}
              {(waFocus || wa) && <Privacy />}
            </div>
          }
        >
          <div onFocus={() => setWaFocus(true)} onBlur={() => { setWaFocus(false); const n = normalizeIndianMobile(wa); if (n) setWa(n); }}>
            <PhoneInput
              id="pub-wa"
              value={wa}
              bad={Boolean(err)}
              onChange={(x) => {
                setWa(x);
                if (err) setErr(null);
              }}
            />
          </div>
        </Field>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={title} hideHeader>
      {step === "live" ? (
        <div className="space-y-5 pt-2">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-teal text-white ring-8 ring-teal-soft">
              <IconCheck size={36} strokeWidth={2.5} />
            </span>
            <h2 className="font-display text-[28px] font-bold leading-tight">Your store is live 🎉</h2>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Your public link</p>
            <div className="flex items-center gap-2 rounded-2xl border border-line bg-paper p-2 pl-4">
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{publicUrl.replace(/^https?:\/\//, "")}</span>
              <Button variant="secondary" size="sm" onClick={() => copy(publicUrl, "pub")}>
                <IconCopy size={16} />
                {copied === "pub" ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-sm text-muted">Paste this link into your Instagram bio.</p>
          </div>
          {canShare && (
            <Button size="lg" variant="teal" className="w-full" onClick={share}>
              <IconChat size={20} />
              Share your store
            </Button>
          )}
          <a href={`/s/${slug}`} target="_blank" rel="noopener noreferrer" className="block min-h-11 text-center text-sm font-bold text-saffron underline underline-offset-4">
            View my live store
          </a>
          <div className="space-y-3 rounded-2xl bg-warn-bg p-4 text-warn-ink">
            <p className="flex gap-2 text-sm">
              <IconLock size={18} className="shrink-0" />
              <span>
                <b>Your private edit link.</b> {PRIVATE_WARNING}
              </span>
            </p>
            <p className="break-all rounded-lg bg-surface/70 px-3 py-2 font-mono text-xs text-ink">{editUrl}</p>
            <a
              className={btnClass("secondary", "md", "w-full border-warn-ink/25")}
              href={`https://wa.me/?text=${encodeURIComponent(`My Storefront edit link: ${editUrl}\n${PRIVATE_WARNING}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconChat size={16} />
              Save my private edit link on WhatsApp
            </a>
            <button type="button" className={btnClass("secondary", "md", "w-full border-warn-ink/25")} onClick={() => copy(editUrl, "edit")}>
              <IconCopy size={16} />
              {copied === "edit" ? "Copied" : "Copy edit link"}
            </button>
          </div>
        </div>
      ) : step === "retry" ? (
        <div className="space-y-4 pt-8 text-center">
          <p className="font-display text-xl font-bold">Not published yet</p>
          <p className="text-sm text-muted">{err} Your draft is safe.</p>
          <Button size="lg" className="w-full" onClick={() => publish(lastBody.current)}>
            Retry
          </Button>
        </div>
      ) : (
        <p className="pt-8 text-center text-sm text-muted" role="status">
          Publishing your store…
        </p>
      )}
    </Sheet>
  );
}
