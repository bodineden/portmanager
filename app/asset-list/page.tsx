import Link from "next/link";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  getAssetMetrics,
  getDailyChangePercent,
  isNeonConfigured,
  listAssetChanges,
  listAssets,
  listQueuedAssets,
  type Asset,
} from "@/lib/assets-db";
import { removeAssetAction, saveAssetAction, updatePriceAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const navItems = [
  { label: "Dashboard", icon: "D" },
  { label: "Assets", icon: "A", active: true },
  { label: "Investors", icon: "I" },
  { label: "Holders", icon: "H" },
  { label: "Transactions", icon: "T" },
  { label: "Analytics", icon: "N" },
  { label: "Reports", icon: "R" },
  { label: "Settings", icon: "S" },
];

function StatusPill({ status }: { status: Asset["status"] }) {
  const color =
    status === "Synced"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "Review"
        ? "bg-orange-50 text-orange-700 ring-orange-200"
        : status === "Manual"
          ? "bg-blue-50 text-blue-700 ring-blue-200"
          : "bg-rose-50 text-rose-700 ring-rose-200";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function ActionButton({
  label,
  children,
  tone = "text-slate-500",
}: {
  label: string;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-sm font-bold shadow-sm transition hover:border-blue-200 hover:bg-blue-50 ${tone}`}
    >
      {children}
    </button>
  );
}

export default async function AssetListPage() {
  if (!isNeonConfigured()) {
    return <NeonSetupPage title="Asset List" />;
  }

  const assets = await listAssets();
  const queuedAssets = await listQueuedAssets();
  const changes = await listAssetChanges();
  const metrics = getAssetMetrics(assets);
  const pendingCount = queuedAssets.length;

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="hidden bg-[#061d3c] px-3 py-7 text-white shadow-2xl lg:flex lg:flex-col">
          <div className="mb-9 flex items-center gap-3 px-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-blue-600 text-xl font-bold shadow-lg shadow-blue-950/30">PM</div>
            <div className="text-xl font-bold leading-tight">
              Portfolio
              <br />
              Manager
            </div>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.active ? "/asset-list" : item.label === "Holders" ? "/holder-list" : "#"}
                className={`flex h-12 items-center gap-3 rounded-lg px-4 text-sm font-medium transition ${
                  item.active ? "bg-blue-600 text-white shadow-lg shadow-blue-950/25" : "text-blue-50 hover:bg-white/10"
                }`}
              >
                <span className="grid w-5 place-items-center text-lg">{item.icon}</span>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="mt-auto flex items-center gap-3 rounded-xl px-3 py-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-white/20 font-semibold">A</div>
            <span className="text-sm font-medium">Admin User</span>
            <span className="ml-auto text-lg">v</span>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 lg:hidden">Portfolio Manager</p>
              <h1 className="text-2xl font-bold tracking-normal text-slate-950">Asset List</h1>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <Link href="/" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
                Back to Home
              </Link>
              <span>Last updated from Neon</span>
              <a href="/asset-list" aria-label="Refresh prices" title="Refresh prices" className="text-lg font-semibold text-slate-700">R</a>
              <span className="h-6 w-px bg-slate-200" />
              <button aria-label="Open calendar" title="Open calendar" className="text-lg font-semibold text-slate-700">C</button>
              <button aria-label="Notifications" title="Notifications" className="relative text-lg text-slate-700">
                N
                {pendingCount > 0 ? (
                  <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[10px] font-bold text-white">{pendingCount}</span>
                ) : null}
              </button>
            </div>
          </header>

          <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-slate-500">{metric.label}</p>
                <p className="mt-2 text-2xl font-bold tracking-normal text-slate-950">{metric.value}</p>
                <p className={`mt-1 text-sm font-semibold ${metric.tone}`}>{metric.detail}</p>
              </div>
            ))}
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <h2 className="text-lg font-bold text-slate-950">Asset Registry</h2>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <label className="sr-only" htmlFor="asset-search">Search assets</label>
                    <input
                      id="asset-search"
                      placeholder="Search ticker or asset name"
                      className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white sm:w-64"
                    />
                    <select aria-label="Filter by type" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700">
                      <option>All types</option>
                      {[...new Set(assets.map((asset) => asset.type))].map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                    <select aria-label="Filter by status" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700">
                      <option>All statuses</option>
                      <option>Synced</option>
                      <option>Manual</option>
                      <option>Review</option>
                      <option>Stale</option>
                    </select>
                    <a href="#asset-form" className="grid h-10 place-items-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-900/20 transition hover:bg-blue-700">
                      + Add Asset
                    </a>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {["Ticker", "Asset Name", "Type", "Currency", "Latest Price", "Daily Change", "Last Price Update", "Status", "Actions"].map((heading) => (
                        <th key={heading} className="border-b border-slate-200 px-4 py-3 font-bold">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {assets.map((asset) => {
                      const dailyChange = getDailyChangePercent(asset);

                      return (
                        <tr key={asset.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-bold text-slate-950">{asset.ticker}</td>
                          <td className="px-4 py-3 text-slate-700">{asset.name}</td>
                          <td className="px-4 py-3 text-slate-600">{asset.type}</td>
                          <td className="px-4 py-3 text-slate-600">{asset.currency}</td>
                          <td className="px-4 py-3 font-semibold text-slate-950">{formatMoney(asset.latestPrice, asset.currency)}</td>
                          <td className={`px-4 py-3 font-semibold ${dailyChange < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                            {dailyChange >= 0 ? "+" : ""}
                            {dailyChange.toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatDateTime(asset.lastPriceUpdate)}</td>
                          <td className="px-4 py-3"><StatusPill status={asset.status} /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <form action={updatePriceAction} className="contents">
                                <input type="hidden" name="id" value={asset.id} />
                                <input type="hidden" name="latestPrice" value={asset.latestPrice} />
                                <ActionButton label={`Mark ${asset.ticker} synced`}>U</ActionButton>
                              </form>
                              <form action={removeAssetAction} className="contents">
                                <input type="hidden" name="id" value={asset.id} />
                                <input type="hidden" name="confirmRemove" value="yes" />
                                <ActionButton label={`Remove ${asset.ticker}`} tone="text-rose-500">x</ActionButton>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="grid gap-4">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-950">Price Update Queue</h2>
                  <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700 ring-1 ring-orange-200">{pendingCount} pending</span>
                </div>
                <div className="space-y-3">
                  {queuedAssets.map((asset) => (
                    <form key={asset.id} action={updatePriceAction} className="flex items-center gap-3 rounded-md border border-slate-200 p-3">
                      <input type="hidden" name="id" value={asset.id} />
                      <div className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-xs font-bold text-blue-700">{asset.ticker}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-950">{asset.name}</p>
                        <p className="text-xs text-slate-500">{asset.status} / {formatDateTime(asset.lastPriceUpdate)}</p>
                      </div>
                      <input
                        aria-label={`${asset.ticker} price`}
                        name="latestPrice"
                        defaultValue={asset.latestPrice.toFixed(2)}
                        className="h-9 w-24 rounded-md border border-slate-200 px-2 text-right text-sm font-semibold"
                      />
                      <button className="h-9 rounded-md bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700">Save</button>
                    </form>
                  ))}
                  {queuedAssets.length === 0 ? <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">All asset prices are synced.</p> : null}
                </div>
              </section>

              <section id="asset-form" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-bold text-slate-950">Add / Edit Asset</h2>
                <form action={saveAssetAction}>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Ticker</span>
                      <input name="ticker" placeholder="AAPL" required className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm uppercase outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                    <label className="sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Asset Name</span>
                      <input name="name" placeholder="Apple Inc." required className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Type</span>
                      <input name="type" placeholder="Stock" defaultValue="Stock" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Currency</span>
                      <input name="currency" placeholder="USD" defaultValue="USD" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm uppercase outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Price Source</span>
                      <input name="priceSource" placeholder="Manual" defaultValue="Manual" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Current Price</span>
                      <input name="latestPrice" placeholder="189.98" required inputMode="decimal" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Status</span>
                      <select name="status" defaultValue="Manual" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white">
                        <option>Manual</option>
                        <option>Synced</option>
                        <option>Review</option>
                        <option>Stale</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button className="h-10 flex-1 rounded-md bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700">Save Asset</button>
                    <a href="/asset-list" className="grid h-10 place-items-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</a>
                  </div>
                </form>
              </section>
            </aside>
          </div>

          <div className="mt-4">
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-bold text-slate-950">Recent Asset Changes</h2>
                <a href="#" className="text-sm font-semibold text-blue-600">View all</a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {["Date", "Ticker", "Change", "Detail", "User"].map((heading) => (
                        <th key={heading} className="border-b border-slate-200 px-4 py-3 font-bold">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {changes.map((change) => (
                      <tr key={change.id}>
                        <td className="px-4 py-3 text-slate-600">{formatDate(change.createdAt)}</td>
                        <td className="px-4 py-3 font-bold text-slate-950">{change.ticker}</td>
                        <td className="px-4 py-3 text-slate-700">{change.action}</td>
                        <td className="px-4 py-3 text-slate-600">{change.detail}</td>
                        <td className="px-4 py-3 text-slate-600">{change.user}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function NeonSetupPage({ title }: { title: string }) {
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-6 py-8 text-slate-950">
      <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link href="/" className="text-sm font-semibold text-blue-600">Back to Home</Link>
        <h1 className="mt-4 text-2xl font-bold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Neon is enabled in the code, but `DATABASE_URL` is not set yet. Add your Neon Postgres connection string to `.env.local`,
          then restart the dev server.
        </p>
      </section>
    </main>
  );
}
