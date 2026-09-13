import { describe, expect, it } from "vitest";
import { combineNativeEth, deriveSolanaPnl } from "./wallet-pnl";
import { buildJoinedPortfolio, type JoinedPortfolioInputs, type LiveResult } from "./live-data";
import { joinedHoldingsMap, VALUE_SOURCE_KEYS, valueSetSignature } from "./holding-values";
import { readManualBasis } from "./basis-db";
import type { AcquisitionEvidence, ManualBasis } from "./pnl";

const DATE = "2026-09-13T12:00:00.000Z";
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: DATE, message: "fixture" } });
const bases = [1.8532039629166812, 0.234833930625, 0.555084996570, 260.395615978488];
const chains = [1, 8453, 42161, 4663];
const balances = chains.map((chainId, i) => ({ chainId, chainName: ["Ethereum", "Base", "Arbitrum One", "Robinhood Chain"][i],
  symbol: "ETH", amountRaw: "1000000000000000", amount: 0.001 }));
const basis = (costUsd: number): ManualBasis => ({ costUsd, asOf: "2026-09-13", note: "synthetic desk statement" });
const manual = () => Object.fromEntries(chains.map((id, i) => [`native:${id}:native`, basis(bases[i])]));
const arrival: AcquisitionEvidence = { source: "rpc", chainId: 1, assetId: "native", decimals: 18, complete: true, hasDisposals: false,
  lots: [{ transactionHash: `0x${"1".repeat(64)}`, acquiredAt: DATE, quantityRaw: balances[0].amountRaw,
    operation: "funding-arrival", success: true, allPaymentLegsObserved: true, acquiredAssetCount: 1,
    nativeOutflowRaw: "0", tokenOutflows: [], nativePrice: { provider: "defillama-historical", assetId: "native", timestamp: DATE, priceUsd: bases[0] * 1000 } }] };
const inputs = (): JoinedPortfolioInputs => ({ t212Summary: live({ currency: "USD", cashAvailable: 0, totalValue: 0, investmentsCurrentValue: 0 }),
  t212Positions: live([]), nfts: live([]), walletNative: live(balances), walletTokens: live([]), ethPrice: live(2000),
  fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: DATE }), manualHoldings: live([]),
  capitalEvents: live([{ occurredAt: DATE, kind: "contribution", amountThb: 100 }]), manualBasis: { ...manual(), "native:solana:native": basis(4.705788) },
  solana: live({ native: [{ chainId: "solana", chainName: "Solana", symbol: "SOL", amountRaw: "48588734", amount: 0.048588734, priceUsd: 100 }], tokens: [] }) });

describe("combined native ETH", () => {
  it("sums all quantities, exact units, values and complete mixed operator/arrival bases", () => {
    const m = manual(); delete m["native:1:native"];
    const [row] = combineNativeEth(balances, 2000, 36, DATE, { "native:1:native": arrival }, m);
    expect(row).toMatchObject({ key: "native:eth", chainId: "eth", symbol: "ETH", amount: 0.004,
      amountRaw: "4000000000000000", valueUsd: 8, valueThb: 288, pnlEligibility: "eligible", basisStatus: "operator-recorded" });
    expect(row.costBasisUsd).toBeCloseTo(263.03873886859966, 10);
    expect(row.pnlUsd).toBeCloseTo(8 - bases.reduce((a, b) => a + b, 0), 10);
    expect(row.chains.map((chain) => chain.chainId)).toEqual(chains);
    expect(row.chains.reduce((sum, chain) => sum + chain.valueUsd!, 0)).toBe(row.valueUsd);
    expect(row.basisNote).toContain("funding arrivals priced");
  });
  it.each(chains)("fails closed if chain %s has no basis, without summing partial bases", (id) => {
    const m = manual(); delete m[`native:${id}:native`];
    expect(combineNativeEth(balances, 2000, 36, DATE, undefined, m)[0]).toMatchObject({ valueUsd: 8,
      costBasisUsd: null, pnlUsd: null, basisStatus: "not-recorded", pnlEligibility: "not-recorded" });
  });
  it("retains precedence over evidence and rejects a mismatched constituent quantity", () => {
    const bad = { ...arrival, lots: [{ ...arrival.lots[0], quantityRaw: "1" }] };
    const m = manual();
    expect(combineNativeEth(balances, 2000, 36, DATE, { "native:1:native": bad }, m)[0].pnlEligibility).toBe("eligible");
    delete m["native:1:native"];
    expect(combineNativeEth(balances, 2000, 36, DATE, { "native:1:native": bad }, m)[0].pnlEligibility).toBe("not-recorded");
  });
  it("combines four sub-dollar remnants before the dust/basis gate", () => {
    const [row] = combineNativeEth(balances, 400, 36, DATE, undefined, manual());
    expect(row.chains.every((chain) => chain.valueUsd! < 1)).toBe(true);
    expect(row).toMatchObject({ valueUsd: 1.6, pnlEligibility: "eligible" });
    expect(combineNativeEth(balances, 200, 36, DATE, undefined, manual())[0].pnlEligibility).toBe("dust");
    expect(combineNativeEth(balances, null, 36, DATE, undefined, manual())[0].pnlEligibility).toBe("unpriced");
  });
  it("does not emit an empty ETH row", () => expect(combineNativeEth([], 2000, 36, DATE)).toEqual([]));
});

