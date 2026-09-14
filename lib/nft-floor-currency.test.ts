import { describe, expect, it } from "vitest";
import { buildJoinedPortfolio, normalizeNftFloor, type JoinedPortfolioInputs, type LiveResult } from "./live-data";
import { formatNftFloor } from "./pnl-view";

const DATE = "2026-09-14T14:51:00Z";
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: DATE, message: "Recorded quote regression fixture" } });
// Brief's pinned ETH values. Non-itsriggles floors reconstructed from those exact
// row values at 2507.03; this is not a new live read or a historical DB observation.
export const pinnedNftStats = [
  { collection: "itsriggles", tokenCount: 1, total: { floor_price: 0.0305, floor_price_symbol: "ETH" }, valueUsd: 76.464415 },
  { collection: "piggy-banks-nfts", tokenCount: 1, total: { floor_price: 0.0125, floor_price_symbol: "ETH" }, valueUsd: 31.337875000000004 },
  { collection: "claystonkz", tokenCount: 1, total: { floor_price: 0.008196999, floor_price_symbol: "ETH" }, valueUsd: 20.55012240297 },
  { collection: "wasteland-art", tokenCount: 1, total: { floor_price: 0.0068821, floor_price_symbol: "ETH" }, valueUsd: 17.253631163 },
  { collection: "thefirmbrokers", tokenCount: 1, total: { floor_price: 0.0048, floor_price_symbol: "ETH" }, valueUsd: 12.033744 },
  { collection: "g00fyz", tokenCount: 2, total: { floor_price: 0.0003, floor_price_symbol: "ETH" }, valueUsd: 1.504218 },
];
const inputs = (): JoinedPortfolioInputs => ({
  t212Summary: live({ currency: "USD", cashAvailable: 0, totalValue: 0, investmentsCurrentValue: 0 }),
  t212Positions: live([]), walletNative: live([]), walletTokens: live([]), solana: live({ native: [], tokens: [] }),
  manualHoldings: live([]), capitalEvents: live([]), ethPrice: live(2507.03),
  fiatFx: live({ usdToThb: 33.076908, gbpToThb: 44.72977472098751, eurToThb: null, asOf: DATE }),
  nfts: live(pinnedNftStats.map((row) => ({ collection: row.collection, collectionName: row.collection,
    tokenCount: row.tokenCount, ...normalizeNftFloor(row.total) }))),
});

describe("NFT floor currency regression", () => {
  it("preserves the six pinned ETH-quoted row values byte-for-byte", () => {
    const after = buildJoinedPortfolio(inputs(), DATE);
    const before = pinnedNftStats.map((row) => row.total.floor_price * row.tokenCount * 2507.03);
    expect(JSON.stringify(after.nfts.map((row) => row.valueUsd))).toBe(JSON.stringify(before));
    expect(before).toEqual(pinnedNftStats.map((row) => row.valueUsd));
    process.stdout.write(`PINNED_NFT_BEFORE_AFTER ${JSON.stringify(after.nfts.map((row, i) => ({ collection: row.collection, before: before[i], after: row.valueUsd })))}\n`);
    expect(after.totals.nftsUsd).toBe(before.reduce((sum, value) => sum + value, 0));
    process.stdout.write(`PINNED_NFT_SUM ${after.totals.nftsUsd}; brief states 159.143861; exact listed rows sum differently\n`);
  });
  it("keeps a USDG floor priced at par even when the ETH display rate is unavailable", () => {
    const data = inputs();
    data.nfts = live([{ collection: "prspct", collectionName: "prspct", tokenCount: 3,
      ...normalizeNftFloor({ floor_price: 0.4, floor_price_symbol: "USDG" }) }]);
    data.ethPrice = { data: null, state: { status: "unavailable", asOf: null, message: "ETH quote unavailable" } };
    const book = buildJoinedPortfolio(data, DATE);
    expect(book.nfts[0]).toMatchObject({ floorEth: null, floorUsd: 0.4, valueUsd: 0.4 * 3, valueEth: null });
    expect(book.totals.nftsUsd).toBe(0.4 * 3);
    expect(book.totals.nftsEth).toBeNull();
    expect(formatNftFloor(book.nfts[0])).toBe("0.4 USDG");
  });
  it.each([null, undefined, "SOL", "BTC", "", "USDC.e"])("never assumes ETH for the unsupported quote %s", (symbol) => {
    expect(normalizeNftFloor({ floor_price: 0.4, floor_price_symbol: symbol })).toEqual({ floorAmount: null, floorSymbol: null, floorEth: null, floorUsd: null });
  });
  it.each([null, undefined, -1, NaN, Infinity, "bad"])("fails closed on malformed floor amount %s", (amount) => {
    expect(normalizeNftFloor({ floor_price: amount, floor_price_symbol: "USDG" }).floorAmount).toBeNull();
  });
});
