import { afterEach, describe, expect, it, vi } from "vitest";
import { AS_OF, capitalBook } from "./__fixtures__/capital-book";
import { createCapitalReader, createManualHoldingsReader, createLedgerSchemaInitializer } from "./capital-db";
import { buildJoinedPortfolio, type JoinedPortfolioInputs } from "./live-data";
import { CAPITAL_EVENTS_DDL, MANUAL_HOLDINGS_DDL, PORTFOLIO_SNAPSHOT_EXTENSION_DDL } from "./assets-db";


afterEach(() => vi.useRealTimers());
describe("joined capital and manual cash", () => {
  it("includes GBP 2000 once in full book value without entering eligible asset sums", () => {
    const book = capitalBook();
    expect(book.totals.manualThb).toBeCloseTo(2000 * 44.6154, 8);
    expect(book.totals.grandTotalThb).toBeCloseTo((2000 + 9.62) * 44.6154, 8);
    expect(book.capital).toMatchObject({ available: true, contributedThb: 120000, asOf: AS_OF });
    expect(book.capital.contributedUsd).toBeCloseTo(120000 / 33.003871, 8);
    expect(book.totals.bookPnl?.pnlThb).toBeCloseTo((2000 + 9.62) * 44.6154 - 120000, 8);
    expect(book.totals.pnlCoverage.totalHoldings).toBe(1);
    expect(book.manualHoldings).toHaveLength(1);
    expect(capitalBook(false).capital).toMatchObject({ available: false, contributedThb: null, contributedUsd: null });
    expect(capitalBook(false).totals.bookPnl).toBeNull();
  });
});

