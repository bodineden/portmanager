import { describe, expect, it } from "vitest";
import { sumContributedCapital, latestManualHoldings, calculateBookPnl } from "./capital";

const AS_OF = "2026-09-11T00:00:00Z";
const FX = 33.003871;

describe("operator capital and cash-pot ledger", () => {
  it("sums contributions less withdrawals through the inclusive snapshot cutoff", () => {
    expect(sumContributedCapital([
      { occurredAt: AS_OF, kind: "contribution", amountThb: 120000 },
      { occurredAt: "2026-09-10T00:00:00Z", kind: "withdrawal", amountThb: 1000 },
      { occurredAt: "2026-09-12T00:00:00Z", kind: "contribution", amountThb: 9000 },
    ], AS_OF)).toBe(119000);
  });
  it("keeps absent capital null, including a ledger containing only future events", () => {
    expect(sumContributedCapital([], AS_OF)).toBeNull();
    expect(sumContributedCapital([{ occurredAt: "2026-09-12T00:00:00Z", kind: "contribution", amountThb: 120000 }], AS_OF)).toBeNull();
    expect(calculateBookPnl(100000, null, FX)).toBeNull();
  });
  it("selects latest report per label at cutoff with created-at then id tie breaks", () => {
    const base = { label: "T212 cash pot", kind: "cash" as const, currency: "GBP", recordedAt: AS_OF, createdAt: AS_OF, amount: 2000 };
    const reports = [
      { ...base, id: "b" }, { ...base, id: "a", amount: 1000 },
      { ...base, id: "c", recordedAt: "2026-09-12T00:00:00Z", amount: 3000 },
      { ...base, id: "z", createdAt: "2026-09-10T00:00:00Z", amount: 4000 },
      { ...base, id: "old", recordedAt: "2026-09-09T00:00:00Z", amount: 5000 },
    ];
    expect(latestManualHoldings(reports, AS_OF)).toEqual([reports[0]]);
    expect(latestManualHoldings([...reports].reverse(), AS_OF)).toEqual([reports[0]]);
  });
  it("calculates book P&L in THB then converts the result at snapshot FX", () => {
    const valueThb = (2000 + 9.62) * 44.6154;
    const pnl = calculateBookPnl(valueThb, 120000, FX)!;
    expect(pnl.pnlThb).toBeCloseTo(valueThb - 120000, 8);
    expect(pnl.pnlUsd).toBeCloseTo((valueThb - 120000) / FX, 8);
    expect(pnl.pnlPct).toBeCloseTo((valueThb - 120000) / 120000 * 100, 8);
    expect(calculateBookPnl(null, 120000, FX)).toBeNull();
    expect(calculateBookPnl(valueThb, 120000, null)).toBeNull();
    expect(calculateBookPnl(valueThb, 0, FX)?.pnlPct).toBeNull();
    // A known negative net contribution still follows the signed formula; only zero is undefined.
    expect(calculateBookPnl(valueThb, -120000, FX)?.pnlPct).toBeCloseTo((valueThb + 120000) / -120000 * 100, 8);
  });
});
