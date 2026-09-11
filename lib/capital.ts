/** Operator-reported book capital, never inferred from broker transfers or asset basis. */
export type CapitalEvent = { occurredAt: string; kind: "contribution" | "withdrawal"; amountThb: number };
export type ManualHoldingReport = {
  id: string; recordedAt: string; createdAt: string; label: string; kind: "cash"; currency: string; amount: number;
};
export type BookCapital = { contributedThb: number | null; contributedUsd: number | null; asOf: string; available: boolean };
export type BookPnl = { pnlThb: number; pnlUsd: number; pnlPct: number | null };

export function sumContributedCapital(events: readonly CapitalEvent[], asOf: string): number | null {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) return null;
  const rows = events.filter((row) => Date.parse(row.occurredAt) <= cutoff);
  if (!rows.length || rows.some((row) => !Number.isFinite(row.amountThb) || row.amountThb <= 0
    || !["contribution", "withdrawal"].includes(row.kind))) return null;
  const sum = rows.reduce((total, row) => total + (row.kind === "contribution" ? row.amountThb : -row.amountThb), 0);
  return Number.isFinite(sum) ? sum : null;
}

/** A label is the stable identity; a new currency/report replaces, never adds to, its older balance.
 * Equal recorded_at uses created_at DESC, then UUID DESC for deterministic operator corrections.
 */
export function latestManualHoldings(rows: readonly ManualHoldingReport[], asOf: string): ManualHoldingReport[] {
  const latest = new Map<string, ManualHoldingReport>();
  const sorted = rows.filter((row) => Date.parse(row.recordedAt) <= Date.parse(asOf)).sort((a, b) =>
    Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
  for (const row of sorted) if (!latest.has(row.label)) latest.set(row.label, row);
  return [...latest.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function calculateBookPnl(valueThb: number | null, contributedThb: number | null, usdToThb: number | null): BookPnl | null {
  if (valueThb === null || !Number.isFinite(valueThb) || valueThb < 0 || contributedThb === null
    || !Number.isFinite(contributedThb) || usdToThb === null || !Number.isFinite(usdToThb) || usdToThb <= 0) return null;
  const pnlThb = valueThb - contributedThb;
  const pnlUsd = pnlThb / usdToThb;
  const pct = contributedThb !== 0 ? pnlThb / contributedThb * 100 : null;
  return Number.isFinite(pnlThb) && Number.isFinite(pnlUsd)
    ? { pnlThb, pnlUsd, pnlPct: pct !== null && Number.isFinite(pct) ? pct : null } : null;
}
