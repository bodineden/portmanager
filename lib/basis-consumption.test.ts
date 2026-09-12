import { describe, expect, it } from "vitest";
import { deriveOnchainPnl, type AcquisitionEvidence, type OnchainHolding } from "./pnl";
import { basisChip, coverageLabel } from "./pnl-view";
import { dustBook } from "../scripts/__fixtures__/dust-book";
import { deriveMascotState } from "./mascot";

const AS_OF = "2026-09-05T12:00:00.000Z";
const ACQUIRED = "2026-09-01T12:00:00.000Z";
const native: OnchainHolding = { kind: "native", chainId: 1, assetId: "native", decimals: 18,
  asOf: AS_OF, quantityRaw: "1500000000000000000", valueUsd: 4500 };
function arrivals(): AcquisitionEvidence {
  return { source: "rpc", chainId: 1, assetId: "native", decimals: 18, complete: true, hasDisposals: false,
    lots: ["1000000000000000000", "500000000000000000"].map((quantityRaw, index) => ({
      transactionHash: `0x${String(index + 1).repeat(64)}`, acquiredAt: ACQUIRED, quantityRaw,
      operation: "funding-arrival", success: true, allPaymentLegsObserved: true, acquiredAssetCount: 1,
      nativeOutflowRaw: "0", tokenOutflows: [],
      nativePrice: { provider: "defillama-historical", assetId: "native", timestamp: ACQUIRED, priceUsd: index === 0 ? 2000 : 2400 },
    })) };
}

const nft: OnchainHolding = { kind: "nft", chainId: 4663, assetId: "batch-collection", decimals: 0,
  asOf: AS_OF, quantityRaw: "2", valueUsd: 60 };
function batch(): AcquisitionEvidence {
  return { ...arrivals(), source: "opensea-v2", chainId: 4663, assetId: nft.assetId, decimals: 0,
    lots: [{ ...arrivals().lots[0], operation: "purchase", quantityRaw: "2", acquiredAssetCount: 2,
      acquiredAssetIds: [nft.assetId, nft.assetId], nativeOutflowRaw: "20000000000000000" }] };
}

describe("same-asset batch acquisitions", () => {
  it("consumes the pinned collector batch shape without requiring new fields", () => {
    const evidence = batch();
    delete evidence.lots[0].acquiredAssetIds;
    expect(deriveOnchainPnl(nft, 36, evidence)).toMatchObject({ costBasisUsd: 40, pnlUsd: 20,
      basisStatus: "onchain-derived", pnlEligibility: "eligible" });
  });
  it("preserves the full paid USD exactly when per-unit thirds have floating-point residue", () => {
    const evidence = batch();
    Object.assign(evidence.lots[0], { quantityRaw: "3", acquiredAssetCount: 3, nativeOutflowRaw: "1000000000000000000",
      acquiredAssetIds: [nft.assetId, nft.assetId, nft.assetId] });
    evidence.lots[0].nativePrice!.priceUsd = 123.45;
    expect(deriveOnchainPnl({ ...nft, quantityRaw: "3" }, 36, evidence).costBasisUsd).toBe(123.45);
  });
  it("splits the full observed payment across two units without halving the collection basis", () => {
    const result = deriveOnchainPnl(nft, 36, batch());
    expect(result).toMatchObject({ costBasisUsd: 40, pnlUsd: 20, basisStatus: "onchain-derived", pnlEligibility: "eligible" });
    const perUnitBasis = result.costBasisUsd! / 2;
    expect(perUnitBasis).toBe(20);
    expect(perUnitBasis + perUnitBasis).toBe(0.02 * 2000);
  });
});

