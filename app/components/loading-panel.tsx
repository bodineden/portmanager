export function LoadingPanel({ label = "Loading workspace..." }: { label?: string }) {
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-6 py-8 text-slate-950">
      <section className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center">
        <div className="rounded-lg border border-slate-200 bg-white px-8 py-7 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          <p className="mt-4 text-sm font-semibold text-slate-700">{label}</p>
        </div>
      </section>
    </main>
  );
}
