import { describe, expect, it } from "vitest";
import { holdingId, joinedHoldingsMap, valueSetSignature } from "./holding-values";
import { buildJoinedPortfolio, type LiveResult } from "./live-data";
import { readManualBasis } from "./basis-db";
import { isSolanaAddress } from "./solana-address";

const AS_OF = "2026-09-13T00:00:00Z";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CASE_DISTINCT_MINT = "EpjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: AS_OF, message: "fixture" } });
const statement = { costUsd: 7, asOf: "2026-09-13", note: "fixture exact mint statement" };
const basisRow = (mint: string, cost = "7") => ({ holding_key: `token:solana:${mint}`,
  cost_usd: cost, as_of: statement.asOf, note: statement.note });
const readRows = (rows: unknown[]) => readManualBasis(AS_OF, {
  hasDb: () => true, getDb: () => ({ query: async () => rows }),
});

describe("case-sensitive Solana holding and basis identities", () => {
  it("L3: keeps two case-distinct mints, two snapshot entries and one $7 statement separate", async () => {
    expect(isSolanaAddress(MINT)).toBe(true);
    expect(isSolanaAddress(CASE_DISTINCT_MINT)).toBe(true);
    expect(MINT.toLowerCase()).toBe(CASE_DISTINCT_MINT.toLowerCase());
    expect(holdingId.token("solana", MINT)).not.toBe(holdingId.token("solana", CASE_DISTINCT_MINT));
    const book = buildJoinedPortfolio({
      t212Summary: live({ currency: "USD", cashAvailable: 0, totalValue: 0, investmentsCurrentValue: 0 }),
      t212Positions: live([]), nfts: live([]), walletNative: live([]), walletTokens: live([]),
      solana: live({ native: [], tokens: [MINT, CASE_DISTINCT_MINT].map((contract, index) => ({
        chainId: "solana" as const, chainName: "Solana", symbol: contract, name: contract, contract,
        amountRaw: String(index + 1), amount: index + 1, decimals: 0, priceUsd: 10,
      })) }),
      fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: AS_OF }), ethPrice: live(2000),
      capitalEvents: live([]), manualHoldings: live([]), manualBasis: await readRows([basisRow(MINT)]),
    }, AS_OF);
    expect(book.wallet.tokens.map((row) => row.contract)).toEqual([MINT, CASE_DISTINCT_MINT]);
    expect(book.wallet.tokens.map((row) => row.costBasisUsd)).toEqual([7, null]);
    expect(book.wallet.tokens.map((row) => row.pnlEligibility)).toEqual(["eligible", "not-recorded"]);
    const holdings = joinedHoldingsMap(book);
    expect(holdings).toEqual({ [`token:solana:${MINT}`]: 10, [`token:solana:${CASE_DISTINCT_MINT}`]: 20 });
    expect(Object.values(holdings).reduce<number>((sum, value) => sum + value!, 0)).toBe(book.totals.walletTokensUsd);
    const signature = valueSetSignature(holdings, book.sources);
    expect(signature).not.toBeNull();
    expect(valueSetSignature(joinedHoldingsMap(structuredClone(book)), book.sources)).toBe(signature);
  });
  it("L3: reader preserves each valid mint case with independent statements", async () => {
    expect(await readRows([basisRow(MINT), basisRow(CASE_DISTINCT_MINT, "9")])).toEqual({
      [`token:solana:${MINT}`]: statement,
      [`token:solana:${CASE_DISTINCT_MINT}`]: { ...statement, costUsd: 9 },
    });
  });
  it.each([MINT.toLowerCase(), "3RV96nnpc3yvhGhH5my2fJLjFAQraVAiEfojbmHnaSeq".toLowerCase(),
    "Z".repeat(32), "0".repeat(44), `${MINT} `, ` ${MINT}`, `${MINT}:extra`])(
    "L3: reader rejects malformed or case-mangled key %s without repairing it", async (mint) => {
      expect(await readRows([basisRow(mint)])).toEqual({});
      expect(await readRows([basisRow(mint), basisRow(MINT)])).toEqual({ [`token:solana:${MINT}`]: statement });
    },
  );
  it("keeps EVM address case normalization", () => {
    expect(holdingId.token(8453, `0x${"aB".repeat(20)}`)).toBe(`token:8453:0x${"ab".repeat(20)}`);
  });
});
