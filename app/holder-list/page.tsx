import Link from "next/link";
import {
  formatMoney,
  getHoldingMetrics,
  isNeonConfigured,
  listAssets,
  listInvestorHoldings,
  listInvestors,
  type InvestorHolding,
} from "@/lib/assets-db";
import { removeHoldingAction, removeInvestorAction, saveHoldingAction, saveInvestorAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const navItems = [
  { label: "Dashboard", icon: "D", href: "/" },
  { label: "Assets", icon: "A", href: "/asset-list" },
  { label: "Holders", icon: "H", href: "/holder-list", active: true },
  { label: "Transactions", icon: "T", href: "#" },
  { label: "Analytics", icon: "N", href: "#" },
  { label: "Reports", icon: "R", href: "#" },
  { label: "Settings", icon: "S", href: "#" },
];

function ActionButton({ label, children, tone = "text-slate-500" }: { label: string; children: React.ReactNode; tone?: string }) {
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

function InvestorGroup({ name, holdings }: { name: string; holdings: InvestorHolding[] }) {
  const currentValue = holdings.reduce((sum, holding) => sum + holding.currentValue, 0);
  const costBasis = holdings.reduce((sum, holding) => sum + holding.costBasis, 0);
  const gainLoss = currentValue - costBasis;

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">{name}</h2>
          <p className="text-sm text-slate-500">{holdings.length} active holdings</p>
        </div>
        <div className="text-sm">
          <span className="font-semibold text-slate-950">{formatMoney(currentValue)}</span>
          <span className={`ml-3 font-semibold ${gainLoss >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {gainLoss >= 0 ? "+" : ""}
            {formatMoney(gainLoss)}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {["Asset", "Type", "Shares / Units", "Current Price", "Cost Basis", "Current Value", "Gain / Loss", "Actions"].map((heading) => (
                <th key={heading} className="border-b border-slate-200 px-4 py-3 font-bold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {holdings.map((holding) => (
              <tr key={holding.id} className="hover:bg-slate-50/80">
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-950">{holding.assetTicker}</p>
                  <p className="text-xs text-slate-500">{holding.assetName}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{holding.assetType}</td>
                <td className="px-4 py-3 font-semibold text-slate-950">{holding.units.toLocaleString("en-US")}</td>
                <td className="px-4 py-3 text-slate-700">{formatMoney(holding.currentPrice, holding.currency)}</td>
                <td className="px-4 py-3 text-slate-700">{formatMoney(holding.costBasis, holding.currency)}</td>
                <td className="px-4 py-3 font-semibold text-slate-950">{formatMoney(holding.currentValue, holding.currency)}</td>
                <td className={`px-4 py-3 font-semibold ${holding.gainLoss >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {holding.gainLoss >= 0 ? "+" : ""}
                  {formatMoney(holding.gainLoss, holding.currency)}
                </td>
                <td className="px-4 py-3">
                  <form action={removeHoldingAction}>
                    <input type="hidden" name="id" value={holding.id} />
                    <ActionButton label={`Remove ${holding.assetTicker} from ${holding.investorName}`} tone="text-rose-500">x</ActionButton>
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

export default async function HolderListPage() {
  if (!isNeonConfigured()) {
    return <NeonSetupPage title="Holder List" />;
  }

  const assets = await listAssets();
  const investors = await listInvestors();
  const holdings = await listInvestorHoldings();
  const metrics = getHoldingMetrics(investors, holdings);
  const holdingsByInvestor = investors.map((investor) => ({
    investor,
    holdings: holdings.filter((holding) => holding.investorId === investor.id),
  }));

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
              <Link
                key={item.label}
                href={item.href}
                className={`flex h-12 items-center gap-3 rounded-lg px-4 text-sm font-medium transition ${
                  item.active ? "bg-blue-600 text-white shadow-lg shadow-blue-950/25" : "text-blue-50 hover:bg-white/10"
                }`}
              >
                <span className="grid w-5 place-items-center text-lg">{item.icon}</span>
                {item.label}
              </Link>
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
              <h1 className="text-2xl font-bold tracking-normal text-slate-950">Holder List</h1>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <Link href="/" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
                Back to Home
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
                        <p className="text-xs text-slate-500">{formatMoney(investor.capitalContributed)} contributed</p>
                      </div>
                      <form action={removeInvestorAction}>
                        <input type="hidden" name="id" value={investor.id} />
                        <ActionButton label={`Remove ${investor.name}`} tone="text-rose-500">x</ActionButton>
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
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Email</span>
                      <input name="email" placeholder="alice@example.com" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Capital Contributed</span>
                      <input name="capitalContributed" placeholder="100000" required inputMode="decimal" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                  </div>
                  <button className="mt-4 h-10 w-full rounded-md bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700">Save Investor</button>
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
                      <select name="assetTicker" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white">
                        {assets.map((asset) => (
                          <option key={asset.ticker} value={asset.ticker}>{asset.ticker} - {asset.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Shares / Units</span>
                      <input name="units" placeholder="100" required inputMode="decimal" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Cost Basis</span>
                      <input name="costBasis" placeholder="25000" required inputMode="decimal" className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white" />
                    </label>
                  </div>
                  <button className="mt-4 h-10 w-full rounded-md bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700">Save Holding</button>
                </form>
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
