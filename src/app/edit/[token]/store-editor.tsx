"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StoreView } from "@/components/store-view";
import { Button, StatusBadge, Logo, btnClass } from "@/components/ui";
import { IconPencil, IconRefresh, IconArrowUpRight, IconChevronDown, IconChevronUp, IconHand, IconChat } from "@/components/icons";
import type { TStoreContent, TProduct } from "@/lib/ai/schemas";
import { FORMAT_LABEL, rangeFor, formatINR, ENTRY_MAX } from "@/lib/pricing";
import { HeaderSheet, ProductSheet, PublishSheet, type PatchFn } from "./sheets";
import { removeStore } from "@/lib/client/device";

export interface Counts {
  views: number;
  products: Record<string, { interested: number; whatsapp: number }>;
}

type Busy = { header?: boolean; productId?: string | null; all?: boolean };

const CHANGED_ELSEWHERE = "This store changed in another tab. Refresh to see the latest.";

/** IQA-01: the draft revision this tab last saw, per store token. Every write sends it; responses advance it. */
const draftRevs = new Map<string, number>();

export default function StoreEditor({
  token,
  slug,
  draft: initialDraft,
  publishedAt: initialPublishedAt,
  hasUnpublishedChanges: initialDirty,
  draftRev: initialRev,
  counts,
}: {
  token: string;
  slug: string;
  draft: TStoreContent;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  draftRev: number;
  counts: Counts | null;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [publishedAt, setPublishedAt] = useState(initialPublishedAt);
  const [dirty, setDirty] = useState(initialDirty);
  const [busy, setBusy] = useState<Busy>({});
  const [sheet, setSheet] = useState<{ kind: "header" } | { kind: "product"; id: string } | { kind: "publish" } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  // T29: overflow menu → Delete store → confirm → deleted view.
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [noteSeen, setNoteSeen] = useState(true);
  // IQA-01: the draft revision this tab last saw; every write sends it and the server returns the next one.
  // Seed this tab's revision for the store (read/written only in handlers and fetch callbacks).
  useEffect(() => {
    draftRevs.set(token, initialRev);
  }, [token, initialRev]);

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

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const api = `/api/stores/${encodeURIComponent(token)}`;

  const patch: PatchFn = useCallback(
    async (body) => {
      const res = await fetch(api, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(body as object), draftRev: draftRevs.get(token) ?? initialRev }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && b.error === "changed_elsewhere") flash(CHANGED_ELSEWHERE);
        return { ok: false, field: b.field, error: b.error };
      }
      draftRevs.set(token, b.draftRev);
      setDraft(b.draft);
      setDirty(b.hasUnpublishedChanges);
      return { ok: true };
    },
    [api, token, initialRev],
  );

  const regenerate = async (body: { target: "bio" } | { target: "product"; productId: string } | { target: "all" }) => {
    setBusy(body.target === "bio" ? { header: true } : body.target === "product" ? { productId: body.productId } : { all: true });
    try {
      const res = await fetch(`${api}/regenerate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await res.json().catch(() => ({}));
      if (res.status === 429) flash("Too many regenerations for this store. Try again in a while.");
      else if (res.status === 409 && b.error === "changed_elsewhere") flash(CHANGED_ELSEWHERE);
      else if (!res.ok) flash("Couldn't regenerate, kept your previous version.");
      else if (b.kept) flash(b.message ? `Kept your store: ${b.message}` : "Couldn't regenerate, kept your previous version.");
      else {
        if (typeof b.draftRev === "number") draftRevs.set(token, b.draftRev);
        setDraft(b.draft);
        setDirty(b.hasUnpublishedChanges);
      }
    } catch {
      flash("Couldn't regenerate, kept your previous version.");
    }
    setBusy({});
  };

  const deleteStore = async () => {
    setDeleting(true);
    try {
      const res = await fetch(api, { method: "DELETE" });
      if (res.ok) {
        removeStore(token);
        setConfirmDelete(false);
        setDeleted(true);
        return;
      }
      flash(res.status === 404 ? "This store no longer exists." : "Couldn't delete the store. Please try again.");
    } catch {
      flash("Couldn't delete the store. Please try again.");
    } finally {
      setDeleting(false);
    }
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
      <div className="mb-2 space-y-1 rounded-2xl bg-saffron-soft px-4 py-3 text-sm text-ink [overflow-wrap:anywhere]">
        {/* IQA-04: after a manual format/price change the AI's reason is stale → show only the range. */}
        {p.priceSource === "creator" || !p.tierReason ? (
          <p className="font-bold text-saffron-ink">
            Suggested range for {FORMAT_LABEL[p.format].toLowerCase()}: {formatINR(range.min)}–{formatINR(range.max)}
          </p>
        ) : (
          <>
            <p>{p.tierReason}</p>
            <p className="font-bold text-saffron-ink">
              Typical range for {FORMAT_LABEL[p.format].toLowerCase()}s: {formatINR(range.min)}–{formatINR(range.max)}
            </p>
          </>
        )}
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

  if (deleted) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-4 px-5 py-16" role="status">
        <h1 className="font-display text-[28px] font-bold leading-tight">Store deleted</h1>
        <p className="text-muted">Its public page no longer works, and it&apos;s been removed from this device.</p>
        <Link href="/" className={btnClass("primary", "lg", "w-full")}>
          Create a new store
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      {/* Top bar: mobile = name + badge + View live; ≥ md = logo, actions (D6 desktop frame). */}
      <div className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[480px] items-center gap-3 px-4 py-3 md:max-w-none md:px-6">
          <span className="hidden md:block">
            <Logo withName={false} />
          </span>
          <div className="min-w-0 flex-1 md:flex md:items-center md:gap-3">
            <p className="min-w-0 truncate font-bold md:text-lg">{draft.creator.displayName}</p>
            <StatusBadge kind={badge} />
          </div>
          {publishedAt && (
            <a
              href={`/s/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View live"
              className={btnClass("secondary", "sm", "min-w-11 px-0 sm:px-3 md:border-0 md:bg-transparent")}
            >
              <span className="hidden sm:inline">View live</span> <IconArrowUpRight size={16} />
            </a>
          )}
          {/* T28: new answers for the same store/token → confirm → regenerate (S1 in edit mode). */}
          <Link href={`/?edit=${encodeURIComponent(token)}`} className={btnClass("secondary", "sm", "shrink-0 whitespace-nowrap")}>
            Edit answers
          </Link>
          {/* T29: overflow menu */}
          <div className="relative">
            <button
              type="button"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={btnClass("secondary", "sm", "min-w-11 px-0 text-lg leading-none")}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              ⋯
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-48 overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-card">
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-h-11 w-full items-center px-4 text-left text-sm font-bold text-danger active:bg-sand"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                >
                  Delete store
                </button>
              </div>
            )}
          </div>
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

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/70 p-4 md:items-center" role="dialog" aria-modal aria-label="Delete store">
          <div className="w-full max-w-sm space-y-4 rounded-[24px] bg-surface p-5">
            <p className="font-display text-xl font-bold">Delete this store?</p>
            <p className="text-sm text-muted">Its public page will stop working. This can&apos;t be undone.</p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <button type="button" disabled={deleting} className={btnClass("primary", "md", "flex-1 bg-danger! shadow-none!")} onClick={deleteStore}>
                {deleting ? "Deleting…" : "Delete store"}
              </button>
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
          onPublished={(d, at, r) => {
            if (typeof r === "number") draftRevs.set(token, r);
            setDraft(d);
            setPublishedAt(at);
            setDirty(false);
          }}
        />
      )}
    </div>
  );
}
