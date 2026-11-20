import Link from "next/link";
import { IconSearch } from "./icons";
import { btnClass } from "./ui";

/** S6 — /s/unknown, /edit/badtoken, any unknown route. */
export function NotFoundView() {
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-start gap-4 px-5 py-20">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sand text-muted">
        <IconSearch size={28} />
      </span>
      <h1 className="font-display text-[28px] font-bold leading-tight">This store doesn&apos;t exist (yet).</h1>
      <p className="text-muted">The link may be mistyped, or the store hasn&apos;t been published.</p>
      <Link href="/" className={btnClass("primary", "lg", "mt-2 w-full")}>
        Create your own store
      </Link>
    </div>
  );
}
