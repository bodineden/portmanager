import type { WalletTokenHolding } from "./live-data";

const USD_STABLECOINS = new Set([
  "USDC", "USDT", "USDG", "DAI", "PYUSD", "USDE", "USDS", "TUSD",
  "FDUSD", "USD1", "USDP", "GUSD", "LUSD", "FRAX", "CRVUSD", "USDTB",
]);

/** Exact USD-pegged symbols only; a ticker is not proof that a token has a price. */
export function isStablecoinSymbol(symbol: string | null | undefined): boolean {
  return typeof symbol === "string" && USD_STABLECOINS.has(symbol.toUpperCase());
}

// Canonical Solana USD-stable mints: RPC inventory uses mint labels, not tickers.
// Case folding is local to classification; never alter RPC IDs or persisted keys.
const USD_STABLECOIN_CONTRACTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", // PYUSD
].map((contract) => contract.toLowerCase()));

/** Only known contracts qualify; absent or unknown metadata fails closed. */
export function isStablecoinContract(contract: string | null | undefined): boolean {
  return typeof contract === "string" && USD_STABLECOIN_CONTRACTS.has(contract.toLowerCase());
}

/** Unpriced imposters remain crypto; cash requires an observed finite USD value. */
export function isCashToken(row: Pick<WalletTokenHolding, "symbol" | "contract" | "priced" | "valueUsd">): boolean {
  return (isStablecoinSymbol(row.symbol) || isStablecoinContract(row.contract)) && row.priced === true
    && typeof row.valueUsd === "number" && Number.isFinite(row.valueUsd);
}
