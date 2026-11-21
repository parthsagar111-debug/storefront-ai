"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StoreView, THEMES } from "@/components/store-view";
import { IconChat, IconCheck } from "@/components/icons";
import type { TStoreContent, TProduct } from "@/lib/ai/schemas";
import { waLink, waAskLink } from "@/lib/whatsapp";

/** Visitor id: random, in localStorage (per browser); per page load if storage is blocked (T4). */
function visitorId(): string {
  const fresh = () => crypto.randomUUID();
  try {
    let v = localStorage.getItem("sf.visitor");
    if (!v) {
      v = fresh();
      localStorage.setItem("sf.visitor", v);
    }
    return v;
  } catch {
    return fresh();
  }
}

const tappedKey = (slug: string) => `sf.tapped.${slug}`;
function loadTapped(slug: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(tappedKey(slug)) || "[]");
  } catch {
    return [];
  }
}

export default function PublicStore({ slug, content }: { slug: string; content: TStoreContent }) {
  const vid = useRef<string>("");
  const [tapped, setTapped] = useState<string[]>([]);
  // IQA-02: per-product send state; "Thanks!" only after the server confirms.
  const [sending, setSending] = useState<Record<string, "sending" | "failed">>({});
  const c = content.creator;
  const firstName = c.displayName.split(/\s+/)[0];
  const t = THEMES[content.theme];

  const send = (type: string, productId?: string) =>
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, type, productId, visitorId: vid.current }),
      keepalive: true,
    }).catch(() => {});

  useEffect(() => {
    vid.current = visitorId();
    const timer = setTimeout(() => setTapped(loadTapped(slug)), 0);
    send("store_viewed");
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  /** IQA-02: show "Thanks!" and remember the tap only after /api/events returns 2xx (204 "already counted" included). */
  const interested = async (p: TProduct) => {
    if (tapped.includes(p.id) || sending[p.id] === "sending") return;
    setSending((s) => ({ ...s, [p.id]: "sending" }));
    let ok = false;
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, type: "interest_tapped", productId: p.id, visitorId: vid.current }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (!ok) {
      setSending((s) => ({ ...s, [p.id]: "failed" }));
      return;
    }
    setSending(({ [p.id]: _done, ...rest }) => (void _done, rest));
    setTapped((prev) => {
      const next = prev.includes(p.id) ? prev : [...prev, p.id];
      try {
        localStorage.setItem(tappedKey(slug), JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const primary = "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-bold text-white";
  const link = "inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4";

  // Exactly one primary action per card: Available now → Enquire on WhatsApp; Coming soon → I'm interested.
  const cta = (p: TProduct) => {
    if (p.availability === "available" && c.whatsapp) {
      return (
        <a
          className={primary}
          style={{ background: t.accent }}
          href={waLink(c.whatsapp, firstName, p.title)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => send("whatsapp_tapped", p.id)}
        >
          <IconChat size={18} />
          Enquire on WhatsApp
        </a>
      );
    }
    const done = tapped.includes(p.id);
    return (
      <div className="space-y-1">
        {done ? (
          <p className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-4 text-center text-sm font-semibold" style={{ background: t.soft, color: t.ink }} role="status">
            <IconCheck size={18} />
            Thanks! {firstName} will see that you&apos;re interested.
          </p>
        ) : (
          <>
            <button
              type="button"
              className={primary}
              style={{ background: t.accent }}
              disabled={sending[p.id] === "sending"}
              aria-busy={sending[p.id] === "sending"}
              onClick={() => interested(p)}
            >
              {sending[p.id] === "sending" ? "Sending…" : sending[p.id] === "failed" ? "Tap to try again" : "I'm interested"}
            </button>
            {sending[p.id] === "failed" && (
              <p className="text-center text-sm font-semibold text-danger" role="alert">
                Couldn&apos;t send that. Tap to try again.
              </p>
            )}
          </>
        )}
        {(c.whatsapp || c.instagramHandle) && (
          <div className="flex flex-wrap justify-center gap-x-6">
            {c.whatsapp && (
              <a
                className={link}
                style={{ color: t.accent }}
                href={waAskLink(c.whatsapp, firstName, p.title)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => send("whatsapp_tapped", p.id)}
              >
                Ask on WhatsApp
              </a>
            )}
            {c.instagramHandle && (
              <a className={link} style={{ color: t.accent }} href={`https://instagram.com/${c.instagramHandle}`} target="_blank" rel="noopener noreferrer">
                Follow on Instagram
              </a>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-dvh md:dot-grid md:py-16">
      <div className="mx-auto w-full max-w-[480px] overflow-hidden bg-paper md:rounded-[28px] md:bg-surface md:shadow-[0_24px_80px_rgba(34,26,20,0.14)]">
        <StoreView variant="public" content={content} productCta={cta} />
        <footer className="mt-8 border-t border-line px-5 py-5 text-center text-sm text-muted">
          Made with Storefront AI ·{" "}
          <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4">
            Create your own store
          </Link>
        </footer>
      </div>
    </div>
  );
}
