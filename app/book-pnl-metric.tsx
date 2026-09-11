import { formatThb, formatUsd, type JoinedPortfolio } from "@/lib/live-data";
import { formatPnlMoney, formatPnlPercent } from "@/lib/pnl-view";

export function BookPnlMetric({ portfolio }: { portfolio: JoinedPortfolio }) {
  const { capital, totals, sources } = portfolio;
  const pnl = capital.available ? totals.bookPnl : null;
  const partial = Object.entries(sources).some(([key, source]) => key !== "capital" && source.status !== "live");
  return <article className="panel pnl-metric" data-book-pnl={pnl ? "available" : "unavailable"}>
    <p className="eyebrow">BOOK VALUE / CONTRIBUTED CAPITAL</p><h2>Book P&amp;L</h2>
    <div className="pnl-metric-line"><strong className={pnl ? pnl.pnlUsd >= 0 ? "positive" : "negative" : ""}>{formatPnlMoney(pnl?.pnlUsd)}</strong><span>{formatPnlPercent(pnl?.pnlPct)}</span></div>
    <small>{formatPnlMoney(pnl?.pnlThb, "THB")} THB</small>
    {capital.available ? <>
      <p>Contributed capital {formatThb(capital.contributedThb)}</p>
      <p className="muted">{formatUsd(capital.contributedUsd)} · basis display at snapshot FX</p>
      <p>{pnl ? partial ? "Known book value less capital · source coverage is incomplete; see source status." : "Full book value less contributed capital." : "Book value or FX unavailable — book P&L unavailable."}</p>
    </> : <p>Contributed capital not recorded — book P&amp;L unavailable</p>}
  </article>;
}
