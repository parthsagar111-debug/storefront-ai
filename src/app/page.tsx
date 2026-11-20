import CreateForm from "./create-form";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[480px] flex-1 space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold leading-tight">Turn what you know into a store people buy from.</h1>
        <p className="text-zinc-600">A few quick answers. Your store in about a minute.</p>
      </header>
      <CreateForm />
    </main>
  );
}
