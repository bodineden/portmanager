import { neon } from "@neondatabase/serverless";
import { isNeonConfigured, PORTFOLIO_SNAPSHOT_DDL, PORTFOLIO_SNAPSHOT_EXTENSION_DDL } from "./assets-db";
import { joinedHoldingsMap, valueSetSignature, VALUE_SOURCE_KEYS, type HoldingsValueMap, type SnapshotSources } from "./holding-values";
import type { JoinedPortfolio } from "./live-data";
import type { PnlCoverage } from "./pnl";

export type SnapshotDb = { query: (text: string, params?: unknown[], signal?: AbortSignal) => Promise<unknown> };
export type SnapshotRecorderOptions = {
  hasDb?: () => boolean;
  getDb?: () => SnapshotDb;
  now?: () => number;
  /** Defaults to 2s for the entire DDL + INSERT, not 2s per query. */
  timeoutMs?: number;
  log?: (message: string) => void;
};
export type SnapshotRecordResult = "recorded" | "already-exists" | "skipped" | "error";

function defaultDb(): SnapshotDb {
  const sql = neon(process.env.DATABASE_URL!);
  return { query: (text, params, signal) => sql.query(text, params, { fetchOptions: { signal } }) };
}

function validValue(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** One first qualifying observation per UTC day. Factory gives tests isolated attempt flags. */
export function createSnapshotRecorder(options: SnapshotRecorderOptions = {}) {
  let attemptedDate: string | null = null;
  let recordedDate: string | null = null;
  return async (portfolio: JoinedPortfolio, clock: { now?: () => number } = {}): Promise<SnapshotRecordResult> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attemptDate: string | null = null;
    try {
      if (!(options.hasDb ?? isNeonConfigured)()) return "skipped";
      const now = (clock.now ?? options.now ?? Date.now)();
      const observed = Date.parse(portfolio.asOf);
      if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime()) || !Number.isFinite(observed) || observed > now) return "skipped";
      const date = new Date(now).toISOString().slice(0, 10);
      if (recordedDate === date) return "already-exists";
      if (attemptedDate === date || new Date(observed).toISOString().slice(0, 10) !== date) return "skipped";
      const totals = portfolio.totals;
      // Inventory completeness is independent of a finite priced subtotal. A hard
      // failure in any source must leave today's immutable slot available to retry.
      // Partial-but-valued inventories (unpriced dust/collections) remain eligible.
      if (!VALUE_SOURCE_KEYS.every((key) => ["live", "partial"].includes(portfolio.sources[key]?.status))) return "skipped";
      if (!validValue(totals.grandTotalUsd) || !validValue(totals.grandTotalThb)
        || portfolio.sources.fiatFx.status !== "live" || !validValue(portfolio.fx.usdToThb) || portfolio.fx.usdToThb === 0) return "skipped";
      attemptDate = date;
      attemptedDate = date; // Set before the first await so concurrent page renders coalesce.
      const db = (options.getDb ?? defaultDb)();
      const controller = new AbortController();
      const requestedTimeout = options.timeoutMs ?? 2_000;
      const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 && requestedTimeout <= 30_000 ? requestedTimeout : 2_000;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Snapshot write timed out")); }, timeoutMs);
      });
      const write = async (): Promise<SnapshotRecordResult> => {
        // Never call assets-db ensureSchema: it performs archive ALTER/UPDATE/seed operations.
        await db.query(PORTFOLIO_SNAPSHOT_DDL, [], controller.signal);
        controller.signal.throwIfAborted();
        await db.query(PORTFOLIO_SNAPSHOT_EXTENSION_DDL, [], controller.signal);
        controller.signal.throwIfAborted();
        const holdings = joinedHoldingsMap(portfolio);
        const rows = await db.query(`
          INSERT INTO portfolio_snapshot (
            snapshot_date, total_value_usd, total_value_thb, cost_basis_usd, cost_basis_thb,
            pnl_usd, pnl_thb, pnl_pct, coverage, as_of,
            contributed_capital_thb, contributed_capital_usd, manual_value_usd, manual_value_thb,
            book_pnl_thb, book_pnl_usd, holdings
          ) VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz,
            $11, $12, $13, $14, $15, $16, $17::jsonb)
          ON CONFLICT (snapshot_date) DO NOTHING
          RETURNING snapshot_date
        `, [date, totals.grandTotalUsd, totals.grandTotalThb, totals.costBasisUsd, totals.costBasisThb,
          totals.pnlUsd, totals.pnlThb, totals.pnlPct, JSON.stringify({ ...totals.pnlCoverage,
            sources: portfolio.sources, valueSetSignature: valueSetSignature(holdings, portfolio.sources), byClass: Object.fromEntries(Object.entries(totals.pnlByClass).map(([name, value]) => [name, value.pnlCoverage])),
          }), portfolio.asOf, portfolio.capital.contributedThb, portfolio.capital.contributedUsd,
          totals.manualUsd, totals.manualThb, totals.bookPnl?.pnlThb ?? null, totals.bookPnl?.pnlUsd ?? null,
          JSON.stringify(holdings)], controller.signal);
        return Array.isArray(rows) && rows.length > 0 ? "recorded" : "already-exists";
      };
      const result = await Promise.race([write(), timeout]);
      if (result === "recorded" || result === "already-exists") recordedDate = attemptDate;
      return result;
    } catch {
      // A failed page attempt must not suppress the same day's scheduled retry.
      if (attemptDate !== null && attemptedDate === attemptDate) attemptedDate = null;
      // Driver errors may contain credentials/SQL. Log only a fixed operational label.
      try { (options.log ?? console.warn)("[portfolio_snapshot] Daily snapshot attempt failed; page remains available."); } catch { /* Logging must not break rendering either. */ }
      return "error";
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}

