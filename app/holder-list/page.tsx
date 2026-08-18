import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import { PendingButton } from "../components/pending-button";
import {
  formatDate,
  formatMoney,
  getHoldingMetrics,
  isNeonConfigured,
  listAssets,
  listDeletedInvestors,
  listInvestorHoldings,
  listInvestors,
  type InvestorHolding,
} from "@/lib/assets-db";
import { recoverInvestorAction, removeHoldingAction, removeInvestorAction, saveHoldingAction, saveInvestorAction } from "./actions";
import { CsvExportButton } from "./csv-export-button";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function InvestorGroup({ name, holdings }: { name: string; holdings: InvestorHolding[] }) {
  const currentValue = holdings.reduce((sum, holding) => sum + holding.currentValueBase, 0);
  const acquiredCost = holdings.reduce((sum, holding) => sum + holding.acquiredCost, 0);
  const gainLoss = currentValue - acquiredCost;

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">{name}</h2>
          <p className="text-sm text-slate-500">{holdings.length} active holdings / base currency THB</p>
        </div>
        <div className="text-sm">
          <span className="font-semibold text-slate-950">{formatMoney(currentValue, "THB")}</span>
          <span className={`ml-3 font-semibold ${gainLoss >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {gainLoss >= 0 ? "+" : ""}
            {formatMoney(gainLoss, "THB")}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {["Asset", "Shares", "Current Price", "FX to THB", "Acquired Cost (THB)", "Acquired At", "Current Value (THB)", "Gain / Loss (THB)", "Actions"].map((heading) => (
                <th key={heading} className="border-b border-slate-200 px-4 py-3 font-bold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {holdings.map((holding) => (
              <tr key={holding.id} className="hover:bg-slate-50/80">
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-950">{holding.ticker}</p>
                  <p className="text-xs text-slate-500">{holding.assetName}</p>
                </td>
                <td className="px-4 py-3 font-semibold text-slate-950">{holding.shares.toLocaleString("en-US")}</td>
                <td className="px-4 py-3 text-slate-700">{formatMoney(holding.currentPrice, holding.currencyCode)}</td>
                <td className="px-4 py-3 text-slate-700">{holding.exchangeRateToBase.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                <td className="px-4 py-3 text-slate-700">{formatMoney(holding.acquiredCost, "THB")}</td>
                <td className="px-4 py-3 text-slate-600">{formatDateOnly(holding.acquiredAt)}</td>
                <td className="px-4 py-3 font-semibold text-slate-950">{formatMoney(holding.currentValueBase, "THB")}</td>
                <td className={`px-4 py-3 font-semibold ${holding.gainLoss >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {holding.gainLoss >= 0 ? "+" : ""}
                  {formatMoney(holding.gainLoss, "THB")}
                </td>
                <td className="px-4 py-3">
                  <form action={removeHoldingAction}>
                    <input type="hidden" name="id" value={holding.id} />
                    <PendingButton
                      aria-label={`Remove ${holding.ticker} from ${holding.investorName}`}
                      title={`Remove ${holding.ticker} from ${holding.investorName}`}
                      pendingLabel=""
                      className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-sm font-bold text-rose-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
                    >
                      x
                    </PendingButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDateOnly(value: string) {
  return formatDate(value);
}

export default async function HolderListPage() {
  if (!isNeonConfigured()) {
    return <NeonSetupPage title="Holder List" />;
  }

  const assets = await listAssets();
  const investors = await listInvestors();
  const deletedInvestors = await listDeletedInvestors();
  const holdings = await listInvestorHoldings();
  const metrics = getHoldingMetrics(investors, holdings);
  const holdingsByInvestor = investors.map((investor) => ({
    investor,
    holdings: holdings.filter((holding) => holding.investorId === investor.id),
  }));

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <AppSidebar active="holder-list" />

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 lg:hidden">Portfolio Manager</p>
              <h1 className="text-2xl font-bold tracking-normal text-slate-950">Holder List</h1>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <CsvExportButton holdings={holdings.map((holding) => ({ ticker: holding.ticker, name: holding.assetName, shares: holding.shares, currentPrice: holding.currentPrice, valueThb: holding.currentValueBase }))} />
              <Link href="/" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
                Back to Home
              </Link>
              <Link href="/exchange-rate" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
                Exchange Rate
              </Link>
              <span>Investor Holding Management</span>
              <Link href="/holder-list" aria-label="Refresh holders" title="Refresh holders" className="text-lg font-semibold text-slate-700">R</Link>
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
            <section className="space-y-4">
              {holdingsByInvestor.map(({ investor, holdings: investorHoldings }) => (
                <InvestorGroup key={investor.id} name={investor.name} holdings={investorHoldings} />
              ))}
            </section>

            <aside className="grid content-start gap-4">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-950">Investors</h2>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-200">{investors.length} active</span>
                </div>
                <div className="space-y-3">
                  {investors.map((investor) => (
                    <div key={investor.id} className="flex items-center gap-3 rounded-md border border-slate-200 p-3">
                      <div className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-xs font-bold text-blue-700">{investor.name.slice(0, 1)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-950">{investor.name}</p>
                        <p className="text-xs text-slate-500">Investor.id: {investor.id.slice(0, 8)}</p>
                      </div>
                      <form action={removeInvestorAction}>
                        <input type="hidden" name="id" value={investor.id} />
                        <PendingButton
                          aria-label={`Remove ${investor.name}`}
                          title={`Remove ${investor.name}`}
                          pendingLabel=""
                          className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-sm font-bold text-rose-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
                        >
                          x
                        </PendingButton>
                      </form>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-bold text-slate-950">Add / Edit Investor</h2>
                <form action={saveInvestorAction}>
                  <div className="grid gap-3">
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Investor Name</span>
                      <input name="name" placeholder="Alice Johnson" required className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                  </div>
                  <PendingButton className="mt-4 h-10 w-full rounded-md bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700" pendingLabel="Saving Investor">
                    Save Investor
                  </PendingButton>
                </form>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-bold text-slate-950">Add Asset to Holder</h2>
                <form action={saveHoldingAction}>
                  <div className="grid gap-3">
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Investor</span>
                      <select name="investorId" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white">
                        {investors.map((investor) => (
                          <option key={investor.id} value={investor.id}>{investor.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Asset</span>
                      <select name="assetId" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white">
                        {assets.map((asset) => (
                          <option key={asset.id} value={asset.id}>{asset.ticker} - {asset.fullName}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Shares</span>
                      <input name="shares" placeholder="100" required inputMode="decimal" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Acquired Cost (THB)</span>
                      <input name="acquiredCost" placeholder="25000" required inputMode="decimal" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Acquired At</span>
                      <input name="acquiredAt" type="date" required className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                  </div>
                  <PendingButton className="mt-4 h-10 w-full rounded-md bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700" pendingLabel="Saving Holding">
                    Save Holding
                  </PendingButton>
                </form>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-950">Deleted Investors</h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{deletedInvestors.length} recoverable</span>
                </div>
                <div className="space-y-3">
                  {deletedInvestors.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">No deleted investors to recover.</p>
                  ) : (
                    deletedInvestors.map((investor) => (
                      <div key={investor.id} className="flex items-center gap-3 rounded-md border border-slate-200 p-3">
                        <div className="grid h-10 w-10 place-items-center rounded-md bg-slate-100 text-xs font-bold text-slate-700">{investor.name.slice(0, 1)}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-950">{investor.name}</p>
                          <p className="text-xs text-slate-500">Deleted investor</p>
                        </div>
                        <form action={recoverInvestorAction}>
                          <input type="hidden" name="id" value={investor.id} />
                          <PendingButton className="h-9 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50" pendingLabel="Restoring">
                            Recover
                          </PendingButton>
                        </form>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </aside>
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
