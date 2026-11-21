"use client";
import { useState, type ReactNode, type ComponentType } from "react";
import type { TStoreContent, TProduct } from "@/lib/ai/schemas";
import { FORMAT_LABEL, formatINR } from "@/lib/pricing";
import {
  IconBook,
  IconTemplate,
  IconPlayCircle,
  IconLive,
  IconCap,
  IconVideo,
  IconUsers,
  IconInstagram,
  IconChevronDown,
  IconChevronUp,
  IconCheck,
  IconSpinner,
} from "./icons";

/** Store accents (TOKENS.md). White text on `accent` passes 4.5:1. */
export const THEMES: Record<TStoreContent["theme"], { accent: string; soft: string; ink: string }> = {
  saffron: { accent: "#B4500A", soft: "#FCEBDD", ink: "#6E3106" },
  teal: { accent: "#0F766E", soft: "#DDF3F0", ink: "#0B4F4A" },
  plum: { accent: "#8E2C74", soft: "#F6E3EF", ink: "#5E1C4C" },
  indigo: { accent: "#3E46B5", soft: "#E4E6F9", ink: "#2A3080" },
};

/** Format covers: 135° gradient + icon (TOKENS.md). */
export const COVER: Record<TProduct["format"], { from: string; to: string; Icon: ComponentType<{ size?: number; className?: string }> }> = {
  ebook: { from: "#B45309", to: "#78350F", Icon: IconBook },
  template_pack: { from: "#BE185D", to: "#831843", Icon: IconTemplate },
  recorded_course: { from: "#4338CA", to: "#312E81", Icon: IconPlayCircle },
  live_workshop: { from: "#B91C1C", to: "#7F1D1D", Icon: IconLive },
  cohort_course: { from: "#047857", to: "#064E3B", Icon: IconCap },
  one_on_one: { from: "#7E22CE", to: "#4C1D95", Icon: IconVideo },
  community: { from: "#0369A1", to: "#0C4A6E", Icon: IconUsers },
};

const byPrice = (ps: TProduct[]) => ps.map((p, i) => [p, i] as const).sort((a, b) => a[0].price - b[0].price || a[1] - b[1]).map(([p]) => p);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export interface StoreViewProps {
  content: TStoreContent;
  variant: "public" | "editor";
  /** Editor: controls above the header / each product. */
  headerToolbar?: ReactNode;
  productToolbar?: (p: TProduct) => ReactNode;
  /** Editor: panel between toolbar and card (Why ₹ explanation). */
  productNote?: (p: TProduct) => ReactNode;
  /** Editor: footer inside the card (tap counts). */
  productFooter?: (p: TProduct) => ReactNode;
  /** Editor: a line between the header and the products (V4 price note). */
  beforeProducts?: ReactNode;
  /** Public: the card's CTA area. */
  productCta?: (p: TProduct) => ReactNode;
  busy?: { header?: boolean; productId?: string | null; all?: boolean };
  highlightId?: string | null;
}

