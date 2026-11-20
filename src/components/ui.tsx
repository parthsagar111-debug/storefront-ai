// UI primitives in the "Haldi & Ink" style (Design/TOKENS.md).
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { IconStore } from "./icons";

type Variant = "primary" | "secondary" | "ghost" | "teal" | "soft";

export function btnClass(variant: Variant = "primary", size: "md" | "lg" | "sm" = "md", extra = "") {
  const v: Record<Variant, string> = {
    primary: "bg-saffron text-white shadow-[0_6px_16px_rgba(180,80,10,0.25)] active:brightness-95",
    secondary: "border border-line-input bg-surface text-ink active:bg-sand",
    ghost: "text-ink active:bg-sand",
    teal: "bg-teal text-white active:brightness-95",
    soft: "border border-saffron/30 bg-saffron-soft text-saffron-ink active:brightness-95",
  };
  const s = { sm: "min-h-11 px-3 text-sm rounded-xl", md: "min-h-12 px-4 text-base rounded-2xl", lg: "min-h-14 px-5 text-lg rounded-2xl" }[size];
  return `inline-flex items-center justify-center gap-2 font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${s} ${v[variant]} ${extra}`;
}

export function Button({ variant, size, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "lg" | "sm" }) {
  return <button type="button" {...rest} className={btnClass(variant, size, className)} />;
}

export function Chip({ selected, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={`min-h-11 rounded-full border px-4 text-sm font-medium transition ${
        selected ? "border-saffron bg-saffron-soft font-semibold text-saffron-ink" : "border-line-input bg-surface text-ink active:bg-sand"
      }`}
    >
      {children}
    </button>
  );
}

/** Filled (ink) single-choice chip used for audience size. */
export function ChoiceChip({ selected, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${
        selected ? "border-ink bg-ink text-white" : "border-line-input bg-surface text-ink active:bg-sand"
      }`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-2xl bg-sand p-1">
      {options.map(([k, text]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={`min-h-11 rounded-xl text-base font-semibold transition ${value === k ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({ kind }: { kind: "Draft" | "Live" | "Unpublished changes" }) {
  const cls = {
    Draft: "bg-sand text-muted",
    Live: "bg-teal-soft text-teal-ink",
    "Unpublished changes": "bg-warn-bg text-warn-ink",
  }[kind];
  const dot = { Draft: "bg-muted", Live: "bg-teal", "Unpublished changes": "bg-warn-ink" }[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {kind}
    </span>
  );
}

export function Logo({ withName = true }: { withName?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-saffron text-white">
        <IconStore size={18} />
      </span>
      {withName && <span className="font-display text-lg font-bold">Storefront AI</span>}
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-xs font-bold uppercase tracking-wider text-muted">{children}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export const inputBase =
  "w-full rounded-xl border bg-surface px-4 py-3 text-base text-ink outline-none transition focus:border-saffron focus:ring-2 focus:ring-saffron/15";
export const inputCls = (bad?: boolean) => `${inputBase} ${bad ? "border-danger bg-red-50" : "border-line-input"}`;
