import Link from "next/link";
import { AppSidebar } from "./components/app-sidebar";
import MascotCompanion from "./mascot-companion";
import { deriveMascotState } from "@/lib/mascot";
import { WalletBalancesPanel } from "./home-wallet-panel";
import { WalletInventorySnapshot } from "./wallet-inventory-snapshot";
import { PnlPerformance, PnlCalendar } from "./pnl-history-panels";
import { PnlAssetTable } from "./pnl-asset-table";
import { BookPnlMetric } from "./book-pnl-metric";
import { formatThb, formatUsd, getJoinedPortfolio, type LiveSourceState } from "@/lib/live-data";
import { readPortfolioSnapshotHistory } from "@/lib/pnl-history";
import { dailyChangeDetails, previousDayHoldings, valueDirection, formatPnlMoney, formatPnlPercent, formatSnapshotAsOf, formatHoldingQuantity, valueAllocation, allocationPnl } from "@/lib/pnl-view";
import { requireSession } from "@/lib/auth";
import { shouldSuppressHolding } from "@/lib/dust-filter";
import { holdingId } from "@/lib/holding-values";
import "./home.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function SourceBadge({ state }: { state: LiveSourceState }) {
  return <span className={`live-source-badge is-${state.status}`} title={state.message}><i aria-hidden="true" />{state.status}</span>;
}

