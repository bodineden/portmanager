import { afterEach, describe, expect, it, vi } from "vitest";
import { createSnapshotHistoryReader, createSnapshotReader, readPortfolioSnapshotHistory } from "./pnl-history";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("mascot snapshot availability (offline clients)", () => {
  it("distinguishes a successful empty history from an unconfigured database", async () => {
    const query = vi.fn(async () => []);
    const getDb = vi.fn(() => ({ query }));
    expect(await createSnapshotHistoryReader({ hasDb: () => true, getDb })())
      .toEqual({ snapshots: [], available: true });
    expect(await createSnapshotHistoryReader({ hasDb: () => false, getDb })())
      .toEqual({ snapshots: [], available: false });
    expect(getDb).toHaveBeenCalledTimes(1);
    vi.stubEnv("DATABASE_URL", "");
    expect(await readPortfolioSnapshotHistory()).toEqual({ snapshots: [], available: false });
  });

  it("preserves valid observations while identifying rejected history evidence", async () => {
    const row = {
      snapshot_date: "2026-09-05", total_value_usd: "10", total_value_thb: "360",
      cost_basis_usd: null, cost_basis_thb: null, pnl_usd: null, pnl_thb: null, pnl_pct: null,
      coverage: { totalHoldings: 1, eligible: 0, notRecorded: 1, dust: 0, unpriced: 0,
        unreconciled: 0, status: "partial", sourcesComplete: true },
    };
    const query = vi.fn(async () => [row]);
    const options = { hasDb: () => true, getDb: () => ({ query }) };
    const result = await createSnapshotHistoryReader(options)();
    expect(result.available).toBe(true);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]).toMatchObject({ date: "2026-09-05", totalValueUsd: 10, pnlUsd: null });
    query.mockResolvedValue([row, { ...row, snapshot_date: "invalid" }]);
    expect(await createSnapshotHistoryReader(options)()).toEqual({ snapshots: result.snapshots, available: false });
    // Existing callers retain their original array contract, including valid rows.
    expect(await createSnapshotReader(options)()).toEqual(result.snapshots);
  });

  it("identifies malformed driver responses as unavailable instead of healthy empty history", async () => {
    for (const rows of [null, undefined, {}, { rows: [] }]) {
      expect(await createSnapshotHistoryReader({ hasDb: () => true, getDb: () => ({ query: async () => rows }) })())
        .toEqual({ snapshots: [], available: false });
    }
  });

  it("marks query and construction failures unavailable without exposing their messages", async () => {
    for (const constructionFails of [false, true]) {
      const log = vi.fn();
      const read = createSnapshotHistoryReader({ hasDb: () => true, log, getDb: () => {
        if (constructionFails) throw new Error("private driver detail");
        return { query: async () => { throw new Error("private query detail"); } };
      } });
      expect(await read()).toEqual({ snapshots: [], available: false });
      expect(log).toHaveBeenCalledExactlyOnceWith("[portfolio_snapshot] History unavailable; page remains available.");
    }
  });

  it("bounds availability checks and aborts hanging history reads", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const read = createSnapshotHistoryReader({ hasDb: () => true, timeoutMs: 20, log: vi.fn(), getDb: () => ({
      query: (_sql, _params, querySignal) => {
        signal = querySignal;
        return new Promise(() => {});
      },
    }) });
    const pending = read();
    await vi.advanceTimersByTimeAsync(21);
    expect(await pending).toEqual({ snapshots: [], available: false });
    expect(signal?.aborted).toBe(true);
  });
});
