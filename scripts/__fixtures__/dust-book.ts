import { buildJoinedPortfolio, normalizeT212Positions, type JoinedPortfolioInputs, type LiveResult, type NormalizedT212Position } from "../../lib/live-data";
import browserFixture from "./pnl-browser.json";
import type { AcquisitionEvidence } from "../../lib/pnl";

const AS_OF = "2026-09-05T12:00:00.000Z";
const ACQUIRED = "2026-09-01T12:00:00.000Z";
const TOKEN = "0x0000000000000000000000000000000000000001";
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: AS_OF, message: "Synthetic browser inventory." } });
const unavailable = <T>(): LiveResult<T> => ({ data: null, state: { status: "unavailable", asOf: null, message: "Synthetic provider request failed." } });

function position(ticker: string, value: number | null): NormalizedT212Position {
  return { ticker, name: ticker, quantity: 1, averagePrice: 0.5, currentPrice: value,
    ppl: value === null ? null : value - 0.5, currency: "USD", pplCurrency: "USD", valueNative: value, costAccount: null, valueAccount: value };
}

function evidence(chainId: number, assetId: string, quantityRaw: string, decimals: number, native = false): AcquisitionEvidence {
  return { source: "rpc", chainId, assetId, decimals, complete: true, hasDisposals: false, lots: [{
    transactionHash: `0x${"1".repeat(64)}`, acquiredAt: ACQUIRED, quantityRaw,
    operation: native ? "purchase" : "airdrop", success: true, allPaymentLegsObserved: true, acquiredAssetCount: 1,
    nativeOutflowRaw: "0", nativePrice: null,
    tokenOutflows: native ? [{ assetId: "usdc", amountRaw: "500000", decimals: 6,
      historicalPrice: { provider: "defillama-historical", assetId: "usdc", timestamp: ACQUIRED, priceUsd: 1 } }] : [],
  }] };
}

/** Feed real joined assembly independent input values, including raw .999 values that round to $1.00. */
export function dustBook(scenario: string) {
  const inputs: JoinedPortfolioInputs = {
    t212Summary: live({ currency: "USD", totalValue: 1.999, cashAvailable: 0, investmentsCurrentValue: 1.999 }),
    t212Positions: live([position("SECURITY-ONE", 1), position("SECURITY-SMALL", 0.999), position("SECURITY-UNKNOWN", null)]),
    nfts: live([
      { collection: "collection-one", collectionName: "COLLECTION-ONE", tokenCount: 1, floorEth: 0.001 },
      { collection: "collection-small", collectionName: "COLLECTION-SMALL", tokenCount: 1, floorEth: 0.000999 },
      { collection: "collection-unknown", collectionName: "COLLECTION-UNKNOWN", tokenCount: 1, floorEth: null },
    ]),
    walletNative: live([
      { chainId: 1, chainName: "Ethereum", symbol: "NATIVE-ONE", amount: 0.001, amountRaw: "1000000000000000" },
      { chainId: 8453, chainName: "Base", symbol: "NATIVE-SMALL", amount: 0.000999, amountRaw: "999000000000000" },
    ]),
    walletTokens: live([
      { chainId: 1, chainName: "Ethereum", contract: TOKEN, symbol: "TOKEN-ONE", name: "One token", amount: 1, amountRaw: "1000000000000000000", decimals: 18, priceUsd: 1 },
      { chainId: 1, chainName: "Ethereum", contract: "0x0000000000000000000000000000000000000002", symbol: "TOKEN-SMALL", name: "Small token", amount: 1, amountRaw: "1000000000000000000", decimals: 18, priceUsd: 0.999 },
      { chainId: 1, chainName: "Ethereum", contract: "0x0000000000000000000000000000000000000003", symbol: "TOKEN-UNKNOWN", name: "Unknown quote token", amount: 1, amountRaw: "1000000000000000000", decimals: 18, priceUsd: null },
    ]),
    fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: AS_OF }), ethPrice: live(1000),
    manualHoldings: live([
      { id: "quarter", label: "Quarter cash pot", kind: "cash", currency: "USD", amount: 0.25, recordedAt: AS_OF, createdAt: AS_OF },
      { id: "zero", label: "Zero cash pot", kind: "cash", currency: "USD", amount: 0, recordedAt: AS_OF, createdAt: AS_OF },
    ]),
    capitalEvents: live([{ occurredAt: ACQUIRED, kind: "contribution", amountThb: 153 }]),
    basisEvidence: {
      "nft:4663:collection-one": evidence(4663, "collection-one", "1", 0),
      "native:1:native": evidence(1, "native", "1000000000000000", 18, true),
      [`token:1:${TOKEN}`]: evidence(1, TOKEN, "1000000000000000000", 18),
    },
  };
  if (scenario === "unreconciled") {
    inputs.t212Summary = live({ currency: "USD", totalValue: 100, cashAvailable: 0, investmentsCurrentValue: 100 });
    inputs.t212Positions = normalizeT212Positions(browserFixture.unreconciledT212Positions, "USD", AS_OF);
    inputs.nfts = live([]);
    inputs.walletNative = live([]);
    inputs.walletTokens = live([]);
    inputs.manualHoldings = live([]);
  } else if (scenario === "empty") {
    inputs.t212Positions.data = inputs.t212Positions.data!.slice(1);
    inputs.t212Summary = live({ currency: "USD", totalValue: 0.999, cashAvailable: 0, investmentsCurrentValue: 0.999 });
    inputs.nfts.data = inputs.nfts.data!.slice(1);
    inputs.walletNative!.data = inputs.walletNative!.data!.slice(1);
    inputs.walletTokens!.data = inputs.walletTokens!.data!.slice(1);
    inputs.manualHoldings = live([]);
  } else if (scenario === "wholesale") {
    inputs.t212Positions = live([position("SECURITY-UNKNOWN", null)]);
    inputs.nfts.data = inputs.nfts.data!.slice(2);
    inputs.walletTokens!.data = inputs.walletTokens!.data!.slice(2);
    inputs.ethPrice = unavailable();
    inputs.manualHoldings = live([]);
  } else if (scenario === "failed") {
    inputs.walletNative = unavailable();
    inputs.walletTokens = unavailable();
    inputs.nfts = unavailable();
  } else if (scenario === "inventory") {
    inputs.nfts.state = { status: "partial", asOf: AS_OF, message: "Synthetic inventory pagination incomplete." };
  } else if (scenario === "eth-outage") {
    inputs.ethPrice = unavailable();
    inputs.nfts = live([
      { collection: "collection-zero", collectionName: "COLLECTION-ZERO", tokenCount: 1, floorEth: 0 },
      { collection: "collection-positive", collectionName: "COLLECTION-POSITIVE", tokenCount: 1, floorEth: 0.1 },
    ]);
    inputs.manualHoldings = live([]);
  } else if (scenario === "fiat-outage") {
    inputs.fiatFx = unavailable();
    inputs.t212Summary = live({ currency: "USD", totalValue: 0.999, cashAvailable: 0, investmentsCurrentValue: 0.999 });
    inputs.t212Positions = live([position("SECURITY-SMALL", 0.999)]);
    inputs.nfts.data = inputs.nfts.data!.slice(1, 2);
    inputs.walletNative!.data = inputs.walletNative!.data!.slice(1);
    inputs.walletTokens!.data = inputs.walletTokens!.data!.slice(1, 2);
    inputs.manualHoldings = live([]);
  }
  return buildJoinedPortfolio(inputs, AS_OF);
}