describe("SELECT-only operator ledgers", () => {
  it("sets up only live tables and snapshot extensions even before a value is recordable", async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => { statements.push(sql); return []; });
    const initialize = createLedgerSchemaInitializer({ hasDb: () => true, getDb: () => ({ query }) });
    expect(await initialize()).toBe(true);
    expect(await initialize()).toBe(true);
    expect(query).toHaveBeenCalledTimes(4);
    expect(statements[0]).toContain("capital_events");
    expect(statements[1]).toContain("manual_holdings");
    expect(statements[2]).toContain("CREATE TABLE IF NOT EXISTS portfolio_snapshot");
    expect(statements[3]).toContain("ADD COLUMN IF NOT EXISTS holdings");
    for (const statement of statements) expect(statement).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|assets|holdings|investors|transactions|currency|asset|holding|exchange_rate)\s*(?:\(|SET|WHERE)/i);
    const gated = createLedgerSchemaInitializer({ hasDb: () => false, getDb: () => { throw new Error("must not construct"); } });
    expect(await gated()).toBe(false);
  });
  it("never converts an absent/partial manual ledger into zero or a full book", () => {
    // The real path always supplies a reader result; this probes incomplete input too.
    const inputs = { t212Summary: { data: null, state: { status: "unavailable", asOf: null, message: "fixture" } },
      t212Positions: { data: [], state: { status: "live", asOf: AS_OF, message: "fixture" } },
      nfts: { data: [], state: { status: "live", asOf: AS_OF, message: "fixture" } },
      fiatFx: { data: { usdToThb: 33.003871, gbpToThb: 44.6154, eurToThb: null, asOf: AS_OF }, state: { status: "live", asOf: AS_OF, message: "fixture" } },
      ethPrice: { data: 2578.15, state: { status: "live", asOf: AS_OF, message: "fixture" } } } satisfies JoinedPortfolioInputs;
    for (const manualHoldings of [undefined, { data: [], state: { status: "partial" as const, asOf: AS_OF, message: "incomplete" } },
      { data: null, state: { status: "live" as const, asOf: AS_OF, message: "corrupt input" } }]) {
      const book = buildJoinedPortfolio({ ...inputs, manualHoldings }, AS_OF);
      expect(book.totals.manualUsd).toBeNull();
      expect(book.totals.manualThb).toBeNull();
      expect(book.totals.grandTotalUsd).toBeNull();
    }
  });
  it("gates DB construction and fails unavailable, never manufacturing zero capital", async () => {
    const getDb = vi.fn(() => { throw new Error("private connection"); });
    for (const reader of [createCapitalReader, createManualHoldingsReader]) {
      const result = await reader({ hasDb: () => false, getDb })(AS_OF);
      expect(result.data).toEqual([]);
      expect(result.state.status).toBe("unavailable");
    }
    expect(getDb).not.toHaveBeenCalled();
  });
  it("retries failed cold-start DDL and coalesces concurrent setup without touching rows", async () => {
    let fails = true;
    const query = vi.fn(async () => { if (fails) throw new Error("private URL"); return []; });
    const initialize = createLedgerSchemaInitializer({ hasDb: () => true, getDb: () => ({ query }) });
    expect(await initialize()).toBe(false);
    fails = false;
    expect(await Promise.all([initialize(), initialize()])).toEqual([true, true]);
    expect(query).toHaveBeenCalledTimes(5);
  });
  it("uses parameterized as-of SELECTs, normalizes driver Dates and deterministic report ties", async () => {
    const capitalQuery = vi.fn(async () => [{ occurred_at: new Date(AS_OF), kind: "contribution", amount_thb: "120000.000000" }]);
    const reportQuery = vi.fn(async () => [{ id: "uuid", label: "T212 cash pot", kind: "cash", currency: "GBP", amount: "2000.000000", recorded_at: new Date(AS_OF), created_at: new Date(AS_OF) }]);
    const capital = await createCapitalReader({ hasDb: () => true, getDb: () => ({ query: capitalQuery }) })(AS_OF);
    const cash = await createManualHoldingsReader({ hasDb: () => true, getDb: () => ({ query: reportQuery }) })(AS_OF);
    expect(capital.data?.[0]).toMatchObject({ amountThb: 120000, occurredAt: new Date(AS_OF).toISOString() });
    expect(cash.data?.[0]).toMatchObject({ amount: 2000, recordedAt: new Date(AS_OF).toISOString() });
    for (const query of [capitalQuery, reportQuery]) {
      const args = query.mock.calls[0] as unknown as [string, unknown[]];
      expect(args[0]).toMatch(/SELECT/);
      expect(args[0]).not.toMatch(/\b(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)\b/);
      expect(args[1]).toEqual([AS_OF]);
    }
  });
  it("rejects whitespace-variant labels instead of normalizing or double-counting them", async () => {
    for (const label of ["T212 cash pot ", " T212 cash pot"]) {
      const read = createManualHoldingsReader({ hasDb: () => true, log: vi.fn(), getDb: () => ({ query: async () => [
        { id: "uuid", label, kind: "cash", currency: "GBP", amount: "2000", recorded_at: AS_OF, created_at: AS_OF },
      ] }) });
      expect(await read(AS_OF)).toMatchObject({ data: [], state: { status: "unavailable" } });
    }
  });
  it("distinguishes empty capital (partial) from known empty manual inventory (live)", async () => {
    const options = { hasDb: () => true, getDb: () => ({ query: async () => [] }) };
    expect((await createCapitalReader(options)(AS_OF)).state.status).toBe("partial");
    expect((await createManualHoldingsReader(options)(AS_OF)).state.status).toBe("live");
  });
  it("fails independently on corrupt rows and private errors without leaking details", async () => {
    for (const query of [async () => [{}], async () => { throw new Error("private SQL"); }]) {
      const log = vi.fn();
      for (const reader of [createCapitalReader, createManualHoldingsReader]) {
        const result = await reader({ hasDb: () => true, getDb: () => ({ query }), log })(AS_OF);
        expect(result).toMatchObject({ data: [], state: { status: "unavailable" } });
      }
      expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    }
  });
  it.each([
    ["capital", createCapitalReader, "Contributed capital"],
    ["manualHoldings", createManualHoldingsReader, "Manual holdings"],
  ] as const)("pins audit A4: %s SELECT finishing after 2000 ms reports a timeout, remains fail-closed, and retries", async (_name, createReader, label) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let slow = true;
    const query = vi.fn((_sql: string, _params?: unknown[], s?: AbortSignal): Promise<unknown> => {
      signal = s;
      return slow ? new Promise((resolve) => setTimeout(() => resolve([]), 2001)) : Promise.resolve([]);
    });
    const log = vi.fn();
    const read = createReader({ hasDb: () => true, getDb: () => ({ query }), log });
    let settled = false;
    const pending = read(AS_OF).then((result) => { settled = true; return result; });
    await vi.advanceTimersByTimeAsync(1999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result).toEqual({ data: [], state: { status: "unavailable", asOf: null, message: `${label} ledger read timed out.` } });
    expect(signal?.aborted).toBe(true);
    expect(log).toHaveBeenCalledWith("[portfolio_ledger] Read timed out; page remains available.");
    await vi.advanceTimersByTimeAsync(1); // Late successful query cannot turn this timed-out read live.
    expect(result.state.status).toBe("unavailable");
    slow = false;
    expect((await read(AS_OF)).state.status).toBe(_name === "capital" ? "partial" : "live");
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("classifies deadline-triggered driver aborts as timeouts without exposing private errors", async () => {
    vi.useFakeTimers();
    const log = vi.fn();
    const read = createCapitalReader({ hasDb: () => true, log, getDb: () => ({
      query: (_sql, _params, signal) => new Promise((_resolve, reject) => {
        signal!.addEventListener("abort", () => reject(new Error("private connection aborted")), { once: true });
      }),
    }) });
    const pending = read(AS_OF);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).state.message).toBe("Contributed capital ledger read timed out.");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });
  it("keeps real query failures distinct even if their private error text mentions a timeout", async () => {
    const read = createCapitalReader({ hasDb: () => true, log: vi.fn(), getDb: () => ({
      query: async () => { throw new Error("Ledger IO timed out: private SQL"); },
    }) });
    expect((await read(AS_OF)).state.message).toBe("Contributed capital ledger unavailable.");
  });
  it("bounds and aborts a hanging SELECT", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const reader = createCapitalReader({ hasDb: () => true, timeoutMs: 20, log: vi.fn(), getDb: () => ({
      query: (_sql, _params, s) => { signal = s; return new Promise(() => {}); },
    }) });
    const pending = reader(AS_OF);
    await vi.advanceTimersByTimeAsync(21);
    expect((await pending).state.status).toBe("unavailable");
    expect(signal?.aborted).toBe(true);
  });
  it("exports additive idempotent DDL with exact ledger constraints and snapshot extensions", () => {
    expect(CAPITAL_EVENTS_DDL).toContain("CREATE TABLE IF NOT EXISTS capital_events");
    expect(CAPITAL_EVENTS_DDL).toContain("amount_thb numeric(20,6) not null check (amount_thb > 0)");
    expect(MANUAL_HOLDINGS_DDL).toContain("amount numeric(20,6) not null check (amount >= 0)");
    for (const name of ["contributed_capital_thb", "contributed_capital_usd", "manual_value_usd", "manual_value_thb", "book_pnl_thb", "book_pnl_usd", "holdings"]) {
      expect(PORTFOLIO_SNAPSHOT_EXTENSION_DDL).toContain(`ADD COLUMN IF NOT EXISTS ${name}`);
    }
  });
});
