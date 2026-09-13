import { afterEach, describe, expect, it, vi } from "vitest";
import type { NormalizedWalletTokenBalance } from "./live-data";
import { DEFAULT_SOL_WALLET, fetchSolanaSource, type SolanaPriceInventory } from "./solana-wallet";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CLASSIC = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const PRIMARY = "https://api.mainnet-beta.solana.com";
const FALLBACK = "https://api.mainnet.solana.com";
type RpcRequest = { method: string; params: [string, { programId?: string; commitment?: string }, unknown?] };

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function rpc(value: unknown) {
  return json({ jsonrpc: "2.0", id: 1, result: { context: { slot: 123 }, value } });
}

function account(mint = USDC_MINT, amount = "1000000", decimals = 6, program = CLASSIC, pubkey = SOL_MINT) {
  return {
    pubkey,
    account: {
      owner: program,
      data: { parsed: { type: "account", info: {
        owner: DEFAULT_SOL_WALLET, mint, tokenAmount: { amount, decimals, uiAmount: 999999 },
      } } },
    },
  };
}

function network(
  handler?: (request: RpcRequest, endpoint: string) => Response | undefined | Promise<Response | undefined>,
) {
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as RpcRequest;
    const response = await handler?.(request, String(input));
    return response ?? rpc(request.method === "getBalance" ? 48_588_734 : []);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function pricing(prices: Record<string, number | null> = { [SOL_MINT]: 150, [USDC_MINT]: 1 }) {
  return vi.fn(async (inventory: SolanaPriceInventory[]): Promise<NormalizedWalletTokenBalance[]> => inventory.map((row) => ({
    chainId: row.chainId, chainName: row.chainName, symbol: row.symbol, name: row.name,
    contract: row.contract, amountRaw: row.amountRaw, decimals: row.decimals, amount: row.amount,
    priceUsd: prices[row.contract] ?? null,
  })));
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Solana live wallet reader", () => {
  it("uses the exact desk fallback and reads confirmed SOL plus both parsed token programs", async () => {
    const fetch = network();
    const price = pricing();
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, price);
    expect(DEFAULT_SOL_WALLET).toBe("3RV96nnpc3yvhGhH5my2fJLjFAQraVAiEfojbmHnaSeq");
    expect(result.state.status).toBe("live");
    expect(result.data).toEqual({
      native: [{ chainId: "solana", chainName: "Solana", symbol: "SOL", amount: 0.048588734, amountRaw: "48588734", priceUsd: 150 }],
      tokens: [],
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { jsonrpc: "2.0", id: 1, method: "getBalance", params: [DEFAULT_SOL_WALLET, { commitment: "confirmed" }] },
      { jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [DEFAULT_SOL_WALLET, { programId: CLASSIC }, { encoding: "jsonParsed", commitment: "confirmed" }] },
      { jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [DEFAULT_SOL_WALLET, { programId: TOKEN_2022 }, { encoding: "jsonParsed", commitment: "confirmed" }] },
    ]);
    for (const [endpoint, init] of fetch.mock.calls) {
      expect(endpoint).toBe(PRIMARY);
      expect(init?.cache).toBe("no-store");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(price).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({
      chainId: "solana", symbol: "SOL", mint: SOL_MINT, contract: SOL_MINT,
      llamaChain: "solana", coinGeckoPlatform: "solana", priceHintUsd: null, priceCandidate: true,
    })]);
  });

  it.each(["HTTP", "RPC", "network", "malformed", "bad-json"])("fails over all three reads after a primary %s failure", async (failure) => {
    const fetch = network((request, endpoint) => {
      if (endpoint !== PRIMARY) return undefined;
      if (failure === "HTTP") return json({}, 503);
      if (failure === "RPC") return json({ jsonrpc: "2.0", id: 1, error: { code: -32603, message: "unavailable" } });
      if (failure === "network") throw new Error("private provider message");
      if (failure === "bad-json") return new Response("not JSON");
      return rpc(request.method === "getBalance" ? -1 : { wrong: [] });
    });
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, pricing());
    expect(result.state.status).toBe("live");
    expect(result.data?.native[0].amount).toBe(0.048588734);
    expect(fetch.mock.calls.filter(([endpoint]) => endpoint === FALLBACK)).toHaveLength(3);
  });

  it("aggregates repeated mint accounts, uses raw units, retains Token-2022 and omits zero balances", async () => {
    network((request) => {
      if (request.method === "getBalance") return undefined;
      return rpc(request.params[1].programId === CLASSIC ? [
        account(USDC_MINT, "1000001", 6, CLASSIC, SOL_MINT),
        account(USDC_MINT, "2000002", 6, CLASSIC, DEFAULT_SOL_WALLET),
        account(TOKEN_2022, "0", 6, CLASSIC, CLASSIC),
      ] : [account(CLASSIC, "250", 2, TOKEN_2022, USDC_MINT)]);
    });
    const price = pricing();
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, price);
    expect(result.state.status).toBe("live");
    expect(result.data?.tokens).toHaveLength(2);
    expect(result.data?.tokens[0]).toMatchObject({ contract: USDC_MINT, amountRaw: "3000003", amount: 3.000003, priceUsd: 1 });
    expect(result.data?.tokens[1]).toMatchObject({ contract: CLASSIC, amountRaw: "250", amount: 2.5, priceUsd: null });
    expect(price.mock.calls[0][0].map((row) => row.contract)).toEqual([SOL_MINT, USDC_MINT, CLASSIC]);
  });

  it("preserves exact base58 case in wallet requests, mint identifiers and price lookups", async () => {
    const fetch = network((request) => request.params[1].programId === CLASSIC ? rpc([account()]) : undefined);
    const price = pricing({ [SOL_MINT]: 150, [USDC_MINT.toLowerCase()]: 42 });
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, price);
    expect(fetch.mock.calls.every(([, init]) => JSON.parse(String(init?.body)).params[0] === DEFAULT_SOL_WALLET)).toBe(true);
    expect(price.mock.calls[0][0][1].contract).toBe(USDC_MINT);
    expect(result.data?.tokens[0].contract).toBe(USDC_MINT);
    expect(result.data?.tokens[0].priceUsd).toBeNull();
  });

  it("uses the explicitly supplied Solana wallet", async () => {
    const fetch = network();
    await fetchSolanaSource(SOL_MINT, pricing());
    expect(fetch.mock.calls.every(([, init]) => JSON.parse(String(init?.body)).params[0] === SOL_MINT)).toBe(true);
  });

  it.each(["", "0xC1bd8020d08B2A1F98da54f1573A54412d99c609", "O".repeat(44)])("rejects invalid wallet %s without a network request", async (wallet) => {
    const fetch = network();
    const price = pricing();
    const result = await fetchSolanaSource(wallet, price);
    expect(result.data).toBeNull();
    expect(result.state.status).toBe("unavailable");
    expect(fetch).not.toHaveBeenCalled();
    expect(price).not.toHaveBeenCalled();
  });

  it("returns unavailable without throwing or exposing private errors when all endpoints fail", async () => {
    const fetch = network(() => { throw new Error("private provider message"); });
    const price = pricing();
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, price);
    expect(result.data).toBeNull();
    expect(result.state.status).toBe("unavailable");
    expect(result.state.message).toContain("3 of 3 required reads are unavailable");
    expect(result.state.message).not.toContain("private");
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(price).not.toHaveBeenCalled();
  });

  it("omits the entire Solana inventory when Token-2022 exhausts both endpoints", async () => {
    network((request) => request.params[1].programId === TOKEN_2022 ? json({}, 429)
      : request.params[1].programId === CLASSIC ? rpc([account()]) : undefined);
    const price = pricing();
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, price);
    expect(result.state.status).toBe("unavailable");
    expect(result.state.message).toContain("1 of 3 required reads are unavailable");
    expect(result.data).toBeNull();
    expect(price).not.toHaveBeenCalled();
  });

  it("omits the entire Solana inventory when the native read is unavailable", async () => {
    network((request) => request.method === "getBalance" ? rpc(null)
      : request.params[1].programId === CLASSIC ? rpc([account()]) : undefined);
    const price = pricing();
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, price);
    expect(result.state.status).toBe("unavailable");
    expect(result.data).toBeNull();
    expect(price).not.toHaveBeenCalled();
  });

  it("prevents partial classic-program failure from exposing SOL P&L without its wallet value", async () => {
    const fetch = network((request) => request.params[1].programId === CLASSIC ? json({}, 503) : undefined);
    const price = pricing();
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, price);
    expect(result).toEqual({ data: null, state: {
      status: "unavailable", asOf: null, message: expect.stringContaining("1 of 3 required reads are unavailable"),
    } });
    expect(fetch.mock.calls.filter(([, init]) => JSON.parse(String(init?.body)).params[1].programId === CLASSIC)).toHaveLength(2);
    expect(price).not.toHaveBeenCalled();
  });

  it.each([null, -1, 0, Number.NaN, Infinity])("keeps missing or invalid price %s unpriced without declaring the inventory missing", async (priceUsd) => {
    network((request) => request.params[1].programId === CLASSIC ? rpc([account()]) : undefined);
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, pricing({ [SOL_MINT]: priceUsd, [USDC_MINT]: priceUsd }));
    expect(result.state.status).toBe("live");
    expect(result.data?.native[0].priceUsd).toBeNull();
    expect(result.data?.tokens[0].priceUsd).toBeNull();
    expect(result.data?.tokens[0].amount).toBe(1);
  });

  it("isolates a rejected pricing call and retains the live unpriced inventory", async () => {
    network((request) => request.params[1].programId === CLASSIC ? rpc([account()]) : undefined);
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, async () => { throw new Error("price unavailable"); });
    expect(result.state.status).toBe("live");
    expect(result.data?.native[0].priceUsd).toBeNull();
    expect(result.data?.tokens[0].priceUsd).toBeNull();
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "48588734", null])("rejects invalid or inexact lamport quantity %s", async (amount) => {
    network((request) => request.method === "getBalance" ? rpc(amount) : undefined);
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, pricing());
    expect(result.state.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });

  it.each([
    account(USDC_MINT, "-1"), account(USDC_MINT, "1.2"), account(USDC_MINT, "18446744073709551616"),
    account(USDC_MINT, "1", -1), account(USDC_MINT, "1", 1.5), account(USDC_MINT, "1", 256),
    account("invalid-mint"), { pubkey: SOL_MINT, account: { data: ["base64", "base64"] } },
  ])("fails closed on malformed SPL account %#", async (malformed) => {
    network((request) => request.params[1].programId === CLASSIC ? rpc([malformed]) : undefined);
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, pricing());
    expect(result.state.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });

  it("fails over malformed account inventories instead of silently dropping an account", async () => {
    const fetch = network((request, endpoint) => {
      if (request.params[1].programId !== CLASSIC) return undefined;
      return rpc(endpoint === PRIMARY ? [account(), { bad: true }] : [account()]);
    });
    const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, pricing());
    expect(result.state.status).toBe("live");
    expect(result.data?.tokens[0].amount).toBe(1);
    expect(fetch.mock.calls.filter(([endpoint]) => endpoint === FALLBACK)).toHaveLength(1);
  });

  it("rejects inconsistent decimals and duplicate account ids without double counting", async () => {
    for (const accounts of [[account(), account()], [account(), account(USDC_MINT, "2", 2, CLASSIC, DEFAULT_SOL_WALLET)]]) {
      network((request) => request.params[1].programId === CLASSIC ? rpc(accounts) : undefined);
      const result = await fetchSolanaSource(DEFAULT_SOL_WALLET, pricing());
      expect(result.state.status).toBe("unavailable");
      expect(result.data).toBeNull();
    }
  });
});
