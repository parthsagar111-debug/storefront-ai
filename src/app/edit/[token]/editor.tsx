"use client";
import Link from "next/link";
import { NotFoundView } from "@/components/not-found-view";
import { use, useCallback, useEffect, useRef, useState } from "react";
import StoreEditor, { type Counts } from "./store-editor";
import type { EditorView } from "@/lib/server/store-access";
import { saveStore, listStores } from "@/lib/client/device";

const LINES = [
  "Reading what you do…",
  "Finding products your audience will pay for…",
  "Pricing for Indian buyers…",
  "Writing your page…",
];

type Load = { state: "loading" } | { state: "missing" } | { state: "ok"; store: EditorView & { counts: Counts | null } };

export default function Editor({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStore = useCallback(async (): Promise<Load | null> => {
    try {
      const res = await fetch(`/api/stores/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (res.status === 404) return { state: "missing" };
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

  // Fetch now (first load), then every 2 s while generating; stop otherwise.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const run = () =>
      fetchStore().then((next) => {
        if (cancelled) return;
        if (next) setLoad(next);
        else timer.current = setTimeout(run, 2000);
      });
    timer.current = setTimeout(run, load.state === "loading" ? 0 : 2000);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load, active, fetchStore]);

  if (load.state === "loading") return <Skeleton line={LINES[0]} />;
  if (load.state === "missing") return <NotFoundView />;

  const s = load.store;
  const restart = async (path: "retry" | "answer", body?: unknown) => {
    const res = await fetch(`/api/stores/${encodeURIComponent(token)}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) alert("Too many tries for this store. Please wait a bit.");
    setLoad({ state: "ok", store: { ...s, status: "generating", isStale: false, genStartedAt: new Date().toISOString() } });
  };

  if (s.status === "failed" || s.isStale) {
    return (
      <div className="space-y-4 py-10 text-center">
        <h1 className="text-xl font-semibold">Our AI is busy right now.</h1>
        <p className="text-zinc-600">Your answers are saved.</p>
        <button className="min-h-12 w-full rounded-xl bg-zinc-900 text-white" onClick={() => restart("retry")}>
          Try again
        </button>
      </div>
    );
  }

  if (s.status === "pending" || s.status === "generating") return <Generating since={s.genStartedAt ?? s.updatedAt} />;

  if (s.status === "needs_input" && s.followUp?.kind === "unclear") {
    return (
      <div className="space-y-4 py-10">
        <h1 className="text-xl font-semibold">We couldn&apos;t understand that.</h1>
        <p className="text-zinc-600">Try something like &quot;I teach home cooking to working women.&quot;</p>
        <Link href={`/?from=${encodeURIComponent(token)}`} className="block min-h-12 rounded-xl bg-zinc-900 py-3 text-center text-white">
          Edit my answers
        </Link>
      </div>
    );
  }

  if (s.status === "needs_input" && s.followUp?.kind === "needs_more") {
    return (
      <PickDirection
        question={s.followUp.question}
        directions={s.followUp.directions}
        allowText={s.followUp.round < 2}
        onPick={(d) => restart("answer", { direction: d })}
      />
    );
  }

  if (s.status === "ready" && s.draft) {
    return (
      <StoreEditor
        token={token}
        slug={s.slug}
        draft={s.draft}
        publishedAt={s.publishedAt}
        hasUnpublishedChanges={s.hasUnpublishedChanges}
        counts={s.counts}
      />
    );
  }
  return <Skeleton line="Loading…" />;
}

function Generating({ since }: { since: string }) {
  const [i, setI] = useState(0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % LINES.length), 2500);
    const started = new Date(since).getTime();
    const s = setInterval(() => setSlow(Date.now() - started > 20_000), 1000);
    return () => {
      clearInterval(t);
      clearInterval(s);
    };
  }, [since]);
  return <Skeleton line={slow ? "Taking a little longer than usual…" : LINES[i]} />;
}

function Skeleton({ line }: { line: string }) {
  const bar = "animate-pulse rounded bg-zinc-200";
  return (
    <div className="space-y-5" aria-busy>
      <p className="text-center text-sm font-medium text-zinc-600" aria-live="polite">
        {line}
      </p>
      <div className="flex items-center gap-3">
        <div className={`h-14 w-14 rounded-full ${bar}`} />
        <div className="flex-1 space-y-2">
          <div className={`h-4 w-1/2 ${bar}`} />
          <div className={`h-3 w-3/4 ${bar}`} />
        </div>
      </div>
      <div className="space-y-2">
        <div className={`h-3 ${bar}`} />
        <div className={`h-3 ${bar}`} />
        <div className={`h-3 w-2/3 ${bar}`} />
      </div>
      {[0, 1, 2].map((k) => (
        <div key={k} className="overflow-hidden rounded-2xl border border-zinc-200">
          <div className={`h-24 ${bar} rounded-none`} />
          <div className="space-y-2 p-4">
            <div className={`h-4 w-2/3 ${bar}`} />
            <div className={`h-3 ${bar}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PickDirection({
  question,
  directions,
  allowText,
  onPick,
}: {
  question: string;
  directions: string[];
  allowText: boolean;
  onPick: (d: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-4 py-6">
      <h1 className="text-xl font-semibold">{question}</h1>
      <div className="space-y-2">
        {directions.map((d) => (
          <button key={d} className="min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-left" onClick={() => onPick(d)}>
            {d}
          </button>
        ))}
      </div>
      {!allowText && <p className="text-sm text-zinc-600">Pick the one closest to what you do.</p>}
      <div className={allowText ? "space-y-2" : "hidden"}>
        <input
          className="w-full rounded-xl border border-zinc-300 px-3 py-3"
          placeholder="or describe it yourself"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          disabled={text.trim().length < 2}
          className="min-h-12 w-full rounded-xl bg-zinc-900 text-white disabled:opacity-40"
          onClick={() => onPick(text.trim())}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
