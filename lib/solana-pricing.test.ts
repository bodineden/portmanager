import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetSnapshotCacheForTests, getJoinedPortfolio } from "./live-data";
import { DEFAULT_SOL_WALLET } from "./solana-wallet";
import { joinedHoldingsMap } from "./holding-values";
import * as basisDb from "./basis-db";

vi.mock("./pnl-history", () => ({ recordPortfolioSnapshot: vi.fn(async () => "skipped") }));

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CLASSIC = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
const rpc = (value: unknown) => json({ jsonrpc: "2.0", id: 1, result: { value } });

afterEach(() => {
  __resetSnapshotCacheForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("shared Solana and EVM wallet pricing path", () => {
  it.each(["DefiLlama", "CoinGecko", "wrong-case"])("matches base58 mints exactly through %s", async (provider) => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("OPENSEA_API_KEY", "");
    const wallet = provider === "CoinGecko" ? USDC_MINT : DEFAULT_SOL_WALLET;
    vi.stubEnv("SOL_WALLET", wallet);
    vi.spyOn(basisDb, "readManualBasis").mockResolvedValue({
      "native:solana:native": { costUsd: 4.705788, asOf: "2026-09-13", note: "fixture bridge basis" },
      [`token:solana:${USDC_MINT}`]: { costUsd: 3, asOf: "2026-09-13", note: "fixture token basis" },
    });
    __resetSnapshotCacheForTests();
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.mainnet-beta.solana.com" || url === "https://api.mainnet.solana.com") {
        const request = JSON.parse(String(init?.body));
        expect(request.params[0]).toBe(wallet);
        if (request.method === "getBalance") return rpc(1_000_000_000);
        return rpc(request.params[1].programId === CLASSIC ? [{
          pubkey: SOL_MINT, account: { owner: CLASSIC, data: { parsed: { type: "account", info: {
            owner: wallet, mint: USDC_MINT, tokenAmount: { amount: "2000000", decimals: 6 },
          } } } },
        }] : []);
      }
      if (url.includes("coins.llama.fi/prices/current/solana:")) {
        const key = (mint: string) => `solana:${provider === "wrong-case" ? mint.toLowerCase() : mint}`;
        return json({ coins: provider === "CoinGecko" ? {} : { [key(SOL_MINT)]: { price: 150 }, [key(USDC_MINT)]: { price: 1 } } });
      }
      if (url.includes("simple/token_price/solana")) {
        const mint = new URL(url).searchParams.get("contract_addresses")!;
        return json({ [provider === "wrong-case" ? mint.toLowerCase() : mint]: { usd: mint === SOL_MINT ? 150 : 1 } });
      }
      if (url.includes("open.er-api.com")) return json({ rates: { THB: 36, GBP: 0.8, EUR: 0.9 } });
      if (url.includes("simple/price?ids=ethereum")) return json({ ethereum: { usd: 2000 } });
      return json({}, 503);
    });
    vi.stubGlobal("fetch", fetch);
    const book = await getJoinedPortfolio();
    const native = book.wallet.native.find((row) => row.chainId === "solana")!;
    const token = book.wallet.tokens.find((row) => row.chainId === "solana")!;
    expect(native.priceUsd).toBe(provider === "wrong-case" ? null : 150);
    expect(token.priceUsd).toBe(provider === "wrong-case" ? null : 1);
    expect(token.contract).toBe(USDC_MINT);
    expect(joinedHoldingsMap(book)[`token:solana:${USDC_MINT}`]).toBe(provider === "wrong-case" ? null : 2);
    expect(native.key).toBe("native:solana:native");
    expect(native.costBasisUsd).toBe(provider === "wrong-case" ? null : 4.705788);
    expect(token.costBasisUsd).toBe(provider === "wrong-case" ? null : 3);
    expect(token.pnlEligibility).toBe(provider === "wrong-case" ? "unpriced" : "eligible");
    expect(fetch.mock.calls.map(([url]) => String(url))).toContain(
      `https://coins.llama.fi/prices/current/solana:${SOL_MINT},solana:${USDC_MINT}`,
    );
    if (provider !== "DefiLlama") {
      const urls = fetch.mock.calls.map(([url]) => String(url));
      expect(urls).toContain(`https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${SOL_MINT}&vs_currencies=usd`);
      expect(urls).toContain(`https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${USDC_MINT}&vs_currencies=usd`);
    }
  });
});
