"use client";
import { useEffect, useRef, useState } from "react";
import { Sheet, Field, inputCls } from "@/components/sheet";
import type { TStoreContent, TProduct } from "@/lib/ai/schemas";
import { FORMATS } from "@/lib/ai/schemas";
import { FORMAT_LABEL, PRICE_TABLE, rangeFor, formatINR } from "@/lib/pricing";
import { normalizeIndianMobile } from "@/lib/whatsapp";

export type PatchFn = (body: unknown) => Promise<{ ok: true } | { ok: false; field?: string; error?: string }>;

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
      <button type="button" className="min-h-12 flex-1 rounded-xl border border-zinc-300" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" disabled={busy} className="min-h-12 flex-1 rounded-xl bg-zinc-900 text-white disabled:opacity-50" onClick={onSave}>
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

export function HeaderSheet({ draft, onClose, patch }: { draft: TStoreContent; onClose: () => void; patch: PatchFn }) {
  const c = draft.creator;
  const [v, setV] = useState({
    displayName: c.displayName,
    headline: c.headline,
    bio: c.bio,
    instagramHandle: c.instagramHandle ?? "",
    whatsapp: c.whatsapp ?? "",
  });
  const [bad, setBad] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsWa = draft.products.some((p) => p.availability === "available");

  const save = async () => {
    if (v.whatsapp && !normalizeIndianMobile(v.whatsapp)) return setBad("whatsapp");
    if (!v.whatsapp && needsWa) return setBad("whatsapp");
    setBusy(true);
    const r = await patch({ creator: v });
    setBusy(false);
    if (r.ok) onClose();
    else setBad(r.field?.replace(/^creator\./, "") || "form");
  };
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => {
    setV({ ...v, [k]: e.target.value });
    if (bad === k) setBad(null);
  };

  return (
    <Sheet open onClose={onClose} title="Edit your header" footer={<SaveBar busy={busy} onCancel={onClose} onSave={save} />}>
      <Field label="Name" error={bad === "displayName" ? FIELD_MSG.displayName : null}>
        <input className={inputCls(bad === "displayName")} value={v.displayName} onChange={set("displayName")} maxLength={60} />
      </Field>
      <Field label="Headline" error={bad === "headline" ? FIELD_MSG.headline : null}>
        <input className={inputCls(bad === "headline")} value={v.headline} onChange={set("headline")} maxLength={70} />
      </Field>
      <Field label="Bio" error={bad === "bio" ? FIELD_MSG.bio : null} hint={`${v.bio.length}/320`}>
        <textarea className={inputCls(bad === "bio")} rows={5} value={v.bio} onChange={set("bio")} maxLength={320} />
      </Field>
      <Field label="Instagram handle (optional)" error={bad === "instagramHandle" ? FIELD_MSG.instagramHandle : null}>
        <input className={inputCls(bad === "instagramHandle")} value={v.instagramHandle} onChange={set("instagramHandle")} placeholder="@yourhandle" />
      </Field>
      <Field
        label={needsWa ? "WhatsApp number (needed for Available now products)" : "WhatsApp number (optional)"}
        error={bad === "whatsapp" ? FIELD_MSG.whatsapp : null}
        hint={PRIVACY}
      >
        <input className={inputCls(bad === "whatsapp")} inputMode="tel" value={v.whatsapp} onChange={set("whatsapp")} placeholder="+91 98765 43210" />
      </Field>
      {bad === "form" && <p className="text-sm text-red-700">Couldn&apos;t save. Please check the fields.</p>}
    </Sheet>
  );
}

