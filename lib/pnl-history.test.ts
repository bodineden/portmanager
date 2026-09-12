import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetSnapshotCacheForTests, getJoinedPortfolio, buildJoinedPortfolio, type JoinedPortfolio, type JoinedPortfolioInputs, type LiveResult } from "./live-data";
import { joinedHoldingsMap, valueSetSignature, VALUE_SOURCE_KEYS } from "./holding-values";
import { oneUnpricedNft } from "./__fixtures__/nft-floors";
import * as history from "./pnl-history";

const DATE = "2026-09-05T12:00:00.000Z";
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: DATE, message: "fixture" } });
function portfolio(overrides: Partial<JoinedPortfolioInputs> = {}): JoinedPortfolio {
  return buildJoinedPortfolio({
    manualHoldings: live([]),
    capitalEvents: { data: [], state: { status: "partial", asOf: DATE, message: "Contributed capital not recorded." } },
    t212Summary: live({ currency: "GBP", cashAvailable: 487, totalValue: 487, investmentsCurrentValue: 0 }),
    t212Positions: live([]), nfts: live([]), walletTokens: live([]),
    walletNative: live([{ chainId: 42161, chainName: "Arbitrum One", symbol: "ETH", amount: 0.248396 }]),
    fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: DATE }), ethPrice: live(2_400),
    ...overrides,
  }, DATE);
}
afterEach(() => { __resetSnapshotCacheForTests(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("daily snapshot recorder", () => {
  it.each(VALUE_SOURCE_KEYS)("rejects unavailable %s before DB IO without consuming the same-day retry", async (source) => {
    const query = vi.fn(async () => [{ snapshot_date: "2026-09-05" }]);
    const getDb = vi.fn(() => ({ query }));
    const record = history.createSnapshotRecorder({ hasDb: () => true, getDb, now: () => Date.parse(DATE) });
    const book = portfolio();
    const original = book.sources[source];
    book.sources[source] = { status: "unavailable", asOf: null, message: "Hard provider failure" };
    expect(Number.isFinite(book.totals.grandTotalUsd)).toBe(true);
    expect(await record(book)).toBe("skipped");
    expect(getDb).not.toHaveBeenCalled();
    book.sources[source] = original;
    expect(await record(book)).toBe("recorded");
    expect(await record(book)).toBe("already-exists");
  });

  it("pins audit A5's finite-but-incomplete wallet book: null tokens, wallet 200, total 2916.65 is skipped", async () => {
    // Synthetic audit reproduction, not historical wallet balances.
    const book = portfolio({
      t212Summary: live({ currency: "GBP", totalValue: 9.62, cashAvailable: 0.28, investmentsCurrentValue: 9.34 }),
      t212Positions: live([{ ticker: "CMCSA_US_EQ", name: "Comcast", quantity: 0.5, averagePrice: 26.32,
        currentPrice: 25.25, ppl: -0.37, currency: "USD", pplCurrency: "GBP", valueNative: 12.625, valueAccount: 9.34 }]),
      manualHoldings: live([{ id: "opening", label: "T212 cash pot", kind: "cash", currency: "GBP", amount: 2000, recordedAt: DATE, createdAt: DATE }]),
      capitalEvents: live([{ occurredAt: DATE, kind: "contribution", amountThb: 120000 }]),
      fiatFx: live({ usdToThb: 33.003871, gbpToThb: 44.6154, eurToThb: null, asOf: DATE }), ethPrice: live(2578.15),
      walletNative: live([{ chainId: 42161, chainName: "Arbitrum One", symbol: "ETH", amount: 200 / 2578.15 }]),
      walletTokens: { data: null, state: { status: "unavailable", asOf: null, message: "Hard provider failure" } },
    });
    expect(book.totals.walletTokensUsd).toBeNull();
    expect(book.totals.walletUsd).toBe(200);
    expect(book.totals.grandTotalUsd).toBeCloseTo(2916.65, 2);
    const query = vi.fn(async () => [{ snapshot_date: "2026-09-05" }]);
    const getDb = vi.fn(() => ({ query }));
    const record = history.createSnapshotRecorder({ hasDb: () => true, getDb, now: () => Date.parse(DATE), log: vi.fn() });
    expect(await record(book)).toBe("skipped");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("records the full NFT/token inventory and values while coverage counts only displayable holdings", async () => {
    const book = portfolio({
      nfts: live(oneUnpricedNft),
      walletTokens: live([
        { chainId: 1, chainName: "Ethereum", symbol: "UNPRICED", name: "Unpriced token", amountRaw: "7", decimals: 0, amount: 7, priceUsd: null },
        { chainId: 1, chainName: "Ethereum", symbol: "DUST", name: "Priced dust", amountRaw: "1", decimals: 0, amount: 1, priceUsd: 0.02 },
      ]),
    });
    expect(Number.isFinite(book.totals.grandTotalUsd)).toBe(true);
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => { void _sql; void _params; return [{ snapshot_date: "2026-09-05" }]; });
    const record = history.createSnapshotRecorder({ hasDb: () => true, getDb: () => ({ query }), now: () => Date.parse(DATE) });
    expect(await record(book)).toBe("recorded");
    const params = query.mock.calls[2][1]!;
    const coverage = JSON.parse(String(params[8]));
    expect(coverage.sources.nfts.status).toBe("live");
    expect(coverage.sources.walletTokens.status).toBe("live");
    expect(coverage).toMatchObject({ totalHoldings: 6, eligible: 0, notRecorded: 6, unpriced: 0, dust: 0, status: "partial" });
    expect(coverage.eligible + coverage.notRecorded + coverage.unreconciled + coverage.dust + coverage.unpriced).toBe(coverage.totalHoldings);
    const holdings = JSON.parse(String(params[16]));
    expect(holdings).toHaveProperty("nft:wasteland-art", null);
    expect(holdings).toHaveProperty("token:1:unpriced", null);
    expect(holdings).toHaveProperty("token:1:dust", 0.02);
    expect(Object.values(holdings)).toHaveLength(9);
    expect(holdings).toEqual(joinedHoldingsMap(book));
    expect(coverage.valueSetSignature).toBe(valueSetSignature(holdings, book.sources));
    expect(params[1]).toBe(book.totals.grandTotalUsd);
    expect(book.totals.walletTokensUsd).toBe(0.02);
    expect(book.totals.walletTokensThb).toBe(0.72);
    expect(history.mapPortfolioSnapshotRow({ snapshot_date: "2026-09-05", total_value_usd: params[1], total_value_thb: params[2], coverage, holdings })?.coverage).toMatchObject({ totalHoldings: 6, dust: 0, unpriced: 0 });
  });

  it("records non-null partial values with explicit partial source status and observation time", async () => {
    const query = vi.fn(async (_text: string, _params?: unknown[]) => { void _text; void _params; return [{ snapshot_date: "2026-09-05" }]; });
    const book = portfolio(); book.sources.walletNative.status = "partial";
    const record = history.createSnapshotRecorder({ hasDb: () => true, getDb: () => ({ query }), now: () => Date.parse(DATE) });
    expect(await record(book)).toBe("recorded");
    const row = query.mock.calls[2][1]!;
    expect(JSON.parse(String(row[8])).sources.walletNative.status).toBe("partial");
    expect(row[9]).toBe(book.asOf);
  });

  it("allows same-day and next-day recovery after an error even if the logger throws", async () => {
    let now = Date.parse(DATE);
    let fail = true;
    const query = vi.fn(async () => { if (fail) throw new Error("offline"); return [{ snapshot_date: "2026-09-06" }]; });
    const record = history.createSnapshotRecorder({ hasDb: () => true, getDb: () => ({ query }), now: () => now, log: () => { throw new Error("logger unavailable"); } });
    const book = portfolio();
    expect(await record(book)).toBe("error");
    fail = false;
    expect(await record(book)).toBe("recorded");
    now = Date.parse("2026-09-06T00:00:00Z"); book.asOf = new Date(now).toISOString();
    expect(await record(book)).toBe("recorded");
    expect(query).toHaveBeenCalledTimes(7);
  });

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

  it("swallows DB construction/DDL/INSERT errors, logs no secret, and allows retry", async () => {
    for (const failure of ["connect", "ddl", "insert"]) {
      let calls = 0;
      const log = vi.fn();
      const getDb = vi.fn(() => {
        if (failure === "connect") throw new Error("sensitive database URL");
        return { query: async () => { calls += 1; if (failure === "ddl" || calls % 3 === 0) throw new Error("sensitive database URL"); return []; } };
      });
      const record = history.createSnapshotRecorder({ hasDb: () => true, getDb, now: () => Date.parse(DATE), log });
      expect(await record(portfolio())).toBe("error");
      expect(await record(portfolio())).toBe("error");
      expect(getDb).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledTimes(2);
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
    expect(query).toHaveBeenCalledTimes(6);
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
      const retry = record(portfolio());
      await vi.advanceTimersByTimeAsync(21);
      expect(await retry).toBe("error");
      expect(query).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("records one UTC-date row with null basis/P&L and partial coverage, without touching archive", async () => {
    const stored = new Map<string, unknown[]>();
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      if (text.includes("CREATE TABLE") || text.includes("ALTER TABLE portfolio_snapshot")) return [];
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
    expect(await recorder(book)).toBe("already-exists");
    expect(query).toHaveBeenCalledTimes(3); // snapshot table + additive extensions, then parameterized INSERT
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
