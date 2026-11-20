import Link from "next/link";

/** S6 — /s/unknown, /edit/badtoken, any unknown route. */
export function NotFoundView() {
  return (
    <div className="space-y-4 py-16 text-center">
      <h1 className="text-xl font-semibold">This store doesn&apos;t exist (yet).</h1>
      <Link href="/" className="block min-h-12 rounded-xl bg-zinc-900 py-3 text-white">
        Create your own store
      </Link>
    </div>
  );
}
