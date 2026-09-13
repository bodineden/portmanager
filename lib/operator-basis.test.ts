import { describe, expect, it } from "vitest";
import { deriveOnchainPnl, type OnchainHolding } from "./pnl";
import { basisChip, coverageLabel } from "./pnl-view";
import { buildJoinedPortfolio, type JoinedPortfolioInputs, type LiveResult } from "./live-data";
import type { AcquisitionEvidence } from "./pnl";
import { readManualBasis } from "./basis-db";
import { dustBook } from "../scripts/__fixtures__/dust-book";

const TOKEN = `0x${"a".repeat(40)}`;
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: AS_OF, message: "fixture" } });
const inputs = (): JoinedPortfolioInputs => ({
  t212Summary: live({ currency: "USD", cashAvailable: 0, totalValue: 0, investmentsCurrentValue: 0 }),
  t212Positions: live([]),
  nfts: live([{ collection: "desk-nft", collectionName: "Desk NFT", tokenCount: 1, floorEth: 1 }]),
  walletNative: live([{ chainId: 1, chainName: "Ethereum", symbol: "ETH", amount: 1, amountRaw: "1000000000000000000" }]),
  walletTokens: live([{ chainId: 1, chainName: "Ethereum", contract: `0x${"A".repeat(40)}`, symbol: "DESK", name: "Desk token", amount: 1, amountRaw: "1", decimals: 0, priceUsd: 100 }]),
  fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: AS_OF }), ethPrice: live(100),
  manualHoldings: live([]), capitalEvents: live([]),
});

const chain: AcquisitionEvidence = { source: "opensea-v2", chainId: 4663, assetId: "desk-nft", decimals: 0,
  complete: true, hasDisposals: false, lots: [{ transactionHash: `0x${"1".repeat(64)}`, acquiredAt: "2026-09-04T12:00:00Z",
    quantityRaw: "1", operation: "purchase", success: true, allPaymentLegsObserved: true, acquiredAssetCount: 1,
    nativeOutflowRaw: "10000000000000000", tokenOutflows: [],
    nativePrice: { provider: "defillama-historical", assetId: "native", timestamp: "2026-09-04T12:00:00Z", priceUsd: 2000 } }] };


const AS_OF = "2026-09-05T12:00:00.000Z";
const operator = { costUsd: 80, asOf: "2026-09-01", note: "desk execution: $80 paid 2026-09-01" };
const holding: OnchainHolding = { kind: "native", chainId: 1, assetId: "native", quantityRaw: "1000000000000000000", decimals: 18, valueUsd: 100, asOf: AS_OF };

