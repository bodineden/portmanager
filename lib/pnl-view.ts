import type { FiatRates, JoinedPortfolio } from "./live-data";
import type { BasisStatus, PnlClass, PnlCoverage, PnlEligibility } from "./pnl";
import type { PortfolioSnapshot } from "./pnl-history";
import { valueSetSignature, type HoldingsValueMap } from "./holding-values";

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatViewUsd(value: number | null | undefined): string {
  return finite(value) ? new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value) : "—";
}

export function formatViewThb(value: number | null | undefined): string {
  return finite(value) ? `฿${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

/** Compact visual day-cell label; exact USD/THB stays in the selected detail. */
export function formatCalendarUsd(value: number | null | undefined): string {
  if (!finite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.01) return value < 0 ? "−<$0.01" : "<$0.01";
  const number = Object.is(value, -0) ? 0 : value;
  const compact = Math.abs(number) >= 1_000;
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", currencyDisplay: "narrowSymbol",
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: compact || Number.isInteger(number) ? 0 : 2,
    maximumFractionDigits: compact ? 1 : 2,
  }).format(number);
}

export function formatPnlMoney(value: number | null | undefined, currency: "USD" | "THB" = "USD"): string {
  if (!finite(value)) return "—";
  return `${value > 0 ? "+" : ""}${currency === "USD" ? formatViewUsd(value) : formatViewThb(value)}`;
}

/** The data contract already expresses pnlPct in percentage points. */
export function formatPnlPercent(value: number | null | undefined): string {
  if (!finite(value)) return "—";
  const number = Object.is(value, -0) ? 0 : value;
  return `${number > 0 ? "+" : ""}${number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function formatHoldingQuantity(value: number | null | undefined, maxDigits = 4): string {
  if (!finite(value)) return "—";
  const digits = Number.isInteger(maxDigits) && maxDigits >= 0 && maxDigits <= 20 ? maxDigits : 4;
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function formatSnapshotAsOf(value: string | null | undefined): string {
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return "—";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }).format(timestamp)} UTC`;
}

/** Coverage counts joined rows, not NFT units or broker cash. */
export function coverageLabel(coverage: PnlCoverage): string {
  if (coverage.eligible === 0) {
    return coverage.unreconciled > 0
      ? "Recorded P&L unavailable — unreconciled holdings are excluded"
      : "No recorded cost basis yet — P&L unavailable";
  }
  return coverage.status === "complete"
    ? `Complete P&L (${coverage.eligible} of ${coverage.totalHoldings} holdings have recorded basis)`
    : `Partial P&L (${coverage.eligible} of ${coverage.totalHoldings} holdings have recorded basis)`;
}

const BASIS_CHIPS: Record<BasisStatus, { label: BasisStatus; description: string }> = {
  "t212-live": { label: "t212-live", description: "Recorded Trading 212 average cost" },
  "onchain-derived": { label: "onchain-derived", description: "Audited acquisition evidence with historical payment value" },
  "arrival-priced": { label: "arrival-priced", description: "Funding arrival priced at its arrival-date ETH/USD under the owner rule" },
  "airdrop-free": { label: "airdrop-free", description: "Verified acquisition with no payment; percentage is unavailable for zero basis" },
  "not-recorded": { label: "not-recorded", description: "Basis not recorded; excluded from recorded P&L" },
};

export function basisChip(status: BasisStatus): { label: BasisStatus; description: string } {
  return BASIS_CHIPS[status];
}

export function eligibilityLabel(eligibility: PnlEligibility): string | null {
  return {
    eligible: "Included in recorded P&L",
    "not-recorded": "Basis not recorded · excluded from P&L",
    dust: null,
    unpriced: null,
    unreconciled: "Unreconciled · excluded from P&L",
  }[eligibility];
}

/** Display-only conversion using this joined observation's FX; never a fallback rate. */
export function snapshotFiatUsd(
  amount: number | null | undefined,
  currency: string | null | undefined,
  fx: FiatRates | null,
): number | null {
  if (!finite(amount)) return null;
  if (currency === "USD") return amount;
  if (!finite(fx?.usdToThb) || fx.usdToThb <= 0) return null;
  const rate = currency === "THB" ? 1 : currency === "GBP" ? fx.gbpToThb : currency === "EUR" ? fx.eurToThb : null;
  if (!finite(rate) || rate <= 0) return null;
  const converted = amount * (rate / fx.usdToThb);
  return Number.isFinite(converted) ? converted : null;
}

export type ValueAllocation = {
  key: PnlClass | "crypto";
  label: string;
  valueUsd: number | null;
  valueThb: number | null;
  sharePct: number | null;
};

/** Missing class subtotals must not become a partial whole-class value. */
function completeValueSum(values: (number | null)[]): number | null {
  if (!values.every(finite)) return null;
  const sum = values.reduce<number>((total, value) => total + value!, 0);
  return finite(sum) ? sum : null;
}

/** Value includes cash and excluded holdings; it never uses P&L subset sums. */
export function valueAllocation(portfolio: JoinedPortfolio): ValueAllocation[] {
  const { totals, fx } = portfolio;
  const accountUsd = snapshotFiatUsd(portfolio.t212.totalValue, portfolio.t212.currency, fx);
  const brokerCashUsd = snapshotFiatUsd(portfolio.t212.cashAvailable, portfolio.t212.currency, fx);
  const brokerCashThb = portfolio.t212.currency === "THB" ? portfolio.t212.cashAvailable
    : finite(brokerCashUsd) && finite(fx.usdToThb) && fx.usdToThb > 0 ? brokerCashUsd * fx.usdToThb : null;
  // Account remainder, not a second sum of positions: account total is authoritative.
  const stocksUsd = finite(accountUsd) && finite(brokerCashUsd) && accountUsd >= brokerCashUsd ? accountUsd - brokerCashUsd : null;
  const stocksThb = finite(totals.t212Thb) && finite(brokerCashThb) && totals.t212Thb >= brokerCashThb ? totals.t212Thb - brokerCashThb : null;
  const cashUsd = completeValueSum([brokerCashUsd, totals.manualUsd]);
  const cashThb = completeValueSum([brokerCashThb, totals.manualThb]);
  const values: Omit<ValueAllocation, "sharePct">[] = [
    { key: "t212", label: "Stocks Port",
      valueUsd: completeValueSum([stocksUsd, cashUsd]), valueThb: completeValueSum([stocksThb, cashThb]) },
    { key: "crypto", label: "Crypto Port",
      valueUsd: completeValueSum([totals.nftsUsd, totals.walletNativeUsd, totals.walletTokensUsd]),
      valueThb: completeValueSum([totals.nftsThb, totals.walletNativeThb, totals.walletTokensThb]) },
  ];
  // Every constituent class stays individually fail-closed: a negative subtotal must
  // never be masked by a positive sibling before shares are derived.
  const complete = [stocksUsd, cashUsd, totals.nftsUsd, totals.walletNativeUsd, totals.walletTokensUsd]
    .every((value) => finite(value) && value >= 0)
    && values.every(({ valueUsd }) => finite(valueUsd) && valueUsd >= 0);
  const sum = complete ? values.reduce((total, { valueUsd }) => total + valueUsd!, 0) : null;
  return values.map((value) => ({ ...value, sharePct: finite(sum) && sum > 0 ? value.valueUsd! / sum * 100 : null }));
}

/** Display grouping only: recorded-subset sums are independent of value completeness. */
export function allocationPnl(portfolio: JoinedPortfolio, key: ValueAllocation["key"]) {
  // Cash contributes value only: no recorded basis, P&L or eligible holdings.
  if (key !== "crypto") return portfolio.totals.pnlByClass[key];
  const classes = ["nfts", "walletNative", "walletTokens"] as const;
  const summaries = classes.map((name) => portfolio.totals.pnlByClass[name]);
  const recordedSum = (field: "pnlUsd" | "costBasisUsd") => {
    const known = summaries.map((summary) => summary[field]).filter(finite);
    return known.length ? completeValueSum(known) : null;
  };
  const count = (field: "totalHoldings" | "eligible" | "notRecorded" | "unreconciled" | "dust" | "unpriced") =>
    summaries.reduce((sum, summary) => sum + summary.pnlCoverage[field], 0);
  const pnlCoverage: PnlCoverage = {
    totalHoldings: count("totalHoldings"), eligible: count("eligible"), notRecorded: count("notRecorded"),
    unreconciled: count("unreconciled"), dust: count("dust"), unpriced: count("unpriced"),
    status: summaries.every((summary) => summary.pnlCoverage.status === "complete") ? "complete" : "partial",
    sourcesComplete: summaries.every((summary) => summary.pnlCoverage.sourcesComplete),
  };
  return { pnlUsd: recordedSum("pnlUsd"), costBasisUsd: recordedSum("costBasisUsd"), pnlCoverage };
}

function utcDate(value: string): string | null {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== date) return null;
  const timestamp = value === date ? day : Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

export type DailyValueChange = { usd: number; thb: number | null; pct: number | null; date: string; previousDate: string };

export type DailyChangeResult = { change: DailyValueChange | null; reason: string | null };
export function valueDirection(value: number | null | undefined): "up" | "down" | "flat" | null {
  return !finite(value) ? null : value > 0 ? "up" : value < 0 ? "down" : "flat";
}

/** Adjacent UTC book observations, with reported deposits/withdrawals excluded. Not investment P&L. */
export function dailyChangeDetails(snapshots: readonly PortfolioSnapshot[], asOf?: string): DailyChangeResult {
  const [current, previous] = [...snapshots].sort((a, b) => b.date.localeCompare(a.date));
  const absent = (reason: string): DailyChangeResult => ({ change: null, reason });
  if (!current || !previous || utcDate(current.date) !== current.date || utcDate(previous.date) !== previous.date
    || (asOf !== undefined && utcDate(asOf) !== current.date)
    || Date.parse(`${current.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`) !== 86_400_000) return absent("no previous recorded day");
  if (![current, previous].every((row) => finite(row.totalValueUsd) && row.totalValueUsd >= 0
    && finite(row.totalValueThb) && row.totalValueThb >= 0)) return absent("book value unavailable");
  if (![current, previous].every((row) => row.sources && !Object.values(row.sources).some((source) => source.status === "unavailable"))) return absent("source unavailable");
  const signature = valueSetSignature(current.holdings, current.sources);
  const previousSignature = valueSetSignature(previous.holdings, previous.sources);
  if (!signature || !previousSignature) return absent("value-set evidence unavailable");
  if (signature !== previousSignature) return absent("holdings changed between days");
  if (![current, previous].every((row) => finite(row.contributedCapitalUsd) && finite(row.contributedCapitalThb))) return absent("contributed capital not recorded");
  const thb = (current.totalValueThb! - previous.totalValueThb!) - (current.contributedCapitalThb! - previous.contributedCapitalThb!);
  if (!finite(thb)) return absent("adjusted change unavailable");
  // Snapshots store same-observation THB/USD mirrors, not a standalone FX column.
  // Recover only THIS snapshot's rate; capital is a fallback for a zero-valued book.
  const usdToThb = current.totalValueUsd! > 0
    ? current.totalValueThb! / current.totalValueUsd!
    : current.contributedCapitalThb! / current.contributedCapitalUsd!;
  if (thb !== 0 && (!finite(usdToThb) || usdToThb <= 0)) return absent("snapshot FX unavailable");
  // Suppress floating-point cancellation noise, not genuine cent-level changes.
  const clean = (value: number, a: number, b: number) => Math.abs(value) <= Number.EPSILON * 16 * Math.max(1, Math.abs(a), Math.abs(b)) ? 0 : value;
  const adjustedThb = clean(thb, current.totalValueThb!, current.contributedCapitalThb!);
  // Exact known zero stays zero under every positive FX rate, including a full withdrawal.
  const adjustedUsd = adjustedThb === 0 ? 0 : adjustedThb / usdToThb;
  if (!finite(adjustedUsd)) return absent("adjusted change unavailable");
  // THB-adjusted change / previous THB book value; not a USD investment return.
  const pct = previous.totalValueThb! > 0 ? adjustedThb / previous.totalValueThb! * 100 : null;
  return { change: { usd: adjustedUsd, thb: adjustedThb, pct: finite(pct) ? pct : null, date: current.date, previousDate: previous.date }, reason: null };
}
export function dailyChange(snapshots: readonly PortfolioSnapshot[], asOf?: string): DailyValueChange | null {
  return dailyChangeDetails(snapshots, asOf).change;
}

/** Asset Day compares only a recorded adjacent UTC date, never an older available row. */
export function previousDayHoldings(snapshots: readonly PortfolioSnapshot[], asOf: string): HoldingsValueMap | null {
  const date = utcDate(asOf);
  if (!date) return null;
  const previousDate = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return snapshots.find((row) => row.date === previousDate)?.holdings ?? null;
}
export function holdingDayChange(id: string, valueUsd: number | null, previous: HoldingsValueMap | null): { usd: number; pct: number | null } | null {
  const before = previous && Object.hasOwn(previous, id) ? previous[id] : null;
  if (!finite(valueUsd) || valueUsd < 0 || !finite(before) || before < 0) return null;
  const usd = valueUsd - before;
  const pct = before > 0 ? usd / before * 100 : null;
  return finite(usd) ? { usd, pct: finite(pct) ? pct : null } : null;
}

export type HistoryPeriod = "1M" | "3M" | "All";

/** UTC calendar months, clamped at month end; gaps remain gaps, never backfilled. */
export function historyPeriodRows(snapshots: readonly PortfolioSnapshot[], period: HistoryPeriod, asOf: string): PortfolioSnapshot[] {
  const end = utcDate(asOf);
  if (!end) return [];
  let start = "0000-01-01";
  if (period !== "All") {
    const cutoff = new Date(`${end}T00:00:00.000Z`);
    const day = cutoff.getUTCDate();
    cutoff.setUTCDate(1);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - (period === "1M" ? 1 : 3));
    const monthEnd = new Date(cutoff);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    monthEnd.setUTCDate(0);
    cutoff.setUTCDate(Math.min(day, monthEnd.getUTCDate()));
    start = cutoff.toISOString().slice(0, 10);
  }
  return snapshots.filter((row) => utcDate(row.date) === row.date && row.date >= start && row.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Gaps and unknown values break lines; cost also tracks the recorded subset. */
export function historyLineSegments(
  snapshots: readonly PortfolioSnapshot[],
  field: "totalValueUsd" | "costBasisUsd",
): PortfolioSnapshot[][] {
  const segments: PortfolioSnapshot[][] = [];
  let segment: PortfolioSnapshot[] | null = null;
  const coverageKeys = ["status", "sourcesComplete", "totalHoldings", "eligible", "notRecorded", "dust", "unpriced", "unreconciled"] as const;
  for (const row of [...snapshots].sort((a, b) => a.date.localeCompare(b.date))) {
    if (utcDate(row.date) !== row.date || !finite(row[field])) {
      segment = null;
      continue;
    }
    const previous: PortfolioSnapshot | undefined = segment?.[segment.length - 1];
    const adjacent = previous && Date.parse(`${row.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`) === 86_400_000;
    const sameSubset = previous && coverageKeys.every((key) => previous.coverage[key] === row.coverage[key]);
    if (!segment || !adjacent || (field === "costBasisUsd" && !sameSubset)) {
      segment = [];
      segments.push(segment);
    }
    segment.push(row);
  }
  return segments;
}

/** Monday-first whole-week month cells. Null cells represent dates outside it. */
export function calendarDays(month: string): (string | null)[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const first = new Date(`${month}-01T00:00:00.000Z`);
  if (!Number.isFinite(first.getTime())) return [];
  const end = new Date(first);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: Math.ceil((offset + end.getUTCDate()) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day >= 1 && day <= end.getUTCDate() ? `${month}-${String(day).padStart(2, "0")}` : null;
  });
}
