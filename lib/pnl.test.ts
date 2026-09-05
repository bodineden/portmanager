import { describe, expect, it } from "vitest";
import { buildJoinedPortfolio, RH_ERC20_REGISTRY, type JoinedPortfolioInputs, type LiveResult } from "./live-data";

import * as pnl from "./pnl";

const AS_OF = "2026-09-05T12:00:00.000Z";
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: AS_OF, message: "fixture" } });
const inputs = (): JoinedPortfolioInputs => ({
  t212Summary: live({ currency: "GBP", cashAvailable: 487, totalValue: 647, investmentsCurrentValue: 160 }),
  t212Positions: live([{
    ticker: "TEST_US_EQ", name: "Synthetic test equity", quantity: 2, averagePrice: 95,
    currentPrice: 100, ppl: 8, currency: "USD", pplCurrency: "GBP", valueNative: 200, valueAccount: 160,
  }]),
  nfts: live([]), walletNative: live([]), walletTokens: live([]),
  fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: AS_OF }),
  ethPrice: live(2_400),
});

// Synthetic acquisition evidence, NOT evidence for Bodin's current book.
const tokenHolding = { kind: "token" as const, chainId: 8453, assetId: "0x0000000000000000000000000000000000000001", quantityRaw: "2000000000000000000", decimals: 18, valueUsd: 30 };
const freeEvidence = (): pnl.AcquisitionEvidence => ({
  source: "blockscout-v2" as const, chainId: tokenHolding.chainId, assetId: tokenHolding.assetId,
  decimals: 18, complete: true, hasDisposals: false,
  lots: [{ transactionHash: `0x${"a".repeat(64)}`, acquiredAt: "2026-06-01T12:00:00.000Z",
    quantityRaw: tokenHolding.quantityRaw, operation: "claim" as const, success: true,
    allPaymentLegsObserved: true, acquiredAssetCount: 1, nativeOutflowRaw: "0", nativePrice: null,
    tokenOutflows: [] }],
});

const purchaseEvidence = (): pnl.AcquisitionEvidence => {
  const evidence = freeEvidence();
  evidence.lots[0].operation = "purchase";
  evidence.lots[0].nativeOutflowRaw = "10000000000000000"; // 0.01 ETH, not current ETH price.
  evidence.lots[0].nativePrice = { provider: "defillama-historical", assetId: "native", timestamp: evidence.lots[0].acquiredAt, priceUsd: 2_000 };
  return evidence;
};

