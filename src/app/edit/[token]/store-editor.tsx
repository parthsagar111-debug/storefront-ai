"use client";
import { useCallback, useEffect, useState } from "react";
import { StoreView } from "@/components/store-view";
import { Button, StatusBadge, Logo, btnClass } from "@/components/ui";
import { IconPencil, IconRefresh, IconArrowUpRight, IconChevronDown, IconChevronUp, IconHand, IconChat } from "@/components/icons";
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
  const editingId = sheet?.kind === "product" ? sheet.id : null;
  const toolBase = "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold disabled:opacity-40";
  const tool = `${toolBase} border-line-input bg-surface text-ink`;

  const editRegen = (onEdit: () => void, onRegen: () => void, editing = false, label = "") => (
    <div className="ml-auto flex gap-2">
      <button type="button" className={editing ? `${toolBase} border-saffron bg-saffron text-white` : tool} disabled={anyBusy} onClick={onEdit} aria-label={`Edit ${label}`}>
        <IconPencil size={16} />
        {editing ? "Editing" : "Edit"}
      </button>
      <button type="button" className={`${tool} w-11 justify-center px-0`} disabled={anyBusy} onClick={onRegen} aria-label={`Regenerate ${label}`}>
        <IconRefresh size={18} />
      </button>
    </div>
  );

  const productToolbar = (p: TProduct) => (
    <>
      <button
        type="button"
        aria-expanded={why === p.id}
        className={`inline-flex min-h-11 items-center gap-1 rounded-xl border px-3 text-sm font-bold ${
          why === p.id ? "border-saffron bg-saffron-soft text-saffron-ink" : "border-saffron/25 bg-saffron-soft/70 text-saffron-ink"
        }`}
        onClick={() => setWhy(why === p.id ? null : p.id)}
      >
        Why {formatINR(p.price)}?
        {why === p.id ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
      </button>
      {editRegen(
        () => setSheet({ kind: "product", id: p.id }),
        () => regenerate({ target: "product", productId: p.id }),
        editingId === p.id,
        p.title,
      )}
    </>
  );

  const productNote = (p: TProduct) => {
    if (why !== p.id) return null;
    const range = rangeFor(p.format);
    return (
      <div className="mb-2 space-y-1 rounded-2xl bg-saffron-soft px-4 py-3 text-sm text-ink">
        <p>{p.priceSource === "creator" ? "You set this price." : p.tierReason}</p>
        <p className="font-bold text-saffron-ink">
          Typical range for {FORMAT_LABEL[p.format].toLowerCase()}s: {formatINR(range.min)}–{formatINR(range.max)}
        </p>
      </div>
    );
  };

  const productFooter = (p: TProduct) => {
    if (!publishedAt) return null;
    const c = counts?.products[p.id];
    return (
      <div className="border-t border-line px-4 py-3 text-sm">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <IconHand size={16} className="text-saffron" />
            <b>{c?.interested ?? 0}</b> interested
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconChat size={16} className="text-teal" />
            <b>{c?.whatsapp ?? 0}</b> WhatsApp taps
          </span>
        </p>
        {!noteSeen && <p className="mt-1 text-xs text-muted">Taps show interest, not purchases.</p>}
      </div>
    );
  };

  const editingProduct = editingId ? draft.products.find((p) => p.id === editingId) : null;
  const publishLabel = publishedAt && !dirty ? "Published" : "Publish";

  return (
    <div className="min-h-dvh">
      {/* Top bar: mobile = name + badge + View live; ≥ md = logo, actions (D6 desktop frame). */}
      <div className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[480px] items-center gap-3 px-4 py-3 md:max-w-none md:px-6">
          <span className="hidden md:block">
            <Logo withName={false} />
          </span>
          <div className="min-w-0 flex-1 md:flex md:items-center md:gap-3">
            <p className="truncate font-bold md:text-lg">{draft.creator.displayName}</p>
            <StatusBadge kind={badge} />
          </div>
          {publishedAt && (
            <a href={`/s/${slug}`} target="_blank" rel="noopener noreferrer" className={btnClass("secondary", "sm", "md:border-0 md:bg-transparent")}>
              View live <IconArrowUpRight size={16} />
            </a>
          )}
          <div className="hidden gap-2 md:flex">
            <Button variant="secondary" size="sm" disabled={anyBusy} onClick={() => setConfirmAll(true)}>
              <IconRefresh size={16} />
              {busy.all ? "Regenerating…" : "Regenerate all"}
            </Button>
            <Button size="sm" disabled={anyBusy} onClick={() => setSheet({ kind: "publish" })}>
              {publishLabel}
            </Button>
          </div>
        </div>
      </div>

      <div className={`md:dot-grid md:min-h-[calc(100dvh-69px)] md:transition-[padding] ${sheet && sheet.kind !== "publish" ? "md:pr-[420px]" : ""}`}>
        <div className="mx-auto max-w-[480px] px-3 pb-32 pt-4 md:pb-16 md:pt-8">
          <p className="mb-4 hidden text-center text-xs font-bold uppercase tracking-wider text-muted md:block">Preview · this is what buyers see</p>

          {publishedAt && counts && (
            <p className="mb-3 px-1 text-sm text-muted">
              <b className="text-ink">{counts.views}</b> page views
            </p>
          )}

          <StoreView
            variant="editor"
            content={draft}
            busy={busy}
            highlightId={editingId}
            headerToolbar={editRegen(() => setSheet({ kind: "header" }), () => regenerate({ target: "bio" }), sheet?.kind === "header", "header")}
            productToolbar={productToolbar}
            productNote={productNote}
            productFooter={productFooter}
          />

          {noEntry && (
            <p className="mt-4 rounded-2xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">Most first-time buyers start with something under ₹500.</p>
          )}
        </div>
      </div>

      {/* Mobile sticky actions. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-[480px] gap-2">
          <Button variant="secondary" className="flex-1 gap-1.5 whitespace-nowrap px-3 text-[15px]" disabled={anyBusy} onClick={() => setConfirmAll(true)}>
            <IconRefresh size={18} className="shrink-0" />
            {busy.all ? "Regenerating…" : "Regenerate all"}
          </Button>
          <Button className="flex-1" disabled={anyBusy} onClick={() => setSheet({ kind: "publish" })}>
            {publishLabel}
          </Button>
        </div>
      </div>

      {confirmAll && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/70 p-4 md:items-center" role="dialog" aria-modal aria-label="Regenerate all">
          <div className="w-full max-w-sm space-y-4 rounded-[24px] bg-surface p-5">
            <p className="font-display text-xl font-bold">This replaces your bio and all products</p>
            <p className="text-sm text-muted">Your name, Instagram and WhatsApp stay. The live store only changes when you publish.</p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmAll(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setConfirmAll(false);
                  regenerate({ target: "all" });
                }}
              >
                Regenerate all
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-[440px] rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-card md:bottom-8" role="status">
          {toast}
        </div>
      )}

      {sheet?.kind === "header" && <HeaderSheet draft={draft} patch={patch} onClose={() => setSheet(null)} />}
      {editingProduct && (
        <ProductSheet
          draft={draft}
          product={editingProduct}
          index={draft.products.findIndex((p) => p.id === editingProduct.id)}
          patch={patch}
          onClose={() => setSheet(null)}
        />
      )}
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
