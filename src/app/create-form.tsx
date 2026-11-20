"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listStores,
  saveStore,
  updateStore,
  newToken,
  newClientRequestId,
  storageAvailable,
  submitStore,
  type SavedStore,
} from "@/lib/client/device";

const SIZES = [
  ["none", "No audience yet"],
  ["under_5k", "Under 5K"],
  ["5k_20k", "5K–20K"],
  ["20k_100k", "20K–100K"],
  ["100k_plus", "100K+"],
] as const;

const CHIPS = {
  expertise: ["Home cooking", "Fitness for women", "Stock market basics", "UPSC prep", "Vedic astrology", "Canva design"],
  audience: ["Working professionals", "College students", "New moms", "Small business owners"],
  outcome: ["Cook in 20 minutes", "Lose weight without a gym", "Crack the exam", "Start investing"],
};

type Field = "name" | "expertise" | "audience" | "outcome";

/** SPEC S1 client check: blocks only empty, < 2 chars, or one character repeated 5+ times. */
function tooThin(s: string) {
  const t = s.trim();
  const c = t.replace(/\s/g, "").toLowerCase();
  return t.length < 2 || (c.length >= 5 && new Set(c).size === 1);
}

export default function CreateForm() {
  const router = useRouter();
  const [v, setV] = useState<Record<Field, string>>({ name: "", expertise: "", audience: "", outcome: "" });
  const [size, setSize] = useState<string>("");
  const [lang, setLang] = useState<"en" | "hinglish">("en");
  const [insta, setInsta] = useState("");
  const [showInsta, setShowInsta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<SavedStore | null>(null);
  const [noStorage, setNoStorage] = useState(false);
  const [onceLink, setOnceLink] = useState<string | null>(null);

  // S2c "unclear" → back to S1 with the previous answers prefilled (/?from=<token>).
  useEffect(() => {
    const from = new URLSearchParams(location.search).get("from");
    if (!from) return;
    fetch(`/api/stores/${encodeURIComponent(from)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        const i = s?.input;
        if (!i) return;
        setV({ name: i.name ?? "", expertise: i.expertise ?? "", audience: i.audience ?? "", outcome: i.outcome ?? "" });
        setSize(i.audienceSize ?? "");
        setLang(i.language ?? "en");
        if (i.instagramHandle) {
          setInsta(i.instagramHandle);
          setShowInsta(true);
        }
      })
      .catch(() => {});
  }, []);

  // Read device storage after mount (it can be blocked; T22).
  useEffect(() => {
    const t = setTimeout(() => {
      const ok = storageAvailable();
      setNoStorage(!ok);
      if (!ok) return;
      const stores = listStores();
      // Lost-response recovery: re-send unconfirmed submissions with the same ids (idempotent on the server).
      stores
        .filter((s) => !s.confirmed && s.input)
        .forEach(async (s) => {
          const r = await submitStore(s);
          if (r.ok) updateStore(s.token, { confirmed: true, slug: r.slug });
        });
      setRecent(stores[0] ?? null);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const valid = (Object.keys(v) as Field[]).every((k) => !tooThin(v[k])) && size !== "";

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    // T27: Create always makes a NEW pair, saved before the request (T11).
    const s: SavedStore = {
      token: newToken(),
      clientRequestId: newClientRequestId(),
      name: v.name.trim(),
      createdAt: Date.now(),
      confirmed: false,
      input: { ...v, audienceSize: size, language: lang, instagramHandle: insta || undefined },
    };
    const saved = saveStore(s);
    const r = await submitStore(s);
    if (r.ok) {
      updateStore(s.token, { confirmed: true, slug: r.slug });
      if (!saved) {
        setOnceLink(`/edit/${s.token}`); // T22: storage blocked → show the edit link once
        setBusy(false);
        return;
      }
      router.push(`/edit/${s.token}`);
      return;
    }
    setBusy(false);
    setError(
      r.status === 429
        ? "Too many stores created, try again later."
        : r.status === 400
          ? "Please check your answers and try again."
          : "Couldn't reach the server. Your answers are saved, tap Create again.",
    );
  }

  const input = "w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base outline-none focus:border-zinc-900";
  const chip = "min-h-11 rounded-full border border-zinc-300 px-3 py-2 text-sm active:bg-zinc-100";
  const chipOn = "min-h-11 rounded-full border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm text-white";

  if (onceLink) {
    return (
      <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <p className="font-medium">Your store is being created.</p>
        <p className="text-sm">Your browser is blocking storage. Your edit link will only be shown once; copy it before leaving.</p>
        <p className="break-all rounded-lg bg-white p-2 font-mono text-sm">{location.origin + onceLink}</p>
        <a className="block rounded-xl bg-zinc-900 py-3 text-center text-white" href={onceLink}>
          Open my store
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {recent && (
        <a href={`/edit/${recent.token}`} className="block rounded-xl bg-zinc-100 px-4 py-3 text-sm font-medium">
          Continue your store ({recent.name}) →
        </a>
      )}
      {noStorage && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Your browser is blocking storage. Your edit link will only be shown once; copy it before leaving.
        </p>
      )}

      <label className="block space-y-2">
        <span className="font-medium">Your name</span>
        <input className={input} value={v.name} maxLength={500} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </label>

      {(
        [
          ["expertise", "What are you good at?"],
          ["audience", "Who do you help?"],
          ["outcome", "What do they get from you?"],
        ] as const
      ).map(([k, label]) => (
        <div key={k} className="space-y-2">
          <label className="block space-y-2">
            <span className="font-medium">{label}</span>
            <input className={input} value={v[k]} maxLength={500} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </label>
          <div className="flex flex-wrap gap-2">
            {CHIPS[k].map((c) => (
              <button key={c} type="button" className={chip} onClick={() => setV({ ...v, [k]: c })}>
                {c}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="space-y-2">
        <span className="font-medium">Audience size</span>
        <div className="flex flex-wrap gap-2">
          {SIZES.map(([k, label]) => (
            <button key={k} type="button" className={size === k ? chipOn : chip} onClick={() => setSize(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className="font-medium">Language</span>
        <div className="flex gap-2">
          {(
            [
              ["en", "English"],
              ["hinglish", "Hinglish"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={lang === k ? chipOn : chip} onClick={() => setLang(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {showInsta ? (
        <label className="block space-y-2">
          <span className="font-medium">Instagram handle (optional)</span>
          <input className={input} value={insta} placeholder="@yourhandle" onChange={(e) => setInsta(e.target.value)} />
        </label>
      ) : (
        <button type="button" className="min-h-11 text-sm text-zinc-600 underline" onClick={() => setShowInsta(true)}>
          + Add Instagram handle (optional)
        </button>
      )}

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <button
        type="button"
        disabled={!valid || busy}
        onClick={submit}
        className="min-h-12 w-full rounded-xl bg-zinc-900 py-3 text-base font-medium text-white disabled:opacity-40"
      >
        {busy ? "Creating…" : "Create my store"}
      </button>
    </div>
  );
}