export default async function Home() {
  const [email, portfolio] = await Promise.all([requireSession(), getJoinedPortfolio()]);
  // Read after the joined boundary has finished its existing daily recorder.
  const { snapshots: history, available: snapshotHistoryAvailable } = await readPortfolioSnapshotHistory();
  const mascot = deriveMascotState({ ...portfolio, snapshotHistoryAvailable }, new Date());
  const { wallet, totals, sources } = portfolio;
  const { change, reason: changeReason } = dailyChangeDetails(history, portfolio.asOf);
  const dayDirection = valueDirection(change?.usd);
  const valueSourcesComplete = Object.entries(sources).every(([key, source]) => key === "capital" || source.status === "live");
  const classes = valueAllocation(portfolio).map((item) => ({
    ...item, pnl: allocationPnl(portfolio, item.key),
  }));
  const classSubtitles: Record<string, string> = {
    t212: "Shares and ETFs on Trading 212", crypto: "NFTs and crypto in your wallet",
    cash: "Broker cash, cash pot and stablecoins",
  };
  const canCompareCapital = portfolio.capital.available && portfolio.capital.contributedThb !== null
    && Number.isFinite(portfolio.capital.contributedThb) && totals.grandTotalThb !== null && Number.isFinite(totals.grandTotalThb);
  const walletAssetCount = [...wallet.native, ...wallet.tokens].filter((row) => !shouldSuppressHolding(row)).length;
  const walletTokens = [...wallet.tokens].sort((left, right) => Number(right.priced) - Number(left.priced));
  const nativeRows = [...wallet.native].sort((left, right) => Number(right.valueUsd !== null) - Number(left.valueUsd !== null)).map((holding) => ({
    id: holding.key, symbol: holding.symbol, chainName: holding.chainName, chainId: holding.chainId,
    chains: holding.chains, amountValue: holding.amount,
    amount: formatHoldingQuantity(holding.amount, holding.chainId === "solana" ? 9 : 18), priceUsd: formatUsd(holding.priceUsd), valueUsd: holding.valueUsd,
    valueUsdText: formatUsd(holding.valueUsd), valueThb: formatThb(holding.valueThb),
  }));
  const tokenRows = walletTokens.map((holding) => ({
    id: holdingId.token(holding.chainId, holding.contract ?? holding.symbol), symbol: holding.symbol,
    name: holding.name, contract: holding.contract, chainName: holding.chainName, chainId: holding.chainId,
    amount: formatHoldingQuantity(holding.amount, 18), priceUsd: formatUsd(holding.priceUsd), valueUsd: holding.valueUsd,
    valueUsdText: formatUsd(holding.valueUsd), valueThb: formatThb(holding.valueThb), priced: holding.priced,
  }));
  const sourceNames: Record<keyof typeof sources, string> = {
    t212Summary: "T212 account", t212Positions: "T212 positions", nfts: "OpenSea NFTs", fiatFx: "Fiat FX",
    ethPrice: "ETH price", walletNative: "Wallet native", walletTokens: "Wallet tokens", solana: "Solana wallet", manualHoldings: "Manual holdings", capital: "Contributed capital",
  };

  return (
    <main className="workspace-shell home-shell">
      <AppSidebar active="home" email={email ?? undefined} />
      <section className="workspace-main">
        <header className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">YOUR PORTFOLIO / AT A GLANCE</p>
            <h1 className="page-title">Portfolio overview</h1>
            <p className="page-subtitle">What you have, what it is worth and how it has changed.</p>
          </div>
          <div className="header-status"><span className="status-light" aria-hidden="true" />USD primary · THB secondary</div>
        </header>
        <div className="page-content home-content">
          <section className="panel pnl-value-hero" aria-label="Live portfolio summary">
            <div className="pnl-hero-top">
              <div>
                <p className="eyebrow">YOUR MONEY TODAY</p><h2>Portfolio value</h2>
                <strong className="pnl-hero-value" data-value-currency="USD">{formatUsd(totals.grandTotalUsd)}</strong>
                <p className="pnl-secondary">{formatThb(totals.grandTotalThb)} <span>THB</span></p>
              </div>
              <div className="pnl-hero-asof">
                <span className={`pnl-status ${!valueSourcesComplete ? "is-partial" : ""}`}>{totals.grandTotalUsd === null ? "Live values unavailable" : !valueSourcesComplete ? "Some prices are missing" : "All prices live"}</span>
                <small>As of {formatSnapshotAsOf(portfolio.asOf)}</small>
                <p>{totals.grandTotalUsd === null ? "Missing values show —; the values we know remain below." : !valueSourcesComplete ? "Known values only; check the price sources below." : "Stocks, crypto and cash at current prices."}</p>
              </div>
            </div>
            <div className="pnl-class-values">
              {classes.map((item) => <div key={item.key} data-value-class={item.key}>
                <span className={`pnl-class-dot is-${item.key}`} aria-hidden="true" /><small>{item.label}</small>
                <strong>{formatUsd(item.valueUsd)}</strong><span className="pnl-class-secondary">{formatThb(item.valueThb)}</span>
                <span className="pnl-class-share">{item.sharePct === null ? "—" : `${item.sharePct.toFixed(1)}% of portfolio`}</span>
                <p className="pnl-class-subtitle">{classSubtitles[item.key]}</p>
              </div>)}
            </div>
            <p className="pnl-capital-comparison" data-capital-comparison={canCompareCapital ? "available" : "unavailable"}>{canCompareCapital
              ? `You put in ${formatThb(portfolio.capital.contributedThb)}. The book is worth ${formatThb(totals.grandTotalThb)} today.`
              : "Not enough live data to compare with what you put in."}</p>
            <div className="pnl-hero-foot"><span data-wallet-summary-count={walletAssetCount}>{walletAssetCount} wallet assets</span><span>Cash contributes to value only; it has no P&amp;L.</span></div>
          </section>
          <section className="pnl-metric-strip" aria-label="Profit, loss and daily change">
            <BookPnlMetric portfolio={portfolio} />
            <article className="panel pnl-metric" data-daily-change={change ? "available" : "unavailable"}>
              <p className="eyebrow">VALUE / DAY TO DAY</p><h2>Daily change</h2>
              <div className="pnl-metric-line"><strong className={dayDirection === "up" ? "positive is-up" : dayDirection === "down" ? "negative is-down" : dayDirection === "flat" ? "muted is-flat" : ""}>{dayDirection === "up" ? "↑ " : dayDirection === "down" ? "↓ " : dayDirection === "flat" ? "→ " : ""}{formatPnlMoney(change?.usd)}</strong><span>{formatPnlPercent(change?.pct)}</span></div>
              <small>{formatPnlMoney(change?.thb, "THB")} THB</small>
              <p>{change ? `${change.previousDate} → ${change.date} · first daily observations.` : `Waiting for two comparable days — ${changeReason}.`}</p>
              <p className="muted">Value change with deposits and withdrawals excluded, measured in baht against the previous day; not investment P&amp;L.</p>
            </article>
          </section>
          <div className="pnl-analysis-grid">
            <PnlPerformance snapshots={history} asOf={portfolio.asOf} />
            <section className="panel pnl-allocation">
              <div className="panel-header"><div><p className="eyebrow">CURRENT VALUE MIX</p><h2 className="panel-title">Allocation by class</h2></div></div>
              <div className="pnl-allocation-list">{classes.map((item) => <div className="pnl-allocation-item" key={item.key}>
                <div><span><i className={`pnl-class-dot is-${item.key}`} />{item.label}</span><strong>{formatUsd(item.valueUsd)}</strong></div>
                <div className="pnl-allocation-track"><span className={`is-${item.key}`} style={{ width: item.sharePct === null ? "0%" : `${item.sharePct}%` }} /></div>
                <small>{item.sharePct === null ? "Share unavailable" : `${formatHoldingQuantity(item.sharePct, 1)}% of portfolio`} · {formatThb(item.valueThb)}</small>
                {item.key === "cash" ? <small className="pnl-class-pnl">Value only · no P&amp;L</small>
                  : <small className="pnl-class-pnl">P&amp;L (recorded): {formatUsd(item.pnl.pnlCoverage.eligible > 0 ? item.pnl.pnlUsd : null)} · {item.pnl.pnlCoverage.eligible} holdings with a purchase cost</small>}
              </div>)}</div>
              <p className="pnl-panel-note">Percentages need a known value for every class.</p>
            </section>
          </div>
          <PnlCalendar snapshots={history} asOf={portfolio.asOf} />
          <PnlAssetTable portfolio={portfolio} previousHoldings={previousDayHoldings(history, portfolio.asOf)} />
          <WalletInventorySnapshot portfolio={portfolio} />
          <WalletBalancesPanel nativeRows={nativeRows} tokenRows={tokenRows} nativeSource={sources.walletNative} tokenSource={sources.walletTokens} solanaSource={sources.solana}
            walletSourcesComplete={sources.walletNative.status === "live" && sources.walletTokens.status === "live" && sources.solana.status === "live"}
            totalWalletUsd={formatUsd(totals.walletUsd)} totalWalletThb={formatThb(totals.walletThb)} />
          <section className="panel pnl-source-strip" aria-label="Portfolio sources">
            <div className="panel-header"><div><p className="eyebrow">EVERY FIGURE HAS A SOURCE</p><h2 className="panel-title">Source status</h2></div><span className="panel-count">{Object.keys(sources).length} sources</span></div>
            <div className="pnl-source-grid">{(Object.keys(sources) as (keyof typeof sources)[]).map((key) => <article key={key} data-source-key={key}>
              <div><strong>{sourceNames[key]}</strong><SourceBadge state={sources[key]} /></div><small>{formatSnapshotAsOf(sources[key].asOf)}</small><p>{sources[key].message}</p>
            </article>)}</div>
          </section>
          <footer className="home-footnote"><p>Baht uses the same exchange rates; NFT floor estimates are not sale proceeds.</p><Link href="/asset-list" className="toolbar-link">Browse asset registry →</Link></footer>
        </div>
      </section>
      <MascotCompanion state={mascot} />
    </main>
  );
}
