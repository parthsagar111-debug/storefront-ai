"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StoreView } from "@/components/store-view";
import { Button, StatusBadge, Logo, btnClass } from "@/components/ui";
import { IconPencil, IconRefresh, IconArrowUpRight, IconChevronDown, IconChevronUp, IconEye, IconTrash, IconMore, IconX } from "@/components/icons";
import type { TStoreContent, TProduct } from "@/lib/ai/schemas";
import { FORMAT_LABEL, rangeFor, formatINR, ENTRY_MAX } from "@/lib/pricing";
import { HeaderSheet, ProductSheet, PublishSheet, type PatchFn } from "./sheets";
import { removeStore } from "@/lib/client/device";
import PublicStore from "@/app/s/[slug]/public-store";
import { inputCls } from "@/components/ui";

export interface Counts {
  views: number;
  products: Record<string, { interested: number; whatsapp: number }>;
}

type Busy = { header?: boolean; productId?: string | null; all?: boolean };
type RegenBody = { target: "bio"; hint?: string } | { target: "product"; productId: string; hint?: string } | { target: "all" };
/** V4: what an Undo puts back (sent as PATCH `restore`). */
type Restore =
  | { headline: string; bio: string }
  | { product: { replaceId: string; value: TProduct } }
  | { headline: string; bio: string; products: TProduct[]; sensitiveDomain: TStoreContent["sensitiveDomain"] };
