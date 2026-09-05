import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetSnapshotCacheForTests, getJoinedPortfolio, buildJoinedPortfolio, type JoinedPortfolio, type LiveResult } from "./live-data";
import * as history from "./pnl-history";

const DATE = "2026-09-05T12:00:00.000Z";
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: DATE, message: "fixture" } });
function portfolio(): JoinedPortfolio {
  return buildJoinedPortfolio({
    t212Summary: live({ currency: "GBP", cashAvailable: 487, totalValue: 487, investmentsCurrentValue: 0 }),
    t212Positions: live([]), nfts: live([]), walletTokens: live([]),
    walletNative: live([{ chainId: 42161, chainName: "Arbitrum One", symbol: "ETH", amount: 0.248396 }]),
    fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: DATE }), ethPrice: live(2_400),
  }, DATE);
}
afterEach(() => { __resetSnapshotCacheForTests(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("daily snapshot recorder", () => {
  it("hooks the existing joined server path only with DB configuration and forwards the injected clock", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline fixture")));
    const record = vi.spyOn(history, "recordPortfolioSnapshot").mockResolvedValue("skipped");
    const now = () => Date.parse(DATE);
    vi.stubEnv("DATABASE_URL", "");
    await getJoinedPortfolio({ now });
    expect(record).not.toHaveBeenCalled();
    vi.stubEnv("DATABASE_URL", "fixture-not-a-connection-string");
    const result = await getJoinedPortfolio({ now });
    expect(record).toHaveBeenCalledExactlyOnceWith(result, { now });
  });

  it("swallows DB construction/DDL/INSERT errors, logs no secret, and attempts once per day", async () => {
    for (const failure of ["connect", "ddl", "insert"]) {
      let calls = 0;
      const log = vi.fn();
      const getDb = vi.fn(() => {
        if (failure === "connect") throw new Error("sensitive database URL");
        return { query: async () => { calls += 1; if (failure === "ddl" || calls === 2) throw new Error("sensitive database URL"); return []; } };
      });
      const record = history.createSnapshotRecorder({ hasDb: () => true, getDb, now: () => Date.parse(DATE), log });
      expect(await record(portfolio())).toBe("error");
      expect(await record(portfolio())).toBe("skipped");
      expect(getDb).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0][0]).not.toContain("sensitive");
    }
  });

  it("does no IO without configuration, live FX, valid totals or a same-day observation", async () => {
    const getDb = vi.fn(() => { throw new Error("must not construct a DB"); });
    vi.stubEnv("DATABASE_URL", "");
    expect(await history.createSnapshotRecorder({ getDb })(portfolio())).toBe("skipped");
    for (const issue of ["null-usd", "null-thb", "nan", "infinity", "negative", "fx-partial", "fx-missing", "prior-day", "future", "bad-clock"]) {
      const book = portfolio();
      let clock = Date.parse(DATE);
      if (issue === "null-usd") book.totals.grandTotalUsd = null;
      if (issue === "null-thb") book.totals.grandTotalThb = null;
      if (issue === "nan") book.totals.grandTotalUsd = Number.NaN;
      if (issue === "infinity") book.totals.grandTotalThb = Infinity;
      if (issue === "negative") book.totals.grandTotalUsd = -1;
      if (issue === "fx-partial") book.sources.fiatFx.status = "partial";
      if (issue === "fx-missing") book.fx.usdToThb = null;
      if (issue === "prior-day") book.asOf = "2026-09-04T23:59:59Z";
      if (issue === "future") book.asOf = "2026-09-05T12:00:01Z";
      if (issue === "bad-clock") clock = Number.NaN;
      expect(await history.createSnapshotRecorder({ hasDb: () => true, getDb, now: () => clock })(book), issue).toBe("skipped");
    }
    expect(getDb).not.toHaveBeenCalled();
  });

  it("does not consume an attempt on an ineligible render and rolls over at UTC midnight", async () => {
    let now = Date.parse("2026-09-05T23:59:59Z");
    const query = vi.fn(async () => [{ snapshot_date: "fixture" }]);
    const record = history.createSnapshotRecorder({ hasDb: () => true, getDb: () => ({ query }), now: () => now });
    const book = portfolio();
    book.sources.fiatFx.status = "partial";
    expect(await record(book)).toBe("skipped");
    book.sources.fiatFx.status = "live";
    const results = await Promise.all([record(book), record(book), record(book)]);
    expect(results).toEqual(["recorded", "skipped", "skipped"]);
    now = Date.parse("2026-09-06T00:00:00Z");
    expect(await record(book)).toBe("skipped"); // yesterday's cached snapshot
    book.asOf = new Date(now).toISOString();
    expect(await record(book)).toBe("recorded");
    expect(query).toHaveBeenCalledTimes(4);
  });

  it("bounds page latency when a DB query never resolves", async () => {
    vi.useFakeTimers();
    try {
      const query = vi.fn(() => new Promise<unknown>(() => {}));
      const log = vi.fn();
      const record = history.createSnapshotRecorder({ hasDb: () => true, getDb: () => ({ query }), now: () => Date.parse(DATE), timeoutMs: 20, log });
      const pending = record(portfolio());
      await vi.advanceTimersByTimeAsync(21);
      expect(await pending).toBe("error");
      expect(await record(portfolio())).toBe("skipped");
      expect(query).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("records one UTC-date row with null basis/P&L and partial coverage, without touching archive", async () => {
    const stored = new Map<string, unknown[]>();
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      if (text.includes("CREATE TABLE")) return [];
      expect(text).toContain("ON CONFLICT (snapshot_date) DO NOTHING");
      expect(text).not.toMatch(/UPDATE|DELETE|\bholding\b|\basset\b|\binvestor\b|\btransactions\b/);
      const key = String(values![0]);
      if (stored.has(key)) return [];
      stored.set(key, values!);
      return [{ snapshot_date: key }];
    });
    const recorder = history.createSnapshotRecorder({ hasDb: () => true, getDb: () => ({ query }), now: () => Date.parse(DATE) });
    const book = portfolio();
    expect(await recorder(book)).toBe("recorded");
    expect(await recorder(book)).toBe("skipped");
    expect(query).toHaveBeenCalledTimes(2); // new table only, then parameterized INSERT
    const row = stored.get("2026-09-05")!;
    expect(row.slice(0, 8)).toEqual(["2026-09-05", book.totals.grandTotalUsd, book.totals.grandTotalThb, null, null, null, null, null]);
    const coverage = JSON.parse(String(row[8]));
    expect(coverage).toMatchObject({ eligible: 0, notRecorded: 1, status: "partial", sources: { fiatFx: { status: "live" } } });
    // A cold start still cannot overwrite the first observation of the UTC date.
    const otherRecorder = history.createSnapshotRecorder({ hasDb: () => true, getDb: () => ({ query }), now: () => Date.parse(DATE) });
    const changed = portfolio();
    changed.totals.grandTotalUsd = 9_999;
    expect(await otherRecorder(changed)).toBe("already-exists");
    expect(stored.get("2026-09-05")![1]).toBe(book.totals.grandTotalUsd);
  });
});
