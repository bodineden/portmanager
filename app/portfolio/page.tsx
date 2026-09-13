import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import MascotCompanion from "../mascot-companion";
import { deriveMascotState } from "@/lib/mascot";
import { readPortfolioSnapshotHistory } from "@/lib/pnl-history";
import {
  formatThb,
  formatUsd,
  getJoinedPortfolio,
} from "@/lib/live-data";
import { PortfolioChart } from "./portfolio-chart";
import "./portfolio.css";
import { valueAllocation } from "@/lib/pnl-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function shortDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatAsOf(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export default async function PortfolioPage() {
  const portfolio = await getJoinedPortfolio();
  const { snapshots, available: snapshotHistoryAvailable } = await readPortfolioSnapshotHistory();
  const mascot = deriveMascotState({ ...portfolio, snapshotHistoryAvailable }, new Date());

  const [stocks, crypto] = valueAllocation(portfolio);
  const liveDate = portfolio.asOf.slice(0, 10);
  const liveValueAvailable = portfolio.totals.grandTotalUsd !== null;
  const valueSourcesComplete = Object.entries(portfolio.sources).every(([key, source]) => key === "capital" || source.status === "live");

  return (
    <main className="workspace-shell portfolio-page">
      <AppSidebar active="portfolio" />
      <section className="workspace-main">
        <header className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">READ-ONLY ANALYTICS / LIVE PORTFOLIO</p>
            <h1 className="page-title">Portfolio Value</h1>
            <p className="page-subtitle">Live Stocks Port and Crypto Port value, with the recorded daily snapshots.</p>
          </div>
          <div className="header-tools">
            <span className={`header-status ${liveValueAvailable && valueSourcesComplete ? "" : "is-partial"}`}>
              <span className="status-light" aria-hidden="true" />
              {liveValueAvailable ? valueSourcesComplete ? "LIVE JOINED" : "LIVE JOINED · PARTIAL VALUE" : "LIVE VALUE UNAVAILABLE"} · {formatAsOf(portfolio.asOf)} UTC
            </span>
            <Link href="/" className="toolbar-link">P&L Center</Link>
          </div>
        </header>

        <div className="page-content portfolio-content">
          <section className="portfolio-kpi-grid" aria-label="Live portfolio summary">
            <article className={`portfolio-kpi-card live-edge ${liveValueAvailable ? "" : "unavailable-edge"}`}>
              <span className="metric-index">01 / LIVE JOINED</span>
              <span className="metric-label">Current Value</span>
              <strong className="metric-value">{formatUsd(portfolio.totals.grandTotalUsd)}</strong>
              <small>{formatThb(portfolio.totals.grandTotalThb)} · THB equivalent</small>
              {liveValueAvailable && !valueSourcesComplete && <small>Known priced subtotal; source coverage is incomplete.</small>}
            </article>
            <article className="portfolio-kpi-card">
              <span className="metric-index">02 / Stocks Port</span>
              <span className="metric-label">Current Value</span>
              <strong className="metric-value">{formatUsd(stocks.valueUsd)}</strong>
              <small>{formatThb(stocks.valueThb)}</small>
            </article>
            <article className="portfolio-kpi-card">
              <span className="metric-index">03 / Crypto Port</span>
              <span className="metric-label">Current Value</span>
              <strong className="metric-value">{formatUsd(crypto.valueUsd)}</strong>
              <small>{formatThb(crypto.valueThb)}</small>
            </article>
          </section>

          <PortfolioChart
            snapshots={snapshots}
            livePoint={{
              date: liveDate,
              asOf: portfolio.asOf,
              valueThb: portfolio.totals.grandTotalThb,
              valueUsd: portfolio.totals.grandTotalUsd,
            }}
          />

          <section className="panel portfolio-ledger">
            <div className="panel-header">
              <div>
                <p className="eyebrow">VALUATION LEDGER</p>
                <h2 className="panel-title">Snapshot Register</h2>
                <p className="panel-subtitle">Live values are USD first.</p>
              </div>
              <span className="panel-count">1 LIVE</span>
            </div>
            <div className="portfolio-table-scroll">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th>Series</th>
                    <th>Snapshot</th>
                    <th>Coverage</th>
                    <th className="numeric">Value (USD / THB)</th>
                    <th className="numeric">Within-series change</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="live-ledger-row">
                    <td><span className="series-badge is-live">LIVE JOINED</span></td>
                    <td>
                      <span className="ledger-date">{shortDate(liveDate)}</span>
                      <small>{formatAsOf(portfolio.asOf)} UTC</small>
                    </td>
                    <td><span className="coverage-primary">Stocks Port + Crypto Port</span><small>Current live snapshot</small></td>
                    <td className="numeric value-cell">{formatUsd(portfolio.totals.grandTotalUsd)}<small>{formatThb(portfolio.totals.grandTotalThb)}</small></td>
                    <td className="numeric muted">Not compared</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
      <MascotCompanion state={mascot} />
    </main>
  );
}