const UNDO_MS = 10_000;
const HINT_MAX = 120;

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
  // V4: 10 s "Regenerated. Undo" after any regenerate.
  const [undo, setUndo] = useState<{ restore: Restore; until: number } | null>(null);
  // V4: regenerate asks for an optional "What should change?" hint (bio / product).
  const [regenAsk, setRegenAsk] = useState<{ target: "bio" } | { target: "product"; productId: string; title: string } | null>(null);
  const [hint, setHint] = useState("");
  const [buyerView, setBuyerView] = useState(false);
  // V3 one-time tip, shown as a tooltip under the header's Edit (Claude Design v5); dismissal remembered.
  const [tip, setTip] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setTip(localStorage.getItem("sf.tip.edit.v1") !== "1");
      } catch {
        setTip(true);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const dismissTip = () => {
    setTip(false);
    try {
      localStorage.setItem("sf.tip.edit.v1", "1");
    } catch {}
  };
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

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now()));
    return () => clearTimeout(t);
  }, [undo]);

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
      setUndo(null); // any later change ends the undo window
      return { ok: true };
    },
    [api, token, initialRev],
  );

  const regenerate = async (body: RegenBody) => {
    setBusy(body.target === "bio" ? { header: true } : body.target === "product" ? { productId: body.productId } : { all: true });
    setUndo(null);
    const before = draft; // snapshot for Undo
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
        const next: TStoreContent = b.draft;
        let restore: Restore | null = null;
        if (body.target === "bio") restore = { headline: before.creator.headline, bio: before.creator.bio };
        else if (body.target === "product") {
          const i = before.products.findIndex((p) => p.id === body.productId);
          const fresh = next.products[i];
          if (i >= 0 && fresh && fresh.id !== body.productId) restore = { product: { replaceId: fresh.id, value: before.products[i] } };
        } else
          restore = { headline: before.creator.headline, bio: before.creator.bio, products: before.products, sensitiveDomain: before.sensitiveDomain };
        if (restore) setUndo({ restore, until: Date.now() + UNDO_MS });
      }
    } catch {
      flash("Couldn't regenerate, kept your previous version.");
    }
    setBusy({});
  };

  const undoRegenerate = async () => {
    if (!undo) return;
    const r = await patch({ restore: undo.restore });
    setUndo(null);
    flash(r.ok ? "Restored your previous version." : r.error === "changed_elsewhere" ? CHANGED_ELSEWHERE : "Couldn't undo. Your store has changed since.");
  };

  const removeProduct = async (id: string): Promise<string | null> => {
    const r = await patch({ removeProductId: id });
    if (r.ok) {
      setSheet(null);
      flash("Product removed.");
      return null;
    }
    return r.error === "only_entry"
      ? "This is your only product under ₹500. Keep it so new buyers have an easy first purchase."
      : r.error === "changed_elsewhere"
        ? CHANGED_ELSEWHERE
        : "Couldn't remove the product. Please try again.";
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

  const editRegen = (onEdit: () => void, onRegen: () => void, editing = false, label = "", regenLabel = `Regenerate ${label}`) => (
    <div className="ml-auto flex gap-2">
      <button type="button" className={editing ? `${toolBase} border-saffron bg-saffron text-white` : tool} disabled={anyBusy} onClick={onEdit} aria-label={`Edit ${label}`}>
        <IconPencil size={16} />
        {editing ? "Editing" : "Edit"}
      </button>
      <button type="button" className={`${tool} w-11 justify-center px-0`} disabled={anyBusy} onClick={onRegen} aria-label={regenLabel}>
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
        () => {
          setHint("");
          setRegenAsk({ target: "product", productId: p.id, title: p.title });
        },
        editingId === p.id,
        p.title,
        `Regenerate product: ${p.title}`, // SPEC v4.5 S3 accessible name
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
      <div className="border-t border-line bg-paper/60 px-4 py-3 text-sm">
        <p>
          <b>{c?.interested ?? 0}</b> interested taps · <b>{c?.whatsapp ?? 0}</b> WhatsApp taps
        </p>
        {!noteSeen && <p className="mt-0.5 text-xs text-muted">Taps show interest, not purchases.</p>}
      </div>
    );
  };

  const editingProduct = editingId ? draft.products.find((p) => p.id === editingId) : null;
  // V5: republish is one tap "Update live store".
  const publishLabel = publishedAt ? (dirty ? "Update live store" : "Published") : "Publish";
  const editAnswersHref = `/?edit=${encodeURIComponent(token)}`;
  const menuItem = "flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] font-semibold text-ink active:bg-sand disabled:opacity-40";

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
      {/* Top bar (Claude Design v5). Phone: name over badge, ⋯, Publish. ≥ md: logo, name + badge, View live, ⋯, Regenerate all, Publish. */}
      <div className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[480px] items-center gap-2 px-4 py-3 md:max-w-none md:gap-3 md:px-6">
          <span className="hidden md:block">
            <Logo withName={false} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 md:flex-row md:items-center md:gap-3">
            <p className="w-full min-w-0 truncate font-bold md:w-auto md:text-lg">{draft.creator.displayName}</p>
            <StatusBadge kind={badge} />
          </div>
          {publishedAt && (
            <span className="hidden md:contents">
              <a href={`/s/${slug}`} target="_blank" rel="noopener noreferrer" aria-label="View live" className={btnClass("ghost", "sm", "")}>
                View live <IconArrowUpRight size={16} />
              </a>
            </span>
          )}
          {/* T29 / V4 overflow menu (Start over / Edit answers lives here on every size, per the v5 frames). */}
          <div className="relative">
            <button
              type="button"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={`flex h-11 w-11 items-center justify-center rounded-[14px] border text-ink ${menuOpen ? "border-ink bg-sand" : "border-line-input bg-surface"}`}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <IconMore size={20} />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-surface py-1.5 shadow-[var(--shadow-menu)]">
                <Link role="menuitem" href={editAnswersHref} className={menuItem} onClick={() => setMenuOpen(false)}>
                  <IconRefresh size={18} className="-scale-x-100" />
                  Start over / Edit answers
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  disabled={anyBusy}
                  className={`${menuItem} md:hidden`}
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmAll(true);
                  }}
                >
                  <IconRefresh size={18} />
                  {busy.all ? "Regenerating…" : "Regenerate all"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={menuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    setBuyerView(true);
                  }}
                >
                  <IconEye size={18} />
                  View as buyer
                </button>
                {publishedAt && (
                  <a role="menuitem" href={`/s/${slug}`} target="_blank" rel="noopener noreferrer" className={`${menuItem} md:hidden`} onClick={() => setMenuOpen(false)}>
                    <IconArrowUpRight size={18} />
                    View live store
                  </a>
                )}
                <div className="mx-4 my-1.5 h-px bg-line" />
                <button
                  type="button"
                  role="menuitem"
                  className={`${menuItem} text-danger`}
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                >
                  <IconTrash size={18} />
                  Delete store
                </button>
              </div>
            )}
          </div>
          <Button size="sm" className="shrink-0 px-4 md:hidden" disabled={anyBusy} onClick={() => setSheet({ kind: "publish" })}>
            {publishLabel}
          </Button>
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
        <div className="mx-auto max-w-[480px] px-3 pb-24 pt-4 md:pb-16 md:pt-8">
          <p className="mb-4 text-center text-xs font-bold uppercase tracking-wider text-muted">Your store preview</p>

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
            headerToolbar={
              <div className="relative ml-auto">
                {editRegen(
                  () => {
                    dismissTip();
                    setSheet({ kind: "header" });
                  },
                  () => {
                    setHint("");
                    setRegenAsk({ target: "bio" });
                  },
                  sheet?.kind === "header",
                  "header",
                  "Regenerate bio",
                )}
                {tip && (
                  <div role="status" className="absolute right-0 top-full z-20 mt-2 flex w-[260px] items-start gap-2 rounded-[14px] bg-ink py-3 pl-4 pr-2 text-sm font-semibold text-white shadow-[var(--shadow-toast)]">
                    <span className="flex-1 pt-0.5">Tap Edit on anything to change it</span>
                    <button type="button" aria-label="Dismiss tip" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" onClick={dismissTip}>
                      <IconX size={16} />
                    </button>
                  </div>
                )}
              </div>
            }
            beforeProducts={
              <p className="px-2 text-sm text-muted">
                Prices are starting suggestions based on format and your audience. Tap Why ₹X? or edit any price.
              </p>
            }
            productToolbar={productToolbar}
            productNote={productNote}
            productFooter={productFooter}
          />

          {noEntry && (
            <p className="mt-4 rounded-2xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">Most first-time buyers start with something under ₹500.</p>
          )}
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

      {regenAsk && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/80 md:items-center md:p-4" role="dialog" aria-modal aria-labelledby="regen-title">
          <form
            className="w-full max-w-[480px] space-y-4 rounded-t-[24px] bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 md:max-w-sm md:rounded-[24px] md:pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              const h = hint.trim() || undefined;
              const ask = regenAsk;
              setRegenAsk(null);
              regenerate(ask.target === "bio" ? { target: "bio", hint: h } : { target: "product", productId: ask.productId, hint: h });
            }}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-line-input md:hidden" aria-hidden />
            <div>
              <p id="regen-title" className="font-display text-[22px] font-bold">
                {regenAsk.target === "bio" ? "Regenerate your bio" : "Regenerate this product"}
              </p>
              <p className="text-sm text-muted [overflow-wrap:anywhere]">{regenAsk.target === "bio" ? "Headline and bio" : regenAsk.title}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="regen-hint" className="text-sm font-semibold">
                  What should change? <span className="font-normal text-muted">(optional)</span>
                </label>
                <span className="text-xs text-muted">
                  {hint.length}/{HINT_MAX}
                </span>
              </div>
              <input
                id="regen-hint"
                className={`${inputCls()} min-h-12 border-[1.5px]`}
                value={hint}
                maxLength={HINT_MAX}
                placeholder={regenAsk.target === "bio" ? "e.g. shorter, more friendly" : "e.g. cheaper, for beginners, a live format"}
                onChange={(e) => setHint(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setRegenAsk(null)}>
                Cancel
              </Button>
              <button type="submit" className={btnClass("primary", "md", "flex-1")}>
                <IconRefresh size={18} />
                Regenerate
              </button>
            </div>
          </form>
        </div>
      )}

      {buyerView && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-paper" role="dialog" aria-modal aria-label="Buyer view of your draft">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-ink px-4 py-1.5 text-sm text-white">
            <span className="font-semibold">Buyer view of your draft</span>
            <button type="button" className="min-h-11 font-bold text-on-ink-link" onClick={() => setBuyerView(false)}>
              Back to editing
            </button>
          </div>
          <PublicStore slug={slug} content={draft} preview />
        </div>
      )}

      {undo && !toast && (
        <div className="fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-[440px] items-center justify-between gap-3 rounded-[14px] bg-ink py-1.5 pl-4 pr-2 text-[15px] font-semibold text-white shadow-[var(--shadow-toast)]" role="status">
          <span>Regenerated.</span>
          <button type="button" className="min-h-11 px-3 font-bold text-on-ink-link" onClick={undoRegenerate}>
            Undo
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-[440px] rounded-[14px] bg-ink px-4 py-3 text-[15px] font-semibold text-white shadow-[var(--shadow-toast)] md:bottom-8" role="status">
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
          onRemove={removeProduct}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "publish" && (
        <PublishSheet
          draft={draft}
          token={token}
          slug={slug}
          mode={publishedAt ? (dirty ? "update" : "share") : "form"}
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
