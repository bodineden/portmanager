import { afterEach, describe, expect, it, vi } from "vitest";
import { createSnapshotReader, listPortfolioSnapshots, mapPortfolioSnapshotRow, mapPortfolioSnapshotRows } from "./pnl-history";

const coverage = {
  totalHoldings: 4, eligible: 0, notRecorded: 2, dust: 1, unpriced: 1, unreconciled: 0,
  status: "partial" as const, sourcesComplete: true,
};
const row = (date = "2026-09-05") => ({
  snapshot_date: date, total_value_usd: "1200.50", total_value_thb: "43218.00",
  cost_basis_usd: null, cost_basis_thb: null, pnl_usd: null, pnl_thb: null, pnl_pct: null,
  coverage: { ...coverage },
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("snapshot row mapping", () => {
  it("maps numeric strings and plain JSON coverage while preserving unknown basis and P&L", () => {
    const source = row();
    const mapped = mapPortfolioSnapshotRow(source);
    expect(mapped).toEqual({
      date: "2026-09-05", totalValueUsd: 1200.5, totalValueThb: 43218,
      costBasisUsd: null, costBasisThb: null, pnlUsd: null, pnlThb: null, pnlPct: null,
      coverage,
    });
    expect(mapped!.coverage).not.toBe(source.coverage);
    expect(JSON.parse(JSON.stringify(mapped))).toEqual(mapped);
  });

  it("accepts driver Date/JSON strings, known zero basis, and negative P&L without inventing THB", () => {
    expect(mapPortfolioSnapshotRow({
      ...row(), snapshot_date: new Date("2026-09-05T00:00:00Z"), coverage: JSON.stringify(coverage),
      total_value_thb: null, cost_basis_usd: "0", cost_basis_thb: null,
      pnl_usd: "-10.25", pnl_pct: "-1.5", pnl_thb: null,
    })).toMatchObject({
      date: "2026-09-05", totalValueThb: null, costBasisUsd: 0, costBasisThb: null,
      pnlUsd: -10.25, pnlThb: null, pnlPct: -1.5, coverage,
    });
  });

  it("does not coerce blanks, booleans, non-finite or malformed numerics into money", () => {
    for (const value of ["", " ", false, true, "NaN", "Infinity", Infinity, Number.NaN, {}, "0x10"]) {
      expect(mapPortfolioSnapshotRow({ ...row(), total_value_usd: value, pnl_usd: value }))
        .toMatchObject({ totalValueUsd: null, pnlUsd: null });
    }
    expect(mapPortfolioSnapshotRow({ ...row(), total_value_usd: -1, cost_basis_usd: "-2" }))
      .toMatchObject({ totalValueUsd: null, costBasisUsd: null });
  });

  it("rejects invalid dates and coverage rather than asserting completeness", () => {
    for (const date of ["2026-02-30", "not-a-date", "2026-9-05", new Date("invalid")]) {
      expect(mapPortfolioSnapshotRow({ ...row(), snapshot_date: date })).toBeNull();
    }
    for (const value of [null, "broken JSON", [], {},
      { ...coverage, eligible: -1 }, { ...coverage, notRecorded: 1.5 },
      { ...coverage, totalHoldings: 99 }, { ...coverage, sourcesComplete: "true" },
      { ...coverage, status: "complete" },
      { ...coverage, totalHoldings: 0, notRecorded: 0, dust: 0, unpriced: 0, status: "complete", sourcesComplete: false },
    ]) expect(mapPortfolioSnapshotRow({ ...row(), coverage: value })).toBeNull();
    expect(mapPortfolioSnapshotRow(null)).toBeNull();
  });

  it("returns newest-first rows without mutating fixtures or filling missing days", () => {
    const fixtures = [row("2026-09-01"), row("2026-09-05"), { ...row(), snapshot_date: "invalid" }];
    expect(mapPortfolioSnapshotRows(fixtures).map(({ date }) => date)).toEqual(["2026-09-05", "2026-09-01"]);
    expect(fixtures[0].snapshot_date).toBe("2026-09-01");
    expect(mapPortfolioSnapshotRows({ rows: fixtures })).toEqual([]);
  });
});

describe("read-only snapshot history boundary (fake clients only)", () => {
  it("does no DB construction or I/O when the existing Neon gate is false", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const getDb = vi.fn(() => { throw new Error("must not construct"); });
    expect(await createSnapshotReader({ getDb })()).toEqual([]);
    expect(await listPortfolioSnapshots()).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("uses one SELECT with descending dates and no schema, seed or mutation operation", async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[], _signal?: AbortSignal) => {
      void _sql; void _params; void _signal;
      return [row("2026-09-01"), row("2026-09-05")];
    });
    expect((await createSnapshotReader({ hasDb: () => true, getDb: () => ({ query }) })()).map(({ date }) => date))
      .toEqual(["2026-09-05", "2026-09-01"]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params, signal] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT\s+snapshot_date::text/);
    expect(sql).toContain("ORDER BY snapshot_date DESC");
    expect(sql).not.toMatch(/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)\b/i);
    expect(params).toEqual([]);
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("returns empty history for missing table/query/construction failures and never logs driver secrets", async () => {
    for (const atConstruction of [false, true]) {
      const log = vi.fn();
      const read = createSnapshotReader({ hasDb: () => true, log, getDb: () => {
        if (atConstruction) throw new Error("secret-connection-string");
        return { query: async () => { throw new Error("secret SQL and credentials"); } };
      } });
      expect(await read()).toEqual([]);
      expect(log).toHaveBeenCalledExactlyOnceWith("[portfolio_snapshot] History unavailable; page remains available.");
    }
    expect(await createSnapshotReader({ hasDb: () => { throw new Error("broken gate"); }, log: () => { throw new Error("broken logger"); } })()).toEqual([]);
  });

  it("bounds read latency and aborts a hanging query without failing the page", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const query = vi.fn((_sql: string, _params?: unknown[], querySignal?: AbortSignal) => {
      signal = querySignal;
      return new Promise<unknown>(() => {});
    });
    const read = createSnapshotReader({ hasDb: () => true, getDb: () => ({ query }), timeoutMs: 20, log: vi.fn() });
    const pending = read();
    await vi.advanceTimersByTimeAsync(21);
    expect(await pending).toEqual([]);
    expect(signal?.aborted).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
