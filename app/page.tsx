import Link from "next/link";
import { AppSidebar } from "./components/app-sidebar";
import { WalletBalancesPanel } from "./home-wallet-panel";
import {
  formatCurrency,
  formatEth,
  formatThb,
  formatUsd,
  getJoinedPortfolio,
  type LiveSourceState,
} from "@/lib/live-data";
import { requireSession } from "@/lib/auth";
import "./home.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatAsOf(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date) + " UTC";
}

function formatNumber(value: number | null, maximumFractionDigits = 4) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

function SourceBadge({ state }: { state: LiveSourceState }) {
  return (
    <span className={`live-source-badge is-${state.status}`} title={state.message}>
      <i aria-hidden="true" /> {state.status}
    </span>
  );
}

export default async function Home() {
  const [email, portfolio] = await Promise.all([requireSession(), getJoinedPortfolio()]);
  const { t212, nfts, wallet, fx, totals, sources } = portfolio;
  const positionCount = t212.investments.length;
  const tokenCount = nfts.reduce((sum, holding) => sum + holding.tokenCount, 0);
  const walletTokens = [...wallet.tokens].sort((left, right) => Number(right.priced) - Number(left.priced));
  const walletNativeRows = wallet.native.map((holding) => ({
    id: `${holding.chainId}:native`,
    symbol: holding.symbol,
    chainName: holding.chainName,
    chainId: holding.chainId,
    amount: formatNumber(holding.amount, 18),
    priceUsd: formatUsd(fx.ethToUsd),
    valueUsd: holding.valueUsd,
    valueUsdText: formatUsd(holding.valueUsd),
    valueThb: formatThb(holding.valueThb),
  }));
  const walletTokenRows = walletTokens.map((holding) => ({
    id: `${holding.chainId}:${holding.contract?.toLowerCase() ?? holding.symbol}`,
    symbol: holding.symbol,
    name: holding.name,
    contract: holding.contract,
    chainName: holding.chainName,
    chainId: holding.chainId,
    amount: formatNumber(holding.amount, 18),
    priceUsd: formatUsd(holding.priceUsd),
    valueUsd: holding.valueUsd,
    valueUsdText: formatUsd(holding.valueUsd),
    valueThb: formatThb(holding.valueThb),
    priced: holding.priced,
  }));
  const walletRowCount = wallet.native.length + walletTokens.length;
  const walletSourcesComplete = sources.walletNative.status === "live" && sources.walletTokens.status === "live";
  const walletSourcesUnavailable = sources.walletNative.status === "unavailable"
    && sources.walletTokens.status === "unavailable";

  return (
    <main className="workspace-shell home-shell">
      <AppSidebar active="home" email={email ?? undefined} />

      <section className="workspace-main">
        <header className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">PORTFOLIO OPERATIONS / FULL LIVE JOINED PORT</p>
            <h1 className="page-title">Command Center</h1>
            <p className="page-subtitle">Trading 212 + full EVM wallet balances — one live portfolio, valued in THB</p>
          </div>
          <div className="header-status">
            <span className="status-light" aria-hidden="true" /> SNAPSHOT · {formatAsOf(portfolio.asOf)}
          </div>
        </header>

        <div className="page-content home-content">
          <section className="home-kpi-grid has-wallet" aria-label="Joined live portfolio summary">
            <article className="kpi-card kpi-total">
              <span className="metric-index">01 / JOINED TOTAL</span>
              <span className="metric-label">Trading 212 + NFT wallet</span>
              <strong className="metric-value">{formatThb(totals.grandTotalThb)}</strong>
              <small>{formatUsd(totals.grandTotalUsd)} · {formatEth(totals.nftsEth)} in NFTs</small>
            </article>
            <article className="kpi-card">
              <span className="metric-index">02 / TRADING 212</span>
              <span className="metric-label">Authoritative account total</span>
              <strong className="metric-value">{formatThb(totals.t212Thb)}</strong>
              <small>{formatCurrency(t212.cashAvailable, t212.currency)} cash · {positionCount} position{positionCount === 1 ? "" : "s"}</small>
            </article>
            <article className="kpi-card">
              <span className="metric-index">03 / NFT PORT</span>
              <span className="metric-label">OpenSea wallet floors</span>
              <strong className="metric-value">{formatThb(totals.nftsThb)}</strong>
              <small>{formatEth(totals.nftsEth)} · {formatUsd(totals.nftsUsd)} · {tokenCount} tokens</small>
            </article>
            <article className="kpi-card">
              <span className="metric-index">04 / WALLET (NON-NFT)</span>
              <span className="metric-label">Native coin + ERC-20 tokens</span>
              <strong className="metric-value">{formatThb(totals.walletThb)}</strong>
              <small>{formatUsd(totals.walletUsd)} USD secondary · {walletRowCount} wallet asset{walletRowCount === 1 ? "" : "s"}</small>
            </article>
          </section>

          <WalletBalancesPanel
            nativeRows={walletNativeRows}
            tokenRows={walletTokenRows}
            nativeSource={{
              status: sources.walletNative.status,
              message: sources.walletNative.message,
            }}
            tokenSource={{
              status: sources.walletTokens.status,
              message: sources.walletTokens.message,
            }}
            walletSourcesComplete={walletSourcesComplete}
            walletSourcesUnavailable={walletSourcesUnavailable}
            totalWalletUsd={formatUsd(totals.walletUsd)}
            totalWalletThb={formatThb(totals.walletThb)}
          />

          <section className="panel home-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">TRADING 212 / LIVE ACCOUNT</p>
                <h2 className="panel-title">Cash &amp; Positions</h2>
              </div>
              <div className="home-source-stack">
                <SourceBadge state={sources.t212Summary} />
                <span className="panel-count">AS OF {formatAsOf(t212.asOf)}</span>
              </div>
            </div>

            {sources.t212Summary.status === "unavailable" ? (
              <div className="home-empty is-unavailable">
                <strong>Trading 212 account summary unavailable</strong>
                <p>{sources.t212Summary.message} Cash and account totals remain blank until the live source responds.</p>
              </div>
            ) : (
              <div className="t212-account-strip" aria-label="Trading 212 account summary">
                <div>
                  <small>Cash available</small>
                  <strong>Cash {formatCurrency(t212.cashAvailable, t212.currency)} ({t212.currency ?? "—"})</strong>
                </div>
                <div>
                  <small>Investments</small>
                  <strong>{formatCurrency(t212.investmentsCurrentValue, t212.currency)}</strong>
                </div>
                <div>
                  <small>Total account value</small>
                  <strong>{formatCurrency(t212.totalValue, t212.currency)}</strong>
                </div>
              </div>
            )}

            <div className="home-subsection-head">
              <div>
                <span>OPEN POSITIONS</span>
                <small>Stocks and ETFs appear here automatically after purchase</small>
              </div>
              <SourceBadge state={sources.t212Positions} />
            </div>

            {sources.t212Positions.status === "unavailable" ? (
              <div className="home-empty is-unavailable">
                <strong>Trading 212 positions unavailable</strong>
                <p>{sources.t212Positions.message} This is not being treated as an empty account.</p>
              </div>
            ) : positionCount === 0 ? (
              <div className="home-empty">
                <strong>No positions yet</strong>
                <p>Stocks/ETFs you buy in T212 appear here live. The account is ready now; its available cash is shown above.</p>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="data-table live-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th className="numeric">Qty</th>
                      <th className="numeric">Avg cost</th>
                      <th className="numeric">Current</th>
                      <th className="numeric">Value (THB)</th>
                      <th className="numeric">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t212.investments.map((position) => (
                      <tr key={position.ticker}>
                        <td>
                          <span className="ticker-cell">{position.ticker}</span>
                          <small className="sub-cell">{position.name}</small>
                        </td>
                        <td className="numeric">{formatNumber(position.quantity)}</td>
                        <td className="numeric muted">{formatCurrency(position.averagePrice, position.currency)}</td>
                        <td className="numeric">{formatCurrency(position.currentPrice, position.currency)}</td>
                        <td className="numeric value-cell">{formatThb(position.valueThb)}</td>
                        <td className={`numeric ${position.ppl === null ? "muted" : position.ppl >= 0 ? "positive" : "negative"}`}>
                          {formatCurrency(position.ppl, position.pplCurrency ?? t212.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel home-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">ROBINHOOD CHAIN / OPENSEA</p>
                <h2 className="panel-title">Live NFT Holdings</h2>
              </div>
              <div className="home-source-stack">
                <SourceBadge state={sources.nfts} />
                <span className="panel-count">{nfts.length} COLLECTIONS</span>
              </div>
            </div>

            {sources.nfts.status === "unavailable" ? (
              <div className="home-empty is-unavailable">
                <strong>NFT wallet unavailable</strong>
                <p>{sources.nfts.message} No wallet value is inferred while OpenSea is unavailable.</p>
              </div>
            ) : nfts.length === 0 ? (
              <div className="home-empty">
                <strong>No NFT holdings found</strong>
                <p>The live Robinhood Chain wallet returned no collection holdings in this snapshot.</p>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="data-table live-table">
                  <thead>
                    <tr>
                      <th>Collection</th>
                      <th className="numeric">Tokens</th>
                      <th className="numeric">Floor (ETH)</th>
                      <th className="numeric">Value (ETH)</th>
                      <th className="numeric">Value (USD)</th>
                      <th className="numeric">Value (THB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nfts.map((holding) => (
                      <tr key={holding.collection}>
                        <td>
                          <span className="ticker-cell">{holding.collectionName}</span>
                          <small className="sub-cell">{holding.collection}</small>
                        </td>
                        <td className="numeric">{holding.tokenCount}</td>
                        <td className="numeric">{formatNumber(holding.floorEth, 7)}</td>
                        <td className="numeric">{formatNumber(holding.valueEth, 7)}</td>
                        <td className="numeric">{formatUsd(holding.valueUsd)}</td>
                        <td className="numeric value-cell">{formatThb(holding.valueThb)}</td>
                      </tr>
                    ))}
                    <tr className="table-total-row">
                      <td><strong>Total NFT port</strong></td>
                      <td className="numeric">{tokenCount}</td>
                      <td className="numeric">—</td>
                      <td className="numeric"><strong>{formatEth(totals.nftsEth)}</strong></td>
                      <td className="numeric"><strong>{formatUsd(totals.nftsUsd)}</strong></td>
                      <td className="numeric"><strong>{formatThb(totals.nftsThb)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {sources.nfts.status === "partial" ? (
              <div className="home-availability-note warning">{sources.nfts.message}</div>
            ) : null}
          </section>

          <section className="panel home-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">LIVE FX / CONVERSION</p>
                <h2 className="panel-title">Rates Used by This Snapshot</h2>
              </div>
              <div className="home-source-stack">
                <SourceBadge state={sources.fiatFx} />
                <span className="panel-count">AS OF {formatAsOf(fx.asOf)}</span>
              </div>
            </div>
            <div className="fx-strip">
              <div><small>USD → THB</small><strong>{formatNumber(fx.usdToThb, 6)}</strong></div>
              <div><small>GBP → THB</small><strong>{formatNumber(fx.gbpToThb, 6)}</strong></div>
              <div><small>EUR → THB</small><strong>{formatNumber(fx.eurToThb, 6)}</strong></div>
              <div><small>ETH → USD</small><strong>{formatUsd(fx.ethToUsd)}</strong><SourceBadge state={sources.ethPrice} /></div>
            </div>
          </section>

          <section className="home-footnote">
            <span>TRANSPARENT SOURCES</span>
            <p>Trading 212 Public API · OpenSea API · public EVM RPCs · Blockscout · DefiLlama · CoinGecko · open.er-api.com. Neon remains the historical ledger and is not a live price source.</p>
            <Link href="/portfolio" className="toolbar-link">Open analytics →</Link>
          </section>
        </div>
      </section>
    </main>
  );
}
