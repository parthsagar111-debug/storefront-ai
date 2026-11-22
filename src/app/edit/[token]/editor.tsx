"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NotFoundView } from "@/components/not-found-view";
import { btnClass, inputCls } from "@/components/ui";
import { IconAlert, IconCheck, IconChevronRight, IconLoader, IconPencil, IconRefresh } from "@/components/icons";
import { use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import StoreEditor, { type Counts } from "./store-editor";
import type { EditorView } from "@/lib/server/store-access";
import { saveStore, listStores, removeStore } from "@/lib/client/device";

const AUDIENCE_LABEL: Record<string, string> = {
  none: "No audience yet",
  under_5k: "Under 5K",
  "5k_20k": "5K–20K",
  "20k_100k": "20K–100K",
  "100k_plus": "100K+",
};

/** SPEC v5 V3: one personalised status line (their audience; no follower-count pricing claim). */
const statusLine = (audience?: string) => {
  const a = (audience ?? "").trim();
  if (!a) return "Finding products for your audience…";
  // "Working professionals" → "working professionals"; keep acronyms like "UPSC aspirants".
  const lower = /^[A-Z][a-z]/.test(a) ? a[0].toLowerCase() + a.slice(1) : a;
  return `Finding products for ${lower}…`;
};
const SLOW_AFTER_MS = 12_000;

/** navigator.onLine with live updates (V3: offline → "You're offline. Reconnect to continue."). */
function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    addEventListener("online", sync);
    addEventListener("offline", sync);
    return () => {
      removeEventListener("online", sync);
      removeEventListener("offline", sync);
    };
  }, []);
  return online;
}
const OFFLINE = "You're offline. Reconnect to continue.";

type Load = { state: "loading" } | { state: "missing" } | { state: "ok"; store: EditorView & { counts: Counts | null } };

/**
 * Next 16 keeps visited routes mounted (React Activity). After "Edit answers" the editor must re-fetch
 * and poll the new generation, so a push navigation remounts it (back/forward still restores state).
 */
export default function Editor({ params }: { params: Promise<{ token: string }> }) {
  const { bfcacheId } = useRouter();
  return <EditorInner key={bfcacheId} params={params} />;
}

