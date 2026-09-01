import Link from "next/link";
import { AppSidebar } from "../components/app-sidebar";
import {
  formatCurrency,
  formatEth,
  formatThb,
  formatUsd,
  getJoinedPortfolio,
  type JoinedNftHolding,
  type JoinedPortfolio,
  type JoinedT212Position,
  type LiveSourceState,
  type SourceStatus,
} from "@/lib/live-data";
import "./holder-list.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InvestorView = {
  code: "A" | "B" | "C";
  name: "Bodin" | "PP" | "Sonya";
  share: number;
};

function beneficialValue(value: number | null | undefined, share: number): number | null {
  if (share === 0) return 0;
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value * share;
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number | null | undefined, maximumFractionDigits = 6): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date) + " UTC";
}

function SourceBadge({ state }: { state: LiveSourceState }) {
  return (
    <span className={`holder-source-badge is-${state.status}`}>
      <span aria-hidden="true" />
      {state.status.toUpperCase()}
    </span>
  );
}

function PositionTable({
  positions,
  portfolio,
  share,
}: {
  positions: JoinedT212Position[];
  portfolio: JoinedPortfolio;
  share: number;
}) {
  const source = portfolio.sources.t212Positions;

  if (source.status === "unavailable") {
    return (
      <div className="holder-unavailable-state" role="status">
        <strong>Position data unavailable</strong>
        <p>{source.message} No position count or value has been assumed.</p>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="holder-empty-state">
        <strong>No T212 positions yet</strong>
        <p>No positions are held right now. Stocks and ETFs bought in T212 will appear here live.</p>
      </div>
    );
  }

  return (
    <div className="holder-table-scroll">
      <table className="holder-data-table holder-position-table">
        <thead>
          <tr>
            <th>Ticker / asset</th>
            <th className="numeric">Beneficial qty</th>
            <th className="numeric">Average</th>
            <th className="numeric">Current</th>
            <th className="numeric">Beneficial value</th>
            <th className="numeric">P/L allocation</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => {
            const priceCurrency = position.currency;
            const pnlCurrency = position.pplCurrency ?? portfolio.t212.currency;

            return (
              <tr key={position.ticker}>
                <td>
                  <span className="holder-ticker">{position.ticker}</span>
                  <small>{position.name}</small>
                </td>
                <td className="numeric">{formatQuantity(position.quantity * share)}</td>
                <td className="numeric muted">{formatCurrency(position.averagePrice, priceCurrency)}</td>
                <td className="numeric">{formatCurrency(position.currentPrice, priceCurrency)}</td>
                <td className="numeric holder-value-cell">
                  {formatThb(beneficialValue(position.valueThb, share))}
                </td>
                <td className={`numeric ${position.ppl === null ? "muted" : position.ppl >= 0 ? "positive" : "negative"}`}>
                  {formatCurrency(beneficialValue(position.ppl, share), pnlCurrency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NftTable({
  holdings,
  source,
  share,
}: {
  holdings: JoinedNftHolding[];
  source: LiveSourceState;
  share: number;
}) {
  if (source.status === "unavailable") {
    return (
      <div className="holder-unavailable-state" role="status">
        <strong>NFT holdings unavailable</strong>
        <p>{source.message} No collection count, floor, or wallet value has been assumed.</p>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="holder-empty-state">
        <strong>No NFT collections in the live wallet</strong>
        <p>The current wallet response contains no holdings.</p>
      </div>
    );
  }

  return (
    <div className="holder-table-scroll">
      <table className="holder-data-table holder-nft-table">
        <thead>
          <tr>
            <th>Collection</th>
            <th className="numeric">Wallet tokens</th>
            <th className="numeric">Floor</th>
            <th className="numeric">Beneficial ETH</th>
            <th className="numeric">Beneficial USD</th>
            <th className="numeric">Beneficial THB</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => (
            <tr key={holding.collection}>
              <td>
                <span className="holder-collection">{holding.collectionName}</span>
                <small>{holding.collection}</small>
              </td>
              <td className="numeric">{holding.tokenCount}</td>
              <td className="numeric">
                {holding.floorEth === null ? "—" : `${formatQuantity(holding.floorEth, 7)} ETH`}
              </td>
              <td className="numeric">{formatEth(beneficialValue(holding.valueEth, share))}</td>
              <td className="numeric">{formatUsd(beneficialValue(holding.valueUsd, share))}</td>
              <td className="numeric holder-value-cell">{formatThb(beneficialValue(holding.valueThb, share))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvestorPanel({ investor, portfolio }: { investor: InvestorView; portfolio: JoinedPortfolio }) {
  const isZeroShare = investor.share === 0;
  const accountCurrency = portfolio.t212.currency;
  const accountValueShare = beneficialValue(portfolio.t212.totalValue, investor.share);
  const cashShare = beneficialValue(portfolio.t212.cashAvailable, investor.share);
  const positionCount = portfolio.sources.t212Positions.status === "unavailable"
    ? null
    : portfolio.t212.investments.length;

  return (
    <article className={`holder-investor-panel panel ${isZeroShare ? "is-zero-share" : ""}`}>
      <header className="holder-investor-header">
        <div className="holder-investor-identity">
          <span className="holder-investor-mark" aria-hidden="true">{investor.code}</span>
          <div>
            <p className="eyebrow">INVESTOR {investor.code} / BENEFICIAL OWNERSHIP</p>
            <div className="holder-investor-title-line">
              <h2>{investor.code} / {investor.name}</h2>
              <span className="data-tag">{isZeroShare ? "NO ALLOCATION" : "ACTIVE SPLIT"}</span>
            </div>
          </div>
        </div>
        <div className="holder-share-readout">
          <small>RETURNED SHARE</small>
          <strong>{formatPercent(investor.share)}</strong>
        </div>
      </header>

      <section className="holder-benefit-grid" aria-label={`${investor.name} beneficial value`}>
        <div>
          <span>Joined beneficial value</span>
          <strong>{formatThb(beneficialValue(portfolio.totals.grandTotalThb, investor.share))}</strong>
          <small>{formatUsd(beneficialValue(portfolio.totals.grandTotalUsd, investor.share))}</small>
        </div>
        <div>
          <span>T212 account share</span>
          <strong>{formatThb(beneficialValue(portfolio.totals.t212Thb, investor.share))}</strong>
          <small>{formatCurrency(accountValueShare, accountCurrency)} account value</small>
        </div>
        <div>
          <span>NFT wallet share</span>
          <strong>{formatThb(beneficialValue(portfolio.totals.nftsThb, investor.share))}</strong>
          <small>
            {formatEth(beneficialValue(portfolio.totals.nftsEth, investor.share))}
            <span aria-hidden="true"> · </span>
            {formatUsd(beneficialValue(portfolio.totals.nftsUsd, investor.share))}
          </small>
        </div>
      </section>

      {isZeroShare ? (
        <section className="holder-zero-allocation">
          <span className="holder-zero-mark" aria-hidden="true">0%</span>
          <div>
            <h3>Explicit zero beneficial ownership</h3>
            <p>
              Sonya currently has 0% of T212 cash, T212 positions, and the NFT wallet under the returned ownership configuration.
            </p>
          </div>
        </section>
      ) : (
        <div className="holder-asset-grid">
          <section className="holder-live-panel" aria-labelledby={`t212-${investor.code}`}>
            <header className="holder-live-panel-header">
              <div>
                <p className="eyebrow">TRADING 212 / CASH + POSITIONS</p>
                <h3 id={`t212-${investor.code}`}>Beneficial account interest</h3>
              </div>
              <div className="holder-source-badges">
                <SourceBadge state={portfolio.sources.t212Summary} />
                <SourceBadge state={portfolio.sources.t212Positions} />
              </div>
            </header>

            <dl className="holder-account-strip">
              <div>
                <dt>Beneficial cash available</dt>
                <dd>{formatCurrency(cashShare, accountCurrency)}</dd>
                <small>Account cash: {formatCurrency(portfolio.t212.cashAvailable, accountCurrency)}</small>
              </div>
              <div>
                <dt>Beneficial account value</dt>
                <dd>{formatCurrency(accountValueShare, accountCurrency)}</dd>
                <small>{formatThb(beneficialValue(portfolio.totals.t212Thb, investor.share))} at live FX</small>
              </div>
              <div>
                <dt>Open positions</dt>
                <dd>{positionCount === null ? "—" : positionCount}</dd>
                <small>{formatPercent(investor.share)} economic allocation</small>
              </div>
            </dl>

            <PositionTable positions={portfolio.t212.investments} portfolio={portfolio} share={investor.share} />
          </section>

          <section className="holder-live-panel" aria-labelledby={`nft-${investor.code}`}>
            <header className="holder-live-panel-header">
              <div>
                <p className="eyebrow">ROBINHOOD CHAIN / NFT WALLET</p>
                <h3 id={`nft-${investor.code}`}>Beneficial wallet interest</h3>
              </div>
              <SourceBadge state={portfolio.sources.nfts} />
            </header>
            <div className="holder-economic-note">
              Wallet token counts remain whole-wallet counts; values below apply the returned {formatPercent(investor.share)} economic share.
            </div>
            <NftTable holdings={portfolio.nfts} source={portfolio.sources.nfts} share={investor.share} />
          </section>
        </div>
      )}
    </article>
  );
}

function overallSourceStatus(states: LiveSourceState[]): { status: SourceStatus; label: string } {
  if (states.some((state) => state.status === "unavailable")) {
    return { status: "unavailable", label: "DEGRADED SOURCES" };
  }
  if (states.some((state) => state.status === "partial")) {
    return { status: "partial", label: "PARTIAL SOURCES" };
  }
  return { status: "live", label: "ALL SOURCES LIVE" };
}

export default async function HolderListPage() {
  const portfolio = await getJoinedPortfolio();
  const investors: InvestorView[] = [
    { code: "A", name: "Bodin", share: portfolio.ownership.aShare },
    { code: "B", name: "PP", share: portfolio.ownership.bShare },
    { code: "C", name: "Sonya", share: portfolio.ownership.cShare },
  ];
  const sourceCards: Array<{ label: string; provider: string; state: LiveSourceState }> = [
    { label: "T212 account", provider: "Trading 212 summary", state: portfolio.sources.t212Summary },
    { label: "T212 positions", provider: "Trading 212 positions", state: portfolio.sources.t212Positions },
    { label: "NFT wallet", provider: "OpenSea", state: portfolio.sources.nfts },
    { label: "Fiat FX", provider: "open.er-api.com", state: portfolio.sources.fiatFx },
    { label: "ETH / USD", provider: "CoinGecko", state: portfolio.sources.ethPrice },
  ];
  const overall = overallSourceStatus(sourceCards.map((source) => source.state));
  const t212PositionDetail = portfolio.sources.t212Positions.status === "unavailable"
    ? "Position count unavailable"
    : `${portfolio.t212.investments.length} open position${portfolio.t212.investments.length === 1 ? "" : "s"}`;
  const nftCollectionDetail = portfolio.sources.nfts.status === "unavailable"
    ? "Collection count unavailable"
    : `${portfolio.nfts.length} live collection${portfolio.nfts.length === 1 ? "" : "s"}`;

  return (
    <main className="app-root holder-page">
      <div className="workspace-shell">
        <AppSidebar active="holder-list" />

        <section className="workspace-main">
          <header className="page-header">
            <div className="page-title-group">
              <p className="eyebrow">LIVE JOINED PORT / BENEFICIAL OWNERSHIP</p>
              <h1 className="page-title">Holder List</h1>
              <p className="page-subtitle">T212 cash and positions plus NFT wallet value, allocated from one live snapshot</p>
            </div>
            <div className="header-tools">
              <span className={`header-status holder-header-status is-${overall.status}`}>
                <span className="status-light" aria-hidden="true" />
                {overall.label}
              </span>
              <Link href="/exchange-rate" className="toolbar-link">Exchange Rates</Link>
              <Link href="/" className="toolbar-link">Home</Link>
              <Link href="/holder-list" aria-label="Refresh live holders" title="Refresh live holders" className="refresh-link">R</Link>
            </div>
          </header>

          <div className="page-content holder-content">
            <section className="holder-summary-grid" aria-label="Live ownership summary">
              <article className="holder-summary-card panel is-primary">
                <span className="holder-metric-index">01 / JOINED TOTAL</span>
                <p>Live portfolio value</p>
                <strong>{formatThb(portfolio.totals.grandTotalThb)}</strong>
                <small>{formatUsd(portfolio.totals.grandTotalUsd)} secondary</small>
              </article>
              <article className="holder-summary-card panel">
                <span className="holder-metric-index">02 / T212 ACCOUNT</span>
                <p>Cash + positions</p>
                <strong>{formatThb(portfolio.totals.t212Thb)}</strong>
                <small>
                  {formatCurrency(portfolio.t212.cashAvailable, portfolio.t212.currency)} cash
                  <span aria-hidden="true"> · </span>
                  {t212PositionDetail}
                </small>
              </article>
              <article className="holder-summary-card panel">
                <span className="holder-metric-index">03 / NFT WALLET</span>
                <p>Collection floor value</p>
                <strong>{formatThb(portfolio.totals.nftsThb)}</strong>
                <small>{formatEth(portfolio.totals.nftsEth)} · {nftCollectionDetail}</small>
              </article>
              <article className="holder-summary-card panel">
                <span className="holder-metric-index">04 / RETURNED SPLIT</span>
                <p>Beneficial owners</p>
                <strong className="holder-split-value">
                  A {formatPercent(portfolio.ownership.aShare)} / B {formatPercent(portfolio.ownership.bShare)}
                </strong>
                <small>C / Sonya {formatPercent(portfolio.ownership.cShare)}</small>
              </article>
            </section>

            <section className="holder-investor-stack" aria-labelledby="holder-register-title">
              <div className="holder-section-heading">
                <div>
                  <p className="eyebrow">BENEFICIAL POSITION REGISTER</p>
                  <h2 id="holder-register-title">A / Bodin · B / PP · C / Sonya</h2>
                </div>
                <span className="panel-count">3 HOLDERS / LIVE CONFIG</span>
              </div>
              {investors.map((investor) => (
                <InvestorPanel key={investor.code} investor={investor} portfolio={portfolio} />
              ))}
            </section>

            <section className="holder-sources panel" aria-labelledby="holder-sources-title">
              <header className="panel-header">
                <div>
                  <p className="eyebrow">SOURCE HEALTH / FAIL-SOFT READOUT</p>
                  <h2 className="panel-title" id="holder-sources-title">Live source states</h2>
                  <p className="panel-subtitle">Unavailable values stay as —; no missing value is treated as zero.</p>
                </div>
                <span className="panel-count">SNAPSHOT {formatTimestamp(portfolio.asOf)}</span>
              </header>
              <div className="holder-source-grid">
                {sourceCards.map((source) => (
                  <article className="holder-source-card" key={source.label}>
                    <div>
                      <span>{source.label}</span>
                      <SourceBadge state={source.state} />
                    </div>
                    <strong>{source.provider}</strong>
                    <p>{source.state.message}</p>
                    <small>As of {formatTimestamp(source.state.asOf)}</small>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
