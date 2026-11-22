"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Chip, ChoiceChip, Segmented, Logo, btnClass, inputCls } from "@/components/ui";
import type { ReactNode } from "react";
import { IconArrowUpRight, IconAlert, IconChevronDown, IconChevronUp } from "@/components/icons";
import { parseInstagram, INSTAGRAM_HINT } from "@/lib/instagram";
import {
  listStores,
  saveStore,
  updateStore,
  removeStore,
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

// SPEC v5 V1: niche chips; audience and result chips depend on the niche (general audience chips if unknown).
type Niche = "cooking" | "fitness" | "stocks" | "upsc" | "astrology" | "canva";
const NICHES: [Niche, string, RegExp][] = [
  ["cooking", "Home cooking", /cook|recipe|kitchen|baking|food|khana/i],
  ["fitness", "Fitness for women", /fitness|workout|yoga|gym|exercise/i],
  ["stocks", "Stock market basics", /stock|share market|invest|trading|finance|mutual fund|\bsip\b/i],
  ["upsc", "UPSC prep", /upsc|ias\b|civil services/i],
  ["astrology", "Vedic astrology", /astrolog|jyotish|horoscope|kundli/i],
  ["canva", "Canva design", /canva|graphic design|design/i],
];
const AUDIENCE_CHIPS: Record<Niche | "general", string[]> = {
  cooking: ["Working professionals", "Students living alone", "New moms", "Beginners"],
  fitness: ["New moms", "Working women", "Beginners at home", "Women over 40"],
  stocks: ["College students", "Salaried beginners", "Small business owners"],
  upsc: ["First-time aspirants", "Working aspirants", "Mains repeaters"],
  astrology: ["Working women", "Couples", "Beginners curious about astrology"],
  canva: ["Small business owners", "Freelancers", "Students"],
  general: ["Working professionals", "College students", "Beginners", "Small business owners"],
};
const RESULT_CHIPS: Record<Niche, string[]> = {
  stocks: ["Start a first SIP", "Read a company's numbers", "Avoid common mistakes"],
  cooking: ["Cook in 20 minutes", "Plan a week of meals", "Eat healthier on a budget"],
  fitness: ["Get stronger at home", "Build a daily routine", "Recover after pregnancy safely"],
  upsc: ["Write better Mains answers", "Plan the syllabus", "Revise faster"],
  astrology: ["Read your own chart", "Understand your dasha", "Pick good dates"],
  canva: ["Make posts in 10 minutes", "Build a brand kit", "Design for clients"],
};
/** The niche from a tapped chip or typed text; null → general chips. */
const nicheOf = (expertise: string): Niche | null => NICHES.find(([, chip, re]) => expertise.trim() === chip || re.test(expertise))?.[0] ?? null;

type Field = "name" | "expertise" | "audience" | "outcome";

/** QA-02: field-level messages for client checks and API 400 `issues` paths. */
const FIELD_MESSAGES: Record<string, string> = {
  name: "Add your name (at least 2 letters).",
  expertise: "Add a few words about what you're good at.",
  audience: "Add a few words about who you help.",
  outcome: "Keep the result under 500 characters.",
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

/**
 * Next 16 keeps visited routes mounted (React Activity) and restores their state on navigation.
 * S1's mode and prefill come from the URL (?edit= / ?from=), so a push navigation must remount the
 * form; browser back/forward still restores it (bfcacheId changes only on push/replace).
 */
export default function CreateForm() {
  const { bfcacheId } = useRouter();
  return <CreateFormInner key={bfcacheId} />;
}

function CreateFormInner() {
  const router = useRouter();
  const [v, setV] = useState<Record<Field, string>>({ name: "", expertise: "", audience: "", outcome: "" });
  const [size, setSize] = useState<string>("");
  const [lang, setLang] = useState<"en" | "hinglish">("en");
  const [insta, setInsta] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<SavedStore | null>(null);
  const [noStorage, setNoStorage] = useState(false);
  const [onceLink, setOnceLink] = useState<string | null>(null);
  // T28: /?edit=<token> → same store, new answers → confirm → regenerate.
  const [editToken, setEditToken] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // A store still at the follow-up question has no draft yet: editing answers just re-runs the clarity check.
  const [editHasDraft, setEditHasDraft] = useState(true);

  // S2c "unclear" → back to S1 with the previous answers prefilled (/?from=<token>).
  // T28 "Edit answers" → /?edit=<token>: prefilled, and submitting regenerates that same store.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const edit = q.get("edit");
    const from = edit ?? q.get("from");
    if (!from) return;
    fetch(`/api/stores/${encodeURIComponent(from)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        const i = s?.input;
        if (!i) return;
        if (edit) {
          setEditToken(edit);
          setEditHasDraft(Boolean(s.draft));
        }
        setV({ name: i.name ?? "", expertise: i.expertise ?? "", audience: i.audience ?? "", outcome: i.outcome ?? "" });
        setSize(i.audienceSize ?? "");
        setLang(i.language ?? "en");
        if (i.instagramHandle) setInsta(i.instagramHandle);
        if (i.outcome) setMoreOpen(true);
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
      const resent = stores
        .filter((s) => !s.confirmed && s.input)
        .map(async (s) => {
          const r = await submitStore(s);
          if (r.ok) updateStore(s.token, { confirmed: true, slug: r.slug });
        });
      // "Continue your store" only for a store that still exists: check every remembered token in parallel
      // (short timeout); 404 → forget it on this device; a network failure → no banner rather than a dead link.
      void Promise.allSettled(resent).then(async () => {
        const saved = listStores();
        const checks = await Promise.all(
          saved.map(async (st) => {
            try {
              const res = await fetch(`/api/stores/${encodeURIComponent(st.token)}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
              if (res.status === 404) {
                removeStore(st.token);
                return null;
              }
              return res.ok ? st : null;
            } catch {
              return null;
            }
          }),
        );
        setRecent(checks.find((x): x is SavedStore => x !== null) ?? null);
      });
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // The result is optional (V1): only name, what they teach and who it's for are checked.
  const REQUIRED: Field[] = ["name", "expertise", "audience"];
  const valid = REQUIRED.every((k) => !tooThin(v[k])) && size !== "";

  async function submit() {
    if (!valid || busy) return;
    // QA-02: accept profile URLs / "@handle"; only block if it still isn't a handle.
    const handle = parseInstagram(insta);
    if (handle === null) {
      setFieldErr({ instagramHandle: FIELD_MESSAGES.instagramHandle });
      setTimeout(() => document.getElementById("f-insta")?.focus(), 0);
      return;
    }
    if (!navigator.onLine) {
      setError("You're offline. Reconnect to continue.");
      return;
    }
    if (editToken) {
      if (editHasDraft) setConfirmOpen(true); // T28: confirm before replacing the bio and products
      else regenerateWithNewAnswers();
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

  /** T28: regenerate the SAME store with the new answers (shared per-store limit; published page untouched). */
  async function regenerateWithNewAnswers() {
    if (!editToken) return;
    setConfirmOpen(false);
    setBusy(true);
    setError(null);
    setFieldErr({});
    const handle = parseInstagram(insta) || undefined;
    const input = { ...v, audienceSize: size, language: lang, instagramHandle: handle };
    let res: Response | null = null;
    try {
      res = await fetch(`/api/stores/${encodeURIComponent(editToken)}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
    } catch {
      res = null;
    }
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      updateStore(editToken, { name: v.name.trim() });
      router.push(`/edit/${editToken}`);
      return;
    }
    setBusy(false);
    const known = (res?.status === 400 && Array.isArray(body.issues) ? (body.issues as string[]) : []).map((p) => p.split(".")[0]).filter((f) => f in FIELD_MESSAGES);
    if (known.length) {
      setFieldErr(Object.fromEntries(known.map((f) => [f, FIELD_MESSAGES[f]])));
      document.getElementById(FIELD_INPUT_ID[known[0]])?.focus();
      return;
    }
    setError(
      !res
        ? "Couldn't reach the server. Your answers are still here, tap again."
        : res.status === 429
          ? "Too many regenerations for this store. Try again in a while."
          : body.message ?? "Couldn't regenerate your store. Please try again.",
    );
  }

  // QA-07: on blur, a touched field that the client check would block shows its message under the field.
  const blurCheck = (f: Field) => {
    if (f === "outcome") return; // optional
    if (v[f] !== "" || touched.has(f)) {
      if (tooThin(v[f])) setFieldErr((e) => ({ ...e, [f]: FIELD_MESSAGES[f] }));
    }
  };
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

  const niche = nicheOf(v.expertise);
  const pick = (k: Field, c: string) => {
    setV((cur) => ({ ...cur, [k]: c }));
    clearErr(k);
  };
  const fieldProps = (k: Field) => ({
    value: v[k],
    error: fieldErr[k],
    onChange: (val: string) => {
      setV((cur) => ({ ...cur, [k]: val }));
      setTouched((t) => new Set(t).add(k));
      clearErr(k);
    },
    onBlur: () => blurCheck(k),
  });

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
        {!editToken && recent && (
          <Link
            href={`/edit/${recent.token}`}
            className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-saffron-soft px-4 py-3 text-sm font-bold text-saffron-ink"
          >
            <span className="truncate">Continue your store · {recent.name}</span>
            <IconArrowUpRight size={16} className="shrink-0" />
          </Link>
        )}
        {editToken ? (
          <header className="space-y-2">
            <Link href={`/edit/${editToken}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-saffron underline underline-offset-4">
              ← Back to my store
            </Link>
            <h1 className="font-display text-[32px] font-bold leading-[1.1]">{editHasDraft ? "Start over / Edit answers" : "Edit your answers"}</h1>
            <p className="text-muted">Same store, same link. Your published page stays as it is until you publish again.</p>
          </header>
        ) : (
          <header className="space-y-2">
            <h1 className="font-display text-[32px] font-bold leading-[1.1]">Turn what you know into a store in minutes.</h1>
            <p className="text-muted">Tell us what you teach and who it&apos;s for. We&apos;ll suggest products and prices.</p>
          </header>
        )}
        {noStorage && (
          <p className="flex gap-2 rounded-xl bg-warn-bg p-3 text-sm text-warn-ink">
            <IconAlert size={18} className="shrink-0" />
            Your browser is blocking storage. Your edit link will only be shown once; copy it before leaving.
          </p>
        )}

        {/* V1 + Claude Design v5: the three sentence parts in one white card, heading-font labels. */}
        <div className="flex flex-col gap-5 rounded-[22px] border border-line bg-surface px-4 py-5">
          <TextField k="name" big label="I'm" placeholder="Your name" autoComplete="name" {...fieldProps("name")} />

          <TextField k="expertise" big label="I teach" placeholder="or type what you teach" {...fieldProps("expertise")}>
            <ChipRow chips={NICHES.map(([, c]) => c)} value={v.expertise} onPick={(c) => pick("expertise", c)} />
          </TextField>

          <TextField k="audience" big label="to" placeholder="or type who it's for" {...fieldProps("audience")}>
            {/* Chips follow the niche; tapping one fills the field, typed text is never overwritten by a niche change. */}
            <ChipRow chips={AUDIENCE_CHIPS[niche ?? "general"]} value={v.audience} onPick={(c) => pick("audience", c)} />
          </TextField>
        </div>

        <fieldset className="space-y-2">
          <legend className="pb-2 text-[15px] font-semibold">How many people follow you?</legend>
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

        {/* Instagram: always visible, below the follower chips and above Language (styled like the result field). */}
        <div className="space-y-2">
          <label htmlFor="f-insta" className="block text-sm font-semibold">
            Instagram handle <span className="font-normal text-muted">(optional)</span>
          </label>
          <div
            className={`flex min-h-12 overflow-hidden rounded-xl border-[1.5px] bg-surface focus-within:border-saffron ${fieldErr.instagramHandle ? "border-danger" : "border-line-input"}`}
          >
            <span className="flex items-center border-r border-line-input bg-[#F7F1E8] px-3 font-bold text-ink/80">@</span>
            <input
              id="f-insta"
              className="min-h-12 w-full px-3 text-base outline-none"
              value={insta.replace(/^@/, "")}
              autoCapitalize="none"
              autoCorrect="off"
              aria-invalid={Boolean(fieldErr.instagramHandle)}
              aria-describedby={fieldErr.instagramHandle ? "e-instagramHandle h-insta" : "h-insta"}
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
          <p id="h-insta" className="text-[13px] leading-snug text-muted">Shown as a link on your store. We don&apos;t read your profile.</p>
        </div>

        <div className="space-y-2">
          <span className="block text-[15px] font-semibold">Language</span>
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

        <div className={`border-y border-line ${moreOpen ? "pb-5" : ""}`}>
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="more-options"
            className="flex min-h-[52px] w-full items-center justify-between px-0.5 text-left text-[15px] font-semibold"
            onClick={() => setMoreOpen((o) => !o)}
          >
            <span>More options</span>
            {moreOpen ? <IconChevronUp size={20} /> : <IconChevronDown size={20} />}
          </button>
          {moreOpen && (
            <div id="more-options" className="space-y-[18px] pt-1">
              <TextField
                k="outcome"
                label="What will they be able to do after?"
                optional
                placeholder={niche ? `e.g. ${RESULT_CHIPS[niche][0][0].toLowerCase()}${RESULT_CHIPS[niche][0].slice(1)}` : "e.g. cook dinner in 20 minutes"}
                {...fieldProps("outcome")}
              >
                {niche && <ChipRow chips={RESULT_CHIPS[niche]} value={v.outcome} onPick={(c) => pick("outcome", c)} />}
              </TextField>
            </div>
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
          {editToken ? (busy ? "Starting…" : "Regenerate my store") : busy ? "Creating…" : "Create my store"}
        </button>
      </div>
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/80 p-5" role="dialog" aria-modal aria-label="Start over">
          <div className="w-full max-w-sm space-y-4 rounded-[24px] bg-surface p-5 shadow-[var(--shadow-menu)]">
            <p className="font-display text-2xl font-bold">Start over?</p>
            <p className="leading-relaxed text-ink/80">This replaces your bio and all products, including your edits. Your live page stays as it is until you publish again.</p>
            <div className="flex gap-2 pt-1">
              <button type="button" className={btnClass("secondary", "lg", "flex-1 text-base")} onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className={btnClass("primary", "lg", "flex-1 text-base")} onClick={regenerateWithNewAnswers}>
                Start over
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

/** One stacked full-width field (V1): sentence-style label, input, message, optional chips below. */
function TextField(props: {
  k: Field;
  label: string;
  placeholder?: string;
  autoComplete?: string;
  optional?: boolean;
  /** S1 sentence part: 26 px heading-font label, chips above the input, paper-coloured input. */
  big?: boolean;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  children?: ReactNode;
}) {
  const { k, error } = props;
  return (
    <div className={props.big ? "flex flex-col gap-2.5" : "space-y-2"}>
      <label htmlFor={`f-${k}`} className={props.big ? "block font-display text-[26px] font-bold leading-none" : "block text-sm font-semibold"}>
        {props.label}
        {props.optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {props.children}
      <input
        id={`f-${k}`}
        className={`${inputCls(Boolean(error))} ${props.big ? "min-h-[52px] rounded-[14px] border-[1.5px] text-[17px] [&:not([aria-invalid=true])]:bg-paper" : "min-h-12 border-[1.5px]"}`}
        value={props.value}
        placeholder={props.placeholder}
        maxLength={500}
        autoComplete={props.autoComplete}
        enterKeyHint="next"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `e-${k}` : undefined}
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={props.onBlur}
      />
      <FieldError id={`e-${k}`} msg={error} />
    </div>
  );
}

function ChipRow({ chips, value, onPick }: { chips: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <Chip key={c} selected={value === c} onClick={() => onPick(c)}>
          {c}
        </Chip>
      ))}
    </div>
  );
}
