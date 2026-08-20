import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import { PendingButton } from "../components/pending-button";
import { formatDateTime, isNeonConfigured, listCurrencies, listExchangeRates } from "@/lib/assets-db";
import { saveExchangeRateAction } from "./actions";
import "./exchange-rate.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ExchangeRatePage() {
  if (!isNeonConfigured()) {
    return <NeonSetupPage title="Exchange Rate" />;
  }

  const currencies = await listCurrencies();
  const exchangeRates = await listExchangeRates();

  return (
    <main className="workspace-shell exchange-rate-page">
      <AppSidebar active="exchange-rate" />

      <section className="workspace-main">
        <header className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">PORTFOLIO OPERATIONS / FOREIGN EXCHANGE</p>
            <h1 className="page-title">Exchange Rate</h1>
            <p className="page-subtitle">Maintain the conversion pairs used for THB portfolio reporting</p>
          </div>
          <div className="header-tools">
            <span className="header-meta"><span className="exchange-rate-signal" aria-hidden="true" /> BASE CURRENCY · THB</span>
            <Link href="/" className="toolbar-link">Command Center</Link>
            <Link href="/exchange-rate" aria-label="Refresh exchange rates" title="Refresh exchange rates" className="refresh-link">R</Link>
          </div>
        </header>

        <div className="page-content exchange-rate-content">
          <section className="exchange-rate-readout panel" aria-label="Exchange-rate coverage">
            <div>
              <span>SETTLEMENT BASE</span>
              <strong>THB</strong>
              <small>Portfolio reporting currency</small>
            </div>
            <div>
              <span>SUPPORTED CURRENCIES</span>
              <strong>{currencies.length.toLocaleString("en-US")}</strong>
              <small>Available in the currency registry</small>
            </div>
            <div>
              <span>ACTIVE PAIRS</span>
              <strong>{exchangeRates.length.toLocaleString("en-US")}</strong>
              <small>Latest recorded pair values</small>
            </div>
          </section>

          <div className="exchange-rate-grid">
            <section className="panel exchange-rate-form-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">RATE CONTROL</p>
                  <h2 className="panel-title">Add / Update Rate</h2>
                  <p className="panel-subtitle">Write the latest value for a currency pair</p>
                </div>
                <span className="data-tag">SERVER ACTION</span>
              </div>
              <div className="panel-body">
                <form action={saveExchangeRateAction} className="exchange-rate-form">
                  <label className="exchange-rate-field" htmlFor="exchange-rate-from">
                    <span>From Currency</span>
                    <select id="exchange-rate-from" name="fromCurrency" defaultValue="USD" className="exchange-rate-control">
                      {currencies.map((currency) => (
                        <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="exchange-rate-direction" aria-hidden="true">
                    <span />
                    <b>TO</b>
                    <span />
                  </div>

                  <label className="exchange-rate-field" htmlFor="exchange-rate-to">
                    <span>To Currency</span>
                    <select id="exchange-rate-to" name="toCurrency" defaultValue="THB" className="exchange-rate-control">
                      {currencies.map((currency) => (
                        <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="exchange-rate-field" htmlFor="exchange-rate-value">
                    <span>Exchange Rate</span>
                    <input
                      id="exchange-rate-value"
                      name="rate"
                      placeholder="36.50"
                      required
                      inputMode="decimal"
                      className="exchange-rate-control exchange-rate-value"
                    />
                    <small>Value of one FROM unit measured in the TO currency.</small>
                  </label>

                  <div className="exchange-rate-form-note">
                    <span className="exchange-rate-signal" aria-hidden="true" />
                    <p>Saving appends a timestamped rate and immediately refreshes portfolio conversions.</p>
                  </div>

                  <PendingButton className="pm-button pm-button-primary exchange-rate-submit" pendingLabel="Saving Rate">
                    Save Rate
                  </PendingButton>
                </form>
              </div>
            </section>

            <section className="panel exchange-rate-table-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">CURRENT MARKET INPUTS</p>
                  <h2 className="panel-title">Latest Rates</h2>
                  <p className="panel-subtitle">Most recent value retained for each recorded pair</p>
                </div>
                <span className="panel-count">{exchangeRates.length.toLocaleString("en-US")} PAIRS</span>
              </div>
              <div className="exchange-rate-table-wrap">
                <table className="exchange-rate-table data-table">
                  <caption className="sr-only">Latest recorded exchange rates</caption>
                  <thead>
                    <tr>
                      <th scope="col">Pair</th>
                      <th scope="col">From</th>
                      <th scope="col">To</th>
                      <th scope="col">Rate</th>
                      <th scope="col">Recorded At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exchangeRates.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="exchange-rate-empty">No exchange rates recorded.</td>
                      </tr>
                    ) : exchangeRates.map((exchangeRate) => (
                      <tr key={exchangeRate.id}>
                        <td>
                          <span className="exchange-rate-pair">
                            <b>{exchangeRate.fromCurrency}</b>
                            <span aria-hidden="true">→</span>
                            <b>{exchangeRate.toCurrency}</b>
                          </span>
                        </td>
                        <td><span className="currency-badge">{exchangeRate.fromCurrency}</span></td>
                        <td><span className="currency-badge exchange-rate-base-badge">{exchangeRate.toCurrency}</span></td>
                        <td className="numeric exchange-rate-number">{exchangeRate.rate.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                        <td className="exchange-rate-timestamp">{formatDateTime(exchangeRate.recordedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="exchange-rate-table-footer">
                <span><i className="exchange-rate-signal" aria-hidden="true" /> LIVE INPUT SET</span>
                <small>Rates are stored as time-stamped observations in Neon.</small>
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
    <main className="setup-canvas exchange-rate-page">
      <section className="setup-panel exchange-rate-setup-panel">
        <p className="eyebrow">DATA CONNECTION / ACTION REQUIRED</p>
        <div className="exchange-rate-setup-mark" aria-hidden="true">FX</div>
        <h1>{title}</h1>
        <p className="exchange-rate-setup-copy">
          Neon is enabled in the code, but <code>DATABASE_URL</code> is not set yet. Add your Neon Postgres connection string to <code>.env.local</code>, then restart the development server.
        </p>
        <Link href="/" className="toolbar-link exchange-rate-setup-link">Return to Command Center</Link>
      </section>
    </main>
  );
}