describe("Solana joined wiring and basis keys", () => {
  it("adds exactly one live native SOL row to Crypto Port value and P&L with ten sources", () => {
    const book = buildJoinedPortfolio(inputs(), DATE);
    expect(book.wallet.native).toHaveLength(2);
    expect(book.wallet.tokens).toEqual([]);
    expect(book.wallet.native[1]).toMatchObject({ key: "native:solana:native", amount: 0.048588734,
      costBasisUsd: 4.705788, basisStatus: "operator-recorded", pnlEligibility: "eligible" });
    expect(book.totals.walletNativeUsd).toBeCloseTo(12.8588734, 10);
    expect(book.totals.pnlByClass.walletNative.costBasisUsd).toBeCloseTo(bases.reduce((a, b) => a + b, 0) + 4.705788, 10);
    const coverage = book.totals.pnlCoverage;
    expect(coverage.eligible + coverage.notRecorded + coverage.dust + coverage.unpriced + coverage.unreconciled).toBe(coverage.totalHoldings);
    expect(Object.keys(book.sources)).toHaveLength(10);
    expect(VALUE_SOURCE_KEYS).toContain("solana");
    expect(joinedHoldingsMap(book)).toEqual({ "native:eth": 8, "native:solana:native": 4.8588734 });
    const old = { "native:1": 2, "native:8453": 2, "native:42161": 2, "native:4663": 2, "native:solana:native": 4.8588734 };
    expect(valueSetSignature(old, book.sources)).not.toBe(valueSetSignature(joinedHoldingsMap(book), book.sources));
  });
  it("keeps an unavailable Solana source honest and preserves the EVM holding", () => {
    const data = inputs(); data.solana = { data: null, state: { status: "unavailable", asOf: null, message: "Solana RPC unavailable" } };
    const book = buildJoinedPortfolio(data, DATE);
    expect(book.sources.solana).toMatchObject({ status: "unavailable", message: "Solana RPC unavailable" });
    expect(book.wallet.native.map((row) => row.key)).toEqual(["native:eth"]);
    expect(book.totals.walletNativeUsd).toBe(8);
    expect(book.totals.pnlCoverage.sourcesComplete).toBe(false);
  });
  it("prices SPL tokens by mint and preserves null value/eligibility for unknown markets", () => {
    const data = inputs(); const mint = "So11111111111111111111111111111111111111112";
    data.solana!.data!.tokens = [{ chainId: "solana", chainName: "Solana", name: "Fixture", symbol: "FIX", contract: mint,
      amount: 2, amountRaw: "2000000000", decimals: 9, priceUsd: 5 }];
    data.manualBasis = { ...data.manualBasis, [`token:solana:${mint.toLowerCase()}`]: basis(3) };
    expect(buildJoinedPortfolio(data, DATE).wallet.tokens[0]).toMatchObject({ costBasisUsd: 3, pnlUsd: 7, pnlEligibility: "eligible" });
    data.solana!.data!.tokens[0].priceUsd = null;
    expect(buildJoinedPortfolio(data, DATE).wallet.tokens[0]).toMatchObject({ valueUsd: null, costBasisUsd: null, pnlEligibility: "unpriced" });
  });
  it("reads the pinned native and lowercased mint keys using SELECT only", async () => {
    const mint = "So11111111111111111111111111111111111111112".toLowerCase();
    const keys = ["native:solana:native", `token:solana:${mint}`];
    const queries: string[] = [];
    const result = await readManualBasis(DATE, { hasDb: () => true, getDb: () => ({ query: async (sql) => {
      queries.push(sql); return [...keys, "native:solana:other", `token:solana:So${"1".repeat(36)}`, "token:solana:bad"].map((holding_key) => ({ holding_key, cost_usd: "4.705788", as_of: "2026-09-13", note: "bridge basis" }));
    } }) });
    expect(Object.keys(result)).toEqual(keys);
    expect(queries).toEqual(["SELECT holding_key, cost_usd, as_of::text AS as_of, note FROM manual_basis"]);
  });
  it("does not invent Solana basis or eligibility for dust, missing prices or invalid statements", () => {
    expect(deriveSolanaPnl(null, 36, basis(4)).pnlEligibility).toBe("unpriced");
    expect(deriveSolanaPnl(0.5, 36, basis(4)).pnlEligibility).toBe("dust");
    expect(deriveSolanaPnl(10, 36).pnlEligibility).toBe("not-recorded");
    expect(deriveSolanaPnl(10, 36, basis(-1)).pnlEligibility).toBe("not-recorded");
  });
});
