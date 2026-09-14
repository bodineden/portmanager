import { describe, expect, it } from "vitest";
import { cashBook, cashBookInputs } from "./__fixtures__/cash-book";
import { allocationPnl, valueAllocation } from "./pnl-view";
import { joinedHoldingsMap } from "./holding-values";
import { buildJoinedPortfolio } from "./live-data";

/** Binary-exact amounts isolate regrouping from unrelated FX addition-order noise. */
function exactMintBook() {
  const inputs = cashBookInputs();
  inputs.t212Summary.data = { currency: "USD", totalValue: 128, cashAvailable: 64, investmentsCurrentValue: 64 };
  inputs.manualHoldings!.data![0] = { ...inputs.manualHoldings!.data![0], currency: "USD", amount: 512 };
  inputs.nfts.data = [];
  inputs.walletNative!.data![0].amount = 0.125;
  inputs.walletTokens!.data = [];
  inputs.ethPrice.data = 2048;
  inputs.fiatFx.data = { usdToThb: 32, gbpToThb: 40, eurToThb: null, asOf: "2026-09-14T14:51:00Z" };
  const solana = inputs.solana!.data!;
  Object.assign(solana.native[0], { amountRaw: "1000000000", amount: 1, priceUsd: 32 });
  Object.assign(solana.tokens[0], { amountRaw: "64000000", amount: 64, priceUsd: 1 });
  Object.assign(solana.tokens[1], { amountRaw: "8", amount: 8, priceUsd: 2 });
  inputs.manualBasis = {
    [`token:solana:${solana.tokens[0].contract}`]: { costUsd: 80, asOf: "2026-09-14", note: "Synthetic stablecoin recorded-basis regression" },
    [`token:solana:${solana.tokens[1].contract}`]: { costUsd: 8, asOf: "2026-09-14", note: "Synthetic non-stable recorded-basis regression" },
  };
  return buildJoinedPortfolio(inputs, "2026-09-14T14:51:00Z");
}

describe("pinned three-class acceptance", () => {
  it("moves truncated-symbol Solana USDC to Cash with exact class/grand-total identities", () => {
    const book = exactMintBook();
    const usdc = book.wallet.tokens.find((row) => row.symbol === "EPjF…Dt1v")!;
    expect(usdc).toMatchObject({ name: `SPL token ${usdc.contract}`, priced: true, valueUsd: 64 });
    const before = JSON.stringify(book);
    const classes = valueAllocation(book);
    expect(classes.map((row) => [row.key, row.valueUsd])).toEqual([["t212", 64], ["crypto", 304], ["cash", 640]]);
    expect(classes.reduce((sum, row) => sum + row.valueUsd!, 0)).toBe(book.totals.grandTotalUsd);
    expect(classes.reduce((sum, row) => sum + row.valueThb!, 0)).toBe(book.totals.grandTotalThb);
    expect(JSON.stringify(book)).toBe(before);
  });
  it("excludes only mint-recognized stablecoin basis, P&L and eligible count from Crypto", () => {
    const book = exactMintBook();
    const before = JSON.stringify(book);
    const usdc = book.wallet.tokens.find((row) => row.symbol === "EPjF…Dt1v")!;
    expect(usdc).toMatchObject({ costBasisUsd: 80, pnlUsd: -16, pnlEligibility: "eligible" });
    const crypto = allocationPnl(book, "crypto");
    expect(crypto).toMatchObject({ costBasisUsd: 8, pnlUsd: 8, pnlCoverage: { eligible: 1 } });
    expect(crypto.costBasisUsd).toBe(book.totals.costBasisUsd! - usdc.costBasisUsd!);
    expect(crypto.pnlUsd).toBe(book.totals.pnlUsd! - usdc.pnlUsd!);
    expect(crypto.pnlCoverage.eligible).toBe(book.totals.pnlCoverage.eligible - 1);
    expect(allocationPnl(book, "cash")).toMatchObject({ costBasisUsd: null, pnlUsd: null, pnlCoverage: { eligible: 0, totalHoldings: 0 } });
    expect(JSON.stringify(book)).toBe(before);
    // Same value/basis with an unknown contract is crypto; symbol alone cannot rescue it.
    usdc.contract = "unknown-mint";
    expect(valueAllocation(book).map((row) => row.valueUsd)).toEqual([64, 368, 576]);
    expect(allocationPnl(book, "crypto")).toMatchObject({ costBasisUsd: 88, pnlUsd: -8, pnlCoverage: { eligible: 2 } });
  });
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
