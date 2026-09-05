import Link from "next/link";
import { AppSidebar } from "./components/app-sidebar";
import { WalletBalancesPanel } from "./home-wallet-panel";
import { PnlPerformance, PnlCalendar } from "./pnl-history-panels";
import { PnlAssetTable } from "./pnl-asset-table";
import { formatCurrency, formatThb, formatUsd, getJoinedPortfolio, type LiveSourceState } from "@/lib/live-data";
import { listPortfolioSnapshots } from "@/lib/pnl-history";
import { coverageLabel, dailyChange, formatPnlPercent, formatSnapshotAsOf, formatHoldingQuantity, snapshotFiatUsd, valueAllocation } from "@/lib/pnl-view";
import { requireSession } from "@/lib/auth";
import "./home.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function SourceBadge({ state }: { state: LiveSourceState }) {
  return <span className={`live-source-badge is-${state.status}`} title={state.message}><i aria-hidden="true" />{state.status}</span>;
}

export default async function Home() {
  const [email, portfolio] = await Promise.all([requireSession(), getJoinedPortfolio()]);
  // Read after the joined boundary has finished its existing daily recorder.
  const history = await listPortfolioSnapshots();
  const { t212, wallet, fx, totals, sources } = portfolio;
  const coverage = totals.pnlCoverage;
  const hasRecordedPnl = coverage.eligible > 0 && totals.pnlUsd !== null;
  const pnlState = !hasRecordedPnl ? "none" : coverage.status;
  const change = dailyChange(history, portfolio.asOf);
  const classes = valueAllocation(portfolio);
  const walletTokens = [...wallet.tokens].sort((left, right) => Number(right.priced) - Number(left.priced));
  const nativeRows = [...wallet.native].sort((left, right) => Number(right.valueUsd !== null) - Number(left.valueUsd !== null)).map((holding) => ({
    id: `${holding.chainId}:native`, symbol: holding.symbol, chainName: holding.chainName, chainId: holding.chainId,
    amount: formatHoldingQuantity(holding.amount, 18), priceUsd: formatUsd(fx.ethToUsd), valueUsd: holding.valueUsd,
    valueUsdText: formatUsd(holding.valueUsd), valueThb: formatThb(holding.valueThb),
  }));
  const tokenRows = walletTokens.map((holding) => ({
    id: `${holding.chainId}:${holding.contract?.toLowerCase() ?? holding.symbol}`, symbol: holding.symbol,
    name: holding.name, contract: holding.contract, chainName: holding.chainName, chainId: holding.chainId,
    amount: formatHoldingQuantity(holding.amount, 18), priceUsd: formatUsd(holding.priceUsd), valueUsd: holding.valueUsd,
    valueUsdText: formatUsd(holding.valueUsd), valueThb: formatThb(holding.valueThb), priced: holding.priced,
  }));
  const sourceNames: Record<keyof typeof sources, string> = {
    t212Summary: "T212 account", t212Positions: "T212 positions", nfts: "OpenSea NFTs", fiatFx: "Fiat FX",
    ethPrice: "ETH price", walletNative: "Wallet native", walletTokens: "Wallet tokens",
  };

  return (
    <main className="workspace-shell home-shell">
      <AppSidebar active="home" email={email ?? undefined} />
      <section className="workspace-main">
        <header className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">YOUR PORTFOLIO / AT A GLANCE</p>
            <h1 className="page-title">Portfolio overview</h1>
            <p className="page-subtitle">A clear view of value, recorded P&amp;L and the evidence behind it.</p>
          </div>
          <div className="header-status"><span className="status-light" aria-hidden="true" />USD primary · THB secondary</div>
        </header>
        <div className="page-content home-content">
          <section className="panel pnl-value-hero" aria-label="Joined live portfolio summary">
            <div className="pnl-hero-top">
              <div>
                <p className="eyebrow">LIVE JOINED PORTFOLIO</p><h2>Portfolio value</h2>
                <strong className="pnl-hero-value" data-value-currency="USD">{formatUsd(totals.grandTotalUsd)}</strong>
                <p className="pnl-secondary">{formatThb(totals.grandTotalThb)} <span>THB</span></p>
              </div>
              <div className="pnl-hero-asof">
                <span className={`pnl-status ${!coverage.sourcesComplete ? "is-partial" : ""}`}>{totals.grandTotalUsd === null ? "Value unavailable" : !coverage.sourcesComplete ? "Partial joined value" : "Joined snapshot"}</span>
                <small>As of {formatSnapshotAsOf(portfolio.asOf)}</small>
                <p>{totals.grandTotalUsd === null ? "One or more sources are unavailable. Known class values remain visible below." : !coverage.sourcesComplete ? "Known value is shown; source coverage is incomplete. See source status below." : "Account cash, securities, NFT floors and priced wallet balances."}</p>
              </div>
            </div>
            <div className="pnl-class-values">
              {classes.map((item) => <div key={item.key} data-value-class={item.key}>
                <span className={`pnl-class-dot is-${item.key}`} aria-hidden="true" /><small>{item.label}</small>
                <strong>{formatUsd(item.valueUsd)}</strong><span>{formatThb(item.valueThb)}</span>
              </div>)}
            </div>
            <div className="pnl-hero-foot"><span data-wallet-summary-count={nativeRows.length + tokenRows.length}>{nativeRows.length + tokenRows.length} wallet assets</span><span>Cash contributes to value only; it has no P&amp;L.</span></div>
          </section>
          <section className="pnl-metric-strip" aria-label="P&L and coverage">
            <article className="panel pnl-metric pnl-summary" data-pnl-summary data-pnl-state={pnlState}>
              <p className="eyebrow">COST BASIS / UNREALIZED</p><h2>P&amp;L (recorded)</h2>
              <div className="pnl-metric-line"><strong className={hasRecordedPnl ? (totals.pnlUsd! >= 0 ? "positive" : "negative") : ""}>{formatUsd(hasRecordedPnl ? totals.pnlUsd : null)}</strong><span>{formatPnlPercent(hasRecordedPnl ? totals.pnlPct : null)}</span></div>
              <small>{formatThb(hasRecordedPnl ? totals.pnlThb : null)} THB</small>
              <p className="pnl-state-copy">{coverageLabel(coverage)}</p>
              <p>Basis {formatUsd(hasRecordedPnl ? totals.costBasisUsd : null)} <span className="muted">· {formatThb(hasRecordedPnl ? totals.costBasisThb : null)}</span></p>
            </article>
            <article className="panel pnl-metric" data-daily-change={change ? "available" : "unavailable"}>
              <p className="eyebrow">SNAPSHOT VALUE / DAY TO DAY</p><h2>Daily change</h2>
              <div className="pnl-metric-line"><strong className={change ? (change.usd >= 0 ? "positive" : "negative") : ""}>{formatUsd(change?.usd)}</strong><span>{formatPnlPercent(change?.pct)}</span></div>
              <small>{formatThb(change?.thb)} THB</small>
              <p>{change ? `${change.previousDate} → ${change.date} · first daily observations.` : "Awaiting comparable snapshots on adjacent days."}</p>
              <p className="muted">Value change includes cash flows. It is not investment return.</p>
            </article>
            <article className="panel pnl-metric pnl-coverage" data-pnl-coverage={coverage.status}>
              <p className="eyebrow">WHAT CAN BE MEASURED</p><h2>P&amp;L coverage</h2>
              <div className="pnl-metric-line"><strong>{coverage.eligible}<span> / {coverage.totalHoldings}</span></strong><span className={`pnl-status is-${coverage.status}`}>{coverage.status}</span></div>
              <p>Holdings eligible for P&amp;L · NFT collections count as one holding each.</p>
              <div className="pnl-coverage-buckets"><span>{coverage.notRecorded} basis not recorded</span><span>{coverage.dust} dust</span><span>{coverage.unpriced} unpriced</span><span>{coverage.unreconciled} unreconciled</span></div>
              {!coverage.sourcesComplete && <small>Source coverage is incomplete.</small>}
            </article>
          </section>
          <div className="pnl-analysis-grid">
            <PnlPerformance snapshots={history} asOf={portfolio.asOf} />
            <section className="panel pnl-allocation">
              <div className="panel-header"><div><p className="eyebrow">CURRENT VALUE MIX</p><h2 className="panel-title">Allocation by class</h2></div></div>
              <div className="pnl-allocation-list">{classes.map((item) => <div className="pnl-allocation-item" key={item.key}>
                <div><span><i className={`pnl-class-dot is-${item.key}`} />{item.label}</span><strong>{formatUsd(item.valueUsd)}</strong></div>
                <div className="pnl-allocation-track"><span className={`is-${item.key}`} style={{ width: item.sharePct === null ? "0%" : `${item.sharePct}%` }} /></div>
                <small>{item.sharePct === null ? "Share unavailable" : `${formatHoldingQuantity(item.sharePct, 1)}% of class value`} · {formatThb(item.valueThb)}</small>
                <small className="pnl-class-pnl">P&amp;L (recorded): {formatUsd(totals.pnlByClass[item.key].pnlCoverage.eligible > 0 ? totals.pnlByClass[item.key].pnlUsd : null)} · {totals.pnlByClass[item.key].pnlCoverage.eligible} eligible</small>
              </div>)}</div>
              <p className="pnl-panel-note">Allocation measures value. Unpriced assets have no inferred weight; percentages wait for all class values.</p>
            </section>
          </div>
          <PnlCalendar snapshots={history} asOf={portfolio.asOf} />
          <PnlAssetTable portfolio={portfolio} />
          <section className="panel pnl-account-context">
            <div><p className="eyebrow">TRADING 212 / CASH &amp; POSITIONS</p><h2 className="panel-title">Account context</h2></div>
            <div><small>Cash available · no P&amp;L</small><strong>{formatUsd(snapshotFiatUsd(t212.cashAvailable, t212.currency, fx))}</strong><span>{formatCurrency(t212.cashAvailable, t212.currency)} · account currency</span></div>
            <div><small>Open positions</small><strong>{sources.t212Positions.status === "unavailable" ? "—" : t212.investments.length}</strong><span>{sources.t212Positions.status === "unavailable" ? "Trading 212 positions unavailable" : t212.investments.length === 0 ? "No positions yet" : "Included in per-asset P&L"}</span></div>
            {sources.t212Summary.status === "unavailable" && <p>Trading 212 account summary unavailable. Cash and account totals remain blank.</p>}
          </section>
          <WalletBalancesPanel nativeRows={nativeRows} tokenRows={tokenRows} nativeSource={sources.walletNative} tokenSource={sources.walletTokens}
            walletSourcesComplete={sources.walletNative.status === "live" && sources.walletTokens.status === "live"}
            walletSourcesUnavailable={sources.walletNative.status === "unavailable" && sources.walletTokens.status === "unavailable"}
            totalWalletUsd={formatUsd(totals.walletUsd)} totalWalletThb={formatThb(totals.walletThb)} />
          <section className="panel pnl-source-strip" aria-label="Portfolio sources">
            <div className="panel-header"><div><p className="eyebrow">EVERY FIGURE HAS A SOURCE</p><h2 className="panel-title">Source status</h2></div><span className="panel-count">7 sources</span></div>
            <div className="pnl-source-grid">{(Object.keys(sources) as (keyof typeof sources)[]).map((key) => <article key={key} data-source-key={key}>
              <div><strong>{sourceNames[key]}</strong><SourceBadge state={sources[key]} /></div><small>{formatSnapshotAsOf(sources[key].asOf)}</small><p>{sources[key].message}</p>
            </article>)}</div>
          </section>
          <footer className="home-footnote"><p>USD is the primary view. THB uses this snapshot’s FX. NFT values use collection floors, not sale proceeds.</p><Link href="/asset-list" className="toolbar-link">Browse asset registry →</Link></footer>
        </div>
      </section>
    </main>
  );
}
