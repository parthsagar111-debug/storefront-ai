"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Chip, ChoiceChip, Segmented, Logo, btnClass, inputCls } from "@/components/ui";
import { IconArrowUpRight, IconPlus, IconX, IconAlert } from "@/components/icons";
import { parseInstagram, INSTAGRAM_HINT } from "@/lib/instagram";
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

/** QA-02: field-level messages for client checks and API 400 `issues` paths. */
const FIELD_MESSAGES: Record<string, string> = {
  name: "Add your name (at least 2 letters).",
  expertise: "Add a few words about what you're good at.",
  audience: "Add a few words about who you help.",
  outcome: "Add a few words about what they get from you.",
  audienceSize: "Pick how many people follow you.",
  instagramHandle: INSTAGRAM_HINT,
};
const FIELD_INPUT_ID: Record<string, string> = {
  name: "f-name",
  expertise: "f-expertise",
  audience: "f-audience",
  outcome: "f-outcome",
  instagramHandle: "f-insta",
};

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return (
    <p id={id} className="flex items-center gap-1.5 text-sm font-semibold text-danger" role="alert">
      <IconAlert size={16} className="shrink-0" />
      {msg}
    </p>
  );
}

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
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
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
    // QA-02: accept profile URLs / "@handle"; only block if it still isn't a handle.
    const handle = parseInstagram(insta);
    if (handle === null) {
      setFieldErr({ instagramHandle: FIELD_MESSAGES.instagramHandle });
      document.getElementById("f-insta")?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setFieldErr({});
    // T27: Create always makes a NEW pair, saved before the request (T11).
    const s: SavedStore = {
      token: newToken(),
      clientRequestId: newClientRequestId(),
      name: v.name.trim(),
      createdAt: Date.now(),
      confirmed: false,
      input: { ...v, audienceSize: size, language: lang, instagramHandle: handle || undefined },
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
    // QA-02: map API field errors to their fields; the generic message only when no field is known.
    const known = (r.status === 400 ? r.issues ?? [] : []).map((path) => path.split(".")[0]).filter((f) => f in FIELD_MESSAGES);
    if (known.length) {
      setFieldErr(Object.fromEntries(known.map((f) => [f, FIELD_MESSAGES[f]])));
      document.getElementById(FIELD_INPUT_ID[known[0]])?.focus();
      return;
    }
    setError(
      r.status === 429
        ? "Too many stores created, try again later."
        : r.status === 400
          ? "Please check your answers and try again."
          : "Couldn't reach the server. Your answers are saved, tap Create again.",
    );
  }

  const label = "block text-sm font-bold";
  const clearErr = (f: string) => fieldErr[f] && setFieldErr(({ [f]: _gone, ...rest }) => (void _gone, rest));

  if (onceLink) {
    return (
      <div className="space-y-4 px-5 py-10">
        <Logo />
        <div className="space-y-3 rounded-2xl border border-warn-ink/20 bg-warn-bg p-4 text-warn-ink">
          <p className="font-bold">Your store is being created.</p>
          <p className="text-sm">Your browser is blocking storage. Your edit link will only be shown once; copy it before leaving.</p>
          <p className="break-all rounded-lg bg-surface p-3 font-mono text-sm text-ink">{location.origin + onceLink}</p>
          <a className={btnClass("primary", "md", "w-full")} href={onceLink}>
            Open my store
          </a>
        </div>
      </div>
    );
  }

  const fields = [
    ["expertise", "What are you good at?"],
    ["audience", "Who do you help?"],
    ["outcome", "What do they get from you?"],
  ] as const;

  return (
    <form
      className="flex min-h-dvh flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* scroll-margin keeps a focused field above the sticky Create button when the keyboard is open. */}
      <div className="flex-1 space-y-6 px-5 pb-6 pt-5 [&_input]:scroll-mb-32 [&_input]:scroll-mt-4">

        <Logo />
        {recent && (
          <Link
            href={`/edit/${recent.token}`}
            className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-saffron-soft px-4 py-3 text-sm font-bold text-saffron-ink"
          >
            <span className="truncate">Continue your store · {recent.name}</span>
            <IconArrowUpRight size={16} className="shrink-0" />
          </Link>
        )}
        <header className="space-y-2">
          <h1 className="font-display text-[32px] font-bold leading-[1.1]">Turn what you know into a store people buy from.</h1>
          <p className="text-muted">A few quick answers. Your store in about a minute.</p>
        </header>
        {noStorage && (
          <p className="flex gap-2 rounded-xl bg-warn-bg p-3 text-sm text-warn-ink">
            <IconAlert size={18} className="shrink-0" />
            Your browser is blocking storage. Your edit link will only be shown once; copy it before leaving.
          </p>
        )}

        <div className="space-y-2">
          <label htmlFor="f-name" className={label}>
            Your name
          </label>
          <input
            id="f-name"
            className={inputCls(Boolean(fieldErr.name))}
            value={v.name}
            maxLength={500}
            autoComplete="name"
            enterKeyHint="next"
            aria-invalid={Boolean(fieldErr.name)}
            aria-describedby={fieldErr.name ? "e-name" : undefined}
            onChange={(e) => {
              setV({ ...v, name: e.target.value });
              clearErr("name");
            }}
          />
          <FieldError id="e-name" msg={fieldErr.name} />
        </div>

        {fields.map(([k, text]) => (
          <div key={k} className="space-y-2">
            <label htmlFor={`f-${k}`} className={label}>
              {text}
            </label>
            <input
              id={`f-${k}`}
              className={inputCls(Boolean(fieldErr[k]))}
              value={v[k]}
              maxLength={500}
              enterKeyHint="next"
              aria-invalid={Boolean(fieldErr[k])}
              aria-describedby={fieldErr[k] ? `e-${k}` : undefined}
              onChange={(e) => {
                setV({ ...v, [k]: e.target.value });
                clearErr(k);
              }}
            />
            <FieldError id={`e-${k}`} msg={fieldErr[k]} />
            <div className="flex flex-wrap gap-2">
              {CHIPS[k].map((c) => (
                <Chip
                  key={c}
                  selected={v[k] === c}
                  onClick={() => {
                    setV({ ...v, [k]: c });
                    clearErr(k);
                  }}
                >
                  {c}
                </Chip>
              ))}
            </div>
          </div>
        ))}

        <fieldset className="space-y-2">
          <legend className={`${label} pb-2`}>How many people follow you?</legend>
          <div className="flex flex-wrap gap-2">
            {SIZES.map(([k, text]) => (
              <ChoiceChip
                key={k}
                selected={size === k}
                onClick={() => {
                  setSize(k);
                  clearErr("audienceSize");
                }}
              >
                {text}
              </ChoiceChip>
            ))}
          </div>
          <FieldError id="e-audienceSize" msg={fieldErr.audienceSize} />
        </fieldset>

        <div className="space-y-2">
          <span className={label}>Store language</span>
          <Segmented
            label="Store language"
            value={lang}
            onChange={setLang}
            options={[
              ["en", "English"],
              ["hinglish", "Hinglish"],
            ]}
          />
        </div>

        <div className="border-t border-line pt-2">
          {showInsta ? (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <label htmlFor="f-insta" className={label}>
                  Instagram handle <span className="font-medium text-muted">(optional)</span>
                </label>
                <button
                  type="button"
                  aria-label="Remove Instagram handle"
                  className="flex min-h-11 min-w-11 items-center justify-center text-muted"
                  onClick={() => {
                    setInsta("");
                    setShowInsta(false);
                  }}
                >
                  <IconX size={18} />
                </button>
              </div>
              <div
                className={`flex overflow-hidden rounded-xl border bg-surface focus-within:border-saffron ${fieldErr.instagramHandle ? "border-danger" : "border-line-input"}`}
              >
                <span className="flex items-center bg-sand px-3 text-muted">@</span>
                <input
                  id="f-insta"
                  className="min-h-12 w-full px-3 text-base outline-none"
                  value={insta.replace(/^@/, "")}
                  autoCapitalize="none"
                  autoCorrect="off"
                  aria-invalid={Boolean(fieldErr.instagramHandle)}
                  aria-describedby={fieldErr.instagramHandle ? "e-instagramHandle" : undefined}
                  onChange={(e) => {
                    setInsta(e.target.value);
                    clearErr("instagramHandle");
                  }}
                  onBlur={() => {
                    // A pasted profile URL becomes the handle the creator will see on the store.
                    const h = parseInstagram(insta);
                    if (h) setInsta(h);
                  }}
                />
              </div>
              <FieldError id="e-instagramHandle" msg={fieldErr.instagramHandle} />
              <p className="text-xs text-muted">Shown as a link on your store. We never read your profile.</p>
            </div>
          ) : (
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-between text-left font-bold"
              onClick={() => setShowInsta(true)}
            >
              <span>
                Instagram handle <span className="font-medium text-muted">(optional)</span>
              </span>
              <IconPlus size={20} />
            </button>
          )}
        </div>

        {error && (
          <p className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-danger" role="alert">
            <IconAlert size={18} className="shrink-0" />
            {error}
          </p>
        )}
      </div>

      {/* Sticky CTA: stays reachable above the keyboard at 360 px (viewport uses interactive-widget=resizes-content). */}
      <div className="sticky bottom-0 z-10 bg-gradient-to-t from-paper via-paper/95 to-paper/0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <button type="submit" disabled={!valid || busy} className={btnClass("primary", "lg", "w-full")}>
          {busy ? "Creating…" : "Create my store"}
        </button>
      </div>
    </form>
  );
}
