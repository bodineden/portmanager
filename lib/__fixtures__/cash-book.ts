import { buildJoinedPortfolio, normalizeNftFloor, type JoinedPortfolioInputs, type LiveResult } from "../live-data";

const DATE = "2026-09-14T14:51:00Z";
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: DATE, message: "Pinned brief arithmetic fixture (rounded components, not a live read)" } });
/** Brief arithmetic plus the read-only-confirmed GBP 2000 pot; not a persisted observation. */
export function cashBookInputs(): JoinedPortfolioInputs {
  return {
    t212Summary: live({ currency: "GBP", totalValue: 109.56, cashAvailable: 73.16, investmentsCurrentValue: 36.4 }),
    t212Positions: live([]),
    manualHoldings: live([{ id: "cash", label: "T212 cash pot", kind: "cash", currency: "GBP", amount: 2000, recordedAt: DATE, createdAt: DATE }]),
    capitalEvents: live([{ occurredAt: DATE, kind: "contribution", amountThb: 120000 }]),
    nfts: live([
      ["itsriggles", 0.0305, 1], ["piggy-banks-nfts", 0.0125, 1], ["claystonkz", 0.008196999, 1],
      ["wasteland-art", 0.0068821, 1], ["thefirmbrokers", 0.0048, 1], ["g00fyz", 0.0003, 2],
    ].map(([collection, floor, count]) => ({ collection: String(collection), collectionName: String(collection), tokenCount: Number(count),
      ...normalizeNftFloor({ floor_price: floor, floor_price_symbol: "ETH" }) }))),
    walletNative: live([{ chainId: 4663, chainName: "Robinhood Chain", symbol: "ETH", amount: 0.022395567713417844 }]),
    walletTokens: live([
      { chainId: 4663, chainName: "Robinhood Chain", symbol: "USDG", name: "USDG", contract: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", amountRaw: "2188621", decimals: 6, amount: 2.188621, priceUsd: 2.1886 / 2.188621 },
      { chainId: 4663, chainName: "Robinhood Chain", symbol: "USDG", name: "Unpriced imposter", contract: "0x5411257cedf60bc40f4bead410bf8d02079056a2", amountRaw: "13000000000000000000", decimals: 18, amount: 13, priceUsd: null },
      { chainId: 4663, chainName: "Robinhood Chain", symbol: "DUST-FIXTURE", name: "Combined priced dust fixture", amountRaw: "1", decimals: 0, amount: 1, priceUsd: 0.2090 },
    ]),
    solana: live({ native: [{ chainId: "solana", chainName: "Solana", symbol: "SOL", amountRaw: "1045197959", amount: 1.045197959, priceUsd: 106.2058 / 1.045197959 }], tokens: [
      { chainId: "solana", chainName: "Solana", symbol: "USDC", name: "USDC", contract: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amountRaw: "89432083", decimals: 6, amount: 89.432083, priceUsd: 89.4168 / 89.432083 },
      { chainId: "solana", chainName: "Solana", symbol: "MEME-FIXTURE", name: "Non-stable token fixture", contract: "HcRLc9…DeJR", amountRaw: "1", decimals: 0, amount: 1, priceUsd: 12.1034 },
    ] }),
    ethPrice: live(2507.03), fiatFx: live({ usdToThb: 33.076908, gbpToThb: 44.72977472098751, eurToThb: null, asOf: DATE }),
  };
}
export function cashBook() { return buildJoinedPortfolio(cashBookInputs(), DATE); }
