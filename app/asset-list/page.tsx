import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import {
  formatCurrency,
  formatEth,
  formatThb,
  formatUsd,
  getJoinedPortfolio,
  type LiveSourceState,
  type SourceStatus,
} from "@/lib/live-data";
import "./asset-list.css";

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

function formatNumber(value: number | null | undefined, maximumFractionDigits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

function sourceLabel(status: SourceStatus) {
  if (status === "live") return "LIVE";
  if (status === "partial") return "PARTIAL";
  return "UNAVAILABLE";
}

function joinedStatus(states: LiveSourceState[]): SourceStatus {
  if (states.every((state) => state.status === "live")) return "live";
  if (states.every((state) => state.status === "unavailable")) return "unavailable";
  return "partial";
}

function SourceBadge({ state }: { state: LiveSourceState }) {
  return <span className={`asset-source-badge is-${state.status}`}>{sourceLabel(state.status)}</span>;
}

export default async function AssetListPage() {
  const portfolio = await getJoinedPortfolio();
  const rawPositionCount = portfolio.t212.investments.length;
  const rawNftTokenCount = portfolio.nfts.reduce((sum, holding) => sum + holding.tokenCount, 0);
  const walletTokens = [...portfolio.wallet.tokens].sort(
    (left, right) => Number(right.priced) - Number(left.priced),
  );
  const rawWalletNativeCount = portfolio.wallet.native.length;
  const rawWalletTokenCount = walletTokens.length;
  const positionCount = portfolio.sources.t212Positions.status === "unavailable" ? null : rawPositionCount;
  const nftCollectionCount = portfolio.sources.nfts.status === "unavailable" ? null : portfolio.nfts.length;
  const nftTokenCount = portfolio.sources.nfts.status === "unavailable" ? null : rawNftTokenCount;
  const walletNativeCount = portfolio.sources.walletNative.status === "unavailable" ? null : rawWalletNativeCount;
  const walletTokenCount = portfolio.sources.walletTokens.status === "unavailable" ? null : rawWalletTokenCount;
  const walletEntryCount = walletNativeCount === null || walletTokenCount === null
    ? null
    : walletNativeCount + walletTokenCount;
  const walletSourcesComplete = portfolio.sources.walletNative.status === "live"
    && portfolio.sources.walletTokens.status === "live";
  const walletSourcesUnavailable = portfolio.sources.walletNative.status === "unavailable"
    && portfolio.sources.walletTokens.status === "unavailable";
  const liveEntryCount = positionCount === null || nftCollectionCount === null || walletEntryCount === null
    ? null
    : positionCount + nftCollectionCount + walletEntryCount;
  const registryState = joinedStatus(Object.values(portfolio.sources));
  const accountCurrency = portfolio.t212.currency;
  const sourceFeeds: Array<{ label: string; state: LiveSourceState }> = [
    { label: "T212 ACCOUNT", state: portfolio.sources.t212Summary },
    { label: "T212 POSITIONS", state: portfolio.sources.t212Positions },
    { label: "NFT HOLDINGS", state: portfolio.sources.nfts },
    { label: "WALLET NATIVE", state: portfolio.sources.walletNative },
    { label: "WALLET TOKENS", state: portfolio.sources.walletTokens },
    { label: "FIAT FX", state: portfolio.sources.fiatFx },
    { label: "ETH PRICE", state: portfolio.sources.ethPrice },
  ];

  return (
    <main className="workspace-shell asset-list-shell">
      <AppSidebar active="asset-list" />

      <section className="workspace-main">
        <header className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">LIVE PORTFOLIO / READ-ONLY REGISTRY</p>
            <h1 className="page-title">Asset List</h1>
            <p className="page-subtitle">Trading 212, NFTs, native coin, and ERC-20 tokens in one live registry</p>
          </div>
          <div className="header-tools">
            <span className="header-meta">
              <span className={`asset-source-light is-${registryState}`} aria-hidden="true" />
              {registryState === "live" ? "ALL FEEDS LIVE" : registryState === "partial" ? "PARTIAL LIVE DATA" : "FEEDS UNAVAILABLE"}
            </span>
            <Link href="/" className="toolbar-link">Command Center</Link>
            <Link href="/asset-list" aria-label="Refresh live registry" title="Refresh live registry" className="refresh-link">R</Link>
          </div>
        </header>

        <div className="page-content asset-list-content">
          <section className="asset-registry-hero" aria-labelledby="asset-registry-total">
            <div className="asset-registry-hero-copy">
              <p className="eyebrow">JOINED LIVE VALUE / THB BASE</p>
              <h2 id="asset-registry-total" className="asset-registry-value numeric">{formatThb(portfolio.totals.grandTotalThb)}</h2>
              <div className="asset-registry-secondary">
                <span><small>USD</small><strong className="numeric">{formatUsd(portfolio.totals.grandTotalUsd)}</strong></span>
                <span><small>NFT VALUE</small><strong className="numeric">{formatEth(portfolio.totals.nftsEth)}</strong></span>
                <span><small>SNAPSHOT</small><strong className="mono">{formatTimestamp(portfolio.asOf)}</strong></span>
              </div>
            </div>
          </section>

          <section className="asset-registry-kpis" aria-label="Live registry summary">
            <article className="panel asset-registry-kpi is-primary">
              <span className="asset-kpi-index">01 / T212 ACCOUNT</span>
              <strong className="numeric">{formatThb(portfolio.totals.t212Thb)}</strong>
              <small>{formatCurrency(portfolio.t212.totalValue, accountCurrency)} total value</small>
            </article>
            <article className="panel asset-registry-kpi">
              <span className="asset-kpi-index">02 / CASH AVAILABLE</span>
              <strong className="numeric">{formatCurrency(portfolio.t212.cashAvailable, accountCurrency)}</strong>
              <small>{accountCurrency ?? "—"} · available to trade</small>
            </article>
            <article className="panel asset-registry-kpi">
              <span className="asset-kpi-index">03 / NFT PORT</span>
              <strong className="numeric">{formatThb(portfolio.totals.nftsThb)}</strong>
              <small>{formatEth(portfolio.totals.nftsEth)} · {formatUsd(portfolio.totals.nftsUsd)}</small>
            </article>
            <article className="panel asset-registry-kpi">
              <span className="asset-kpi-index">04 / LIVE REGISTRY</span>
              <strong className="numeric">{formatCount(liveEntryCount)}</strong>
              <small>{formatCount(positionCount)} T212 · {formatCount(nftCollectionCount)} NFT · {formatCount(walletEntryCount)} wallet assets</small>
            </article>
          </section>

          <section className="panel asset-live-panel asset-wallet-panel" aria-label="Wallet asset registry">
            <div className="panel-header asset-live-panel-header">
              <div>
                <p className="eyebrow">EVM WALLET / NATIVE + ERC-20</p>
                <h2 className="panel-title">Live Wallet Asset Registry</h2>
                <p className="panel-subtitle">Positive native coin and token balances across the managed EVM chains</p>
              </div>
              <div className="asset-panel-status">
                <span className="asset-wallet-source-label">
                  <small>NATIVE</small>
                  <SourceBadge state={portfolio.sources.walletNative} />
                </span>
                <span className="asset-wallet-source-label">
                  <small>TOKENS</small>
                  <SourceBadge state={portfolio.sources.walletTokens} />
                </span>
                <span className="panel-count">{formatCount(rawWalletNativeCount + rawWalletTokenCount)} ASSETS</span>
              </div>
            </div>

            {rawWalletNativeCount + rawWalletTokenCount === 0 ? (
              <div className={`asset-empty-state ${walletSourcesComplete ? "" : "is-unavailable"}`}>
                <span className="asset-empty-code">WALLET / —</span>
                <div>
                  <strong>{walletSourcesComplete
                    ? "No wallet assets found"
                    : walletSourcesUnavailable
                      ? "Wallet assets are unavailable"
                      : "Wallet asset snapshot incomplete"}</strong>
                  <p>
                    {walletSourcesComplete
                      ? "The connected EVM wallet returned no positive native coin or ERC-20 balances in this snapshot."
                      : "One or more wallet sources did not return a complete inventory; no empty-wallet conclusion is inferred."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="asset-table-scroll">
                <table className="asset-live-table asset-wallet-table">
                  <caption className="sr-only">Live native coin and ERC-20 wallet registry</caption>
                  <thead>
                    <tr>
                      <th scope="col">Asset</th>
                      <th scope="col">Chain</th>
                      <th scope="col">Type</th>
                      <th scope="col" className="asset-cell-right">Amount</th>
                      <th scope="col" className="asset-cell-right">Price (USD)</th>
                      <th scope="col" className="asset-cell-right">Value (USD)</th>
                      <th scope="col" className="asset-cell-right">Value (THB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.wallet.native.map((holding) => (
                      <tr key={`${holding.chainId}:native`} data-wallet-kind="native">
                        <td><span className="ticker-badge">{holding.symbol}</span></td>
                        <td>
                          <strong className="asset-collection-name">{holding.chainName}</strong>
                          <small className="asset-row-name mono">CHAIN {holding.chainId}</small>
                        </td>
                        <td><span className="data-tag">NATIVE</span></td>
                        <td className="asset-cell-right numeric">{formatNumber(holding.amount, 18)}</td>
                        <td className="asset-cell-right numeric">{formatUsd(portfolio.fx.ethToUsd)}</td>
                        <td className="asset-cell-right numeric">{formatUsd(holding.valueUsd)}</td>
                        <td className="asset-cell-right numeric asset-thb-value">{formatThb(holding.valueThb)}</td>
                      </tr>
                    ))}
                    {walletTokens.map((holding) => (
                      <tr
                        key={`${holding.chainId}:${holding.contract?.toLowerCase() ?? holding.symbol}`}
                        data-wallet-kind="token"
                        data-wallet-priced={holding.priced ? "true" : "false"}
                      >
                        <td>
                          <span className="ticker-badge">{holding.symbol}</span>
                          <small className="asset-row-name" title={holding.contract}>{holding.name}</small>
                        </td>
                        <td>
                          <strong className="asset-collection-name">{holding.chainName}</strong>
                          <small className="asset-row-name mono">CHAIN {holding.chainId}</small>
                        </td>
                        <td>
                          <span className="asset-wallet-type">
                            <span className="data-tag">ERC-20</span>
                            {holding.priced ? null : <span className="data-tag asset-wallet-unpriced">UNPRICED</span>}
                          </span>
                        </td>
                        <td className="asset-cell-right numeric">{formatNumber(holding.amount, 18)}</td>
                        <td className="asset-cell-right numeric">{formatUsd(holding.priceUsd)}</td>
                        <td className="asset-cell-right numeric">{formatUsd(holding.valueUsd)}</td>
                        <td className="asset-cell-right numeric asset-thb-value">{formatThb(holding.valueThb)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td><strong>Total wallet (priced)</strong></td>
                      <td>—</td>
                      <td><span className="data-tag">PRICED</span></td>
                      <td className="asset-cell-right">—</td>
                      <td className="asset-cell-right">—</td>
                      <td className="asset-cell-right numeric"><strong>{formatUsd(portfolio.totals.walletUsd)}</strong></td>
                      <td className="asset-cell-right numeric asset-thb-value"><strong>{formatThb(portfolio.totals.walletThb)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="asset-panel-footer">
              <span>NATIVE</span>
              <p>{portfolio.sources.walletNative.message}</p>
              <span>TOKENS</span>
              <p>{portfolio.sources.walletTokens.message}</p>
              <time dateTime={portfolio.asOf}>Snapshot {formatTimestamp(portfolio.asOf)}</time>
            </div>
          </section>

          <section className="panel asset-live-panel">
            <div className="panel-header asset-live-panel-header">
              <div>
                <p className="eyebrow">TRADING 212 / ACCOUNT + POSITIONS</p>
                <h2 className="panel-title">Live Securities Registry</h2>
                <p className="panel-subtitle">Account summary and every currently open stock or ETF position</p>
              </div>
              <div className="asset-panel-status">
                <SourceBadge state={portfolio.sources.t212Summary} />
                <span className="panel-count">{formatCount(positionCount)} POSITIONS</span>
              </div>
            </div>

            <div className="asset-account-strip">
              <div>
                <span>ACCOUNT CURRENCY</span>
                <strong className="mono">{accountCurrency ?? "—"}</strong>
              </div>
              <div>
                <span>CASH AVAILABLE</span>
                <strong className="numeric">{formatCurrency(portfolio.t212.cashAvailable, accountCurrency)}</strong>
              </div>
              <div>
                <span>INVESTMENTS</span>
                <strong className="numeric">{formatCurrency(portfolio.t212.investmentsCurrentValue, accountCurrency)}</strong>
              </div>
              <div>
                <span>TOTAL VALUE</span>
                <strong className="numeric">{formatCurrency(portfolio.t212.totalValue, accountCurrency)}</strong>
              </div>
            </div>

            {portfolio.sources.t212Summary.status === "unavailable" ? (
              <div className="asset-source-notice is-unavailable">
                <strong>Trading 212 account summary unavailable</strong>
                <p>{portfolio.sources.t212Summary.message}</p>
              </div>
            ) : null}

            {portfolio.sources.t212Positions.status === "unavailable" ? (
              <div className="asset-empty-state is-unavailable">
                <span className="asset-empty-code">T212 / —</span>
                <div>
                  <strong>Live positions are unavailable</strong>
                  <p>{portfolio.sources.t212Positions.message}</p>
                </div>
              </div>
            ) : rawPositionCount === 0 && portfolio.sources.t212Positions.status === "partial" ? (
              <div className="asset-empty-state is-partial">
                <span className="asset-empty-code">T212 / !</span>
                <div>
                  <strong>No complete positions available</strong>
                  <p>{portfolio.sources.t212Positions.message}</p>
                </div>
              </div>
            ) : rawPositionCount === 0 ? (
              <div className="asset-empty-state">
                <span className="asset-empty-code">T212 / 00</span>
                <div>
                  <strong>No positions yet</strong>
                  <p>Stocks/ETFs you buy in T212 appear here live. Cash is already represented in the account summary above.</p>
                </div>
              </div>
            ) : (
              <div className="asset-table-scroll">
                <table className="asset-live-table">
                  <caption className="sr-only">Live Trading 212 positions</caption>
                  <thead>
                    <tr>
                      <th scope="col">Instrument</th>
                      <th scope="col" className="asset-cell-right">Quantity</th>
                      <th scope="col" className="asset-cell-right">Average cost</th>
                      <th scope="col" className="asset-cell-right">Current price</th>
                      <th scope="col" className="asset-cell-right">Native value</th>
                      <th scope="col" className="asset-cell-right">Value (THB)</th>
                      <th scope="col" className="asset-cell-right">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.t212.investments.map((position) => (
                      <tr key={position.ticker}>
                        <td>
                          <span className="ticker-badge">{position.ticker}</span>
                          <small className="asset-row-name">{position.name}</small>
                        </td>
                        <td className="asset-cell-right numeric">{formatNumber(position.quantity, 8)}</td>
                        <td className="asset-cell-right numeric">{formatCurrency(position.averagePrice, position.currency)}</td>
                        <td className="asset-cell-right numeric">{formatCurrency(position.currentPrice, position.currency)}</td>
                        <td className="asset-cell-right numeric">{formatCurrency(position.valueNative, position.currency)}</td>
                        <td className="asset-cell-right numeric asset-thb-value">{formatThb(position.valueThb)}</td>
                        <td className={`asset-cell-right numeric ${position.ppl === null ? "muted" : position.ppl >= 0 ? "positive" : "negative"}`}>
                          {formatCurrency(position.ppl, position.pplCurrency ?? accountCurrency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="asset-panel-footer">
              <span>SUMMARY</span>
              <p>{portfolio.sources.t212Summary.message}</p>
              <span>POSITIONS</span>
              <p>{portfolio.sources.t212Positions.message}</p>
              <time dateTime={portfolio.t212.asOf ?? undefined}>As of {formatTimestamp(portfolio.t212.asOf)}</time>
            </div>
          </section>

          <section className="panel asset-live-panel">
            <div className="panel-header asset-live-panel-header">
              <div>
                <p className="eyebrow">ROBINHOOD CHAIN / OPENSEA</p>
                <h2 className="panel-title">Live NFT Collection Registry</h2>
                <p className="panel-subtitle">Wallet token counts with collection floor values in ETH, USD, and THB</p>
              </div>
              <div className="asset-panel-status">
                <SourceBadge state={portfolio.sources.nfts} />
                <span className="panel-count">{formatCount(nftCollectionCount)} COLLECTIONS · {formatCount(nftTokenCount)} TOKENS</span>
              </div>
            </div>

            {portfolio.sources.nfts.status === "unavailable" ? (
              <div className="asset-empty-state is-unavailable">
                <span className="asset-empty-code">NFT / —</span>
                <div>
                  <strong>Live NFT collections are unavailable</strong>
                  <p>{portfolio.sources.nfts.message}</p>
                </div>
              </div>
            ) : portfolio.nfts.length === 0 ? (
              <div className="asset-empty-state">
                <span className="asset-empty-code">NFT / 00</span>
                <div>
                  <strong>No NFT collections found</strong>
                  <p>The connected Robinhood Chain wallet currently has no collection holdings to display.</p>
                </div>
              </div>
            ) : (
              <div className="asset-table-scroll">
                <table className="asset-live-table asset-nft-table">
                  <caption className="sr-only">Live NFT collections and floor values</caption>
                  <thead>
                    <tr>
                      <th scope="col">Collection</th>
                      <th scope="col" className="asset-cell-right">Tokens</th>
                      <th scope="col" className="asset-cell-right">Floor (ETH)</th>
                      <th scope="col" className="asset-cell-right">Value (ETH)</th>
                      <th scope="col" className="asset-cell-right">Value (USD)</th>
                      <th scope="col" className="asset-cell-right">Value (THB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.nfts.map((holding) => (
                      <tr key={holding.collection}>
                        <td>
                          <strong className="asset-collection-name">{holding.collectionName}</strong>
                          <small className="asset-row-name mono">{holding.collection}</small>
                        </td>
                        <td className="asset-cell-right numeric">{holding.tokenCount.toLocaleString("en-US")}</td>
                        <td className="asset-cell-right numeric">{holding.floorEth === null ? "—" : `${formatNumber(holding.floorEth, 8)} ETH`}</td>
                        <td className="asset-cell-right numeric">{formatEth(holding.valueEth)}</td>
                        <td className="asset-cell-right numeric">{formatUsd(holding.valueUsd)}</td>
                        <td className="asset-cell-right numeric asset-thb-value">{formatThb(holding.valueThb)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td><strong>Total NFT port</strong></td>
                      <td className="asset-cell-right numeric"><strong>{formatCount(rawNftTokenCount)}</strong></td>
                      <td className="asset-cell-right">—</td>
                      <td className="asset-cell-right numeric"><strong>{formatEth(portfolio.totals.nftsEth)}</strong></td>
                      <td className="asset-cell-right numeric"><strong>{formatUsd(portfolio.totals.nftsUsd)}</strong></td>
                      <td className="asset-cell-right numeric asset-thb-value"><strong>{formatThb(portfolio.totals.nftsThb)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="asset-panel-footer">
              <span>SOURCE</span>
              <p>{portfolio.sources.nfts.message}</p>
              <time dateTime={portfolio.sources.nfts.asOf ?? undefined}>As of {formatTimestamp(portfolio.sources.nfts.asOf)}</time>
            </div>
          </section>

          <section className="asset-source-grid" aria-label="Live data sources">
            {sourceFeeds.map(({ label, state }) => (
              <article className="panel asset-source-card" key={label}>
                <div>
                  <span>{label}</span>
                  <SourceBadge state={state} />
                </div>
                <p>{state.message}</p>
                <time dateTime={state.asOf ?? undefined}>{formatTimestamp(state.asOf)}</time>
              </article>
            ))}
          </section>

          <aside className="asset-legacy-note">
            <span>LEGACY (retired scraped era)</span>
            <p>Retired assets remain in Neon for historical continuity only. They are excluded from this live registry, and all add, update, delete, recover, and manual-price controls have been removed from the rendered page.</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
