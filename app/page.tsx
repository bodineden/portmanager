import Link from "next/link";
import { AppSidebar } from "./components/app-sidebar";
import {
  fetchFxRates,
  fetchNftPort,
  fetchT212Positions,
  formatEth,
  formatThb,
  formatUsd,
} from "@/lib/live-data";
import { requireSession } from "@/lib/auth";
import "./home.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function usdToThb(usd: number | null | undefined, usdToThb: number): number | null {
  if (usd === null || usd === undefined || Number.isNaN(usd) || usdToThb <= 0) return null;
  return usd * usdToThb;
}

export default async function Home() {
  const email = await requireSession();

  const [positions, nftPort, fx] = await Promise.all([
    fetchT212Positions(),
    fetchNftPort(),
    fetchFxRates(),
  ]);

  // ---- Stocks port (T212, live) ----
  const stocksRows = positions.map((p) => {
    const usdValue = p.currentPrice * p.quantity;
    return { ...p, usdValue };
  });

  // ---- Crypto / NFT port (wallet, live) ----
  const nftTotalEth = nftPort.reduce((sum, h) => sum + (h.valueEth ?? 0), 0);
  const nftTotalUsd = fx.ethToUsd !== null ? nftTotalEth * fx.ethToUsd : null;
  const nftTotalThb = usdToThb(nftTotalUsd, fx.usdToThb);

  // NOTE: T212 returns prices in the instrument currency; convert per row.
  const stockRowsWithThb = stocksRows.map((r) => {
    let thb: number | null = null;
    if (r.currencyCode === "USD") thb = r.usdValue * (fx.usdToThb || 0);
    else if (r.currencyCode === "GBP") thb = r.usdValue * (fx.gbpToThb || 0);
    else if (r.currencyCode === "EUR") thb = r.usdValue * (fx.eurToThb || 0);
    return { ...r, thb };
  });

  const grandTotalThb =
    (stockRowsWithThb.reduce((sum, r) => sum + (r.thb ?? 0), 0) || 0) + (nftTotalThb ?? 0);

  const dataAsOf = new Date().toISOString().slice(0, 16).replace("T", " ");

  return (
    <main className="workspace-shell home-shell">
      <AppSidebar active="home" email={email ?? undefined} />

      <section className="workspace-main">
        <header className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">PORTFOLIO OPERATIONS / LIVE JOINED PORT</p>
            <h1 className="page-title">Command Center</h1>
            <p className="page-subtitle">Stocks (Trading 212) + Crypto/NFT (wallet) — one live picture, in THB</p>
          </div>
          <div className="header-status">
            <span className="status-light" /> LIVE · {dataAsOf} UTC
          </div>
        </header>

        <div className="page-content home-content">
          <section className="home-kpi-grid" aria-label="Joined portfolio summary">
            <article className="kpi-card kpi-total">
              <span className="metric-index">01 / JOINED TOTAL</span>
              <span className="metric-label">Stocks + NFT port</span>
              <strong className="metric-value">{formatThb(grandTotalThb || null)}</strong>
              <small>THB · live FX</small>
            </article>
            <article className="kpi-card">
              <span className="metric-index">02 / STOCKS</span>
              <span className="metric-label">Trading 212 positions</span>
              <strong className="metric-value">{formatThb(stockRowsWithThb.reduce((s, r) => s + (r.thb ?? 0), 0) || null)}</strong>
              <small>{positions.length} open positions</small>
            </article>
            <article className="kpi-card">
              <span className="metric-index">03 / NFT PORT</span>
              <span className="metric-label">Wallet holdings · A/B 50/50</span>
              <strong className="metric-value">{formatThb(nftTotalThb)}</strong>
              <small>{formatEth(nftTotalEth)} · {formatUsd(nftTotalUsd)}</small>
            </article>
          </section>

          <section className="panel home-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">STOCKS PORT / TRADING 212</p>
                <h2 className="panel-title">Live Positions</h2>
              </div>
              <span className="panel-count">{positions.length} POSITIONS</span>
            </div>

            {positions.length === 0 ? (
              <div className="home-empty">
                <strong>No open positions in Trading 212 yet</strong>
                <p>
                  Assets are still with the previous broker — sell those positions and move them into T212,
                  and they will appear here live via the T212 API. No price scraping needed anymore.
                </p>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="data-table live-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th className="numeric">Qty</th>
                      <th className="numeric">Avg Cost</th>
                      <th className="numeric">Current</th>
                      <th className="numeric">Value (THB)</th>
                      <th className="numeric">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockRowsWithThb.map((r) => (
                      <tr key={r.ticker}>
                        <td><span className="ticker-cell">{r.ticker}</span></td>
                        <td className="numeric">{r.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                        <td className="numeric muted">{r.averagePrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                        <td className="numeric">{r.currentPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                        <td className="numeric value-cell">{formatThb(r.thb)}</td>
                        <td className={`numeric ${r.ppl >= 0 ? "positive" : "negative"}`}>
                          {r.ppl >= 0 ? "+" : ""}{formatUsd(r.ppl)}
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
                <p className="eyebrow">CRYPTO / NFT PORT / WALLET</p>
                <h2 className="panel-title">NFT Holdings — Investor A &amp; B, equal split</h2>
              </div>
              <span className="panel-count">{nftPort.length} COLLECTIONS</span>
            </div>

            {nftPort.length === 0 ? (
              <div className="home-empty">
                <strong>No NFT holdings found on the wallet</strong>
                <p>Wallet {process.env.NFT_WALLET || "0xC1bd…c609"} on Robinhood Chain. Holdings and live floors come straight from OpenSea.</p>
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
                    {nftPort.map((h) => {
                      const usd = fx.ethToUsd !== null && h.valueEth !== null ? h.valueEth * fx.ethToUsd : null;
                      const thb = usdToThb(usd, fx.usdToThb);
                      return (
                        <tr key={h.collection}>
                          <td><span className="ticker-cell">{h.collectionName}</span><small className="sub-cell">{h.collection}</small></td>
                          <td className="numeric">{h.tokenCount}</td>
                          <td className="numeric">{h.floorEth?.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                          <td className="numeric">{h.valueEth?.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                          <td className="numeric">{formatUsd(usd)}</td>
                          <td className="numeric value-cell">{formatThb(thb)}</td>
                        </tr>
                      );
                    })}
                    <tr className="table-total-row">
                      <td><strong>Total NFT port</strong></td>
                      <td className="numeric">{nftPort.reduce((s, h) => s + h.tokenCount, 0)}</td>
                      <td className="numeric">—</td>
                      <td className="numeric"><strong>{formatEth(nftTotalEth)}</strong></td>
                      <td className="numeric"><strong>{formatUsd(nftTotalUsd)}</strong></td>
                      <td className="numeric"><strong>{formatThb(nftTotalThb)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="home-ownership-note">
              <span className="status-light" aria-hidden="true" />
              <p>
                <strong>Ownership:</strong> Investor A holds 50% · Investor B holds 50% of the NFT port.
                {fx.ethToUsd !== null ? ` ETH ≈ ${formatUsd(fx.ethToUsd)}.` : ""} Floors update live from OpenSea.
              </p>
            </div>
          </section>

          <section className="panel home-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">LIVE FX / CONVERSION</p>
                <h2 className="panel-title">Rates (ECB via open.er-api.com)</h2>
              </div>
              <span className="panel-count">AS OF {fx.asOf.slice(0, 16).replace("T", " ")}</span>
            </div>
            <div className="fx-strip">
              <div><small>USD → THB</small><strong>{fx.usdToThb ? fx.usdToThb.toFixed(2) : "—"}</strong></div>
              <div><small>GBP → THB</small><strong>{fx.gbpToThb ? fx.gbpToThb.toFixed(2) : "—"}</strong></div>
              <div><small>EUR → THB</small><strong>{fx.eurToThb ? fx.eurToThb.toFixed(2) : "—"}</strong></div>
              <div><small>ETH → USD</small><strong>{fx.ethToUsd !== null ? fx.ethToUsd.toFixed(2) : "—"}</strong></div>
            </div>
          </section>

          <section className="home-footnote">
            <span>TRANSPARENT SOURCES</span>
            <p>
              Stocks: Trading 212 Public API · NFT floors: OpenSea API · FX: open.er-api.com (ECB).
              No scraping. The historical ledger pages remain under Navigation.
            </p>
            <Link href="/portfolio" className="toolbar-link">Open ledger analytics →</Link>
          </section>
        </div>
      </section>
    </main>
  );
}
