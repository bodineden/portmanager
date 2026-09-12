import type { JoinedPortfolio, LiveSourceState } from "./live-data";

/** Null values remain valid for historical snapshots and unconverted manual cash. */
export type HoldingsValueMap = Record<string, number | null>;
export type SnapshotSources = Record<string, LiveSourceState>;
export const VALUE_SOURCE_KEYS = ["t212Summary", "t212Positions", "nfts", "fiatFx", "ethPrice", "walletNative", "walletTokens", "manualHoldings", "capital"] as const;
export const holdingId = {
  t212: (ticker: string) => `t212:${ticker}`,
  nft: (collection: string) => `nft:${collection}`,
  native: (chainId: number) => `native:${chainId}`,
  token: (chainId: number, contract: string) => `token:${chainId}:${contract.toLowerCase()}`,
  manual: (label: string) => `manual:${label}`,
};
export function joinedHoldingsMap(portfolio: JoinedPortfolio): HoldingsValueMap {
  return Object.fromEntries([
    ...portfolio.t212.investments.map((row) => [holdingId.t212(row.ticker), row.valueUsd]),
    ...portfolio.nfts.map((row) => [holdingId.nft(row.collection), row.valueUsd]),
    ...portfolio.wallet.native.map((row) => [holdingId.native(row.chainId), row.valueUsd]),
    ...portfolio.wallet.tokens.map((row) => [holdingId.token(row.chainId, row.contract ?? row.symbol), row.valueUsd]),
    ...portfolio.manualHoldings.map((row) => [holdingId.manual(row.label), row.valueUsd]),
  ]);
}

/** Includes identities AND priced flags, not just counts: same-count swaps are different baskets.
 * Quantities and cash amounts may move internally without constituting contributed capital.
 */
export function valueSetSignature(holdings: HoldingsValueMap | null | undefined, sources: SnapshotSources | null | undefined): string | null {
  if (!holdings || !sources || !VALUE_SOURCE_KEYS.every((key) => ["live", "partial", "unavailable"].includes(sources[key]?.status))) return null;
  return JSON.stringify({ holdings: Object.entries(holdings).sort(([a], [b]) => a.localeCompare(b)).map(([id, value]) => [id, typeof value === "number" && Number.isFinite(value) && value >= 0]),
    sources: Object.entries(sources).sort(([a], [b]) => a.localeCompare(b)).map(([key, source]) => [key, source.status]) });
}
