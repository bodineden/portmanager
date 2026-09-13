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
  it("keeps combined ETH at exactly $1 displayable and eligible", () => {
    const [row] = combineNativeEth(balances, 250, 36, DATE, undefined, manual());
    expect(row.chains.map((chain) => chain.valueUsd)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(row).toMatchObject({ valueUsd: 1, pnlEligibility: "eligible", costBasisUsd: bases.reduce((sum, cost) => sum + cost, 0) });
  });
  it.each(["missing", "invalid"])("fails closed above USD 1 when a sub-dollar constituent has %s basis", (problem) => {
    const statements = manual();
    if (problem === "missing") delete statements["native:8453:native"];
    else statements["native:8453:native"] = basis(-1);
    const [row] = combineNativeEth(balances, 400, 36, DATE, undefined, statements);
    expect(row.chains.map((chain) => chain.valueUsd)).toEqual([0.4, 0.4, 0.4, 0.4]);
    expect(row).toMatchObject({ valueUsd: 1.6, costBasisUsd: null, pnlUsd: null,
      basisStatus: "not-recorded", pnlEligibility: "not-recorded" });
  });
  it.each(["0", "0000"])("L1 reproduction: validated raw zero %s ignores a stale USD 500 statement", (amountRaw) => {
    const observed = [{ ...balances[0], amount: 1, amountRaw: "1000000000000000000" },
      { ...balances[1], amount: 0, amountRaw }];
    const [row] = combineNativeEth(observed, 2000, 36, DATE, undefined,
      { "native:1:native": basis(1000), "native:8453:native": basis(500) });
    expect(row).toMatchObject({ valueUsd: 2000, costBasisUsd: 1000, pnlUsd: 1000,
      basisStatus: "operator-recorded", pnlEligibility: "eligible", amountRaw: "1000000000000000000" });
    expect(row.chains).toEqual([{ chainId: 1, chainName: "Ethereum", amount: 1, valueUsd: 2000 },
      { chainId: 8453, chainName: "Base", amount: 0, valueUsd: 0 }]);
    expect(row.basisNote).not.toContain("Base:");
  });
  it("L1 reproduction: a validated zero chain without a statement does not block basis", () => {
    const observed = [{ ...balances[0], amount: 1, amountRaw: "1000000000000000000" },
      { ...balances[1], amount: 0, amountRaw: "0" }];
    const [row] = combineNativeEth(observed, 2000, 36, DATE, undefined, { "native:1:native": basis(1000) });
    expect(row).toMatchObject({ costBasisUsd: 1000, pnlUsd: 1000, pnlEligibility: "eligible" });
    expect(row.chains.map((chain) => chain.chainId)).toEqual([1, 8453]);
  });
  it("L1 ignores stale acquisition evidence on a validated zero chain", () => {
    const observed = [{ ...balances[0], amount: 0, amountRaw: "0" }, balances[1]];
    const [row] = combineNativeEth(observed, 2000, 36, DATE, { "native:1:native": arrival },
      { "native:8453:native": basis(1) });
    expect(row).toMatchObject({ valueUsd: 2, costBasisUsd: 1, pnlUsd: 1, pnlEligibility: "eligible" });
  });
  it.each([undefined, "", "0x0", "unavailable", "1"])("L1 rejects an unvalidated zero quantity %s even with a statement", (amountRaw) => {
    const observed = [balances[0], { ...balances[1], amount: 0, amountRaw }];
    const [row] = combineNativeEth(observed, 2000, 36, DATE, undefined, manual());
    expect(row).toMatchObject({ valueUsd: 2, costBasisUsd: null, pnlUsd: null, pnlEligibility: "not-recorded" });
    expect(row.basisNote).toContain("without validated exact raw zero");
  });
  it("L1 reproduction: an unavailable chain read cannot be treated as a validated zero", () => {
    const observed = [{ ...balances[0], amount: 1, amountRaw: "1000000000000000000" }];
    const [row] = combineNativeEth(observed, 2000, 36, DATE, undefined, { "native:1:native": basis(1000) }, false);
    expect(row).toMatchObject({ valueUsd: 2000, costBasisUsd: null, pnlUsd: null, pnlEligibility: "not-recorded" });
    expect(row.basisNote).toContain("inventory is incomplete");
    expect(row.chains.map((chain) => chain.chainId)).toEqual([1]);
  });
  it("keeps an entirely validated zero inventory in the dust bucket", () => {
    const [row] = combineNativeEth(balances.map((balance) => ({ ...balance, amount: 0, amountRaw: "0" })),
      null, 36, DATE, undefined, manual());
    expect(row).toMatchObject({ amountRaw: "0", valueUsd: 0, costBasisUsd: null, pnlUsd: null, pnlEligibility: "dust" });
    expect(row.chains).toHaveLength(4);
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
  it("L1 joined source outage fails closed even when every responding chain has basis", () => {
    const data = inputs();
    data.walletNative = { data: balances.filter((balance) => balance.chainId !== 8453),
      state: { status: "partial", asOf: DATE, message: "Base native balance unavailable" } };
    const book = buildJoinedPortfolio(data, DATE);
    expect(book.wallet.native[0]).toMatchObject({ valueUsd: 6, costBasisUsd: null, pnlUsd: null, pnlEligibility: "not-recorded" });
    expect(book.wallet.native[0].chains.map((chain) => chain.chainId)).toEqual([1, 42161, 4663]);
    expect(book.sources.walletNative.status).toBe("partial");
    expect(book.totals.pnlCoverage.sourcesComplete).toBe(false);
  });
  it("prices SPL tokens by mint and preserves null value/eligibility for unknown markets", () => {
    const data = inputs(); const mint = "So11111111111111111111111111111111111111112";
    data.solana!.data!.tokens = [{ chainId: "solana", chainName: "Solana", name: "Fixture", symbol: "FIX", contract: mint,
      amount: 2, amountRaw: "2000000000", decimals: 9, priceUsd: 5 }];
    data.manualBasis = { ...data.manualBasis, [`token:solana:${mint}`]: basis(3) };
    expect(buildJoinedPortfolio(data, DATE).wallet.tokens[0]).toMatchObject({ costBasisUsd: 3, pnlUsd: 7, pnlEligibility: "eligible" });
    data.solana!.data!.tokens[0].priceUsd = null;
    expect(buildJoinedPortfolio(data, DATE).wallet.tokens[0]).toMatchObject({ valueUsd: null, costBasisUsd: null, pnlEligibility: "unpriced" });
  });
  it("reads native and exact-case mint keys using SELECT only", async () => {
    const mint = "So11111111111111111111111111111111111111112";
    const keys = ["native:solana:native", `token:solana:${mint}`];
    const queries: string[] = [];
    const result = await readManualBasis(DATE, { hasDb: () => true, getDb: () => ({ query: async (sql) => {
      queries.push(sql); return [...keys, "native:solana:other", `token:solana:So${"1".repeat(36)}`, "token:solana:bad",
        "token:solana:epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v", `token:solana:${"Z".repeat(32)}`].map((holding_key) => ({ holding_key, cost_usd: "4.705788", as_of: "2026-09-13", note: "bridge basis" }));
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
