import { afterEach, describe, expect, it, vi } from "vitest";
import { readManualBasis } from "./basis-db";
import { MANUAL_BASIS_DDL } from "./assets-db";

const AS_OF = "2026-09-05T12:00:00.000Z";
const row = { holding_key: "native:1:native", cost_usd: "80.00", as_of: "2026-09-01", note: "desk execution: $80 paid 2026-09-01" };
const expected = { [row.holding_key]: { costUsd: 80, asOf: row.as_of, note: row.note } };
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("SELECT-only operator basis channel", () => {
  it("rejects malformed rows independently, never repairing a holding key or inventing zero cost", async () => {
    const invalid = [null, [], {}, ...[
      { holding_key: " native:1:native" }, { holding_key: "native:01:native" }, { holding_key: "native:1:eth" },
      { holding_key: "nft:1:collection" }, { holding_key: "nft:4663:" }, { holding_key: "nft:4663:bad slug" },
      { holding_key: "token:1:0x123" }, { holding_key: `token:1:0x${"A".repeat(40)}` }, { holding_key: "__proto__" },
      { cost_usd: null }, { cost_usd: true }, { cost_usd: [] }, { cost_usd: "" }, { cost_usd: " " },
      { cost_usd: "0x50" }, { cost_usd: "80oops" }, { cost_usd: "NaN" }, { cost_usd: "Infinity" },
      { cost_usd: Number.NaN }, { cost_usd: Number.POSITIVE_INFINITY }, { cost_usd: -1 },
      { as_of: "2026-02-30" }, { as_of: "invalid" }, { as_of: null }, { as_of: "2026-09-01T00:00:00Z" },
      { note: "" }, { note: "   " }, { note: null }, { note: [] },
    ].map((bad) => ({ ...row, ...bad }))];
    for (const malformed of invalid) {
      const options = { hasDb: () => true, getDb: () => ({ query: async () => [malformed] }) };
      expect(await readManualBasis(AS_OF, options)).toEqual({});
      expect(await readManualBasis(AS_OF, { ...options, getDb: () => ({ query: async () => [malformed, row] }) })).toEqual(expected);
    }
  });
  it("accepts all canonical holding keys and numeric zero with exact note/date preservation", async () => {
    const keys = ["nft:4663:desk-collection", "native:4663:native", `token:8453:0x${"a".repeat(40)}`];
    const note = "operator-stated: ฿3,000 @ 33.03 THB/USD on 2026-09-01";
    const result = await readManualBasis(AS_OF, { hasDb: () => true,
      getDb: () => ({ query: async () => keys.map((holding_key, index) => ({ ...row, holding_key, note, cost_usd: index === 0 ? 0 : "90.82652134423252" })) }) });
    expect(Object.keys(result)).toEqual(keys);
    expect(result[keys[0]].costUsd).toBe(0);
    expect(result[keys[1]].costUsd).toBe(90.82652134423252);
    for (const basis of Object.values(result)) expect(basis).toMatchObject({ asOf: row.as_of, note });
  });
  it("does not construct a DB when unconfigured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const getDb = vi.fn(() => { throw new Error("must not construct"); });
    expect(await readManualBasis(AS_OF, { getDb })).toEqual({});
    expect(getDb).not.toHaveBeenCalled();
  });
  it("fails soft for missing table, broken configuration/driver/results/logger without leaking secrets", async () => {
    const log = vi.fn();
    for (const options of [
      { getDb: () => ({ query: async () => { throw new Error('relation "manual_basis" does not exist; private URL'); } }) },
      { getDb: () => { throw new Error("private URL"); } },
      { getDb: () => ({ query: async () => null }) },
      { hasDb: () => { throw new Error("private config"); } },
    ]) expect(await readManualBasis(AS_OF, { hasDb: () => true, log, ...options })).toEqual({});
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    expect(await readManualBasis(AS_OF, { hasDb: () => true,
      getDb: () => { throw new Error("private"); }, log: () => { throw new Error("broken logger"); } })).toEqual({});
  });
  it.each([undefined, 5, 0, -1, Number.NaN, 30001])("bounds SELECT, aborts, isolates late results and retries with timeout override=%s", async (timeoutMs) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const limit = timeoutMs === 5 ? 5 : 2000;
    const query = vi.fn((_sql: string, _params?: unknown[], s?: AbortSignal): Promise<unknown> => {
      signal = s;
      return new Promise((resolve) => setTimeout(() => resolve([row]), limit + 1));
    });
    const options = { hasDb: () => true, getDb: () => ({ query }), timeoutMs, log: vi.fn() };
    let settled = false;
    const pending = readManualBasis(AS_OF, options).then((value) => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(limit - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result).toEqual({});
    expect(signal!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toEqual({});
    query.mockResolvedValue([row]);
    expect(await readManualBasis(AS_OF, options)).toEqual(expected);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("declares only the pinned additive table shape; never applies schema while reading", async () => {
    expect(MANUAL_BASIS_DDL.replace(/\s+/g, " ").trim()).toBe("CREATE TABLE IF NOT EXISTS manual_basis ( holding_key text PRIMARY KEY, cost_usd numeric NOT NULL CHECK (cost_usd >= 0), as_of date NOT NULL, note text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now() );");
    const query = vi.fn(async () => [row]);
    expect(await readManualBasis(AS_OF, { hasDb: () => true, getDb: () => ({ query }) })).toEqual(expected);
    expect(query).toHaveBeenCalledExactlyOnceWith("SELECT holding_key, cost_usd, as_of::text AS as_of, note FROM manual_basis", [], expect.any(AbortSignal));
  });
});
