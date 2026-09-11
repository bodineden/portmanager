import { neon } from "@neondatabase/serverless";
import { CAPITAL_EVENTS_DDL, MANUAL_HOLDINGS_DDL, PORTFOLIO_SNAPSHOT_DDL, PORTFOLIO_SNAPSHOT_EXTENSION_DDL, isNeonConfigured } from "./assets-db";
import type { CapitalEvent, ManualHoldingReport } from "./capital";
import type { LiveResult } from "./live-data";
import type { SnapshotDb, SnapshotReaderOptions } from "./pnl-history";

function defaultDb(): SnapshotDb {
  const sql = neon(process.env.DATABASE_URL!);
  return { query: (text, params, signal) => sql.query(text, params, { fetchOptions: { signal } }) };
}

async function bounded<T>(options: SnapshotReaderOptions, action: (db: SnapshotDb, signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const requested = options.timeoutMs ?? 2000;
  const ms = Number.isFinite(requested) && requested > 0 && requested <= 30000 ? requested : 2000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([action((options.getDb ?? defaultDb)(), controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Ledger IO timed out")); }, ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Schema setup is deliberately separate from the SELECT-only readers. No row writes. */
export function createLedgerSchemaInitializer(options: SnapshotReaderOptions = {}) {
  let ready: Promise<boolean> | undefined;
  return async (): Promise<boolean> => {
    if (!(options.hasDb ?? isNeonConfigured)()) return false;
    if (!ready) ready = bounded(options, async (db, signal) => {
      await db.query(CAPITAL_EVENTS_DDL, [], signal);
      signal.throwIfAborted();
      await db.query(MANUAL_HOLDINGS_DDL, [], signal);
      signal.throwIfAborted();
      await db.query(PORTFOLIO_SNAPSHOT_DDL, [], signal);
      signal.throwIfAborted();
      await db.query(PORTFOLIO_SNAPSHOT_EXTENSION_DDL, [], signal);
      return true;
    }).catch(() => { ready = undefined; return false; });
    return ready;
  };
}
export const ensureLedgerSchema = createLedgerSchemaInitializer();

function timestamp(value: unknown): string {
  if (!(value instanceof Date) && typeof value !== "string") throw new Error("Invalid ledger timestamp");
  return new Date(value).toISOString();
}
function amount(value: unknown, positive = false): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))) throw new Error("Invalid ledger amount");
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (positive && number === 0)) throw new Error("Invalid ledger amount");
  return number;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid ledger row");
  return value as Record<string, unknown>;
}
function readLedger<T>(name: "capital" | "manualHoldings", sql: string, map: (row: unknown) => T, options: SnapshotReaderOptions) {
  return async (asOf: string): Promise<LiveResult<T[]>> => {
    const absent: LiveResult<T[]> = { data: [], state: { status: "unavailable", asOf: null, message: `${name === "capital" ? "Contributed capital" : "Manual holdings"} ledger unavailable.` } };
    try {
      if (!(options.hasDb ?? isNeonConfigured)()) return absent;
      if (!Number.isFinite(Date.parse(asOf))) return absent;
      const rows = await bounded(options, (db, signal) => db.query(sql, [asOf], signal));
      if (!Array.isArray(rows)) return absent;
      const data = rows.map(map);
      return { data, state: { status: name === "capital" && !data.length ? "partial" : "live", asOf,
        message: name === "capital" ? data.length ? "Operator-reported capital ledger." : "Contributed capital not recorded — book P&L unavailable."
          : "Operator-reported balances; latest report per label at snapshot time." } };
    } catch {
      try { (options.log ?? console.warn)("[portfolio_ledger] Read unavailable; page remains available."); } catch { /* fail soft */ }
      return absent;
    }
  };
}

export function createCapitalReader(options: SnapshotReaderOptions = {}) {
  return readLedger<CapitalEvent>("capital", `
    SELECT occurred_at, kind, amount_thb FROM capital_events
    WHERE occurred_at <= $1::timestamptz ORDER BY occurred_at, id
  `, (value) => {
    const row = object(value);
    if (row.kind !== "contribution" && row.kind !== "withdrawal") throw new Error("Invalid capital kind");
    return { occurredAt: timestamp(row.occurred_at), kind: row.kind, amountThb: amount(row.amount_thb, true) };
  }, options);
}
export function createManualHoldingsReader(options: SnapshotReaderOptions = {}) {
  return readLedger<ManualHoldingReport>("manualHoldings", `
    SELECT DISTINCT ON (label) id, recorded_at, label, kind, currency, amount, created_at
    FROM manual_holdings WHERE recorded_at <= $1::timestamptz
    ORDER BY label, recorded_at DESC, created_at DESC, id DESC
  `, (value) => {
    const row = object(value);
    if (typeof row.id !== "string" || !row.id || typeof row.label !== "string" || !row.label.trim() || row.label !== row.label.trim()
      || row.kind !== "cash" || typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency)) throw new Error("Invalid manual holding");
    return { id: row.id, label: row.label, kind: row.kind, currency: row.currency, amount: amount(row.amount),
      recordedAt: timestamp(row.recorded_at), createdAt: timestamp(row.created_at) };
  }, options);
}
export const readCapitalEvents = createCapitalReader();
export const readManualHoldings = createManualHoldingsReader();
