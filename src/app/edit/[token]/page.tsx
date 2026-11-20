import { Suspense } from "react";
import Editor from "./editor";

export default function EditPage({ params }: PageProps<"/edit/[token]">) {
  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-6">
      <Suspense fallback={null}>
        <Editor params={params} />
      </Suspense>
    </main>
  );
}
