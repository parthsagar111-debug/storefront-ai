"use client";
import { useEffect, type ReactNode } from "react";
import { IconX } from "./icons";

/** Bottom sheet on mobile, side panel ≥ 768 px (D6). `centered` = no title bar (publish steps). */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  hideHeader,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  hideHeader?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    // Lock page scroll only for the mobile bottom sheet; on desktop the preview stays scrollable beside the panel.
    if (!window.matchMedia("(min-width: 768px)").matches) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:pointer-events-none [&>div]:md:pointer-events-auto" role="dialog" aria-modal aria-label={title}>
      {/* Mobile: scrim behind a bottom sheet. ≥ md: side panel under the editor's top bar, no scrim (S3 desktop). */}
      <button type="button" aria-label="Close" className="absolute inset-0 bg-scrim/80 md:hidden" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-[24px] bg-surface shadow-[0_-12px_40px_rgba(34,26,20,0.18)] md:bottom-0 md:left-auto md:right-0 md:top-[69px] md:max-h-none md:w-[420px] md:rounded-none md:border-l md:border-line md:shadow-[-12px_0_40px_rgba(34,26,20,0.08)]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-input md:hidden" aria-hidden />
        {hideHeader ? (
          <button type="button" className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-muted" onClick={onClose} aria-label="Close">
            <IconX size={20} />
          </button>
        ) : (
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3">
            <div>
              <h2 className="font-display text-xl font-bold">{title}</h2>
              {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
            </div>
            <button type="button" className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink" onClick={onClose} aria-label="Close">
              <IconX size={20} />
            </button>
          </div>
        )}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  aside,
  htmlFor,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  aside?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-bold">
          {label}
        </label>
        {aside && <span className="text-xs font-semibold text-muted">{aside}</span>}
      </div>
      {children}
      {hint && <div className="text-xs text-muted">{hint}</div>}
      {error && (
        <p className="text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