describe("basis evidence fail-closed gates", () => {
  it.each(["missing-price", "stale-price", "future", "bad-date", "bad-hash", "failed", "partial-payment", "incomplete", "disposals", "over-balance", "under-balance", "duplicate", "native-outflow", "token-outflow", "multi-unit", "wrong-decimals", "wrong-asset", "unsupported-chain"])("rejects funding arrival %s", (issue) => {
    const evidence = arrivals();
    const holding = { ...native };
    const lot = evidence.lots[0];
    if (issue === "missing-price") lot.nativePrice = null;
    if (issue === "stale-price") lot.nativePrice!.timestamp = AS_OF;
    if (issue === "future") lot.acquiredAt = "2027-01-01T00:00:00Z";
    if (issue === "bad-date") lot.acquiredAt = "not-a-date";
    if (issue === "bad-hash") lot.transactionHash = "0x1234";
    if (issue === "failed") lot.success = false;
    if (issue === "partial-payment") lot.allPaymentLegsObserved = false;
    if (issue === "incomplete") evidence.complete = false;
    if (issue === "disposals") evidence.hasDisposals = true;
    if (issue === "over-balance") holding.quantityRaw = "1499999999999999999";
    if (issue === "under-balance") holding.quantityRaw = "1500000000000000001";
    if (issue === "duplicate") evidence.lots[1].transactionHash = lot.transactionHash;
    if (issue === "native-outflow") lot.nativeOutflowRaw = "1";
    if (issue === "token-outflow") lot.tokenOutflows = [{ assetId: "usdc", amountRaw: "1", decimals: 6, historicalPrice: null }];
    if (issue === "multi-unit") { lot.acquiredAssetCount = 2; lot.acquiredAssetIds = ["native", "native"]; }
    if (issue === "wrong-decimals") holding.decimals = evidence.decimals = 6;
    if (issue === "wrong-asset") holding.assetId = evidence.assetId = "wrapped-eth";
    if (issue === "unsupported-chain") holding.chainId = evidence.chainId = 56;
    expect(deriveOnchainPnl(holding, 36, evidence)).toMatchObject({ costBasisUsd: null, pnlUsd: null,
      basisStatus: "not-recorded", pnlEligibility: "not-recorded" });
  });
  it.each(["token", "nft"] as const)("does not apply the funding rule to %s", (kind) => {
    expect(deriveOnchainPnl({ ...native, kind }, 36, arrivals()).basisStatus).toBe("not-recorded");
  });
  it("keeps the arrival label when funding and clean purchases coexist", () => {
    const evidence = arrivals();
    evidence.lots[1].operation = "purchase";
    evidence.lots[1].tokenOutflows = [{ assetId: "usdc", amountRaw: "1000000000", decimals: 6,
      historicalPrice: { provider: "defillama-historical", assetId: "usdc", timestamp: ACQUIRED, priceUsd: 1 } }];
    expect(deriveOnchainPnl(native, 36, evidence)).toMatchObject({ costBasisUsd: 3000, pnlUsd: 1500, basisStatus: "arrival-priced" });
  });
  it.each(["mixed-asset", "short-unit-proof", "wrong-quantity", "partial-payment", "over-balance", "fractional-count"])("rejects batch %s", (issue) => {
    const evidence = batch();
    const holding = { ...nft };
    const lot = evidence.lots[0];
    if (issue === "mixed-asset") lot.acquiredAssetIds![1] = "other-collection";
    if (issue === "short-unit-proof") lot.acquiredAssetIds!.pop();
    if (issue === "wrong-quantity") lot.quantityRaw = holding.quantityRaw = "3";
    if (issue === "partial-payment") lot.allPaymentLegsObserved = false;
    if (issue === "over-balance") holding.quantityRaw = "1";
    if (issue === "fractional-count") lot.acquiredAssetCount = 1.5;
    expect(deriveOnchainPnl(holding, 36, evidence)).toMatchObject({ costBasisUsd: null, pnlUsd: null,
      basisStatus: "not-recorded", pnlEligibility: "not-recorded" });
  });
  it("preserves verified no-payment batch mint/claim/airdrop and zero-basis percentage", () => {
    for (const operation of ["mint", "claim", "airdrop"] as const) {
      const evidence = batch();
      Object.assign(evidence.lots[0], { operation, nativeOutflowRaw: "0", nativePrice: null });
      expect(deriveOnchainPnl(nft, 36, evidence)).toMatchObject({ costBasisUsd: 0, pnlUsd: 60, pnlPct: null, basisStatus: "airdrop-free" });
    }
  });
});

describe("joined basis evidence browser controls", () => {
  it("puts arrivals and batch NFTs into recorded P&L but leaves a no-evidence token excluded", () => {
    const book = dustBook("basis");
    expect(book.wallet.native[0]).toMatchObject({ costBasisUsd: 1100, pnlUsd: 400, basisStatus: "arrival-priced", pnlEligibility: "eligible" });
    expect(book.nfts[0]).toMatchObject({ tokenCount: 2, costBasisUsd: 40, pnlUsd: 20, basisStatus: "onchain-derived", pnlEligibility: "eligible" });
    expect(book.wallet.tokens[0]).toMatchObject({ costBasisUsd: null, pnlUsd: null, basisStatus: "not-recorded", pnlEligibility: "not-recorded" });
    expect(book.totals).toMatchObject({ costBasisUsd: 1140, pnlUsd: 420,
      pnlCoverage: { totalHoldings: 3, eligible: 2, notRecorded: 1, unreconciled: 0, dust: 0, unpriced: 0, status: "partial", sourcesComplete: true } });
    expect(coverageLabel(book.totals.pnlCoverage)).toBe("Partial P&L (2 of 3 holdings have recorded basis)");
    expect(deriveMascotState(book).mood).toBe("thinking");
    expect(Object.keys(book.sources)).toHaveLength(9);
  });
  it("fails closed without evidence, preserving full book values and the coverage identity", () => {
    const withEvidence = dustBook("basis");
    const book = dustBook("basis-missing");
    for (const row of [...book.nfts, ...book.wallet.native, ...book.wallet.tokens]) {
      expect(row).toMatchObject({ costBasisUsd: null, pnlUsd: null, basisStatus: "not-recorded", pnlEligibility: "not-recorded" });
    }
    expect(book.totals.grandTotalUsd).toBe(withEvidence.totals.grandTotalUsd);
    expect(book.totals).toMatchObject({ costBasisUsd: null, pnlUsd: null,
      pnlCoverage: { totalHoldings: 3, eligible: 0, notRecorded: 3, unreconciled: 0, dust: 0, unpriced: 0, status: "partial", sourcesComplete: true } });
    expect(coverageLabel(book.totals.pnlCoverage)).toBe("No recorded cost basis yet — P&L unavailable");
    for (const portfolio of [withEvidence, book]) {
      const c = portfolio.totals.pnlCoverage;
      expect(c.eligible + c.notRecorded + c.dust + c.unpriced + c.unreconciled).toBe(c.totalHoldings);
    }
  });
});

describe("native ETH funding arrivals", () => {
  it("sums arrivals at historical ETH/USD, distinguishes the owner rule from purchases", () => {
    expect(deriveOnchainPnl(native, 36, arrivals())).toMatchObject({ costBasisUsd: 3200, pnlUsd: 1300,
      costBasisThb: 115200, pnlThb: 46800, basisStatus: "arrival-priced", pnlEligibility: "eligible" });
    expect(basisChip("arrival-priced")).toEqual({ label: "arrival-priced",
      description: "Funding arrival priced at its arrival-date ETH/USD under the owner rule" });
  });
});
