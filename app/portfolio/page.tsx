import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import { isNeonConfigured, listPortfolioValueSeries, type PortfolioValuePoint } from "@/lib/assets-db";
import {
  formatCurrency,
  formatEth,
  formatThb,
  formatUsd,
  getJoinedPortfolio,
} from "@/lib/live-data";
import { PortfolioChart } from "./portfolio-chart";
import "./portfolio.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LegacyHistory = {
  points: PortfolioValuePoint[];
  status: "available" | "not-configured" | "unavailable";
};

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

function formatLegacyChange(value: number | null) {
  if (value === null) return "Baseline";
  return `${value >= 0 ? "+" : "−"}${formatThb(Math.abs(value))}`;
}

async function loadLegacyHistory(): Promise<LegacyHistory> {
  if (!isNeonConfigured()) {
    return { points: [], status: "not-configured" };
  }

  try {
    return { points: await listPortfolioValueSeries(), status: "available" };
  } catch {
    return { points: [], status: "unavailable" };
  }
}

export default async function PortfolioPage() {
  const [portfolio, legacyHistory] = await Promise.all([
    getJoinedPortfolio(),
    loadLegacyHistory(),
  ]);

  const liveDate = portfolio.asOf.slice(0, 10);
  // The database helper includes today. Its retired holdings are not the joined
  // live portfolio, so keep only dates strictly before the live snapshot date.
  const legacyPoints = legacyHistory.points.filter((point) => point.date < liveDate);
  const legacyRows = legacyPoints
    .map((point, index) => ({
      ...point,
      change: index === 0 ? null : point.valueThb - legacyPoints[index - 1].valueThb,
    }))
    .reverse();
  const liveValueAvailable = portfolio.totals.grandTotalThb !== null;
  const legacyRange = legacyPoints.length > 0
    ? `${shortDate(legacyPoints[0].date)} → ${shortDate(legacyPoints.at(-1)!.date)}`
    : legacyHistory.status === "not-configured"
      ? "Neon is not configured"
      : legacyHistory.status === "unavailable"
        ? "Neon is temporarily unavailable"
        : "No pre-live records";

  return (
    <main className="workspace-shell portfolio-page">
      <AppSidebar active="portfolio" />
      <section className="workspace-main">
        <header className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">ANALYTICS / LIVE JOINED PORT</p>
            <h1 className="page-title">Portfolio Value</h1>
            <p className="page-subtitle">Current T212 + NFT valuation, with the retired Neon series retained as non-comparable context</p>
          </div>
          <div className="header-tools">
            <span className={`header-status ${liveValueAvailable ? "" : "is-partial"}`}>
              <span className="status-light" aria-hidden="true" />
              {liveValueAvailable ? "LIVE JOINED" : "LIVE SOURCES PARTIAL"} · {formatAsOf(portfolio.asOf)} UTC
            </span>
            <Link href="/" className="toolbar-link">Command Center</Link>
          </div>
        </header>

        <div className="page-content portfolio-content">
          <section className="portfolio-kpi-grid" aria-label="Live portfolio summary">
            <article className={`portfolio-kpi-card live-edge ${liveValueAvailable ? "" : "unavailable-edge"}`}>
              <span className="metric-index">01 / LIVE JOINED</span>
              <span className="metric-label">Current Value</span>
              <strong className="metric-value">{formatThb(portfolio.totals.grandTotalThb)}</strong>
              <small>{formatUsd(portfolio.totals.grandTotalUsd)} · THB headline</small>
            </article>
            <article className="portfolio-kpi-card">
              <span className="metric-index">02 / T212 LIVE</span>
              <span className="metric-label">Account Total</span>
              <strong className="metric-value">{formatThb(portfolio.totals.t212Thb)}</strong>
              <small>
                {formatCurrency(portfolio.t212.totalValue, portfolio.t212.currency)} · {portfolio.t212.investments.length.toLocaleString("en-US")} positions
              </small>
            </article>
            <article className="portfolio-kpi-card">
              <span className="metric-index">03 / NFT LIVE</span>
              <span className="metric-label">Wallet Floor Value</span>
              <strong className="metric-value">{formatThb(portfolio.totals.nftsThb)}</strong>
              <small>{formatEth(portfolio.totals.nftsEth)} · {formatUsd(portfolio.totals.nftsUsd)}</small>
            </article>
            <article className="portfolio-kpi-card legacy-edge">
              <span className="metric-index">04 / LEGACY CONTEXT</span>
              <span className="metric-label">Pre-live Records</span>
              <strong className="metric-value">{legacyPoints.length.toLocaleString("en-US")}</strong>
              <small>{legacyRange}</small>
            </article>
          </section>

          <PortfolioChart
            legacyPoints={legacyPoints}
            livePoint={{
              date: liveDate,
              asOf: portfolio.asOf,
              valueThb: portfolio.totals.grandTotalThb,
            }}
          />

          <section className="panel portfolio-ledger">
            <div className="panel-header">
              <div>
                <p className="eyebrow">VALUATION LEDGER / TWO ERAS</p>
                <h2 className="panel-title">Snapshot Register</h2>
                <p className="panel-subtitle">Live joined value is not compared with the retired holdings ledger.</p>
              </div>
              <span className="panel-count">1 LIVE · {legacyPoints.length} LEGACY</span>
            </div>
            <div className="portfolio-table-scroll">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th>Series</th>
                    <th>Snapshot</th>
                    <th>Coverage</th>
                    <th className="numeric">Value (THB)</th>
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
                    <td><span className="coverage-primary">T212 + NFT wallet</span><small>Current API snapshot</small></td>
                    <td className="numeric value-cell">{formatThb(portfolio.totals.grandTotalThb)}</td>
                    <td className="numeric muted">Not compared</td>
                  </tr>
                  {legacyRows.map((point) => (
                    <tr key={`legacy-${point.date}`}>
                      <td><span className="series-badge is-legacy">LEGACY</span></td>
                      <td><span className="ledger-date">{shortDate(point.date)}</span><small>{point.date}</small></td>
                      <td><span className="coverage-primary">Retired holdings ledger</span><small>{point.holdingCount.toLocaleString("en-US")} holdings</small></td>
                      <td className="numeric value-cell legacy-value">{formatThb(point.valueThb)}</td>
                      <td className={`numeric ${point.change === null ? "muted" : point.change >= 0 ? "positive" : "negative"}`}>
                        {formatLegacyChange(point.change)}
                      </td>
                    </tr>
                  ))}
                  {legacyPoints.length === 0 ? (
                    <tr className="legacy-empty-row">
                      <td><span className="series-badge is-legacy">LEGACY</span></td>
                      <td colSpan={4} className="portfolio-empty-cell">{legacyRange}. The live joined snapshot above remains available.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