describe("on-chain conservative classification", () => {
  it.each(["airdrop", "claim", "mint"] as const)("verifies %s only with all no-payment evidence", (operation) => {
    const evidence = freeEvidence(); evidence.lots[0].operation = operation;
    expect(pnl.deriveOnchainPnl(tokenHolding, 36, evidence).basisStatus).toBe("airdrop-free");
    evidence.lots[0].tokenOutflows.push({ assetId: "payment-contract", amountRaw: "1", decimals: 18, historicalPrice: null });
    expect(pnl.deriveOnchainPnl(tokenHolding, 36, evidence).basisStatus).toBe("not-recorded");
  });

  it("rejects RH Blockscout evidence, malformed histories and one-unit lot mismatches", () => {
    const evidence = freeEvidence(); evidence.chainId = 4663;
    expect(pnl.deriveOnchainPnl({ ...tokenHolding, chainId: 4663 }, 36, evidence).basisStatus).toBe("not-recorded");
    expect(pnl.deriveOnchainPnl(tokenHolding, 36, {} as pnl.AcquisitionEvidence).basisStatus).toBe("not-recorded");
    const mismatch = freeEvidence(); mismatch.lots[0].quantityRaw = "2000000000000000001";
    expect(pnl.deriveOnchainPnl(tokenHolding, 36, mismatch).basisStatus).toBe("not-recorded");
  });

  it("never reads evidence for dust and never rounds a raw payment through Number first", () => {
    const evidence = new Proxy({} as pnl.AcquisitionEvidence, { get: () => { throw new Error("must not derive dust"); } });
    expect(pnl.deriveOnchainPnl({ ...tokenHolding, valueUsd: 0.99 }, 36, evidence).pnlEligibility).toBe("dust");
    const purchase = purchaseEvidence(); purchase.lots[0].nativeOutflowRaw = "123456789012345678";
    expect(pnl.deriveOnchainPnl(tokenHolding, 36, purchase).costBasisUsd).toBe(Number("0.123456789012345678") * 2000);
  });

  it("values a clean purchase with its historical payment-asset price", () => {
    const evidence = purchaseEvidence();
    expect(pnl.deriveOnchainPnl(tokenHolding, 36, evidence)).toMatchObject({
      basisStatus: "onchain-derived", costBasisUsd: 20, costBasisThb: 720, pnlUsd: 10, pnlThb: 360, pnlPct: 50,
    });
    evidence.lots[0].nativePrice = null;
    expect(pnl.deriveOnchainPnl(tokenHolding, 36, evidence).costBasisUsd).toBeNull();
  });

  it("supports an exact ERC-20 payment and CoinGecko acquisition-date quote for NFTs", () => {
    const evidence = purchaseEvidence();
    evidence.source = "opensea-v2";
    evidence.chainId = 4663;
    evidence.assetId = "synthetic-collection";
    evidence.decimals = 0;
    evidence.lots[0].quantityRaw = "2";
    evidence.lots[0].nativeOutflowRaw = "0";
    evidence.lots[0].nativePrice = null;
    evidence.lots[0].tokenOutflows = [{ assetId: "payment-contract", amountRaw: "20000000", decimals: 6,
      historicalPrice: { provider: "coingecko-history", assetId: "payment-contract", timestamp: "2026-06-01T00:00:00Z", priceUsd: 1 } }];
    expect(pnl.deriveOnchainPnl({ kind: "nft", chainId: 4663, assetId: evidence.assetId, quantityRaw: "2", decimals: 0, valueUsd: 30 }, 36, evidence))
      .toMatchObject({ basisStatus: "onchain-derived", costBasisUsd: 20, pnlUsd: 10 });
  });

  it.each(["transfer", "bridge", "exchange-deposit", "wrapper", "unknown"] as const)("never treats %s as free or a purchase", (operation) => {
    const evidence = freeEvidence();
    evidence.lots[0].operation = operation;
    expect(pnl.deriveOnchainPnl(tokenHolding, 36, evidence)).toMatchObject({ basisStatus: "not-recorded", pnlUsd: null });
  });

  it.each(["incomplete", "disposal", "wrong-chain", "wrong-asset", "partial-quantity", "duplicate", "multi-asset", "failed", "bad-units", "stale-price", "wrong-price-asset", "bad-price", "multi-payment"])("rejects %s evidence without taking down other holdings", (issue) => {
    const evidence = purchaseEvidence();
    const lot = evidence.lots[0];
    if (issue === "incomplete") evidence.complete = false;
    if (issue === "disposal") evidence.hasDisposals = true;
    if (issue === "wrong-chain") evidence.chainId = 1;
    if (issue === "wrong-asset") evidence.assetId = "another-asset";
    if (issue === "partial-quantity") lot.quantityRaw = "1";
    if (issue === "duplicate") evidence.lots.push({ ...lot });
    if (issue === "multi-asset") lot.acquiredAssetCount = 2;
    if (issue === "failed") lot.success = false;
    if (issue === "bad-units") lot.nativeOutflowRaw = "1.2";
    if (issue === "stale-price") lot.nativePrice!.timestamp = AS_OF;
    if (issue === "wrong-price-asset") lot.nativePrice!.assetId = "wrong";
    if (issue === "bad-price") lot.nativePrice!.priceUsd = Number.NaN;
    if (issue === "multi-payment") lot.tokenOutflows.push({ assetId: "other", amountRaw: "1", decimals: 0, historicalPrice: null });
    expect(pnl.deriveOnchainPnl(tokenHolding, 36, evidence)).toMatchObject({ basisStatus: "not-recorded", costBasisUsd: null, pnlUsd: null });
  });

  it("requires complete zero-payment claim evidence before recording a verified zero basis", () => {
    expect(pnl.deriveOnchainPnl(tokenHolding, 36, freeEvidence())).toMatchObject({
      basisStatus: "airdrop-free", costBasisUsd: 0, costBasisThb: 0, pnlUsd: 30, pnlThb: 1080,
      pnlPct: null, pnlEligibility: "eligible",
    });
    const incomplete = freeEvidence();
    incomplete.lots[0].allPaymentLegsObserved = false;
    expect(pnl.deriveOnchainPnl(tokenHolding, 36, incomplete).basisStatus).toBe("not-recorded");
    incomplete.lots[0].allPaymentLegsObserved = true;
    incomplete.lots[0].nativeOutflowRaw = "1";
    expect(pnl.deriveOnchainPnl(tokenHolding, 36, incomplete).basisStatus).toBe("not-recorded");
  });

  it("does not infer a free acquisition from a balance, and skips dust/unpriced", () => {
    expect(typeof pnl.deriveOnchainPnl).toBe("function");
    const holding = { kind: "native" as const, chainId: 42161, assetId: "native", quantityRaw: "248396000000000000", decimals: 18, valueUsd: 596.1504 };
    expect(pnl.deriveOnchainPnl(holding, 36)).toMatchObject({ basisStatus: "not-recorded", costBasisUsd: null, pnlUsd: null });
    expect(pnl.deriveOnchainPnl({ ...holding, valueUsd: 0.99 }, 36).pnlEligibility).toBe("dust");
    expect(pnl.deriveOnchainPnl({ ...holding, valueUsd: 1 }, 36).pnlEligibility).toBe("not-recorded");
    expect(pnl.deriveOnchainPnl({ ...holding, valueUsd: null }, 36).pnlEligibility).toBe("unpriced");
  });
});

