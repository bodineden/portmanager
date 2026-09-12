import { afterEach, describe, expect, it, vi } from "vitest";
import { readBasisEvidence } from "./basis-db";
import type { AcquisitionEvidence } from "./pnl";

const AS_OF = "2026-09-05T12:00:00.000Z";
const valid: AcquisitionEvidence = { source: "rpc", chainId: 1, assetId: "native", decimals: 18,
  complete: true, hasDisposals: false, lots: [{ transactionHash: `0x${"a".repeat(64)}`,
    acquiredAt: "2026-09-01T12:00:00.000Z", quantityRaw: "1000000000000000000", operation: "funding-arrival",
    success: true, allPaymentLegsObserved: true, acquiredAssetCount: 1, nativeOutflowRaw: "0", tokenOutflows: [],
    nativePrice: { provider: "defillama-historical", assetId: "native", timestamp: "2026-09-01T12:00:00.000Z", priceUsd: 2000 } }] };
const row = { holding_key: "native:1:native", evidence: valid };

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("SELECT-only latest basis cache", () => {
  it("drops malformed rows independently while retaining valid siblings", async () => {
    const invalid = [null, {}, { ...row, holding_key: 42 }, { ...row, holding_key: "cash:1:native" },
      { ...row, evidence: null }, { ...row, evidence: [] }, { ...row, evidence: {} },
      { ...row, evidence: { ...valid, source: ["rpc"] } },
      { ...row, evidence: { ...valid, lots: [{ ...valid.lots[0], nativePrice: { ...valid.lots[0].nativePrice, provider: ["defillama-historical"] } }] } },
      ...["source", "chainId", "assetId", "decimals", "complete", "hasDisposals", "lots"].map((field) => {
        const evidence = { ...valid } as Record<string, unknown>; delete evidence[field]; return { ...row, evidence };
      }),
      { ...row, evidence: { ...valid, lots: [null] } },
      { ...row, evidence: { ...valid, lots: [{ ...valid.lots[0], tokenOutflows: [null] }] } },
      { ...row, evidence: { ...valid, lots: [{ ...valid.lots[0], nativePrice: {} }] } },
      { ...row, evidence: { ...valid, lots: [{ ...valid.lots[0], acquiredAssetIds: [42] }] } },
    ];
    for (const malformed of invalid) {
      const getDb = () => ({ query: async () => [malformed] });
      expect(await readBasisEvidence(AS_OF, { hasDb: () => true, getDb })).toEqual({});
      expect(await readBasisEvidence(AS_OF, { hasDb: () => true, getDb: () => ({ query: async () => [malformed, row] }) }))
        .toEqual({ [row.holding_key]: valid });
    }
  });
  it("gates DB construction using the default configuration check", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const getDb = vi.fn(() => { throw new Error("must not construct"); });
    expect(await readBasisEvidence(AS_OF, { getDb })).toEqual({});
    expect(getDb).not.toHaveBeenCalled();
  });
  it("returns empty for missing tables, construction failures and malformed query results; logs no private details", async () => {
    const log = vi.fn();
    for (const options of [
      { getDb: () => ({ query: async () => { throw new Error('relation "basis_evidence" does not exist; private URL'); } }) },
      { getDb: () => { throw new Error("private URL"); } },
      { getDb: () => ({ query: async () => null }) },
      { hasDb: () => { throw new Error("private config"); } },
    ]) expect(await readBasisEvidence(AS_OF, { hasDb: () => true, log, ...options })).toEqual({});
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    expect(await readBasisEvidence(AS_OF, { hasDb: () => true,
      getDb: () => { throw new Error("private"); }, log: () => { throw new Error("broken logger"); } })).toEqual({});
  });
  it.each([undefined, 5, 0, -1, Number.NaN, 30001])("bounds SELECT with abort and isolates late results, timeout override=%s", async (timeoutMs) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const limit = timeoutMs === 5 ? 5 : 2000;
    const query = vi.fn((_sql: string, _params?: unknown[], s?: AbortSignal): Promise<unknown> => {
      signal = s;
      return new Promise((resolve) => setTimeout(() => resolve([row]), limit + 1));
    });
    const options = { hasDb: () => true, getDb: () => ({ query }), timeoutMs, log: vi.fn() };
    let settled = false;
    const pending = readBasisEvidence(AS_OF, options).then((value) => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(limit - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result).toEqual({});
    expect(signal!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toEqual({});
    query.mockResolvedValue([row]);
    expect(await readBasisEvidence(AS_OF, options)).toEqual({ [row.holding_key]: valid });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("passes valid rows without an as-of/collection-date filter or any schema/write statement", async () => {
    const query = vi.fn(async () => [{ ...row, collected_at: "2026-09-06T12:00:00.000Z" }]);
    expect(await readBasisEvidence(AS_OF, { hasDb: () => true, getDb: () => ({ query }) })).toEqual({ [row.holding_key]: valid });
    expect(query).toHaveBeenCalledExactlyOnceWith("SELECT holding_key, evidence FROM basis_evidence", [], expect.any(AbortSignal));
  });
});
