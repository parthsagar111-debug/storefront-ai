import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { NotFoundView } from "@/components/not-found-view";
import { db } from "@/lib/server/db";
import type { TStoreContent } from "@/lib/ai/schemas";
import PublicStore from "./public-store";

/** Only the PUBLISHED snapshot is ever read here (D10): draft edits can't reach this page. */
const getPublished = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  const { data } = await db()
    .from("stores")
    .select("slug, published")
    .eq("slug", slug)
    .not("published", "is", null)
    .maybeSingle<{ slug: string; published: TStoreContent }>();
  return data;
});

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const s = await getPublished(slug);
  if (!s) return { title: "Store not found · Storefront AI", robots: { index: false } };
  const c = s.published.creator;
  const title = `${c.displayName} · ${c.headline}`;
  return {
    title,
    description: c.bio,
    openGraph: { title, description: c.bio, type: "website", url: `/s/${s.slug}` },
    twitter: { card: "summary", title, description: c.bio },
  };
}

async function Store({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await getPublished(slug);
  if (!s) return <NotFoundView />;
  return <PublicStore slug={s.slug} content={s.published} />;
}

export default function PublicStorePage({ params }: PageProps<"/s/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-6">
      <Suspense fallback={<p className="py-10 text-center text-sm text-zinc-500">Loading…</p>}>
        <Store params={params} />
      </Suspense>
    </main>
  );
}
