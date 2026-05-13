import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import { PendingButton } from "../components/pending-button";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  getAssetMetrics,
  getDailyChangePercent,
  isNeonConfigured,
  listAssets,
  listCurrencies,
  listPriceHistory,
} from "@/lib/assets-db";
import { removeAssetAction, saveAssetAction, updatePriceAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AssetListPage() {
  if (!isNeonConfigured()) {
    return <NeonSetupPage title="Asset List" />;
  }

  const assets = await listAssets();
  const currencies = await listCurrencies();
  const priceHistory = await listPriceHistory();
  const metrics = getAssetMetrics(assets);

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <AppSidebar active="asset-list" />

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
              <Link href="/asset-list" aria-label="Refresh prices" title="Refresh prices" className="text-lg font-semibold text-slate-700">R</Link>
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
                    <select aria-label="Filter by currency" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700">
                      <option>All currencies</option>
                      {currencies.map((currency) => (
                        <option key={currency.code}>{currency.code}</option>
                      ))}
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
                      {["Ticker", "Full Name", "Source Link", "Currency", "Current Price", "Price Change", "Price Updated At", "Actions"].map((heading) => (
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
                          <td className="px-4 py-3 text-slate-700">{asset.fullName}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {asset.sourceLink ? (
                              <a href={asset.sourceLink} target="_blank" rel="noreferrer" className="font-semibold text-blue-600">Open</a>
                            ) : (
                              <span className="text-slate-400">None</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{asset.currencyCode}</td>
                          <td className="px-4 py-3 font-semibold text-slate-950">{formatMoney(asset.currentPrice, asset.currencyCode)}</td>
                          <td className={`px-4 py-3 font-semibold ${dailyChange < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                            {dailyChange >= 0 ? "+" : ""}
                            {dailyChange.toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatDateTime(asset.priceUpdatedAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <form action={updatePriceAction} className="contents">
                                <input type="hidden" name="id" value={asset.id} />
                                <input type="hidden" name="currentPrice" value={asset.currentPrice} />
                                <PendingButton
                                  aria-label={`Mark ${asset.ticker} synced`}
                                  title={`Mark ${asset.ticker} synced`}
                                  pendingLabel=""
                                  className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-sm font-bold text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
                                >
                                  U
                                </PendingButton>
                              </form>
                              <form action={removeAssetAction} className="contents">
                                <input type="hidden" name="id" value={asset.id} />
                                <input type="hidden" name="confirmRemove" value="yes" />
                                <PendingButton
                                  aria-label={`Remove ${asset.ticker}`}
                                  title={`Remove ${asset.ticker}`}
                                  pendingLabel=""
                                  className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-sm font-bold text-rose-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
                                >
                                  x
                                </PendingButton>
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
                  <h2 className="text-lg font-bold text-slate-950">Update Current Price</h2>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-200">PriceHistory</span>
                </div>
                <div className="space-y-3">
                  {assets.map((asset) => (
                    <form key={asset.id} action={updatePriceAction} className="flex items-center gap-3 rounded-md border border-slate-200 p-3">
                      <input type="hidden" name="id" value={asset.id} />
                      <div className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-xs font-bold text-blue-700">{asset.ticker}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-950">{asset.fullName}</p>
                        <p className="text-xs text-slate-500">{asset.currencyCode} / {formatDateTime(asset.priceUpdatedAt)}</p>
                      </div>
                      <input
                        aria-label={`${asset.ticker} price`}
                        name="currentPrice"
                        defaultValue={asset.currentPrice.toFixed(2)}
                        className="h-9 w-24 rounded-md border border-slate-200 px-2 text-right text-sm font-semibold"
                      />
                      <PendingButton className="h-9 rounded-md bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700" pendingLabel="Saving">
                        Save
                      </PendingButton>
                    </form>
                  ))}
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
                      <input name="fullName" placeholder="Apple Inc." required className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Source Link</span>
                      <input name="sourceLink" placeholder="https://finance.yahoo.com/quote/AAPL" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Currency Code</span>
                      <select name="currencyCode" defaultValue="USD" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white">
                        {currencies.map((currency) => (
                          <option key={currency.code} value={currency.code}>{currency.code} - {currency.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Current Price</span>
                      <input name="currentPrice" placeholder="189.98" required inputMode="decimal" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <PendingButton className="h-10 flex-1 rounded-md bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700" pendingLabel="Saving Asset">
                      Save Asset
                    </PendingButton>
                    <Link href="/asset-list" className="grid h-10 place-items-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</Link>
                  </div>
                </form>
              </section>
            </aside>
          </div>

          <div className="mt-4">
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-bold text-slate-950">Price History</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {["Recorded At", "Ticker", "Price"].map((heading) => (
                        <th key={heading} className="border-b border-slate-200 px-4 py-3 font-bold">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {priceHistory.map((history) => (
                      <tr key={history.id}>
                        <td className="px-4 py-3 text-slate-600">{formatDate(history.recordedAt)}</td>
                        <td className="px-4 py-3 font-bold text-slate-950">{history.ticker}</td>
                        <td className="px-4 py-3 text-slate-700">{formatMoney(history.price)}</td>
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
