"use client";
import { useCallback, useEffect, useState } from "react";
import { StoreView } from "@/components/store-view";
import type { TStoreContent, TProduct } from "@/lib/ai/schemas";
import { FORMAT_LABEL, rangeFor, formatINR, ENTRY_MAX } from "@/lib/pricing";
import { HeaderSheet, ProductSheet, PublishSheet, type PatchFn } from "./sheets";

export interface Counts {
  views: number;
  products: Record<string, { interested: number; whatsapp: number }>;
}

type Busy = { header?: boolean; productId?: string | null; all?: boolean };

export default function StoreEditor({
  token,
  slug,
  draft: initialDraft,
  publishedAt: initialPublishedAt,
  hasUnpublishedChanges: initialDirty,
  counts,
}: {
  token: string;
  slug: string;
  draft: TStoreContent;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  counts: Counts | null;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [publishedAt, setPublishedAt] = useState(initialPublishedAt);
  const [dirty, setDirty] = useState(initialDirty);
  const [busy, setBusy] = useState<Busy>({});
  const [sheet, setSheet] = useState<{ kind: "header" } | { kind: "product"; id: string } | { kind: "publish" } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [noteSeen, setNoteSeen] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setNoteSeen(localStorage.getItem("sf.tapNoteSeen") === "1");
        localStorage.setItem("sf.tapNoteSeen", "1");
      } catch {
        setNoteSeen(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const api = `/api/stores/${encodeURIComponent(token)}`;

  const patch: PatchFn = useCallback(
    async (body) => {
      const res = await fetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, field: b.field, error: b.error };
      setDraft(b.draft);
      setDirty(b.hasUnpublishedChanges);
      return { ok: true };
    },
    [api],
  );

  const regenerate = async (body: { target: "bio" } | { target: "product"; productId: string } | { target: "all" }) => {
    setBusy(body.target === "bio" ? { header: true } : body.target === "product" ? { productId: body.productId } : { all: true });
    try {
      const res = await fetch(`${api}/regenerate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await res.json().catch(() => ({}));
      if (res.status === 429) flash("Too many regenerations for this store. Try again in a while.");
      else if (!res.ok) flash("Couldn't regenerate, kept your previous version.");
      else if (b.kept) flash(b.message ? `Kept your store: ${b.message}` : "Couldn't regenerate, kept your previous version.");
      else {
        setDraft(b.draft);
        setDirty(b.hasUnpublishedChanges);
      }
    } catch {
      flash("Couldn't regenerate, kept your previous version.");
    }
    setBusy({});
  };

  const anyBusy = Boolean(busy.header || busy.productId || busy.all);
  const badge = publishedAt ? (dirty ? "Unpublished changes" : "Live") : "Draft";
  const noEntry = !draft.products.some((p) => p.price <= ENTRY_MAX);
  const ctl = "min-h-11 rounded-lg border border-zinc-300 px-3 text-sm font-medium disabled:opacity-40";

  const productSlot = (p: TProduct) => {
    const range = rangeFor(p.format);
    const c = counts?.products[p.id];
    return (
      <div className="space-y-2 border-t border-dashed border-zinc-200 pt-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ctl} disabled={anyBusy} onClick={() => setSheet({ kind: "product", id: p.id })}>
            Edit
          </button>
          <button type="button" className={ctl} disabled={anyBusy} onClick={() => regenerate({ target: "product", productId: p.id })}>
            {busy.productId === p.id ? "Regenerating…" : "↻ Regenerate"}
          </button>
          <button type="button" className={`${ctl} bg-zinc-50`} onClick={() => setWhy(why === p.id ? null : p.id)}>
            Why {formatINR(p.price)}?
          </button>
        </div>
        {why === p.id && (
          <div className="space-y-1 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">
            {p.priceSource === "creator" ? (
              <p>You set this price.</p>
            ) : (
              p.tierReason && <p>{p.tierReason}</p>
            )}
            <p className="text-zinc-500">
              Typical range for {FORMAT_LABEL[p.format].toLowerCase()}s: {formatINR(range.min)}–{formatINR(range.max)}
            </p>
          </div>
        )}
        {publishedAt && (
          <p className="text-sm text-zinc-600">
            {c?.interested ?? 0} interested · {c?.whatsapp ?? 0} WhatsApp taps
          </p>
        )}
      </div>
    );
  };

  const editingProduct = sheet?.kind === "product" ? draft.products.find((p) => p.id === sheet.id) : null;

  return (
    <div className="space-y-4 pb-28">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">{draft.creator.displayName}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${badge === "Live" ? "bg-emerald-100 text-emerald-800" : badge === "Draft" ? "bg-zinc-100" : "bg-amber-100 text-amber-900"}`}
          >
            {badge}
          </span>
          {publishedAt && (
            <a href={`/s/${slug}`} target="_blank" rel="noopener noreferrer" className="min-h-11 content-center text-sm font-medium underline">
              View live
            </a>
          )}
        </div>
      </div>

      {publishedAt && counts && (
        <div className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">
          {counts.views} page views{!noteSeen && <span className="block text-xs text-zinc-500">Taps show interest, not purchases.</span>}
        </div>
      )}

      <StoreView
        content={draft}
        busy={busy}
        headerSlot={
          <div className="flex gap-2">
            <button type="button" className={ctl} disabled={anyBusy} onClick={() => setSheet({ kind: "header" })}>
              Edit
            </button>
            <button type="button" className={ctl} disabled={anyBusy} onClick={() => regenerate({ target: "bio" })}>
              {busy.header ? "Regenerating…" : "↻ Regenerate"}
            </button>
          </div>
        }
        productSlot={productSlot}
      />

      {noEntry && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Most first-time buyers start with something under ₹500.</p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-[480px] gap-2">
          <button type="button" className="min-h-12 flex-1 rounded-xl border border-zinc-300 font-medium disabled:opacity-40" disabled={anyBusy} onClick={() => setConfirmAll(true)}>
            {busy.all ? "Regenerating…" : "↻ Regenerate all"}
          </button>
          <button
            type="button"
            className="min-h-12 flex-1 rounded-xl bg-zinc-900 font-medium text-white disabled:opacity-40"
            disabled={anyBusy}
            onClick={() => setSheet({ kind: "publish" })}
          >
            {publishedAt && !dirty ? "Published" : "Publish"}
          </button>
        </div>
      </div>

      {confirmAll && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center" role="dialog" aria-modal>
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5">
            <p className="font-semibold">This replaces your bio and all products</p>
            <p className="text-sm text-zinc-600">Your name, Instagram and WhatsApp stay. The live store only changes when you publish.</p>
            <div className="flex gap-2">
              <button type="button" className="min-h-12 flex-1 rounded-xl border border-zinc-300" onClick={() => setConfirmAll(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="min-h-12 flex-1 rounded-xl bg-zinc-900 text-white"
                onClick={() => {
                  setConfirmAll(false);
                  regenerate({ target: "all" });
                }}
              >
                Regenerate all
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-[440px] rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg" role="status">
          {toast}
        </div>
      )}

      {sheet?.kind === "header" && <HeaderSheet draft={draft} patch={patch} onClose={() => setSheet(null)} />}
      {editingProduct && <ProductSheet draft={draft} product={editingProduct} patch={patch} onClose={() => setSheet(null)} />}
      {sheet?.kind === "publish" && (
        <PublishSheet
          draft={draft}
          token={token}
          slug={slug}
          onClose={() => setSheet(null)}
          onPublished={(d, at) => {
            setDraft(d);
            setPublishedAt(at);
            setDirty(false);
          }}
        />
      )}
    </div>
  );
}