/** Production singleton: no DB construction, DDL or IO until configured and eligible. */
export const recordPortfolioSnapshot = createSnapshotRecorder();

/** First qualifying observation of a UTC date; these are not market closes. */
export type PortfolioSnapshot = {
  date: string;
  totalValueUsd: number | null;
  totalValueThb: number | null;
  costBasisUsd: number | null;
  costBasisThb: number | null;
  pnlUsd: number | null;
  pnlThb: number | null;
  pnlPct: number | null;
  coverage: PnlCoverage;
  // Optional for legacy callers; missing evidence blocks adjusted day comparisons.
  contributedCapitalThb?: number | null;
  contributedCapitalUsd?: number | null;
  manualValueUsd?: number | null;
  manualValueThb?: number | null;
  bookPnlThb?: number | null;
  bookPnlUsd?: number | null;
  holdings?: HoldingsValueMap | null;
  sources?: SnapshotSources | null;
};

function snapshotNumber(value: unknown, nonNegative = false): number | null {
  // PostgreSQL NUMERIC comes back as a string. Empty strings and booleans are
  // missing data, not zero; no conversion or historical FX is inferred here.
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && (!nonNegative || number >= 0) ? number : null;
}

function snapshotDate(value: unknown): string | null {
  const date = value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : value;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? date : null;
}

function snapshotCoverage(value: unknown): PnlCoverage | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  const counts = ["totalHoldings", "eligible", "notRecorded", "dust", "unpriced", "unreconciled"] as const;
  if (!counts.every((key) => typeof row[key] === "number" && Number.isSafeInteger(row[key]) && row[key] >= 0)
    || (row.status !== "complete" && row.status !== "partial") || typeof row.sourcesComplete !== "boolean") return null;
  const coverage: PnlCoverage = {
    totalHoldings: row.totalHoldings as number,
    eligible: row.eligible as number,
    notRecorded: row.notRecorded as number,
    dust: row.dust as number,
    unpriced: row.unpriced as number,
    unreconciled: row.unreconciled as number,
    status: row.status,
    sourcesComplete: row.sourcesComplete,
  };
  const excluded = coverage.notRecorded + coverage.dust + coverage.unpriced + coverage.unreconciled;
  if (coverage.eligible + excluded !== coverage.totalHoldings
    || (coverage.status === "complete" && (!coverage.sourcesComplete || excluded > 0))) return null;
  return coverage;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { return null; } }
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function snapshotHoldings(value: unknown): HoldingsValueMap | null {
  const object = jsonObject(value);
  if (!object) return null;
  if (Object.values(object).some((value) => value !== null && snapshotNumber(value, true) === null)) return null;
  return Object.fromEntries(Object.entries(object).map(([id, value]) => [id, snapshotNumber(value, true)]));
}
function snapshotSources(value: unknown): SnapshotSources | null {
  const sources = jsonObject(jsonObject(value)?.sources);
  if (!sources || !VALUE_SOURCE_KEYS.every((key) => key in sources)) return null;
  const entries = Object.entries(sources).map(([key, value]) => [key, jsonObject(value)] as const);
  if (entries.some(([, source]) => !source || !["live", "partial", "unavailable"].includes(String(source.status)))) return null;
  return Object.fromEntries(entries.map(([key, source]) => [key, { status: source!.status,
    asOf: typeof source!.asOf === "string" ? source!.asOf : null, message: typeof source!.message === "string" ? source!.message : "" }])) as SnapshotSources;
}