describe("operator-recorded basis", () => {
  it.each(["malformed", "missing"])("keeps rows not-recorded after %s table data", async (scenario) => {
    const data = inputs();
    data.manualBasis = await readManualBasis(AS_OF, { hasDb: () => true, log: () => {}, getDb: () => ({ query: async () => {
      if (scenario === "missing") throw new Error('relation "manual_basis" does not exist');
      return [{ holding_key: "nft:4663:desk-nft", cost_usd: "80", as_of: "2026-09-01", note: "" }];
    } }) });
    const book = buildJoinedPortfolio(data, AS_OF);
    for (const row of [...book.nfts, ...book.wallet.native, ...book.wallet.tokens]) {
      expect(row).toMatchObject({ costBasisUsd: null, pnlUsd: null, pnlPct: null, basisStatus: "not-recorded", pnlEligibility: "not-recorded" });
    }
    expect(book.totals.pnlCoverage).toMatchObject({ totalHoldings: 3, eligible: 0, notRecorded: 3 });
    expect(coverageLabel(book.totals.pnlCoverage)).toBe("No recorded cost basis yet — P&L unavailable");
  });
  it("pins the operator-only browser positive and no-basis fail-closed books", () => {
    const positive = dustBook("operator");
    const absent = dustBook("operator-missing");
    expect(positive.nfts[0]).toMatchObject({ valueUsd: 100, costBasisUsd: 80, pnlUsd: 20, pnlPct: 25,
      basisStatus: "operator-recorded", pnlEligibility: "eligible" });
    for (const row of [...positive.wallet.native, ...positive.wallet.tokens, ...absent.nfts, ...absent.wallet.native, ...absent.wallet.tokens]) {
      expect(row).toMatchObject({ costBasisUsd: null, pnlUsd: null, basisStatus: "not-recorded", pnlEligibility: "not-recorded" });
    }
    expect(positive.totals).toMatchObject({ grandTotalUsd: 300, costBasisUsd: 80, pnlUsd: 20,
      pnlCoverage: { totalHoldings: 3, eligible: 1, notRecorded: 2, dust: 0, unpriced: 0, unreconciled: 0, status: "partial", sourcesComplete: true } });
    expect(absent.totals).toMatchObject({ grandTotalUsd: 300, costBasisUsd: null, pnlUsd: null,
      pnlCoverage: { totalHoldings: 3, eligible: 0, notRecorded: 3, dust: 0, unpriced: 0, unreconciled: 0, status: "partial", sourcesComplete: true } });
    expect(Object.keys(positive.sources)).toEqual(Object.keys(absent.sources));
    expect(Object.keys(positive.sources)).toHaveLength(9);
  });
  it("joins all holding kinds by exact keys, retaining chain rows while older desk basis wins", () => {
    const data = inputs();
    data.basisEvidence = { "nft:4663:desk-nft": structuredClone(chain) };
    data.manualBasis = Object.fromEntries(["nft:4663:desk-nft", "native:1:native", `token:1:${TOKEN}`].map((key) => [key, { ...operator }]));
    const before = structuredClone(data);
    const book = buildJoinedPortfolio(data, AS_OF);
    for (const row of [...book.nfts, ...book.wallet.native, ...book.wallet.tokens]) {
      expect(row).toMatchObject({ costBasisUsd: 80, pnlUsd: 20, pnlPct: 25, basisStatus: "operator-recorded", pnlEligibility: "eligible" });
    }
    expect(data).toEqual(before);
    expect(data.basisEvidence["nft:4663:desk-nft"]).toEqual(chain);
    expect(data.manualBasis["nft:4663:desk-nft"]).toEqual(operator);
    const chainOnly = buildJoinedPortfolio({ ...data, manualBasis: undefined }, AS_OF);
    expect(chainOnly.nfts[0]).toMatchObject({ basisStatus: "onchain-derived", costBasisUsd: 20, pnlUsd: 80 });
    expect(book.totals.grandTotalUsd).toBe(chainOnly.totals.grandTotalUsd);
    expect(book.totals).toMatchObject({ costBasisUsd: 240, pnlUsd: 60, pnlPct: 25,
      pnlCoverage: { totalHoldings: 3, eligible: 3, notRecorded: 0, dust: 0, unpriced: 0, unreconciled: 0, status: "complete", sourcesComplete: true } });
    const c = book.totals.pnlCoverage;
    expect(c.eligible + c.notRecorded + c.dust + c.unpriced + c.unreconciled).toBe(c.totalHoldings);
    expect(coverageLabel(c)).toBe("Complete P&L (3 of 3 holdings have recorded basis)");
    expect(Object.keys(book.sources)).toEqual(Object.keys(chainOnly.sources));
    expect(Object.keys(book.sources)).toHaveLength(9);
  });
  it.each(["native", "token", "nft"] as const)("preserves zero-basis and loss arithmetic for %s", (kind) => {
    expect(deriveOnchainPnl({ ...holding, kind }, 36, undefined, { ...operator, costUsd: 0 }))
      .toMatchObject({ costBasisUsd: 0, pnlUsd: 100, pnlPct: null, basisStatus: "operator-recorded", pnlEligibility: "eligible" });
    expect(deriveOnchainPnl({ ...holding, kind }, null, undefined, { ...operator, costUsd: 125 }))
      .toMatchObject({ costBasisUsd: 125, pnlUsd: -25, pnlPct: -20, costBasisThb: null, pnlThb: null, pnlEligibility: "eligible" });
  });
  it.each([[0.999, "dust"], [0, "dust"], [null, "unpriced"], [Number.NaN, "unpriced"], [-1, "unpriced"]] as const)("gates value %s before inspecting either channel", (valueUsd, pnlEligibility) => {
    const unreadable = new Proxy(operator, { get() { throw new Error("must not inspect excluded basis"); } });
    expect(deriveOnchainPnl({ ...holding, valueUsd }, 36, undefined, unreadable))
      .toMatchObject({ costBasisUsd: null, pnlUsd: null, basisStatus: "not-recorded", pnlEligibility });
  });
  it.each([
    { costUsd: -1 }, { costUsd: Number.NaN }, { costUsd: Number.POSITIVE_INFINITY },
    { costUsd: "80" }, { costUsd: null }, { note: "" }, { note: "   " }, { note: null },
    { asOf: "invalid" }, { asOf: "2026-02-30" }, { asOf: "2026-9-01" }, { asOf: null },
  ])("rejects malformed injected desk row %j", (invalid) => {
    expect(deriveOnchainPnl(holding, 36, undefined, { ...operator, ...invalid } as typeof operator))
      .toMatchObject({ costBasisUsd: null, pnlUsd: null, basisStatus: "not-recorded", pnlEligibility: "not-recorded" });
  });
  it("applies desk basis without chain evidence and preserves exact arithmetic/provenance", () => {
    expect(deriveOnchainPnl(holding, 36, undefined, operator)).toEqual({
      costBasisUsd: 80, costBasisThb: 2880, pnlUsd: 20, pnlThb: 720, pnlPct: 25,
      basisStatus: "operator-recorded", pnlEligibility: "eligible",
      basisNote: `operator-recorded: ${operator.note}`,
    });
    expect(basisChip("operator-recorded")).toEqual({ label: "operator-recorded",
      description: "Basis recorded by the desk at acquisition; not chain-derived" });
  });
});
