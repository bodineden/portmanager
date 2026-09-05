import { formatEth, formatThb, formatUsd, type JoinedPortfolio } from "@/lib/live-data";
import type { HoldingPnl } from "@/lib/pnl";
import { basisChip, eligibilityLabel, formatHoldingQuantity, formatPnlPercent } from "@/lib/pnl-view";

type AssetRow = HoldingPnl & { id: string; name: string; detail: string; quantity: string; valueUsd: number | null; valueThb: number | null; walletKind?: "native" | "token"; priced?: boolean };

export function PnlAssetTable({ portfolio }: { portfolio: JoinedPortfolio }) {
  const { t212, nfts, wallet, totals } = portfolio;
  const rows: AssetRow[] = [
    ...t212.investments.map((row) => ({ ...row, id: `t212:${row.ticker}`, name: row.ticker, detail: `Trading 212 · ${row.name}`, quantity: formatHoldingQuantity(row.quantity) })),
    ...nfts.map((row) => ({ ...row, id: `nft:${row.collection}`, name: row.collectionName, detail: `NFT collection · floor ${formatEth(row.floorEth)}`, quantity: `${row.tokenCount} NFTs` })),
    ...[...wallet.native].sort((a, b) => Number(b.valueUsd !== null) - Number(a.valueUsd !== null)).map((row) => ({ ...row, id: `native:${row.chainId}`, name: row.symbol, detail: `${row.chainName} · native`, quantity: formatHoldingQuantity(row.amount, 18), walletKind: "native" as const, priced: row.valueUsd !== null })),
    ...[...wallet.tokens].sort((a, b) => Number(b.priced) - Number(a.priced)).map((row) => ({ ...row, id: `token:${row.chainId}:${row.contract ?? row.symbol}`, name: row.symbol, detail: `${row.chainName} · ${row.name}`, quantity: formatHoldingQuantity(row.amount, 18), walletKind: "token" as const })),
  ];
  const hasPnl = totals.pnlCoverage.eligible > 0;
  return <section className="panel pnl-assets">
    <div className="panel-header"><div><p className="eyebrow">VALUE &amp; RECORDED BASIS</p><h2 className="panel-title">Per-asset P&amp;L</h2></div><span className="panel-count">{rows.length} holdings · all rows</span></div>
    <p className="pnl-panel-note">Recorded basis only. Cash has no P&amp;L. Dust, unpriced and unreconciled holdings are excluded from P&amp;L totals. Basis is not a tax-cost figure.</p>
    {rows.length === 0 ? <div className="home-empty"><strong>{totals.pnlCoverage.sourcesComplete ? "No holdings in this snapshot" : "Holdings unavailable — P&L coverage is incomplete"}</strong><p>No recorded cost basis is available to display. Missing source data is never treated as an empty account.</p></div> :
      <div className="table-scroll"><table className="data-table pnl-asset-table">
        <caption className="sr-only">Every joined holding with current value, basis provenance and unrealized P&amp;L; USD first, THB secondary.</caption>
        <thead><tr><th>Asset / quantity</th><th className="numeric">Current value · USD</th><th className="numeric">Cost basis · USD</th><th className="numeric">P&amp;L · USD / %</th><th>Basis status / eligibility</th></tr></thead>
        <tbody>{rows.map((row) => {
          const unknown = row.basisStatus === "not-recorded";
          const excluded = row.pnlEligibility !== "eligible";
          const status = basisChip(row.basisStatus);
          return <tr key={row.id} data-basis-status={row.basisStatus} data-pnl-eligibility={row.pnlEligibility} data-wallet-kind={row.walletKind} data-wallet-priced={row.walletKind ? String(row.priced) : undefined} className={excluded ? "pnl-row-excluded" : ""}>
            <td><strong className="ticker-cell">{row.name}</strong><small className="sub-cell">{row.detail}</small><small className="sub-cell">{row.quantity}</small></td>
            <td className="numeric value-cell" data-pnl-cell="value">{formatUsd(row.valueUsd)}<small className="sub-cell">{formatThb(row.valueThb)}</small>{row.pnlEligibility === "dust" && <small className="sub-cell">Dust · below $1</small>}{row.pnlEligibility === "unpriced" && <small className="sub-cell">Unpriced</small>}</td>
            <td className="numeric" data-pnl-cell="basis">{formatUsd(unknown ? null : row.costBasisUsd)}<small className="sub-cell">{formatThb(unknown ? null : row.costBasisThb)}</small>{unknown && <small className="sub-cell">basis not recorded</small>}</td>
            <td className={`numeric ${unknown || row.pnlUsd === null ? "muted" : row.pnlUsd >= 0 ? "positive" : "negative"}`} data-pnl-cell="pnl">{formatUsd(unknown ? null : row.pnlUsd)}<small className="sub-cell">{formatThb(unknown ? null : row.pnlThb)} · {formatPnlPercent(unknown || row.basisStatus === "airdrop-free" ? null : row.pnlPct)}</small>{excluded && <small className="sub-cell">Excluded from P&amp;L totals</small>}</td>
            <td><span className={`basis-chip is-${row.basisStatus}`} title={row.basisNote}>{status.label}</span><small className={`sub-cell ${row.pnlEligibility === "unreconciled" ? "warning" : ""}`}>{eligibilityLabel(row.pnlEligibility)}</small>{row.basisStatus === "airdrop-free" && <small className="sub-cell">Verified free acquisition · percentage unavailable</small>}</td>
          </tr>;
        })}</tbody>
        <tfoot><tr className="table-total-row"><td><strong>Eligible P&amp;L totals</strong><small className="sub-cell">{totals.pnlCoverage.eligible} of {totals.pnlCoverage.totalHoldings} holdings</small></td><td className="numeric">—<small className="sub-cell">Full value is shown above</small></td><td className="numeric">{formatUsd(hasPnl ? totals.costBasisUsd : null)}<small className="sub-cell">{formatThb(hasPnl ? totals.costBasisThb : null)}</small></td><td className="numeric">{formatUsd(hasPnl ? totals.pnlUsd : null)}<small className="sub-cell">{formatThb(hasPnl ? totals.pnlThb : null)} · {formatPnlPercent(hasPnl ? totals.pnlPct : null)}</small></td><td>{totals.pnlCoverage.status} coverage</td></tr></tfoot>
      </table></div>}
  </section>;
}