/** The store as buyers see it (S5); the editor (S3) renders the same component with controls. */
export function StoreView(props: StoreViewProps) {
  const { content, variant, busy } = props;
  const t = THEMES[content.theme];
  const c = content.creator;
  const editor = variant === "editor";
  const headerBusy = Boolean(busy?.header || busy?.all);

  const header = (
    <header className={`relative text-center ${editor ? "px-4 pb-5 pt-2" : "px-5 pb-6"}`}>
      {!editor && <div className="absolute inset-x-0 top-0 -z-0 h-20" style={{ background: t.soft }} aria-hidden />}
      <div className={`relative flex flex-col items-center ${editor ? "" : "pt-6"}`}>
        <div
          className="flex h-[88px] w-[88px] items-center justify-center rounded-full font-display text-3xl font-bold text-white ring-4 ring-white"
          style={{ background: t.accent, boxShadow: `0 0 0 6px ${t.soft}` }}
        >
          {initials(c.displayName)}
        </div>
        <h1 className="mt-4 max-w-full font-display text-[28px] font-bold leading-tight [overflow-wrap:anywhere]">{c.displayName}</h1>
        <p className="mt-1 max-w-full font-semibold [overflow-wrap:anywhere]">{c.headline}</p>
        {c.instagramHandle && (
          <a
            href={`https://instagram.com/${c.instagramHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-11 max-w-full items-center gap-1.5 text-sm font-semibold [overflow-wrap:anywhere]"
            style={{ color: t.accent }}
          >
            <IconInstagram size={16} />@{c.instagramHandle}
          </a>
        )}
        <p className="mt-3 w-full text-left leading-relaxed text-ink/90 [overflow-wrap:anywhere]">{c.bio}</p>
      </div>
    </header>
  );

  return (
    <div className="space-y-4">
      {editor ? (
        <EditorBlock toolbar={props.headerToolbar} busy={headerBusy}>
          {header}
        </EditorBlock>
      ) : (
        <BusyOverlay busy={headerBusy}>{header}</BusyOverlay>
      )}

      {props.beforeProducts}
      {editor ? (
        <section className="space-y-4" aria-label="Products">
          {content.products.map((p) => (
            <EditorBlock key={p.id} toolbar={props.productToolbar?.(p)} note={props.productNote?.(p)} highlight={props.highlightId === p.id} busy={false}>
              <ProductCard
                p={p}
                theme={t}
                showDisclaimer={content.sensitiveDomain !== "none"}
                cta={props.productCta?.(p)}
                footer={props.productFooter?.(p)}
                busy={Boolean(busy?.all || busy?.productId === p.id)}
              />
            </EditorBlock>
          ))}
        </section>
      ) : (
        // V6: Available now first (cheapest first), then a "Coming soon" subheading (cheapest first).
        [byPrice(content.products.filter((p) => p.availability === "available")), byPrice(content.products.filter((p) => p.availability !== "available"))].map(
          (group, gi) =>
            group.length > 0 && (
              <section key={gi} className="space-y-4 px-4" aria-label={gi === 0 ? "Available now" : "Coming soon"}>
                {gi === 0 ? (
                  <h2 className="flex items-center gap-2 pt-1 font-display text-xl font-bold">
                    <span className="h-2 w-2 rounded-full bg-teal" aria-hidden />
                    Available now
                  </h2>
                ) : (
                  <h2 className="pt-3 font-display text-xl font-bold">Coming soon</h2>
                )}
                {group.map((p) => (
                  <div key={p.id}>
                    <ProductCard
                      p={p}
                      theme={t}
                      indicative={gi === 1}
                      showDisclaimer={content.sensitiveDomain !== "none"}
                      cta={props.productCta?.(p)}
                      busy={Boolean(busy?.all || busy?.productId === p.id)}
                    />
                  </div>
                ))}
              </section>
            ),
        )
      )}
    </div>
  );
}

/** Dashed editable region with its toolbar (S3). */
function EditorBlock({ toolbar, note, children, busy, highlight }: { toolbar?: ReactNode; note?: ReactNode; children: ReactNode; busy: boolean; highlight?: boolean }) {
  return (
    <div className={`rounded-[24px] border border-dashed p-2 transition ${highlight ? "border-2 border-solid border-saffron" : "border-line-input"}`}>
      {toolbar && <div className="flex items-center gap-2 pb-2">{toolbar}</div>}
      {note}
      <BusyOverlay busy={busy}>{children}</BusyOverlay>
    </div>
  );
}

/** Regenerate: dims the existing block in place with a pill on top — never renders a second card. */
function BusyOverlay({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <div className="relative" aria-busy={busy}>
      <div className={busy ? "pointer-events-none opacity-40 transition" : "transition"}>{children}</div>
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-bold shadow-card" role="status">
            <IconSpinner size={16} className="text-saffron" />
            Regenerating…
          </span>
        </div>
      )}
    </div>
  );
}

function ProductCard({
  p,
  theme,
  cta,
  footer,
  busy,
  indicative = false,
  showDisclaimer,
}: {
  p: TProduct;
  theme: (typeof THEMES)[keyof typeof THEMES];
  cta?: ReactNode;
  footer?: ReactNode;
  busy: boolean;
  /** V6: public coming-soon cards say the price is indicative. */
  indicative?: boolean;
  /** V6: disclaimers only when the store's domain applies. */
  showDisclaimer: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cover = COVER[p.format];
  const available = p.availability === "available";
  return (
    <BusyOverlay busy={busy}>
      <article className="overflow-hidden rounded-[20px] border border-line bg-surface shadow-card">
        <div
          className="relative flex h-[104px] flex-col justify-between overflow-hidden p-4 text-white"
          style={{ background: `linear-gradient(135deg, ${cover.from}, ${cover.to})` }}
        >
          <cover.Icon size={28} />
          <cover.Icon size={120} className="absolute -bottom-6 right-2 opacity-[0.16]" />
          <span className="text-xs font-bold uppercase tracking-[0.12em]">{FORMAT_LABEL[p.format]}</span>
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink">
            {available && <span className="h-1.5 w-1.5 rounded-full bg-teal" />}
            {available ? "Available now" : "Coming soon"}
          </span>
        </div>
        <div className="space-y-3 p-4">
          {/* QA-04: the title column can shrink and wrap anywhere, so long words never push the price off the card. */}
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 flex-1 font-display text-lg font-bold leading-snug [overflow-wrap:anywhere]">{p.title}</h2>
            <span className="shrink-0 font-display text-[21px] font-bold leading-tight [overflow-wrap:anywhere]">{formatINR(p.price)}</span>
          </div>
          {indicative && <p className="-mt-2 text-xs leading-snug text-muted">Indicative price. Final price may change when available.</p>}
          <p className="text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">{p.summary}</p>
          {cta}
        </div>
        <button
          type="button"
          aria-expanded={open}
          className="flex min-h-12 w-full items-center justify-center gap-1 border-t border-line text-sm font-semibold text-ink/80"
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide details" : "See details"}
          {open ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </button>
        {open && (
          <div className="space-y-3 px-4 pb-4 text-sm leading-relaxed text-ink/85 [overflow-wrap:anywhere]">
            <p>{p.description}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">What you get</p>
            <ul className="space-y-2">
              {p.whatYouGet.map((w) => (
                <li key={w} className="flex gap-2">
                  <IconCheck size={16} className="mt-0.5 shrink-0" style={{ color: theme.accent }} />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
            {p.disclaimer && showDisclaimer && <p className="rounded-lg bg-sand px-3 py-2 text-xs text-muted">{p.disclaimer}</p>}
          </div>
        )}
        {footer}
      </article>
    </BusyOverlay>
  );
}
