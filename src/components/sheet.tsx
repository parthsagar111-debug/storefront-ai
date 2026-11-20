"use client";
import { useEffect, type ReactNode } from "react";

/** Bottom sheet on mobile, side panel ≥ 768 px (D6). */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-2xl bg-white shadow-xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[420px] md:rounded-none">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" className="min-h-11 min-w-11 text-zinc-500" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-t border-zinc-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
      {error && <span className="block text-xs font-medium text-red-700">{error}</span>}
    </label>
  );
}

export const inputCls = (bad?: boolean) =>
  `w-full rounded-xl border px-3 py-3 text-base outline-none focus:border-zinc-900 ${bad ? "border-red-500 bg-red-50" : "border-zinc-300 bg-white"}`;
