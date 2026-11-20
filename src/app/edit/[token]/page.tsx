import { Suspense } from "react";
import Editor from "./editor";

export default function EditPage({ params }: PageProps<"/edit/[token]">) {
  return (
    <main className="w-full flex-1">
      <Suspense fallback={<p className="py-10 text-center text-sm text-muted">Loading your store…</p>}>
        <Editor params={params} />
      </Suspense>
    </main>
  );
}
