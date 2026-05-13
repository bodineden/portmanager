import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import { PendingButton } from "../components/pending-button";
import { formatDateTime, isNeonConfigured, listCurrencies, listExchangeRates } from "@/lib/assets-db";
import { saveExchangeRateAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ExchangeRatePage() {
  if (!isNeonConfigured()) {
    return <NeonSetupPage title="Exchange Rate" />;
  }

  const currencies = await listCurrencies();
  const exchangeRates = await listExchangeRates();

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <AppSidebar active="exchange-rate" />

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 lg:hidden">Portfolio Manager</p>
              <h1 className="text-2xl font-bold tracking-normal text-slate-950">Exchange Rate</h1>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <Link href="/" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
                Back to Home
              </Link>
              <span>Base currency: THB</span>
              <Link href="/exchange-rate" aria-label="Refresh exchange rates" title="Refresh exchange rates" className="text-lg font-semibold text-slate-700">R</Link>
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-950">Add / Update Rate</h2>
              <form action={saveExchangeRateAction}>
                <div className="grid gap-3">
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">From Currency</span>
                    <select name="fromCurrency" defaultValue="USD" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white">
                      {currencies.map((currency) => (
                        <option key={currency.code} value={currency.code}>{currency.code} - {currency.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">To Currency</span>
                    <select name="toCurrency" defaultValue="THB" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white">
                      {currencies.map((currency) => (
                        <option key={currency.code} value={currency.code}>{currency.code} - {currency.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Rate</span>
                    <input name="rate" placeholder="36.50" required inputMode="decimal" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                  </label>
                </div>
                <PendingButton className="mt-4 h-10 w-full rounded-md bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700" pendingLabel="Saving Rate">
                  Save Rate
                </PendingButton>
              </form>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-bold text-slate-950">Latest Rates</h2>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-200">{exchangeRates.length} pairs</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {["From", "To", "Rate", "Recorded At"].map((heading) => (
                        <th key={heading} className="border-b border-slate-200 px-4 py-3 font-bold">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {exchangeRates.map((exchangeRate) => (
                      <tr key={exchangeRate.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-bold text-slate-950">{exchangeRate.fromCurrency}</td>
                        <td className="px-4 py-3 text-slate-700">{exchangeRate.toCurrency}</td>
                        <td className="px-4 py-3 font-semibold text-slate-950">{exchangeRate.rate.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDateTime(exchangeRate.recordedAt)}</td>
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
