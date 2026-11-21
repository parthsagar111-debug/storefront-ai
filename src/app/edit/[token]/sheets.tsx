"use client";
import { useEffect, useRef, useState } from "react";
import { Sheet, Field } from "@/components/sheet";
import { Button, Segmented, SectionLabel, btnClass, inputCls } from "@/components/ui";
import { IconAlert, IconChat, IconCheck, IconCopy, IconEye, IconLock } from "@/components/icons";
import type { TStoreContent, TProduct } from "@/lib/ai/schemas";
import { FORMATS } from "@/lib/ai/schemas";
import { FORMAT_LABEL, PRICE_TABLE, rangeFor, formatINR } from "@/lib/pricing";
import { normalizeIndianMobile } from "@/lib/whatsapp";

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
}: {
  draft: TStoreContent;
  product: TProduct;
  index: number;
  onClose: () => void;
  patch: PatchFn;
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
  const [bad, setBad] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const range = rangeFor(v.format);
  const price = Number(v.price);
  const priceValid = Number.isInteger(price) && price >= 49 && price <= 99999;
  const outside = priceValid && (price < range.min || price > range.max);
  const needsNumber = v.availability === "available" && !draft.creator.whatsapp;
  const usedFormats = draft.products.filter((p) => p.id !== product.id).map((p) => p.format);
  const formatName = FORMAT_LABEL[v.format].toLowerCase();

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
      <Field label="Format" htmlFor="p-format" hint="Changing format resets the price to its typical tier.">
        <select
          id="p-format"
          className={`${inputCls()} appearance-none bg-[length:16px] bg-[right_1rem_center] bg-no-repeat`}
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23221A14' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
          value={v.format}
          onChange={(e) => {
            const f = e.target.value as TProduct["format"];
            setV({ ...v, format: f, price: String(PRICE_TABLE[f].typical) });
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
    </Sheet>
  );
}

/** S4: WhatsApp step (only if no number yet) → "Your store is live". */
export function PublishSheet({
  draft,
  token,
  slug,
  onClose,
  onPublished,
}: {
  draft: TStoreContent;
  token: string;
  slug: string;
  onClose: () => void;
  onPublished: (draft: TStoreContent, publishedAt: string, draftRev?: number) => void;
}) {
  const [step, setStep] = useState<"ask" | "live">(draft.creator.whatsapp ? "live" : "ask");
  const [url, setUrl] = useState<string | null>(null);
  const [wa, setWa] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const started = useRef(false);
  const anyAvailable = draft.products.some((p) => p.availability === "available");

  const publish = async (whatsapp?: string) => {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/stores/${encodeURIComponent(token)}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(whatsapp ? { whatsapp } : {}),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      if (body.error === "invalid_whatsapp") setErr("Enter a 10-digit Indian mobile number.");
      else if (body.error === "whatsapp_required") setErr("A product is Available now, so buyers need your WhatsApp number.");
      else if (body.error === "invalid") setErr("Some fields are incomplete. Fix the highlighted product and try again.");
      else setErr("Couldn't publish. Please try again.");
      return;
    }
    setUrl(body.url);
    setStep("live");
    onPublished(body.draft, body.publishedAt, body.draftRev);
  };

  // Number already on file → publish immediately (once).
  useEffect(() => {
    if (!draft.creator.whatsapp || started.current) return;
    started.current = true;
    const t = setTimeout(() => void publish(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this link:", text);
    }
  };
  const editUrl = typeof window !== "undefined" ? `${location.origin}/edit/${token}` : "";
  const title = step === "ask" ? "How should buyers reach you?" : url ? "Your store is live 🎉" : "Publishing…";

  return (
    <Sheet open onClose={onClose} title={title} hideHeader>
      {step === "ask" ? (
        <div className="space-y-5 pt-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-soft text-teal">
            <IconChat size={26} />
          </span>
          <div className="space-y-2">
            <h2 className="font-display text-[28px] font-bold leading-tight">How should buyers reach you?</h2>
            <p className="text-muted">Add your WhatsApp so people can message you about a product.</p>
          </div>
          <Field label="WhatsApp number" htmlFor="pub-wa" error={err} hint={<Privacy />}>
            <PhoneInput
              id="pub-wa"
              value={wa}
              bad={Boolean(err)}
              autoFocus
              onChange={(x) => {
                setWa(x);
                if (err) setErr(null);
              }}
            />
          </Field>
          <Button
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() => (normalizeIndianMobile(wa) ? publish(wa) : setErr("Enter a 10-digit Indian mobile number."))}
          >
            {busy ? "Publishing…" : "Add & publish"}
          </Button>
          <div className="space-y-2">
            <button
              type="button"
              disabled={busy || anyAvailable}
              className={btnClass("secondary", "lg", "w-full border-saffron/40")}
              onClick={() => publish()}
            >
              Skip, show &quot;I&apos;m interested&quot; instead
            </button>
            <p className="text-center text-xs leading-relaxed text-muted">
              {anyAvailable
                ? "Skip is off because a product is Available now. Buyers need a number to reach you."
                : "Visitors tap “I'm interested” and you see which idea they want most."}
            </p>
          </div>
        </div>
      ) : url ? (
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
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{url.replace(/^https?:\/\//, "")}</span>
              <Button variant="secondary" size="sm" onClick={() => copy(url, "pub")}>
                <IconCopy size={16} />
                {copied === "pub" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
          <a
            className={btnClass("teal", "lg", "w-full")}
            href={`https://wa.me/?text=${encodeURIComponent(`My store is live: ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconChat size={20} />
            Share on WhatsApp
          </a>
          <a href={`/s/${slug}`} target="_blank" rel="noopener noreferrer" className="block min-h-11 text-center text-sm font-bold text-saffron underline underline-offset-4">
            View my live store
          </a>
          <div className="space-y-3 rounded-2xl bg-warn-bg p-4 text-warn-ink">
            <p className="flex gap-2 text-sm">
              <IconLock size={18} className="shrink-0" />
              <span>
                <b>Save this link.</b> It&apos;s the only way to edit your store.
              </span>
            </p>
            <p className="break-all rounded-lg bg-surface/70 px-3 py-2 font-mono text-xs text-ink">{editUrl}</p>
            <button type="button" className={btnClass("secondary", "md", "w-full border-warn-ink/25")} onClick={() => copy(editUrl, "edit")}>
              <IconCopy size={16} />
              {copied === "edit" ? "Copied" : "Copy edit link"}
            </button>
          </div>
        </div>
      ) : (
        <p className="pt-8 text-center text-sm text-muted">{err ?? "Publishing your store…"}</p>
      )}
    </Sheet>
  );
}