function EditorInner({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const online = useOnline();
  // V3: fade into the editor only when this view watched the generation finish.
  const [sawGenerating, setSawGenerating] = useState(false);
  // V3 + design: going offline while loading / generating shows the offline screen until "Try again" (online only).
  const [offlineHold, setOfflineHold] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const fetchStore = useCallback(async (): Promise<Load | null> => {
    try {
      const res = await fetch(`/api/stores/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (res.status === 404) {
        removeStore(token); // forget a deleted store on this device (no dead "Continue your store")
        return { state: "missing" };
      }
      if (!res.ok) return null;
      const store: EditorView & { counts: Counts | null } = await res.json();
      // Remember the edit link on this device (also covers links opened on a new device).
      if (!listStores().some((s) => s.token === token) && store.draft) {
        saveStore({
          token,
          clientRequestId: "",
          name: store.draft.creator.displayName,
          createdAt: Date.now(),
          slug: store.slug,
          confirmed: true,
        });
      }
      return { state: "ok", store };
    } catch {
      return null; // transient: keep polling
    }
  }, [token]);

  const active =
    load.state === "loading" ||
    (load.state === "ok" && (load.store.status === "pending" || load.store.status === "generating") && !load.store.isStale);

  useEffect(() => {
    if (!online && active) {
      const t = setTimeout(() => setOfflineHold(true), 0);
      return () => clearTimeout(t);
    }
  }, [online, active]);

  // Fetch now (first load), then every 2 s while generating; stop otherwise.
  useEffect(() => {
    if (!active || offlineHold) return;
    let cancelled = false;
    const run = () =>
      fetchStore().then((next) => {
        if (cancelled) return;
        if (next?.state === "ok" && (next.store.status === "pending" || next.store.status === "generating")) setSawGenerating(true);
        if (next) setLoad(next);
        else timer.current = setTimeout(run, 2000);
      });
    timer.current = setTimeout(run, load.state === "loading" ? 0 : 2000);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load, active, fetchStore, offlineHold, retryKey]);

  if (offlineHold)
    return (
      <Offline
        online={online}
        onRetry={() => {
          setOfflineHold(false);
          setRetryKey((k) => k + 1);
        }}
      />
    );

  if (load.state === "loading") return <Skeleton line="Loading your store…" />;
  if (load.state === "missing") return <NotFoundView variant="edit" />;

  const s = load.store;
  const restart = async (path: "retry" | "answer", body?: unknown) => {
    if (!navigator.onLine) return alert(OFFLINE); // V3: no silent retry while offline
    const res = await fetch(`/api/stores/${encodeURIComponent(token)}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) alert("Too many tries for this store. Please wait a bit.");
    setSawGenerating(true);
    setLoad({ state: "ok", store: { ...s, status: "generating", isStale: false, genStartedAt: new Date().toISOString() } });
  };

  if (s.isStale && s.status !== "failed") {
    // V3 interrupted (Claude Design v5 frame): heading + Try again.
    return (
      <Screen>
        <div className="flex min-h-[80dvh] flex-col justify-center gap-6 pb-20">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-saffron-soft text-saffron" aria-hidden>
            <IconAlert size={30} />
          </span>
          <h1 role="alert" className="font-display text-[28px] font-bold leading-[1.15]">
            Generation was interrupted.
          </h1>
          <button type="button" disabled={!online} className={btnClass("primary", "lg", "w-full")} onClick={() => restart("retry")}>
            <IconRefresh size={20} />
            Try again
          </button>
        </div>
      </Screen>
    );
  }

  if (s.status === "failed") {
    const i = s.input;
    return (
      <Screen>
        <div className="flex min-h-[70dvh] flex-col justify-center gap-5">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E4E6F9] text-[#3E46B5]">
            <IconLoader size={28} />
          </span>
          <div className="space-y-2">
            <h1 className="font-display text-[28px] font-bold leading-tight">Our AI is busy right now.</h1>
            <p className="text-muted">Your answers are saved.</p>
          </div>
          <p className="flex gap-2 rounded-2xl border border-line bg-surface p-4 text-sm">
            <IconCheck size={16} className="mt-0.5 shrink-0 text-teal" />
            <span>{[i.name, i.expertise, AUDIENCE_LABEL[i.audienceSize], i.language === "hinglish" ? "Hinglish" : "English"].filter(Boolean).join(" · ")}</span>
          </p>
          <button type="button" disabled={!online} className={btnClass("primary", "lg", "w-full")} onClick={() => restart("retry")}>
            <IconRefresh size={20} />
            Try again
          </button>
        </div>
      </Screen>
    );
  }

  if (s.status === "pending" || s.status === "generating") {
    return <Generating since={s.genStartedAt ?? s.updatedAt} name={s.input?.name} audience={s.input?.audience} />;
  }

  if (s.status === "needs_input" && s.followUp?.kind === "unclear") {
    return (
      <Screen>
        <div className="flex min-h-[70dvh] flex-col justify-center gap-5">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-saffron-soft text-saffron">
            <IconAlert size={28} />
          </span>
          <div className="space-y-2">
            <h1 className="font-display text-[28px] font-bold leading-tight">We couldn&apos;t understand that.</h1>
            <p className="text-muted">Try something like &quot;I teach home cooking to working women.&quot;</p>
          </div>
          <Link href={`/?from=${encodeURIComponent(token)}`} className={btnClass("primary", "lg", "w-full")}>
            Edit my answers
          </Link>
        </div>
      </Screen>
    );
  }

  if (s.status === "needs_input" && s.followUp?.kind === "needs_more") {
    return (
      <PickDirection
        token={token}
        summary={{ teach: s.input?.expertise ?? "", to: s.input?.audience ?? "" }}
        question={s.followUp.question}
        directions={s.followUp.directions}
        allowText={s.followUp.round < 2}
        onPick={(d) => restart("answer", { direction: d })}
      />
    );
  }

  if (s.status === "ready" && s.draft) {
    return (
      <FadeIn enabled={sawGenerating}>
        <StoreEditor
        token={token}
        slug={s.slug}
        draft={s.draft}
        publishedAt={s.publishedAt}
        hasUnpublishedChanges={s.hasUnpublishedChanges}
        draftRev={s.draftRev}
        counts={s.counts}
        />
      </FadeIn>
    );
  }
  return <Skeleton line="Loading…" />;
}

function Generating({ since, name, audience }: { since: string; name?: string; audience?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const started = new Date(since).getTime();
    const tick = () => setSlow(Date.now() - started > SLOW_AFTER_MS);
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [since]);
  return <Skeleton line={slow ? "Taking a little longer…" : statusLine(audience)} name={name} />;
}

/** V3: 200–300 ms fade from the generating skeleton into the editor. */
function FadeIn({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(!enabled);
  useEffect(() => {
    if (!enabled) return;
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [enabled]);
  return <div className={`transition-opacity duration-[250ms] ease-out motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}>{children}</div>;
}

/** V3 offline (Claude Design v5 frame); "Try again" works only once the browser is back online. */
function Offline({ online, onRetry }: { online: boolean; onRetry: () => void }) {
  return (
    <Screen>
      <div className="flex min-h-[80dvh] flex-col justify-center gap-5 pb-20">
        <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-sand text-ink/70" aria-hidden>
          <IconAlert size={30} />
        </span>
        <div role="status" className="space-y-2">
          <h1 className="font-display text-[28px] font-bold leading-[1.15]">You&apos;re offline.</h1>
          <p className="text-muted">Reconnect to continue.</p>
        </div>
        <button type="button" disabled={!online} className={btnClass("primary", "lg", "w-full")} onClick={onRetry}>
          <IconRefresh size={20} />
          Try again
        </button>
      </div>
    </Screen>
  );
}

/** S2: progress header + store-shaped skeleton (not a spinner). */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function Skeleton({ line, name }: { line: string; name?: string }) {
  const bar = "animate-pulse rounded-full bg-sand";
  return (
    <div aria-busy>
      <div className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto max-w-[480px] space-y-3 px-5 pb-4 pt-[18px]">
          <p className="font-semibold leading-snug" role="status" aria-live="polite">
            {line}
          </p>
          {/* V3: indeterminate indicator (no step bar); v5 token: 40 % accent segment, 1.3 s ease-in-out. */}
          <div className="relative h-1 overflow-hidden rounded bg-sand" role="progressbar" aria-label="Creating your store">
            <span className="absolute inset-y-0 left-0 w-2/5 rounded bg-saffron motion-safe:animate-[indeterminate_1.3s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>
      <Screen>
        <div className="flex flex-col items-center gap-3 pt-6">
          {name ? (
            <>
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-saffron font-display text-[26px] font-bold text-white ring-4 ring-saffron-soft" aria-hidden>
                {initialsOf(name)}
              </div>
              <p className="font-display text-[22px] font-bold">{name}</p>
            </>
          ) : (
            <>
              <div className="h-[72px] w-[72px] animate-pulse rounded-full bg-sand" />
              <div className={`h-4 w-40 ${bar}`} />
            </>
          )}
          <div className={`h-3 w-60 ${bar}`} />
        </div>
        <div className="mt-6 space-y-2">
          <div className={`h-3 ${bar}`} />
          <div className={`h-3 ${bar}`} />
          <div className={`h-3 w-2/3 ${bar}`} />
        </div>
        <div className="mt-6 space-y-4">
          {[0, 1, 2].map((k) => (
            <div key={k} className="overflow-hidden rounded-[20px] border border-line bg-surface">
              <div className="h-24 animate-pulse bg-sand" />
              <div className="space-y-3 p-4">
                <div className="flex justify-between gap-6">
                  <div className={`h-4 w-2/3 ${bar}`} />
                  <div className={`h-4 w-14 ${bar}`} />
                </div>
                <div className={`h-3 ${bar}`} />
                {k === 0 && <div className="h-11 animate-pulse rounded-2xl bg-sand" />}
              </div>
            </div>
          ))}
        </div>
      </Screen>
    </div>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[480px] px-5 py-6">{children}</div>;
}

/** S2b: a chip selects; "Use this" submits the selection (or the typed description). */
function PickDirection({
  token,
  summary,
  question,
  directions,
  allowText,
  onPick,
}: {
  token: string;
  summary: { teach: string; to: string };
  question: string;
  directions: string[];
  allowText: boolean;
  onPick: (d: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const value = chosen ?? (allowText && text.trim().length >= 2 ? text.trim() : null);
  return (
    <Screen>
      <div className="space-y-5">
        {/* V3 + design: compact summary of their answers; editing re-runs the clarity check for this same store. */}
        <div className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <p className="min-w-0 [overflow-wrap:anywhere]">
            <span className="text-muted">I teach </span>
            <b>{summary.teach}</b>
            <span className="text-muted"> · to </span>
            <b>{summary.to}</b>
          </p>
          <Link href={`/?edit=${encodeURIComponent(token)}`} className="inline-flex min-h-11 shrink-0 items-center gap-1 font-bold text-saffron">
            <IconPencil size={16} />
            Edit
          </Link>
        </div>
        <span className="inline-block rounded-full bg-saffron-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-saffron-ink">
          One quick question
        </span>
        <div className="space-y-2">
          <h1 className="font-display text-[28px] font-bold leading-tight">{question}</h1>
        </div>
        <div className="space-y-2" role="radiogroup" aria-label="Directions">
          {directions.map((d) => {
            const on = chosen === d;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={on}
                className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left font-semibold transition ${
                  on ? "border-2 border-saffron bg-saffron-soft text-saffron-ink" : "border-line-input bg-surface"
                }`}
                onClick={() => {
                  setChosen(on ? null : d);
                  setText("");
                }}
              >
                <span>{d}</span>
                {on ? <IconCheck size={20} className="shrink-0 text-saffron" /> : <IconChevronRight size={20} className="shrink-0 text-saffron" />}
              </button>
            );
          })}
        </div>
        {allowText ? (
          <>
            <div className="flex items-center gap-3 text-sm text-muted">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="space-y-2">
              <label htmlFor="f-direction" className="block text-sm font-semibold">
                or describe it yourself
              </label>
              <textarea
                id="f-direction"
                rows={3}
                className={inputCls()}
                value={text}
                maxLength={500}
                onChange={(e) => {
                  setText(e.target.value);
                  if (e.target.value) setChosen(null);
                }}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Pick the one closest to what you do.</p>
        )}
        <button type="button" disabled={!value} className={btnClass("primary", "lg", "w-full")} onClick={() => value && onPick(value)}>
          Use this
        </button>
        <Link href={`/?edit=${encodeURIComponent(token)}`} className="mx-auto block w-fit py-3 text-sm font-bold text-saffron underline underline-offset-4">
          Edit my answers
        </Link>
      </div>
    </Screen>
  );
}