export function ProductSheet({
  draft,
  product,
  onClose,
  patch,
}: {
  draft: TStoreContent;
  product: TProduct;
  onClose: () => void;
  patch: PatchFn;
}) {
  const [v, setV] = useState({
    availability: product.availability,
    title: product.title,
    format: product.format,
    price: String(product.price),
    summary: product.summary,
    description: product.description,
    whatYouGet: [...product.whatYouGet],
  });
  const [whatsapp, setWhatsapp] = useState(draft.creator.whatsapp ?? "");
  const [bad, setBad] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const range = rangeFor(v.format);
  const price = Number(v.price);
  const priceValid = Number.isInteger(price) && price >= 49 && price <= 99999;
  const outside = priceValid && (price < range.min || price > range.max);
  const needsNumber = v.availability === "available" && !draft.creator.whatsapp;
  const usedFormats = draft.products.filter((p) => p.id !== product.id).map((p) => p.format);

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
    const r = await patch({ product: { id: product.id, ...v, price } });
    setBusy(false);
    if (r.ok) onClose();
    else setBad(r.field?.replace(/^products\.\d+\./, "").replace(/^product\./, "").replace(/\.\d+$/, "") || "form");
  };
  const set = (k: "title" | "summary" | "description" | "price") => (e: { target: { value: string } }) => {
    setV({ ...v, [k]: e.target.value });
    if (bad === k) setBad(null);
  };

  return (
    <Sheet open onClose={onClose} title="Edit product" footer={<SaveBar busy={busy} onCancel={onClose} onSave={save} />}>
      <div className="space-y-1">
        <span className="text-sm font-medium">Availability</span>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["coming_soon", "Coming soon"],
              ["available", "Available now"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`min-h-12 rounded-xl border ${v.availability === k ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300"}`}
              onClick={() => setV({ ...v, availability: k })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {needsNumber && (
        <Field label="Your WhatsApp number" error={bad === "whatsapp" ? FIELD_MSG.whatsapp : null} hint={PRIVACY}>
          <input
            className={inputCls(bad === "whatsapp")}
            inputMode="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+91 98765 43210"
            autoFocus
          />
          <span className="block text-xs text-zinc-600">Buyers enquire on WhatsApp for Available now products.</span>
        </Field>
      )}
      <Field label="Title" error={bad === "title" ? FIELD_MSG.title : null}>
        <input className={inputCls(bad === "title")} value={v.title} onChange={set("title")} maxLength={60} />
      </Field>
      <Field label="Format" hint="Changing format sets the typical price for it.">
        <select
          className={inputCls()}
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
      <Field
        label="Price (₹)"
        error={bad === "price" ? FIELD_MSG.price : null}
        hint={
          <>
            Suggested {formatINR(range.min)}–{formatINR(range.max)}
            {outside && <span className="block font-medium text-amber-700">Outside the usual range for this format. You can still use it.</span>}
          </>
        }
      >
        <input className={inputCls(bad === "price")} inputMode="numeric" value={v.price} onChange={set("price")} />
      </Field>
      <Field label="One-line summary" error={bad === "summary" ? FIELD_MSG.summary : null}>
        <input className={inputCls(bad === "summary")} value={v.summary} onChange={set("summary")} maxLength={90} />
      </Field>
      <Field label="Description" error={bad === "description" ? FIELD_MSG.description : null}>
        <textarea className={inputCls(bad === "description")} rows={5} value={v.description} onChange={set("description")} maxLength={420} />
      </Field>
      <div className="space-y-2">
        <span className="text-sm font-medium">What you get</span>
        {v.whatYouGet.map((w, i) => (
          <input
            key={i}
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
        ))}
        {bad === "whatYouGet" && <p className="text-xs font-medium text-red-700">{FIELD_MSG.whatYouGet}</p>}
      </div>
      {bad === "form" && <p className="text-sm text-red-700">Couldn&apos;t save. Please check the fields.</p>}
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
  onPublished: (draft: TStoreContent, publishedAt: string) => void;
}) {
  const [step, setStep] = useState<"ask" | "live">(draft.creator.whatsapp ? "live" : "ask");
  const [url, setUrl] = useState<string | null>(null);
  const [wa, setWa] = useState("+91 ");
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
    onPublished(body.draft, body.publishedAt);
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

  return (
    <Sheet open onClose={onClose} title={step === "ask" ? "How should buyers reach you?" : url ? "Your store is live 🎉" : "Publishing…"}>
      {step === "ask" ? (
        <div className="space-y-4">
          <Field label="WhatsApp number" error={err} hint={PRIVACY}>
            <input className={inputCls(Boolean(err))} inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)} autoFocus />
          </Field>
          <button
            type="button"
            disabled={busy}
            className="min-h-12 w-full rounded-xl bg-zinc-900 font-medium text-white disabled:opacity-50"
            onClick={() => (normalizeIndianMobile(wa) ? publish(wa) : setErr("Enter a 10-digit Indian mobile number."))}
          >
            {busy ? "Publishing…" : "Add & publish"}
          </button>
          <div className="space-y-1">
            <button
              type="button"
              disabled={busy || anyAvailable}
              className="min-h-12 w-full rounded-xl border border-zinc-300 disabled:opacity-40"
              onClick={() => publish()}
            >
              Skip, show &quot;I&apos;m interested&quot; instead
            </button>
            <p className="text-xs text-zinc-500">
              {anyAvailable
                ? "Skip is off because a product is Available now. Buyers need a number to reach you."
                : "Visitors tap “I'm interested” and you see which idea they want most."}
            </p>
          </div>
        </div>
      ) : url ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Your public link</p>
            <p className="break-all rounded-xl bg-zinc-100 p-3 font-mono text-sm">{url}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="min-h-12 rounded-xl border border-zinc-300" onClick={() => copy(url, "pub")}>
                {copied === "pub" ? "Copied ✓" : "Copy"}
              </button>
              <a
                className="flex min-h-12 items-center justify-center rounded-xl bg-[#25D366] font-medium text-white"
                href={`https://wa.me/?text=${encodeURIComponent(`My store is live: ${url}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Share on WhatsApp
              </a>
            </div>
          </div>
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium">Save this link. It&apos;s the only way to edit your store.</p>
            <p className="break-all font-mono text-xs">{editUrl}</p>
            <button type="button" className="min-h-11 w-full rounded-xl border border-amber-400 bg-white" onClick={() => copy(editUrl, "edit")}>
              {copied === "edit" ? "Copied ✓" : "Copy edit link"}
            </button>
          </div>
          <a href={`/s/${slug}`} target="_blank" rel="noopener noreferrer" className="block min-h-11 py-2 text-center text-sm underline">
            View live store
          </a>
        </div>
      ) : (
        <p className="text-sm text-zinc-600">{err ?? "Publishing your store…"}</p>
      )}
    </Sheet>
  );
}
