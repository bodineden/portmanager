import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import { formatMoney, formatSignedMoney, isNeonConfigured, listInvestorHoldings, listPortfolioValueSeries } from "@/lib/assets-db";
import { PortfolioChart } from "./portfolio-chart";
import "./portfolio.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function shortDate(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function PortfolioPage() {
  if (!isNeonConfigured()) {
    return (
      <main className="setup-canvas portfolio-page">
        <section className="setup-panel">
          <p className="eyebrow">CONFIGURATION REQUIRED</p>
          <h1>Portfolio Value</h1>
          <p>Neon is not configured yet. Add the database connection to the local environment, then restart the workspace.</p>
          <Link href="/" className="toolbar-link setup-link">Return to command center</Link>
        </section>
      </main>
    );
  }

  const points = await listPortfolioValueSeries();
  const holdings = await listInvestorHoldings();
  const invested = holdings.reduce((sum, holding) => sum + holding.acquiredCost, 0);
  const latest = points.length > 0 ? points[points.length - 1].valueThb : 0;
  const change = latest - invested;
  const changePct = invested !== 0 ? change / invested * 100 : 0;
  const peak = Math.max(...points.map((point) => point.valueThb), 0);

  return (
    <main className="workspace-shell portfolio-page">
      <AppSidebar active="portfolio" />
      <section className="workspace-main">
        <header className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">ANALYTICS / PORTFOLIO</p>
            <h1 className="page-title">Portfolio Value</h1>
            <p className="page-subtitle">Daily valuation series and long-range THB performance</p>
          </div>
          <div className="header-tools">
            <span className="header-meta">BASE CURRENCY / THB</span>
            <Link href="/" className="toolbar-link">Command Center</Link>
          </div>
        </header>

        <div className="page-content portfolio-content">
          <section className="portfolio-kpi-grid" aria-label="Portfolio summary">
            <article className="portfolio-kpi-card">
              <span className="metric-index">01 / VALUE</span>
              <span className="metric-label">Current Value</span>
              <strong className="metric-value">{formatMoney(latest, "THB")}</strong>
              <small>Latest tracked day</small>
            </article>
            <article className={`portfolio-kpi-card ${change >= 0 ? "gain-edge" : "loss-edge"}`}>
              <span className="metric-index">02 / RETURN</span>
              <span className="metric-label">Return vs. Invested</span>
              <strong className="metric-value">{formatSignedMoney(change, "THB")}</strong>
              <small className={change >= 0 ? "positive" : "negative"}>{changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%</small>
            </article>
            <article className="portfolio-kpi-card">
              <span className="metric-index">03 / HISTORY</span>
              <span className="metric-label">Days Tracked</span>
              <strong className="metric-value">{points.length.toLocaleString("en-US")}</strong>
              <small>{points.length > 0 ? `${shortDate(points[0].date)} → ${shortDate(points[points.length - 1].date)}` : "No history"}</small>
            </article>
            <article className="portfolio-kpi-card">
              <span className="metric-index">04 / PEAK</span>
              <span className="metric-label">Peak Value</span>
              <strong className="metric-value">{formatMoney(peak, "THB")}</strong>
              <small>All-time high</small>
            </article>
          </section>

          <PortfolioChart points={points} />

          <section className="panel portfolio-ledger">
            <div className="panel-header">
              <div><p className="eyebrow">VALUATION LEDGER</p><h2 className="panel-title">Daily Values</h2></div>
              <span className="panel-count">{points.length} RECORDS</span>
            </div>
            <div className="portfolio-table-scroll">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="numeric">Holdings</th>
                    <th className="numeric">Value (THB)</th>
                    <th className="numeric">Day Change</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point, index) => {
                    const previous = index > 0 ? points[index - 1].valueThb : point.valueThb;
                    const dailyChange = point.valueThb - previous;
                    return (
                      <tr key={point.date}>
                        <td><span className="ledger-date">{shortDate(point.date)}</span><small>{point.date}</small></td>
                        <td className="numeric muted">{point.holdingCount.toLocaleString("en-US")}</td>
                        <td className="numeric value-cell">{formatMoney(point.valueThb, "THB")}</td>
                        <td className={`numeric ${dailyChange >= 0 ? "positive" : "negative"}`}>{dailyChange >= 0 ? "+" : ""}{formatMoney(dailyChange, "THB")}</td>
                      </tr>
                    );
                  })}
                  {points.length === 0 ? <tr><td colSpan={4} className="portfolio-empty-cell">No portfolio history is available yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
