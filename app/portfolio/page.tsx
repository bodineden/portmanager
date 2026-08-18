import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import { formatMoney, formatSignedMoney, isNeonConfigured, listPortfolioValueSeries } from "@/lib/assets-db";
import { PortfolioChart } from "./portfolio-chart";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function PortfolioPage() {
  if (!isNeonConfigured()) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-6 py-8 text-slate-950">
        <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <Link href="/" className="text-sm font-semibold text-blue-600">Back to Home</Link>
          <h1 className="mt-4 text-2xl font-bold">Portfolio Value</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Neon is not configured yet.</p>
        </section>
      </main>
    );
  }

  const points = await listPortfolioValueSeries();

  const latest = points.length > 0 ? points[points.length - 1].valueThb : 0;
  const first = points.length > 0 ? points[0].valueThb : 0;
  const change = latest - first;
  const changePct = first !== 0 ? (change / first) * 100 : 0;

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <AppSidebar active="portfolio" />

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 lg:hidden">Portfolio Manager</p>
              <h1 className="text-2xl font-bold tracking-normal text-slate-950">Portfolio Value</h1>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <Link href="/" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
                Back to Home
              </Link>
              <span>Base currency: THB</span>
            </div>
          </header>

          <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Current Value</p>
              <p className="mt-2 text-2xl font-bold tracking-normal text-slate-950">{formatMoney(latest, "THB")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">Latest tracked day</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Change vs. First Day</p>
              <p className="mt-2 text-2xl font-bold tracking-normal text-slate-950">{formatSignedMoney(change, "THB")}</p>
              <p className={`mt-1 text-sm font-semibold ${change >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Days Tracked</p>
              <p className="mt-2 text-2xl font-bold tracking-normal text-slate-950">{points.length}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {points.length > 0 ? `${shortDate(points[0].date)} → ${shortDate(points[points.length - 1].date)}` : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Peak Value</p>
              <p className="mt-2 text-2xl font-bold tracking-normal text-slate-950">
                {formatMoney(Math.max(...points.map((p) => p.valueThb), 0), "THB")}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500">All-time high</p>
            </div>
          </section>

          <PortfolioChart points={points} />

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-950">Daily Values</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Date", "Holdings", "Value (THB)", "Day Change"].map((heading) => (
                      <th key={heading} className="border-b border-slate-200 px-4 py-3 font-bold">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {points.map((p, i) => {
                    const prev = i > 0 ? points[i - 1].valueThb : p.valueThb;
                    const d = p.valueThb - prev;
                    return (
                      <tr key={p.date} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-semibold text-slate-950">{shortDate(p.date)}</td>
                        <td className="px-4 py-3 text-slate-600">{p.holdingCount}</td>
                        <td className="px-4 py-3 font-semibold text-slate-950">{formatMoney(p.valueThb, "THB")}</td>
                        <td className={`px-4 py-3 font-semibold ${d >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {d >= 0 ? "+" : ""}{formatMoney(d, "THB")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