describe("joined P&L aggregation", () => {
  it("preserves USD when THB FX is missing and does not call an unknown aggregate complete", () => {
    const classes: Record<pnl.PnlClass, pnl.PnlClassInput> = {
      t212: { holdings: [], sourceComplete: true }, nfts: { holdings: [], sourceComplete: true },
      walletNative: { holdings: [], sourceComplete: false },
      walletTokens: { holdings: [{ ...tokenHolding, ...pnl.deriveOnchainPnl(tokenHolding, null, freeEvidence()) }], sourceComplete: true },
    };
    expect(pnl.aggregatePnl(classes, null)).toMatchObject({ costBasisUsd: 0, pnlUsd: 30, costBasisThb: null, pnlThb: null, pnlPct: null,
      pnlCoverage: { eligible: 1, status: "partial", sourcesComplete: false } });
  });

  it("fails one invalid evidence independently and joins free NFT collection lots without doubling cost", () => {
    const data = inputs();
    data.nfts = live([{ collection: "synthetic-nft", collectionName: "Synthetic fixture", tokenCount: 2, floorEth: 0.01 }]);
    const evidence = freeEvidence();
    evidence.source = "opensea-v2"; evidence.chainId = 4663; evidence.assetId = "synthetic-nft"; evidence.decimals = 0;
    evidence.lots[0].quantityRaw = "2";
    data.basisEvidence = { "nft:4663:synthetic-nft": evidence };
    expect(buildJoinedPortfolio(data, AS_OF).nfts[0]).toMatchObject({ basisStatus: "airdrop-free", costBasisUsd: 0, pnlUsd: 48 });
    evidence.lots[0].acquiredAt = "2027-01-01T00:00:00Z";
    const portfolio = buildJoinedPortfolio(data, AS_OF);
    expect(portfolio.nfts[0].basisStatus).toBe("not-recorded");
    expect(portfolio.t212.investments[0].pnlUsd).toBe(10);
    expect(portfolio.nfts[0].valueUsd).toBe(48);
  });

  it("can join a proven native purchase only with exact RPC raw balance, not float reconstruction", () => {
    const data = inputs();
    const evidence = purchaseEvidence();
    evidence.assetId = "native";
    evidence.lots[0].quantityRaw = "12500000000000000";
    evidence.lots[0].nativeOutflowRaw = "0";
    evidence.lots[0].tokenOutflows = [{ assetId: "payment-contract", amountRaw: "20000000", decimals: 6,
      historicalPrice: { provider: "defillama-historical", assetId: "payment-contract", timestamp: evidence.lots[0].acquiredAt, priceUsd: 1 } }];
    data.walletNative = live([{ chainId: 8453, chainName: "Base", symbol: "ETH", amount: 0.0125, amountRaw: "12500000000000000" }]);
    data.basisEvidence = { "native:8453:native": evidence };
    expect(buildJoinedPortfolio(data, AS_OF).wallet.native[0]).toMatchObject({ basisStatus: "onchain-derived", costBasisUsd: 20, pnlUsd: 10 });
    delete data.walletNative.data![0].amountRaw;
    expect(buildJoinedPortfolio(data, AS_OF).wallet.native[0].basisStatus).toBe("not-recorded");
  });

  it("joins evidence additively, excludes cash and unknown/dust/unpriced, and satisfies the arithmetic identity", () => {
    const data = inputs();
    data.walletTokens = live([
      { chainId: 8453, chainName: "Base", symbol: "SYNTHETIC", name: "Synthetic fixture", contract: tokenHolding.assetId, amountRaw: tokenHolding.quantityRaw, amount: 2, decimals: 18, priceUsd: 15 },
      { chainId: 4663, chainName: "Robinhood Chain", symbol: "USDG", name: "Global Dollar", amountRaw: "1475000", amount: 1.475, decimals: 6, priceUsd: 1 },
      { chainId: 4663, chainName: "Robinhood Chain", symbol: "DUST", name: "Synthetic dust", amountRaw: "1", amount: 1, decimals: 0, priceUsd: 0.01 },
      { chainId: 4663, chainName: "Robinhood Chain", symbol: "UNKNOWN", name: "Synthetic unpriced", amountRaw: "1", amount: 1, decimals: 0, priceUsd: null },
    ]);
    data.basisEvidence = { [`token:8453:${tokenHolding.assetId}`]: purchaseEvidence() };
    const portfolio = buildJoinedPortfolio(data, AS_OF);
    expect(portfolio.wallet.tokens[0].basisStatus).toBe("onchain-derived");
    expect(portfolio.totals).toMatchObject({
      costBasisUsd: 210, costBasisThb: 7_560, pnlUsd: 20, pnlThb: 720, pnlPct: 20 / 210 * 100,
      pnlCoverage: { totalHoldings: 5, eligible: 2, notRecorded: 1, dust: 1, unpriced: 1, unreconciled: 0, status: "partial" },
      pnlByClass: { t212: { costBasisUsd: 190, pnlUsd: 10 }, walletTokens: { costBasisUsd: 20, pnlUsd: 10 } },
    });
    const eligible = [...portfolio.t212.investments, ...portfolio.wallet.tokens].filter((row) => row.pnlEligibility === "eligible");
    expect(portfolio.totals.pnlUsd).toBe(eligible.reduce((sum, row) => sum + row.valueUsd! - row.costBasisUsd!, 0));
    expect(portfolio.t212.cashAvailable).toBe(487);
  });

  it("never invents zero P&L for wholly unknown or unavailable holdings", () => {
    const data = inputs();
    data.t212Positions = live([]);
    data.walletNative = live([{ chainId: 42161, chainName: "Arbitrum One", symbol: "ETH", amount: 0.248396 }]);
    const portfolio = buildJoinedPortfolio(data, AS_OF);
    expect(portfolio.totals).toMatchObject({ costBasisUsd: null, pnlUsd: null, pnlPct: null,
      pnlCoverage: { eligible: 0, notRecorded: 1, status: "partial" } });
    data.walletNative = { data: null, state: { status: "unavailable", asOf: null, message: "offline" } };
    expect(buildJoinedPortfolio(data, AS_OF).totals.pnlUsd).toBeNull();
  });

  it("distinguishes truly empty live holdings from source failure", () => {
    const data = inputs();
    data.t212Positions = live([]);
    expect(buildJoinedPortfolio(data, AS_OF).totals).toMatchObject({ costBasisUsd: 0, pnlUsd: 0, pnlPct: null, pnlCoverage: { status: "complete" } });
    data.t212Positions.state.status = "unavailable";
    expect(buildJoinedPortfolio(data, AS_OF).totals).toMatchObject({ costBasisUsd: null, pnlUsd: null, pnlCoverage: { status: "partial" } });
  });
});

