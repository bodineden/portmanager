import { describe, expect, it } from "vitest";
import { cashBook } from "./__fixtures__/cash-book";
import { allocationPnl, valueAllocation } from "./pnl-view";
import { joinedHoldingsMap } from "./holding-values";

describe("pinned three-class acceptance", () => {
  it("ties all three classes to the unchanged book in USD and THB", () => {
    const book = cashBook();
    const before = JSON.stringify(book);
    const holdings = joinedHoldingsMap(book);
    const classes = valueAllocation(book);
    expect(classes.map((r) => r.valueUsd!.toFixed(2))).toEqual(["49.22", "333.81", "2895.13"]);
    expect(classes.map((r) => r.sharePct!.toFixed(1))).toEqual(["1.5", "10.2", "88.3"]);
    const sumUsd = classes.reduce((s, r) => s + r.valueUsd!, 0);
    const sumThb = classes.reduce((s, r) => s + r.valueThb!, 0);
    // IEEE-754 addition order may differ below a cent; no balancing plug is added.
    expect(sumUsd).toBeCloseTo(book.totals.grandTotalUsd!, 10);
    expect(sumThb).toBeCloseTo(book.totals.grandTotalThb!, 8);
    expect(sumUsd.toFixed(2)).toBe("3278.16");
    expect(book.totals.grandTotalUsd!.toFixed(2)).toBe("3278.16");
    expect(classes.reduce((s, r) => s + Math.round(r.valueUsd! * 100), 0)).toBe(Math.round(book.totals.grandTotalUsd! * 100));
    expect(joinedHoldingsMap(book)).toEqual(holdings);
    expect(JSON.stringify(book)).toBe(before);
    expect(allocationPnl(book, "cash").pnlUsd).toBeNull();
    process.stdout.write(`PINNED_CLASS_QA ${JSON.stringify({ classes, sumUsd, grandTotalUsd: book.totals.grandTotalUsd, sumThb, grandTotalThb: book.totals.grandTotalThb })}\n`);
  });
  it("keeps Crypto and Stocks visible when manual cash is unavailable", () => {
    const book = cashBook(); book.totals.manualUsd = null; book.totals.manualThb = null;
    const [stocks, crypto, cash] = valueAllocation(book);
    expect(stocks.valueUsd).not.toBeNull(); expect(crypto.valueUsd).not.toBeNull();
    expect(cash.valueUsd).toBeNull(); expect(cash.valueThb).toBeNull();
    expect([stocks, crypto, cash].every((row) => row.sharePct === null)).toBe(true);
  });
});
