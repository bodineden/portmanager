import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import { PendingButton } from "../components/pending-button";
import {
  formatDate,
  formatMoney,
  getHoldingMetrics,
  isNeonConfigured,
  listAssets,
  listDeletedInvestors,
  listInvestorHoldings,
  listInvestors,
  type InvestorHolding,
} from "@/lib/assets-db";
import { recoverInvestorAction, removeHoldingAction, removeInvestorAction, saveHoldingAction, saveInvestorAction } from "./actions";
import { CsvExportButton } from "./csv-export-button";
import "./holder-list.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function InvestorGroup({ name, holdings }: { name: string; holdings: InvestorHolding[] }) {
  const currentValue = holdings.reduce((sum, holding) => sum + holding.currentValueBase, 0);
  const acquiredCost = holdings.reduce((sum, holding) => sum + holding.acquiredCost, 0);
  const gainLoss = currentValue - acquiredCost;

  return (
    <section className="holder-investor-panel panel">
      <header className="holder-investor-header">
        <div className="holder-investor-identity">
          <span className="holder-investor-status" aria-hidden="true" />
          <div>
            <div className="holder-investor-title-line">
              <h2>{name}</h2>
              <span className="data-tag">ACTIVE</span>
            </div>
            <p>{holdings.length} active holdings <span aria-hidden="true">/</span> base currency THB</p>
          </div>
        </div>
        <dl className="holder-investor-totals">
          <div>
            <dt>Current value</dt>
            <dd className="numeric">{formatMoney(currentValue, "THB")}</dd>
          </div>
          <div>
            <dt>Gain / loss</dt>
            <dd className={`numeric ${gainLoss >= 0 ? "positive" : "negative"}`}>
              {gainLoss >= 0 ? "+" : ""}
              {formatMoney(gainLoss, "THB")}
            </dd>
          </div>
        </dl>
      </header>

      <div className="holder-table-wrap">
        <table className="holder-table data-table">
          <thead>
            <tr>
              {[
                "Asset",
                "Shares",
                "Current Price",
                "FX to THB",
                "Acquired Cost (THB)",
                "Acquired At",
                "Current Value (THB)",
                "Gain / Loss (THB)",
                "Actions",
              ].map((heading) => (
                <th key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 ? (
              <tr>
                <td colSpan={9} className="holder-empty-cell">No active holdings assigned to this investor.</td>
              </tr>
            ) : (
              holdings.map((holding) => (
                <tr key={holding.id}>
                  <td>
                    <div className="holder-asset-cell">
                      <span className="ticker-badge">{holding.ticker}</span>
                      <span title={holding.assetName}>{holding.assetName}</span>
                    </div>
                  </td>
                  <td className="numeric holder-number-strong">{holding.shares.toLocaleString("en-US")}</td>
                  <td className="numeric">{formatMoney(holding.currentPrice, holding.currencyCode)}</td>
                  <td className="numeric">{holding.exchangeRateToBase.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                  <td className="numeric">{formatMoney(holding.acquiredCost, "THB")}</td>
                  <td className="numeric holder-date">{formatDateOnly(holding.acquiredAt)}</td>
                  <td className="numeric holder-number-strong">{formatMoney(holding.currentValueBase, "THB")}</td>
                  <td className={`numeric holder-number-strong ${holding.gainLoss >= 0 ? "positive" : "negative"}`}>
                    {holding.gainLoss >= 0 ? "+" : ""}
                    {formatMoney(holding.gainLoss, "THB")}
                  </td>
                  <td className="holder-action-cell">
                    <form action={removeHoldingAction}>
                      <input type="hidden" name="id" value={holding.id} />
                      <PendingButton
                        aria-label={`Remove ${holding.ticker} from ${holding.investorName}`}
                        title={`Remove ${holding.ticker} from ${holding.investorName}`}
                        pendingLabel=""
                        className="pm-button pm-button-danger pm-button-icon holder-remove-button"
                      >
                        x
                      </PendingButton>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDateOnly(value: string) {
  return formatDate(value);
}

export default async function HolderListPage() {
  if (!isNeonConfigured()) {
    return <NeonSetupPage title="Holder List" />;
  }

  const assets = await listAssets();
  const investors = await listInvestors();
  const deletedInvestors = await listDeletedInvestors();
  const holdings = await listInvestorHoldings();
  const metrics = getHoldingMetrics(investors, holdings);
  const holdingsByInvestor = investors.map((investor) => ({
    investor,
    holdings: holdings.filter((holding) => holding.investorId === investor.id),
  }));

  return (
    <main className="app-root holder-page">
      <div className="workspace-shell">
        <AppSidebar active="holder-list" />

        <section className="workspace-main">
          <header className="page-header">
            <div className="page-title-group">
              <p className="eyebrow">OWNERSHIP CONTROL</p>
              <h1 className="page-title">Holder List</h1>
              <p className="page-subtitle">Investor positions, acquisition basis, and THB valuation</p>
            </div>
            <div className="header-tools">
              <span className="header-status"><span className="status-light" aria-hidden="true" /> LIVE REGISTRY</span>
              <CsvExportButton holdings={holdings.map((holding) => ({ ticker: holding.ticker, name: holding.assetName, shares: holding.shares, currentPrice: holding.currentPrice, valueThb: holding.currentValueBase }))} />
              <Link href="/exchange-rate" className="toolbar-link">Exchange Rates</Link>
              <Link href="/" className="toolbar-link">Home</Link>
              <Link href="/holder-list" aria-label="Refresh holders" title="Refresh holders" className="refresh-link">R</Link>
            </div>
          </header>

          <div className="page-content holder-content">
            <section className="holder-kpi-grid" aria-label="Holder metrics">
              {metrics.map((metric, index) => {
                const tone = metric.tone.includes("rose") ? "negative" : metric.tone.includes("emerald") ? "positive" : "muted";

                return (
                  <article key={metric.label} className="holder-kpi panel">
                    <div className="holder-kpi-heading">
                      <p>{metric.label}</p>
                      <span aria-hidden="true">0{index + 1}</span>
                    </div>
                    <p className="holder-kpi-value metric-value">{metric.value}</p>
                    <p className={`holder-kpi-detail ${tone}`}>{metric.detail}</p>
                  </article>
                );
              })}
            </section>

            <div className="holder-layout">
              <section className="holder-investor-stack" aria-label="Investor holdings">
                <div className="holder-section-label">
                  <div>
                    <p className="eyebrow">POSITION REGISTER</p>
                    <h2>Holdings by investor</h2>
                  </div>
                  <span className="panel-count">{holdings.length} POSITIONS</span>
                </div>

                {holdingsByInvestor.length === 0 ? (
                  <div className="holder-empty-panel panel">
                    <span className="holder-empty-mark" aria-hidden="true">00</span>
                    <div>
                      <h3>No active investors</h3>
                      <p>Add an investor from the control panel to begin assigning holdings.</p>
                    </div>
                  </div>
                ) : (
                  holdingsByInvestor.map(({ investor, holdings: investorHoldings }) => (
                    <InvestorGroup key={investor.id} name={investor.name} holdings={investorHoldings} />
                  ))
                )}
              </section>

              <aside className="holder-control-stack">
                <section className="holder-side-panel panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">REGISTRY</p>
                      <h2 className="panel-title">Investors</h2>
                    </div>
                    <span className="panel-count">{investors.length} ACTIVE</span>
                  </div>
                  <div className="holder-roster panel-body">
                    {investors.length === 0 ? (
                      <p className="holder-empty-note">No active investors in the registry.</p>
                    ) : (
                      investors.map((investor) => (
                        <div key={investor.id} className="holder-person-row">
                          <span className="holder-person-mark" aria-hidden="true">{investor.name.slice(0, 1)}</span>
                          <div className="holder-person-copy">
                            <strong title={investor.name}>{investor.name}</strong>
                            <small className="mono">ID {investor.id.slice(0, 8).toUpperCase()}</small>
                          </div>
                          <form action={removeInvestorAction}>
                            <input type="hidden" name="id" value={investor.id} />
                            <PendingButton
                              aria-label={`Remove ${investor.name}`}
                              title={`Remove ${investor.name}`}
                              pendingLabel=""
                              className="pm-button pm-button-danger pm-button-icon holder-remove-button"
                            >
                              x
                            </PendingButton>
                          </form>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="holder-side-panel panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">IDENTITY</p>
                      <h2 className="panel-title">Add / Edit Investor</h2>
                    </div>
                    <span className="data-tag">PERSON</span>
                  </div>
                  <form action={saveInvestorAction} className="holder-form panel-body">
                    <label className="holder-field">
                      <span className="holder-field-label">Investor Name</span>
                      <input name="name" placeholder="Alice Johnson" required className="bp6-input holder-input" />
                    </label>
                    <PendingButton className="pm-button pm-button-primary holder-submit" pendingLabel="Saving Investor">
                      Save Investor
                    </PendingButton>
                  </form>
                </section>

                <section className="holder-side-panel panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">ALLOCATION</p>
                      <h2 className="panel-title">Add Asset to Holder</h2>
                    </div>
                    <span className="data-tag">POSITION</span>
                  </div>
                  <form action={saveHoldingAction} className="holder-form panel-body">
                    <div className="holder-form-grid">
                      <label className="holder-field holder-field-wide">
                        <span className="holder-field-label">Investor</span>
                        <select name="investorId" className="holder-input holder-select">
                          {investors.map((investor) => (
                            <option key={investor.id} value={investor.id}>{investor.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="holder-field holder-field-wide">
                        <span className="holder-field-label">Asset</span>
                        <select name="assetId" className="holder-input holder-select">
                          {assets.map((asset) => (
                            <option key={asset.id} value={asset.id}>{asset.ticker} - {asset.fullName}</option>
                          ))}
                        </select>
                      </label>
                      <label className="holder-field">
                        <span className="holder-field-label">Shares</span>
                        <input name="shares" placeholder="100" required inputMode="decimal" className="bp6-input holder-input numeric" />
                      </label>
                      <label className="holder-field">
                        <span className="holder-field-label">Acquired Cost (THB)</span>
                        <input name="acquiredCost" placeholder="25000" required inputMode="decimal" className="bp6-input holder-input numeric" />
                      </label>
                      <label className="holder-field holder-field-wide">
                        <span className="holder-field-label">Acquired At</span>
                        <input name="acquiredAt" type="date" required className="bp6-input holder-input numeric" />
                      </label>
                    </div>
                    <PendingButton className="pm-button pm-button-primary holder-submit" pendingLabel="Saving Holding">
                      Save Holding
                    </PendingButton>
                  </form>
                </section>

                <section className="holder-side-panel panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">RECOVERY QUEUE</p>
                      <h2 className="panel-title">Deleted Investors</h2>
                    </div>
                    <span className="panel-count">{deletedInvestors.length} RECOVERABLE</span>
                  </div>
                  <div className="holder-roster panel-body">
                    {deletedInvestors.length === 0 ? (
                      <p className="holder-empty-note">No deleted investors to recover.</p>
                    ) : (
                      deletedInvestors.map((investor) => (
                        <div key={investor.id} className="holder-person-row is-deleted">
                          <span className="holder-person-mark" aria-hidden="true">{investor.name.slice(0, 1)}</span>
                          <div className="holder-person-copy">
                            <strong title={investor.name}>{investor.name}</strong>
                            <small>DELETED INVESTOR</small>
                          </div>
                          <form action={recoverInvestorAction}>
                            <input type="hidden" name="id" value={investor.id} />
                            <PendingButton className="pm-button holder-recover-button" pendingLabel="Restoring">
                              Recover
                            </PendingButton>
                          </form>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function NeonSetupPage({ title }: { title: string }) {
  return (
    <main className="setup-canvas holder-setup">
      <section className="setup-panel">
        <p className="eyebrow">DATA CONNECTION REQUIRED</p>
        <h1>{title}</h1>
        <p>
          Neon is enabled in the code, but <code>DATABASE_URL</code> is not set yet. Add your Neon Postgres connection string to <code>.env.local</code>,
          then restart the development server.
        </p>
        <Link href="/" className="toolbar-link holder-setup-link">Back to Home</Link>
      </section>
    </main>
  );
}