describe("required current-book fixture QA", () => {
  it("prints all ten requested decisions without inventing any acquisition or token quantity", () => {
    const data = inputs();
    data.t212Summary = live({ currency: "GBP", cashAvailable: 487, totalValue: 487, investmentsCurrentValue: 0 });
    data.t212Positions = live([]);
    // Operator's rounded current quantities, NOT fresh API observations.
    data.walletNative = live([
      { chainId: 42161, chainName: "Arbitrum One", symbol: "ETH", amount: 0.248396 },
      { chainId: 1, chainName: "Ethereum", symbol: "ETH", amount: 0.000781 },
      { chainId: 8453, chainName: "Base", symbol: "ETH", amount: 0.000099 },
      { chainId: 4663, chainName: "Robinhood Chain", symbol: "ETH", amount: 0.000526 },
    ]);
    data.walletTokens = live([{ chainId: 4663, chainName: "Robinhood Chain", symbol: "USDG", name: "Global Dollar",
      contract: RH_ERC20_REGISTRY.find((row) => row.symbol === "USDG")!.contract,
      amountRaw: "1475000", decimals: 6, amount: 1.475, priceUsd: 1 }]);
    // Reuse the existing suite's floor fixtures (about 0.1831 ETH combined).
    data.nfts = live([
      { collection: "stackersv2", collectionName: "Stackers", tokenCount: 2, floorEth: 0.0910577 },
      { collection: "g00fyz", collectionName: "G00fyz", tokenCount: 2, floorEth: 0.0005 },
    ]);
    const book = buildJoinedPortfolio(data, AS_OF);
    const rows: string[][] = [["T212 positions: 0", "N/A (no holding)", "no-op", "GBP 487 cash is value only; no P&L"]];
    for (const holding of book.wallet.native) rows.push([`${holding.chainName} ETH ${holding.amount}`, holding.basisStatus, holding.pnlEligibility, holding.basisNote]);
    const usdg = book.wallet.tokens[0];
    rows.push(["USDG 1.475", usdg.basisStatus, usdg.pnlEligibility, usdg.basisNote]);
    for (const symbol of ["STACK", "GME"]) {
      const entry = RH_ERC20_REGISTRY.find((row) => row.symbol === symbol)!;
      // Operator provides a sub-cent VALUE BUCKET, not exact quantities/prices.
      // Probe representative values only; none are presented as observed holdings.
      for (const valueUsd of [0, 0.000001, 0.005, 0.009999]) {
        const result = pnl.deriveOnchainPnl({ kind: "token", chainId: 4663, assetId: entry.contract, quantityRaw: "", decimals: 18, valueUsd }, 36);
        expect(result).toMatchObject({ basisStatus: "not-recorded", pnlEligibility: "dust", costBasisUsd: null, pnlUsd: null });
      }
      rows.push([`${symbol} token (sub-cent)`, "not-recorded", "dust", "Operator reports sub-cent value; no basis derivation; exact quantity not supplied"]);
    }
    for (const holding of book.nfts) rows.push([`${holding.tokenCount}× ${holding.collectionName} NFT`, holding.basisStatus, holding.pnlEligibility, holding.basisNote]);
    expect(rows).toHaveLength(10);
    expect(book.totals.costBasisUsd).toBeNull();
    expect(book.totals.pnlUsd).toBeNull();
    expect(book.totals.pnlPct).toBeNull();
    expect(book.totals.pnlCoverage.eligible).toBe(0);
    process.stdout.write(`\nCURRENT_BOOK_TABLE_BEGIN\nFixture ETH/USD=2400; USD/THB=36, GBP/THB=45; not live quotes.\n| Holding | basisStatus | P&L bucket | Reason |\n|---|---|---|---|\n${rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}\nCurrent-book P&L: costBasisUsd=null; pnlUsd=null; pnlPct=null; eligible=0.\nCURRENT_BOOK_TABLE_END\n`);
  });
});

