"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StoreView, THEMES } from "@/components/store-view";
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
  const c = content.creator;
  const firstName = c.displayName.split(/\s+/)[0];
  const accent = THEMES[content.theme].accent;

  const send = (type: string, productId?: string) =>
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, type, productId, visitorId: vid.current }),
      keepalive: true,
    }).catch(() => {});

  useEffect(() => {
    vid.current = visitorId();
    const t = setTimeout(() => setTapped(loadTapped(slug)), 0);
    send("store_viewed");
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const interested = (p: TProduct) => {
    if (tapped.includes(p.id)) return;
    const next = [...tapped, p.id];
    setTapped(next);
    try {
      localStorage.setItem(tappedKey(slug), JSON.stringify(next));
    } catch {}
    send("interest_tapped", p.id);
  };

  const btn = "flex min-h-12 w-full items-center justify-center rounded-xl px-4 py-3 text-center font-medium";

  const cta = (p: TProduct) => {
    if (p.availability === "available" && c.whatsapp) {
      return (
        <a
          className={`${btn} text-white`}
          style={{ background: accent }}
          href={waLink(c.whatsapp, firstName, p.title)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => send("whatsapp_tapped", p.id)}
        >
          Enquire on WhatsApp
        </a>
      );
    }
    const done = tapped.includes(p.id);
    return (
      <div className="space-y-2">
        {done ? (
          <p className={`${btn} bg-zinc-100 text-zinc-800`} role="status">
            ✓ Thanks! {firstName} will see that you&apos;re interested.
          </p>
        ) : (
          <button type="button" className={`${btn} text-white`} style={{ background: accent }} onClick={() => interested(p)}>
            I&apos;m interested
          </button>
        )}
        {c.whatsapp && (
          <a
            className={`${btn} border border-zinc-300 text-zinc-800`}
            href={waAskLink(c.whatsapp, firstName, p.title)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => send("whatsapp_tapped", p.id)}
          >
            Ask on WhatsApp
          </a>
        )}
        {!c.whatsapp && c.instagramHandle && (
          <a
            className="block min-h-11 py-2 text-center text-sm font-medium"
            style={{ color: accent }}
            href={`https://instagram.com/${c.instagramHandle}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Follow on Instagram
          </a>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <StoreView content={content} productCta={cta} />
      <footer className="border-t border-zinc-200 pt-4 text-center text-sm text-zinc-500">
        Made with Storefront AI ·{" "}
        <Link href="/" className="font-medium text-zinc-800 underline">
          Create your own store
        </Link>
      </footer>
    </div>
  );
}
