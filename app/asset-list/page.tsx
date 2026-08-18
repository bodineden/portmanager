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
  listDeletedAssets,
  listInvestorHoldings,
  listPriceHistory,
} from "@/lib/assets-db";
import { recoverAssetAction, removeAssetAction, saveAssetAction, updatePriceAction } from "./actions";
import { AssetDashboard } from "./asset-dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AssetListPage() {
  if (!isNeonConfigured()) {
    return <NeonSetupPage title="Asset List" />;
  }

  const assets = await listAssets();
  const deletedAssets = await listDeletedAssets();
  const currencies = await listCurrencies();
  const priceHistory = await listPriceHistory();
  const holdings = await listInvestorHoldings();
  const metrics = getAssetMetrics(assets);
  const dashboardAssets = assets.map((asset) => ({
    id: asset.id,
    ticker: asset.ticker,
    fullName: asset.fullName,
    currencyCode: asset.currencyCode,
    currentPrice: asset.currentPrice,
    previousPrice: asset.previousPrice,
    valueThb: holdings.filter((holding) => holding.assetId === asset.id).reduce((sum, holding) => sum + holding.currentValueBase, 0),
    updatedAt: formatDate(asset.priceUpdatedAt),
  }));
  const totalValue = holdings.reduce((sum, holding) => sum + holding.currentValueBase, 0);
  const totalPreviousValue = holdings.reduce((sum, holding) => {
    const asset = assets.find((candidate) => candidate.id === holding.assetId);
    return sum + (asset && asset.currentPrice !== 0 ? holding.currentValueBase * asset.previousPrice / asset.currentPrice : holding.currentValueBase);
  }, 0);
  const totalChange = totalValue - totalPreviousValue;
  const totalChangePct = totalPreviousValue === 0 ? 0 : totalChange / totalPreviousValue * 100;
  const gainers = [...assets].filter((asset) => getDailyChangePercent(asset) >= 0).sort((a, b) => getDailyChangePercent(b) - getDailyChangePercent(a)).slice(0, 3);
  const losers = [...assets].filter((asset) => getDailyChangePercent(asset) < 0).sort((a, b) => getDailyChangePercent(a) - getDailyChangePercent(b)).slice(0, 3);

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

          <section className="mb-6 overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-lg sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-sm font-semibold text-blue-300">Portfolio value</p><p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{formatMoney(totalValue, "THB")}</p><p className="mt-2 text-sm text-slate-400">Across {holdings.length} holdings and {assets.length} tracked assets</p></div>
              <div className={`rounded-xl px-4 py-3 ${totalChange >= 0 ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}><p className="text-xs font-semibold uppercase tracking-wide">Daily change</p><p className="mt-1 text-xl font-bold">{totalChange >= 0 ? "+" : ""}{formatMoney(totalChange, "THB")} <span className="text-sm">({totalChangePct >= 0 ? "+" : ""}{totalChangePct.toFixed(2)}%)</span></p></div>
            </div>
          </section>

          <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-slate-500">{metric.label}</p>
                <p className="mt-2 text-2xl font-bold tracking-normal text-slate-950">{metric.value}</p>
                <p className={`mt-1 text-sm font-semibold ${metric.tone}`}>{metric.detail}</p>
              </div>
            ))}
          </section>

          <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <AssetDashboard assets={dashboardAssets} updatePriceAction={updatePriceAction} />
            <div className="grid content-start gap-4">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">Biggest movers</h2>
              <p className="mt-1 text-sm text-slate-500">Top daily gainers and losers</p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
                {[["Gainers", gainers], ["Losers", losers]].map(([label, items]) => (
                  <div key={label as string}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{label as string}</p>
                    <div className="space-y-2">
                      {(items as typeof assets).length === 0 ? <p className="text-sm text-slate-400">None today</p> : (items as typeof assets).map((asset) => {
                        const change = getDailyChangePercent(asset);
                        return <div key={asset.id} className="flex items-center justify-between"><p className="text-sm font-bold">{asset.ticker}</p><span className={`rounded-full px-2 py-1 text-xs font-bold ${change >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span></div>;
                      })}
                    </div>
                  </div>
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
            </div>
          </div>

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
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Ticker", "Full Name", "Currency", "Current Price", "Price Change", "Price Updated At", "Actions"].map((heading) => (
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
                        <td className="px-4 py-3 text-slate-600">{asset.currencyCode}</td>
                        <td className="px-4 py-3 font-semibold text-slate-950">{formatMoney(asset.currentPrice, asset.currencyCode)}</td>
                        <td className={`px-4 py-3 font-semibold ${dailyChange < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          {dailyChange >= 0 ? "+" : ""}
                          {dailyChange.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatDateTime(asset.priceUpdatedAt)}</td>
                        <td className="px-4 py-3">
                          <form action={removeAssetAction}>
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
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

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-950">Deleted Assets</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{deletedAssets.length} recoverable</span>
              </div>
              <div className="space-y-3">
                {deletedAssets.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">No deleted assets to recover.</p>
                ) : (
                  deletedAssets.map((asset) => (
                    <div key={asset.id} className="flex items-center gap-3 rounded-md border border-slate-200 p-3">
                      <div className="grid h-10 w-10 place-items-center rounded-md bg-slate-100 text-xs font-bold text-slate-700">{asset.ticker}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-950">{asset.fullName}</p>
                        <p className="text-xs text-slate-500">Deleted {asset.deletedAt ? formatDateTime(asset.deletedAt) : "recently"}</p>
                      </div>
                      <form action={recoverAssetAction}>
                        <input type="hidden" name="id" value={asset.id} />
                        <PendingButton className="h-9 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50" pendingLabel="Restoring">
                          Recover
                        </PendingButton>
                      </form>
                    </div>
                  ))
                )}
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