describe("T212 P&L assembly", () => {
  it("keeps API P&L but excludes a non-reconciling quote from aggregate eligibility", () => {
    const data = inputs();
    data.t212Positions.data![0].ppl = 12;
    expect(buildJoinedPortfolio(data, AS_OF).t212.investments[0]).toMatchObject({
      basisStatus: "t212-live", costBasisUsd: 190, pnlUsd: 15, pnlEligibility: "unreconciled",
    });
  });

  it("falls back only when ppl is null and preserves an explicit zero", () => {
    const data = inputs();
    data.t212Positions.data![0].ppl = null;
    expect(buildJoinedPortfolio(data, AS_OF).t212.investments[0].pnlUsd).toBe(10);
    data.t212Positions.data![0].ppl = 0;
    expect(buildJoinedPortfolio(data, AS_OF).t212.investments[0].pnlUsd).toBe(0);
    data.t212Positions.data![0].pplCurrency = null;
    expect(buildJoinedPortfolio(data, AS_OF).t212.investments[0]).toMatchObject({ basisStatus: "not-recorded", pnlUsd: null });
  });

  it("never converts absent average cost or an unknown FX cross to zero", () => {
    const data = inputs();
    data.t212Positions.data![0].averagePrice = null;
    expect(buildJoinedPortfolio(data, AS_OF).t212.investments[0].costBasisUsd).toBeNull();
    data.t212Positions.data![0].averagePrice = 95;
    data.t212Positions.data![0].currency = "JPY";
    expect(buildJoinedPortfolio(data, AS_OF).t212.investments[0].basisStatus).toBe("not-recorded");
  });

  it("uses average cost and account-currency API P&L without changing legacy value", () => {
    const portfolio = buildJoinedPortfolio(inputs(), AS_OF);
    expect(portfolio.t212.investments[0]).toMatchObject({
      valueUsd: 200, valueThb: 7_200,
      costBasisUsd: 190, costBasisThb: 6_840, basisStatus: "t212-live",
      pnlUsd: 10, pnlThb: 360, pnlPct: 10 / 190 * 100, pnlEligibility: "eligible",
    });
    expect(portfolio.totals.t212Thb).toBe(29_115);
  });
});
