import type { WalletTokenHolding } from "./live-data";

const USD_STABLECOINS = new Set([
  "USDC", "USDT", "USDG", "DAI", "PYUSD", "USDE", "USDS", "TUSD",
  "FDUSD", "USD1", "USDP", "GUSD", "LUSD", "FRAX", "CRVUSD", "USDTB",
]);

/** Exact USD-pegged symbols only; a ticker is not proof that a token has a price. */
export function isStablecoinSymbol(symbol: string | null | undefined): boolean {
  return typeof symbol === "string" && USD_STABLECOINS.has(symbol.toUpperCase());
}

/** Unpriced imposters remain crypto; cash requires an observed finite USD value. */
export function isCashToken(row: Pick<WalletTokenHolding, "symbol" | "priced" | "valueUsd">): boolean {
  return isStablecoinSymbol(row.symbol) && row.priced === true
    && typeof row.valueUsd === "number" && Number.isFinite(row.valueUsd);
}
