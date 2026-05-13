import { WorkspaceLink } from "./components/workspace-link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-900/20">PM</div>
            <div>
              <p className="text-lg font-bold leading-tight text-slate-950">Portfolio Manager</p>
              <p className="text-sm text-slate-500">Operations workspace</p>
            </div>
          </div>
          <div className="hidden text-sm font-medium text-slate-500 sm:block">Admin User</div>
        </header>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-blue-600">Workspace</p>
            <h1 className="max-w-xl text-4xl font-bold tracking-normal text-slate-950 sm:text-5xl">Choose where to work</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Start with the asset registry, holder list, or exchange rates that feed THB performance values.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-950">Available Areas</h2>
            </div>
            <div className="p-4">
              <div className="grid gap-3">
                <WorkspaceLink
                  href="/asset-list"
                  icon="A"
                  iconClassName="grid h-14 w-14 place-items-center rounded-lg bg-blue-600 text-xl font-bold text-white shadow-sm shadow-blue-900/20"
                  title="Asset List"
                  description="Enter, remove, and update asset prices from the persisted asset registry."
                />

                <WorkspaceLink
                  href="/holder-list"
                  icon="H"
                  iconClassName="grid h-14 w-14 place-items-center rounded-lg bg-emerald-600 text-xl font-bold text-white shadow-sm shadow-emerald-900/20"
                  title="Holder List"
                  description="Manage investors and each holding's asset, shares, acquired cost, acquired date, and current value."
                />

                <WorkspaceLink
                  href="/exchange-rate"
                  icon="E"
                  iconClassName="grid h-14 w-14 place-items-center rounded-lg bg-slate-700 text-xl font-bold text-white shadow-sm shadow-slate-900/20"
                  title="Exchange Rate"
                  description="Maintain the latest FX rates used to convert holdings into the THB base currency."
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
