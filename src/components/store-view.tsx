"use client";
import { useState, type ReactNode } from "react";
import type { TStoreContent, TProduct } from "@/lib/ai/schemas";
import { FORMAT_LABEL, formatINR } from "@/lib/pricing";

export const THEMES: Record<TStoreContent["theme"], { accent: string; soft: string; from: string; to: string }> = {
  saffron: { accent: "#c2410c", soft: "#fff7ed", from: "#fb923c", to: "#f59e0b" },
  teal: { accent: "#0f766e", soft: "#f0fdfa", from: "#2dd4bf", to: "#0891b2" },
  plum: { accent: "#7e22ce", soft: "#faf5ff", from: "#c084fc", to: "#db2777" },
  indigo: { accent: "#4338ca", soft: "#eef2ff", from: "#818cf8", to: "#2563eb" },
};

const FORMAT_ICON: Record<TProduct["format"], string> = {
  ebook: "📘",
  template_pack: "🗂️",
  recorded_course: "🎬",
  live_workshop: "🎙️",
  cohort_course: "👥",
  one_on_one: "💬",
  community: "🤝",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Mobile-first store (S5). Slots let the editor add controls without forking the layout. */
export function StoreView({
  content,
  headerSlot,
  productSlot,
  productCta,
}: {
  content: TStoreContent;
  headerSlot?: ReactNode;
  productSlot?: (p: TProduct, index: number) => ReactNode;
  productCta?: (p: TProduct) => ReactNode;
}) {
  const t = THEMES[content.theme];
  const c = content.creator;
  return (
    <div className="space-y-5" style={{ ["--accent" as string]: t.accent }}>
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
            style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
          >
            {initials(c.displayName)}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight">{c.displayName}</h1>
            <p className="text-sm text-zinc-600">{c.headline}</p>
            {c.instagramHandle && (
              <a
                className="text-sm font-medium"
                style={{ color: t.accent }}
                href={`https://instagram.com/${c.instagramHandle}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                @{c.instagramHandle}
              </a>
            )}
          </div>
        </div>
        <p className="leading-relaxed text-zinc-800">{c.bio}</p>
        {headerSlot}
      </header>

      <section className="space-y-4">
        {content.products.map((p, i) => (
          <ProductCard key={p.id} p={p} theme={t} cta={productCta?.(p)} slot={productSlot?.(p, i)} />
        ))}
      </section>
    </div>
  );
}

function ProductCard({
  p,
  theme,
  cta,
  slot,
}: {
  p: TProduct;
  theme: (typeof THEMES)[keyof typeof THEMES];
  cta?: ReactNode;
  slot?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div
        className="relative flex h-24 items-center gap-3 px-4 text-white"
        style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
      >
        <span className="text-3xl" aria-hidden>
          {FORMAT_ICON[p.format]}
        </span>
        <span className="text-sm font-semibold uppercase tracking-wide">{FORMAT_LABEL[p.format]}</span>
        {p.availability === "coming_soon" && (
          <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-zinc-900">
            Coming soon
          </span>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold leading-snug">{p.title}</h2>
          <span className="shrink-0 font-semibold">{formatINR(p.price)}</span>
        </div>
        <p className="text-sm text-zinc-600">{p.summary}</p>
        {cta}
        <button type="button" className="min-h-11 text-sm font-medium text-zinc-700 underline" onClick={() => setOpen(!open)}>
          {open ? "Hide details" : "See details"}
        </button>
        {open && (
          <div className="space-y-2 text-sm text-zinc-700">
            <p>{p.description}</p>
            <ul className="list-disc space-y-1 pl-5">
              {p.whatYouGet.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            {p.disclaimer && <p className="text-xs text-zinc-500">{p.disclaimer}</p>}
          </div>
        )}
        {slot}
      </div>
    </article>
  );
}
