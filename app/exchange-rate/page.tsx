import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import {
  getJoinedPortfolio,
  type LiveSourceState,
  type SourceStatus,
} from "@/lib/live-data";
import "./exchange-rate.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "—";

  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(timestamp)} UTC`;
}

function formatRate(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

function sourceLabel(status: SourceStatus) {
  if (status === "live") return "LIVE";
  if (status === "partial") return "PARTIAL";
  return "UNAVAILABLE";
}

function combinedStatus(states: LiveSourceState[]): SourceStatus {
  if (states.every((state) => state.status === "live")) return "live";
  if (states.every((state) => state.status === "unavailable")) return "unavailable";
  return "partial";
}

function SourceBadge({ state }: { state: LiveSourceState }) {
  return <span className={`fx-source-badge is-${state.status}`}>{sourceLabel(state.status)}</span>;
}

export default async function ExchangeRatePage() {
  const portfolio = await getJoinedPortfolio();
  const fiatState = portfolio.sources.fiatFx;
  const ethState = portfolio.sources.ethPrice;
  const fxState = combinedStatus([fiatState, ethState]);
  const fiatAsOf = portfolio.fx.asOf ?? fiatState.asOf;
  const rateRows: Array<{
    pair: string;
    from: string;
    to: string;
    value: number | null;
    note: string;
    provider: string;
    state: LiveSourceState;
    asOf: string | null;
  }> = [
    {
      pair: "USD → THB",
      from: "USD",
      to: "THB",
      value: portfolio.fx.usdToThb,
      note: "One US dollar in Thai baht",
      provider: "open.er-api.com / ECB",
      state: fiatState,
      asOf: fiatAsOf,
    },
    {
      pair: "GBP → THB",
      from: "GBP",
      to: "THB",
      value: portfolio.fx.gbpToThb,
      note: "One British pound in Thai baht",
      provider: "open.er-api.com / ECB",
      state: fiatState,
      asOf: fiatAsOf,
    },
    {
      pair: "EUR → THB",
      from: "EUR",
      to: "THB",
      value: portfolio.fx.eurToThb,
      note: "One euro in Thai baht",
      provider: "open.er-api.com / ECB",
      state: fiatState,
      asOf: fiatAsOf,
    },
    {
      pair: "ETH → USD",
      from: "ETH",
      to: "USD",
      value: portfolio.fx.ethToUsd,
      note: "One ether in US dollars",
      provider: "CoinGecko",
      state: ethState,
      asOf: ethState.asOf,
    },
  ];

  return (
    <main className="workspace-shell exchange-rate-page">
      <AppSidebar active="exchange-rate" />

      <section className="workspace-main">
        <header className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">LIVE PORTFOLIO / CONVERSION CORE</p>
            <h1 className="page-title">Exchange Rate</h1>
            <p className="page-subtitle">The exact fiat and ETH rates used by the joined live portfolio</p>
          </div>
          <div className="header-tools">
            <span className="header-meta">
              <span className={`fx-source-light is-${fxState}`} aria-hidden="true" />
              {fxState === "live" ? "LIVE RATE SET" : fxState === "partial" ? "PARTIAL RATE SET" : "RATES UNAVAILABLE"}
            </span>
            <Link href="/" className="toolbar-link">P&L Center</Link>
            <Link href="/exchange-rate" aria-label="Refresh live exchange rates" title="Refresh live exchange rates" className="refresh-link">R</Link>
          </div>
        </header>

        <div className="page-content exchange-rate-content">
          <section className="fx-hero" aria-labelledby="fx-hero-title">
            <div>
              <p className="eyebrow">USD PRIMARY / THB ALONGSIDE</p>
              <h2 id="fx-hero-title">Live conversion matrix</h2>
              <p>Live exchange rates keep the portfolio in USD, with THB alongside. Fiat crosses use the same snapshot; ETH is quoted directly in USD.</p>
            </div>
            <div className="fx-hero-readout">
              <span>DISPLAY CURRENCIES</span>
              <strong className="mono">USD <small>/ THB</small></strong>
              <small>Fiat as of <time dateTime={fiatAsOf ?? undefined}>{formatTimestamp(fiatAsOf)}</time></small>
            </div>
          </section>

          <section className="fx-rate-grid" aria-label="Current live rates">
            {rateRows.map((rate, index) => (
              <article className={`panel fx-rate-card${index === 0 ? " is-primary" : ""}`} key={rate.pair}>
                <div className="fx-rate-card-header">
                  <span className="fx-rate-index">0{index + 1}</span>
                  <SourceBadge state={rate.state} />
                </div>
                <div className="fx-rate-pair">
                  <span>{rate.from}</span>
                  <i aria-hidden="true">→</i>
                  <span>{rate.to}</span>
                </div>
                <strong className="numeric">{formatRate(rate.value)}</strong>
                <small>{rate.value === null ? "Live value unavailable" : `${rate.to} per 1 ${rate.from}`}</small>
              </article>
            ))}
          </section>

          <section className="panel fx-matrix-panel">
            <div className="panel-header fx-panel-header">
              <div>
                <p className="eyebrow">CURRENT MARKET INPUTS</p>
                <h2 className="panel-title">Core Rate Matrix</h2>
                <p className="panel-subtitle">Read-only rates from the same live snapshot used across the portfolio</p>
              </div>
              <span className="panel-count">04 CORE RATES</span>
            </div>
            <div className="fx-table-scroll">
              <table className="fx-rate-table">
                <caption className="sr-only">Live exchange rates used by the joined portfolio core</caption>
                <thead>
                  <tr>
                    <th scope="col">Market input</th>
                    <th scope="col">From</th>
                    <th scope="col">To</th>
                    <th scope="col" className="fx-cell-right">Live rate</th>
                    <th scope="col">Provider</th>
                    <th scope="col">State</th>
                    <th scope="col">As of (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {rateRows.map((rate) => (
                    <tr key={rate.pair}>
                      <td>
                        <strong className="fx-table-pair mono">{rate.pair}</strong>
                        <small>{rate.note}</small>
                      </td>
                      <td><span className="currency-badge">{rate.from}</span></td>
                      <td><span className="currency-badge fx-base-badge">{rate.to}</span></td>
                      <td className="fx-cell-right numeric fx-table-rate">{formatRate(rate.value)}</td>
                      <td className="fx-provider">{rate.provider}</td>
                      <td><SourceBadge state={rate.state} /></td>
                      <td><time className="fx-timestamp" dateTime={rate.asOf ?? undefined}>{formatTimestamp(rate.asOf)}</time></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="fx-matrix-footer">
              <span>READ-ONLY LIVE CORE</span>
              <p>Source availability and observation times accompany every rate.</p>
              <time dateTime={portfolio.asOf}>Snapshot assembled {formatTimestamp(portfolio.asOf)}</time>
            </div>
          </section>

          <section className="fx-source-grid" aria-label="Rate provider status">
            <article className="panel fx-source-panel">
              <div className="fx-source-panel-head">
                <div>
                  <p className="eyebrow">FIAT CONVERSION SOURCE</p>
                  <h2 className="panel-title">open.er-api.com / ECB</h2>
                </div>
                <SourceBadge state={fiatState} />
              </div>
              <p>{fiatState.message}</p>
              <dl>
                <div><dt>Endpoint base</dt><dd className="mono">USD</dd></div>
                <div><dt>Portfolio display</dt><dd className="mono">USD / THB</dd></div>
                <div><dt>Provider as of</dt><dd><time dateTime={fiatAsOf ?? undefined}>{formatTimestamp(fiatAsOf)}</time></dd></div>
              </dl>
            </article>

            <article className="panel fx-source-panel">
              <div className="fx-source-panel-head">
                <div>
                  <p className="eyebrow">DIGITAL ASSET SOURCE</p>
                  <h2 className="panel-title">CoinGecko ETH / USD</h2>
                </div>
                <SourceBadge state={ethState} />
              </div>
              <p>{ethState.message}</p>
              <dl>
                <div><dt>Asset</dt><dd className="mono">ETH</dd></div>
                <div><dt>Quote</dt><dd className="mono">USD</dd></div>
                <div><dt>Observed at</dt><dd><time dateTime={ethState.asOf ?? undefined}>{formatTimestamp(ethState.asOf)}</time></dd></div>
              </dl>
            </article>
          </section>

          <aside className="fx-method-note">
            <span>CONVERSION PATH</span>
            <p>Trading 212 values use snapshot fiat rates for USD and THB. NFT floors and native ETH convert into USD before the THB equivalent. If a required rate is unavailable, the dependent value remains <strong>—</strong>.</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
