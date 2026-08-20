import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import { PendingButton } from "../components/pending-button";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  getAssetMetrics,
  getDailyChangePercent,
  isNeonConfigured,
  listAssets,
  listCurrencies,
  listDeletedAssets,
  listInvestorHoldings,
  listPriceHistory,
} from "@/lib/assets-db";
import { recoverAssetAction, removeAssetAction, saveAssetAction, updatePriceAction } from "./actions";
import { AssetDashboard } from "./asset-dashboard";
import "./asset-list.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function metricToneClass(tone: string) {
  if (tone.includes("rose")) return "negative";
  if (tone.includes("emerald")) return "positive";
  if (tone.includes("blue")) return "accent";
  return "muted";
}

export default async function AssetListPage() {
  if (!isNeonConfigured()) {
    return <NeonSetupPage title="Asset List" />;
  }

  const assets = await listAssets();
  const deletedAssets = await listDeletedAssets();
  const currencies = await listCurrencies();
  const priceHistory = await listPriceHistory();
  const holdings = await listInvestorHoldings();
  const metrics = getAssetMetrics(assets);
  const dashboardAssets = assets.map((asset) => ({
    id: asset.id,
    ticker: asset.ticker,
    fullName: asset.fullName,
    currencyCode: asset.currencyCode,
    currentPrice: asset.currentPrice,
    previousPrice: asset.previousPrice,
    valueThb: holdings.filter((holding) => holding.assetId === asset.id).reduce((sum, holding) => sum + holding.currentValueBase, 0),
    updatedAt: formatDate(asset.priceUpdatedAt),
  }));
  const totalValue = holdings.reduce((sum, holding) => sum + holding.currentValueBase, 0);
  const totalPreviousValue = holdings.reduce((sum, holding) => {
    const asset = assets.find((candidate) => candidate.id === holding.assetId);
    return sum + (asset && asset.currentPrice !== 0 ? holding.currentValueBase * asset.previousPrice / asset.currentPrice : holding.currentValueBase);
  }, 0);
  const totalChange = totalValue - totalPreviousValue;
  const totalChangePct = totalPreviousValue === 0 ? 0 : totalChange / totalPreviousValue * 100;
  const gainers = [...assets].filter((asset) => getDailyChangePercent(asset) >= 0).sort((a, b) => getDailyChangePercent(b) - getDailyChangePercent(a)).slice(0, 3);
  const losers = [...assets].filter((asset) => getDailyChangePercent(asset) < 0).sort((a, b) => getDailyChangePercent(a) - getDailyChangePercent(b)).slice(0, 3);
  const moverGroups = [
    { label: "Gainers", items: gainers, tone: "positive" },
    { label: "Losers", items: losers, tone: "negative" },
  ] as const;

  return (
    <main className="workspace-shell asset-list-shell">
      <AppSidebar active="asset-list" />

      <section className="workspace-main">
        <header className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">Market operations / Asset intelligence</p>
            <h1 className="page-title">Asset List</h1>
            <p className="page-subtitle">Price control, market movement, and registry oversight</p>
          </div>
          <div className="header-tools">
            <Link href="/" className="toolbar-link">Home</Link>
            <span className="header-meta"><span className="status-light" aria-hidden="true" />Neon ledger online</span>
            <Link href="/asset-list" aria-label="Refresh prices" title="Refresh prices" className="refresh-link">R</Link>
          </div>
        </header>

        <div className="page-content asset-list-content">
          <section className="asset-list-overview">
            <div className="asset-overview-copy">
              <p className="eyebrow">Consolidated portfolio value</p>
              <p className="asset-overview-value numeric">{formatMoney(totalValue, "THB")}</p>
              <p className="asset-overview-meta">
                <span><strong className="numeric">{holdings.length}</strong> active holdings</span>
                <span><strong className="numeric">{assets.length}</strong> tracked assets</span>
                <span>Base currency <strong className="mono">THB</strong></span>
              </p>
            </div>
            <div className={`asset-daily-change ${totalChange >= 0 ? "is-positive" : "is-negative"}`}>
              <span>Daily change</span>
              <strong className="numeric">{totalChange >= 0 ? "+" : ""}{formatMoney(totalChange, "THB")}</strong>
              <small className="numeric">{totalChangePct >= 0 ? "+" : ""}{totalChangePct.toFixed(2)}%</small>
            </div>
          </section>

          <section className="asset-kpi-strip" aria-label="Asset metrics">
            {metrics.map((metric, index) => (
              <div key={metric.label} className="panel asset-kpi-card">
                <div className="asset-kpi-head">
                  <span>{metric.label}</span>
                  <span className="asset-kpi-index mono">0{index + 1}</span>
                </div>
                <strong className="asset-kpi-value numeric">{metric.value}</strong>
                <small className={metricToneClass(metric.tone)}>{metric.detail}</small>
              </div>
            ))}
          </section>

          <div className="asset-list-primary-grid">
            <AssetDashboard assets={dashboardAssets} updatePriceAction={updatePriceAction} />

            <aside className="asset-list-side-stack">
              <section className="panel asset-movers-panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Biggest movers</h2>
                    <p className="panel-subtitle">Ranked by one-day price delta</p>
                  </div>
                  <span className="panel-count">TOP 03</span>
                </div>
                <div className="asset-movers-body">
                  {moverGroups.map((group) => (
                    <div key={group.label} className="asset-mover-group">
                      <div className="asset-mover-group-head">
                        <span>{group.label}</span>
                        <span className={group.tone}>{group.items.length}</span>
                      </div>
                      <div className="asset-mover-list">
                        {group.items.length === 0 ? (
                          <p className="asset-empty-inline">None today</p>
                        ) : group.items.map((asset, index) => {
                          const change = getDailyChangePercent(asset);
                          return (
                            <div key={asset.id} className="asset-mover-row">
                              <span className="asset-mover-rank mono">0{index + 1}</span>
                              <span className="asset-mover-name">
                                <strong className="mono">{asset.ticker}</strong>
                                <small>{asset.fullName}</small>
                              </span>
                              <span className={`change-badge numeric ${change >= 0 ? "positive" : "negative"}`}>
                                {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section id="asset-form" className="panel asset-editor-panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Add / Edit Asset</h2>
                    <p className="panel-subtitle">Ticker is the registry identity</p>
                  </div>
                  <span className="panel-count">UPSERT</span>
                </div>
                <form action={saveAssetAction} className="asset-editor-form">
                  <div className="asset-form-grid">
                    <label className="asset-field">
                      <span>Ticker</span>
                      <input name="ticker" placeholder="AAPL" required className="asset-field-control asset-ticker-input mono" />
                    </label>
                    <label className="asset-field asset-field-wide">
                      <span>Asset name</span>
                      <input name="fullName" placeholder="Apple Inc." required className="asset-field-control" />
                    </label>
                    <label className="asset-field asset-field-wide">
                      <span>Source link</span>
                      <input name="sourceLink" placeholder="https://finance.yahoo.com/quote/AAPL" className="asset-field-control mono" />
                    </label>
                    <label className="asset-field">
                      <span>Currency code</span>
                      <select name="currencyCode" defaultValue="USD" className="asset-field-control mono">
                        {currencies.map((currency) => (
                          <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="asset-field">
                      <span>Current price</span>
                      <input name="currentPrice" placeholder="189.98" required inputMode="decimal" className="asset-field-control asset-number-input" />
                    </label>
                  </div>
                  <div className="asset-form-actions">
                    <PendingButton className="pm-button pm-button-primary asset-form-submit" pendingLabel="Saving Asset">
                      Save Asset
                    </PendingButton>
                    <Link href="/asset-list" className="asset-cancel-button">Cancel</Link>
                  </div>
                </form>
              </section>
            </aside>
          </div>

          <section className="panel asset-registry-panel">
            <div className="panel-header asset-registry-header">
              <div>
                <h2 className="panel-title">Asset Registry</h2>
                <p className="panel-subtitle">Canonical instruments and latest recorded market state</p>
              </div>
              <div className="asset-registry-tools">
                <label className="sr-only" htmlFor="asset-search">Search assets</label>
                <input id="asset-search" placeholder="Search ticker or asset name" className="asset-field-control asset-registry-search" />
                <select aria-label="Filter by currency" className="asset-field-control asset-registry-filter mono">
                  <option>All currencies</option>
                  {currencies.map((currency) => (
                    <option key={currency.code}>{currency.code}</option>
                  ))}
                </select>
                <span className="panel-count">{assets.length} ACTIVE</span>
              </div>
            </div>

            <div className="asset-table-scroll">
              <table className="asset-data-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Full name</th>
                    <th>Currency</th>
                    <th className="asset-cell-right">Current price</th>
                    <th className="asset-cell-right">Price change</th>
                    <th>Price updated at</th>
                    <th className="asset-action-cell">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => {
                    const dailyChange = getDailyChangePercent(asset);

                    return (
                      <tr key={asset.id}>
                        <td><span className="ticker-badge">{asset.ticker}</span></td>
                        <td className="asset-name-cell">{asset.fullName}</td>
                        <td><span className="currency-badge">{asset.currencyCode}</span></td>
                        <td className="asset-cell-right numeric asset-price-cell">{formatMoney(asset.currentPrice, asset.currencyCode)}</td>
                        <td className={`asset-cell-right numeric ${dailyChange < 0 ? "negative" : "positive"}`}>
                          {dailyChange >= 0 ? "+" : ""}{dailyChange.toFixed(2)}%
                        </td>
                        <td className="mono asset-date-cell">{formatDateTime(asset.priceUpdatedAt)}</td>
                        <td className="asset-action-cell">
                          <form action={removeAssetAction}>
                            <input type="hidden" name="id" value={asset.id} />
                            <input type="hidden" name="confirmRemove" value="yes" />
                            <PendingButton
                              aria-label={`Remove ${asset.ticker}`}
                              title={`Remove ${asset.ticker}`}
                              pendingLabel=""
                              className="pm-button pm-button-danger pm-button-icon asset-remove-button"
                            >
                              x
                            </PendingButton>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                  {assets.length === 0 ? (
                    <tr><td colSpan={7} className="asset-table-empty">No active assets in the registry.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <div className="asset-list-secondary-grid">
            <section className="panel asset-history-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Price History</h2>
                  <p className="panel-subtitle">Most recent persisted market observations</p>
                </div>
                <span className="panel-count">{priceHistory.length} RECORDS</span>
              </div>
              <div className="asset-table-scroll">
                <table className="asset-data-table asset-history-table">
                  <thead>
                    <tr>
                      <th>Recorded at</th>
                      <th>Ticker</th>
                      <th className="asset-cell-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.map((history) => (
                      <tr key={history.id}>
                        <td className="mono asset-date-cell">{formatDate(history.recordedAt)}</td>
                        <td><span className="ticker-badge">{history.ticker}</span></td>
                        <td className="asset-cell-right numeric asset-price-cell">{formatMoney(history.price)}</td>
                      </tr>
                    ))}
                    {priceHistory.length === 0 ? (
                      <tr><td colSpan={3} className="asset-table-empty">No price history has been recorded.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel asset-deleted-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Deleted Assets</h2>
                  <p className="panel-subtitle">Soft-deleted registry records</p>
                </div>
                <span className="panel-count">{deletedAssets.length} RECOVERABLE</span>
              </div>
              <div className="asset-deleted-list">
                {deletedAssets.length === 0 ? (
                  <p className="asset-empty-state">No deleted assets to recover.</p>
                ) : (
                  deletedAssets.map((asset) => (
                    <div key={asset.id} className="asset-deleted-row">
                      <span className="asset-deleted-mark mono">{asset.ticker}</span>
                      <span className="asset-deleted-copy">
                        <strong>{asset.fullName}</strong>
                        <small className="mono">Deleted {asset.deletedAt ? formatDateTime(asset.deletedAt) : "recently"}</small>
                      </span>
                      <form action={recoverAssetAction}>
                        <input type="hidden" name="id" value={asset.id} />
                        <PendingButton className="pm-button asset-recover-button" pendingLabel="Restoring">
                          Recover
                        </PendingButton>
                      </form>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

function NeonSetupPage({ title }: { title: string }) {
  return (
    <main className="setup-canvas asset-list-setup">
      <section className="setup-panel">
        <p className="eyebrow">Connection required / Neon Postgres</p>
        <h1>{title}</h1>
        <p>
          Neon is enabled in the code, but `DATABASE_URL` is not set yet. Add your Neon Postgres connection string to `.env.local`,
          then restart the development server.
        </p>
        <Link href="/" className="toolbar-link asset-setup-link">Return home</Link>
      </section>
    </main>
  );
}