/** Pure driver-row boundary. Invalid coverage/date cannot become a chart point. */
export function mapPortfolioSnapshotRow(value: unknown): PortfolioSnapshot | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const date = snapshotDate(row.snapshot_date);
  const coverage = snapshotCoverage(row.coverage);
  if (!date || !coverage) return null;
  return {
    date,
    totalValueUsd: snapshotNumber(row.total_value_usd, true),
    totalValueThb: snapshotNumber(row.total_value_thb, true),
    costBasisUsd: snapshotNumber(row.cost_basis_usd, true),
    costBasisThb: snapshotNumber(row.cost_basis_thb, true),
    pnlUsd: snapshotNumber(row.pnl_usd),
    pnlThb: snapshotNumber(row.pnl_thb),
    pnlPct: snapshotNumber(row.pnl_pct),
    contributedCapitalThb: snapshotNumber(row.contributed_capital_thb),
    contributedCapitalUsd: snapshotNumber(row.contributed_capital_usd),
    manualValueUsd: snapshotNumber(row.manual_value_usd, true),
    manualValueThb: snapshotNumber(row.manual_value_thb, true),
    bookPnlThb: snapshotNumber(row.book_pnl_thb),
    bookPnlUsd: snapshotNumber(row.book_pnl_usd),
    holdings: snapshotHoldings(row.holdings),
    sources: snapshotSources(row.coverage),
    coverage,
  };
}

/** Pure normalization also guarantees ordering independently of the driver. */
export function mapPortfolioSnapshotRows(rows: unknown): PortfolioSnapshot[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapPortfolioSnapshotRow).filter((row): row is PortfolioSnapshot => row !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export type SnapshotReaderOptions = Pick<SnapshotRecorderOptions, "hasDb" | "getDb" | "timeoutMs" | "log">;

export type SnapshotHistory = { snapshots: PortfolioSnapshot[]; available: boolean };

/** Read only; distinguish a successful empty history from unavailable evidence. */
export function createSnapshotHistoryReader(options: SnapshotReaderOptions = {}) {
  return async (): Promise<SnapshotHistory> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!(options.hasDb ?? isNeonConfigured)()) return { snapshots: [], available: false };
      const db = (options.getDb ?? defaultDb)();
      const controller = new AbortController();
      const requestedTimeout = options.timeoutMs ?? 2_000;
      const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 && requestedTimeout <= 30_000 ? requestedTimeout : 2_000;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Snapshot read timed out")); }, timeoutMs);
      });
      const rows = await Promise.race([db.query(`
        SELECT snapshot_date::text AS snapshot_date, total_value_usd, total_value_thb,
          cost_basis_usd, cost_basis_thb, pnl_usd, pnl_thb, pnl_pct, coverage,
          contributed_capital_thb, contributed_capital_usd, manual_value_usd, manual_value_thb,
          book_pnl_thb, book_pnl_usd, holdings
        FROM portfolio_snapshot
        ORDER BY snapshot_date DESC
      `, [], controller.signal), timeout]);
      const snapshots = mapPortfolioSnapshotRows(rows);
      return { snapshots, available: Array.isArray(rows) && snapshots.length === rows.length };
    } catch {
      try { (options.log ?? console.warn)("[portfolio_snapshot] History unavailable; page remains available."); } catch { /* Logging is fail-soft too. */ }
      return { snapshots: [], available: false };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}

/** Preserve the existing chart API and fail-soft empty-array behavior. */
export function createSnapshotReader(options: SnapshotReaderOptions = {}) {
  const read = createSnapshotHistoryReader(options);
  return async (): Promise<PortfolioSnapshot[]> => (await read()).snapshots;
}

/** No DB construction or IO without the existing Neon configuration gate. */
export const listPortfolioSnapshots = createSnapshotReader();
export const readPortfolioSnapshotHistory = createSnapshotHistoryReader();
