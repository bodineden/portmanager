import { neon } from "@neondatabase/serverless";
import { isNeonConfigured, PORTFOLIO_SNAPSHOT_DDL } from "./assets-db";
import type { JoinedPortfolio } from "./live-data";

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
  return async (portfolio: JoinedPortfolio, clock: { now?: () => number } = {}): Promise<SnapshotRecordResult> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!(options.hasDb ?? isNeonConfigured)()) return "skipped";
      const now = (clock.now ?? options.now ?? Date.now)();
      const observed = Date.parse(portfolio.asOf);
      if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime()) || !Number.isFinite(observed) || observed > now) return "skipped";
      const date = new Date(now).toISOString().slice(0, 10);
      if (attemptedDate === date || new Date(observed).toISOString().slice(0, 10) !== date) return "skipped";
      const totals = portfolio.totals;
      if (!validValue(totals.grandTotalUsd) || !validValue(totals.grandTotalThb)
        || portfolio.sources.fiatFx.status !== "live" || !validValue(portfolio.fx.usdToThb) || portfolio.fx.usdToThb === 0) return "skipped";
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
        const rows = await db.query(`
          INSERT INTO portfolio_snapshot (
            snapshot_date, total_value_usd, total_value_thb, cost_basis_usd, cost_basis_thb,
            pnl_usd, pnl_thb, pnl_pct, coverage, as_of
          ) VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz)
          ON CONFLICT (snapshot_date) DO NOTHING
          RETURNING snapshot_date
        `, [date, totals.grandTotalUsd, totals.grandTotalThb, totals.costBasisUsd, totals.costBasisThb,
          totals.pnlUsd, totals.pnlThb, totals.pnlPct, JSON.stringify({ ...totals.pnlCoverage,
            sources: portfolio.sources, byClass: Object.fromEntries(Object.entries(totals.pnlByClass).map(([name, value]) => [name, value.pnlCoverage])),
          }), portfolio.asOf], controller.signal);
        return Array.isArray(rows) && rows.length > 0 ? "recorded" : "already-exists";
      };
      return await Promise.race([write(), timeout]);
    } catch {
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
