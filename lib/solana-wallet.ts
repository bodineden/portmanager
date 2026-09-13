import type { LiveResult, NormalizedWalletTokenBalance } from "./live-data";

export const DEFAULT_SOL_WALLET = "3RV96nnpc3yvhGhH5my2fJLjFAQraVAiEfojbmHnaSeq";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAMS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
] as const;
const RPC_ENDPOINTS = ["https://api.mainnet-beta.solana.com", "https://api.mainnet.solana.com"];
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const U64_MAX = BigInt("18446744073709551615");
const RPC_TIMEOUT_MS = 8_000;

export type SolanaPriceInventory = {
  chainId: "solana";
  chainName: string;
  symbol: string;
  name: string;
  mint: string;
  contract: string;
  amountRaw: string;
  decimals: number;
  amount: number;
  priceHintUsd: null;
  priceCandidate: true;
  llamaChain: "solana";
  coinGeckoPlatform: "solana";
};

export type SolanaWalletBalances = {
  native: {
    chainId: "solana";
    chainName: string;
    symbol: "SOL";
    amount: number;
    amountRaw: string;
    priceUsd: number | null;
  }[];
  tokens: NormalizedWalletTokenBalance[];
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function inventoryRow(mint: string, amountRaw: string, decimals: number): SolanaPriceInventory {
  // Keep base58 case in RPC and provider identifiers. Only the joined book's
  // persisted basis keys use the required lowercase-mint vocabulary.
  const digits = amountRaw.padStart(decimals + 1, "0");
  const amount = Number(decimals === 0 ? digits : `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid token quantity.");
  return {
    chainId: "solana", chainName: "Solana", symbol: `${mint.slice(0, 4)}…${mint.slice(-4)}`,
    name: `SPL token ${mint}`, mint, contract: mint, amountRaw, decimals, amount,
    priceHintUsd: null, priceCandidate: true, llamaChain: "solana", coinGeckoPlatform: "solana",
  };
}

function parseBalance(value: unknown): string {
  // JSON-RPC encodes lamports as a number. Reject unsafe integers instead of
  // claiming that an already-rounded JSON number is an exact raw balance.
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid native SOL balance.");
  }
  return String(value);
}

function parseTokenAccounts(value: unknown, wallet: string, program: string): SolanaPriceInventory[] {
  if (!Array.isArray(value)) throw new Error("Invalid SPL inventory.");
  const rows = new Map<string, SolanaPriceInventory>();
  const accounts = new Set<string>();
  for (const entry of value) {
    const row = object(entry);
    const account = object(row?.account);
    const parsed = object(object(account?.data)?.parsed);
    const info = object(parsed?.info);
    const tokenAmount = object(info?.tokenAmount);
    const mint = info?.mint;
    const raw = tokenAmount?.amount;
    const decimals = tokenAmount?.decimals;
    if (typeof row?.pubkey !== "string" || !ADDRESS_PATTERN.test(row.pubkey)
      || accounts.has(row.pubkey) || account?.owner !== program
      || parsed?.type !== "account" || info?.owner !== wallet
      || typeof mint !== "string" || !ADDRESS_PATTERN.test(mint)
      || typeof raw !== "string" || !/^\d+$/.test(raw) || raw.length > 20
      || BigInt(raw) > U64_MAX
      || typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
      throw new Error("Malformed SPL token account.");
    }
    accounts.add(row.pubkey);
    if (BigInt(raw) === BigInt(0)) continue;
    const existing = rows.get(mint);
    if (existing && existing.decimals !== decimals) throw new Error("Inconsistent SPL mint decimals.");
    const amountRaw = (BigInt(existing?.amountRaw ?? "0") + BigInt(raw)).toString();
    if (BigInt(amountRaw) > U64_MAX) throw new Error("Invalid SPL aggregate balance.");
    rows.set(mint, inventoryRow(mint, amountRaw, decimals));
  }
  return [...rows.values()];
}

async function readRpc<T>(method: string, params: unknown[], parse: (value: unknown) => T): Promise<{
  data: T | null;
  message: string;
}> {
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "PortManager/1.0" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      const payload = object(await response.json());
      const result = object(payload?.result);
      if (payload?.jsonrpc !== "2.0" || payload.id !== 1 || payload.error || !result || !("value" in result)) continue;
      return { data: parse(result.value), message: "" };
    } catch {
      // HTTP, RPC, timeout and malformed payloads all try the next provider.
      // Never include raw provider errors that may contain private details.
    }
  }
  return { data: null, message: `${method} is unavailable from both public Solana RPC endpoints.` };
}

export async function fetchSolanaSource(
  wallet: string,
  priceTokens: (inventory: SolanaPriceInventory[]) => Promise<NormalizedWalletTokenBalance[]>,
): Promise<LiveResult<SolanaWalletBalances>> {
  if (!ADDRESS_PATTERN.test(wallet)) {
    return { data: null, state: { status: "unavailable", asOf: null, message: "The configured Solana wallet address is invalid." } };
  }
  const readTokens = (program: string) => readRpc("getTokenAccountsByOwner", [
    wallet, { programId: program }, { encoding: "jsonParsed", commitment: "confirmed" },
  ], (value) => parseTokenAccounts(value, wallet, program));
  const [balance, classic, token2022] = await Promise.all([
    readRpc("getBalance", [wallet, { commitment: "confirmed" }], parseBalance),
    readTokens(TOKEN_PROGRAMS[0]),
    readTokens(TOKEN_PROGRAMS[1]),
  ]);
  const reads = [balance, classic, token2022];
  const unavailableCount = reads.filter((read) => read.data === null).length;
  const message = unavailableCount === 0
    ? "Native SOL and both SPL token programs are live from Solana RPC."
    : `Solana inventory is incomplete: ${unavailableCount} of 3 required reads are unavailable. ${reads.filter((read) => read.data === null).map((read) => read.message).join(" ")}`;
  // An incomplete source must not contribute eligible P&L rows while its
  // unavailable valuation is excluded from wallet subtotals.
  if (unavailableCount > 0) return { data: null, state: { status: "unavailable", asOf: null, message } };

  const nativeInventory = balance.data === null ? null : {
    ...inventoryRow(SOL_MINT, balance.data, 9), symbol: "SOL", name: "Solana",
  };
  const inventory = [...(nativeInventory ? [nativeInventory] : []), ...(classic.data ?? []), ...(token2022.data ?? [])];
  // Native SOL uses the wrapped SOL mint in the existing wallet-token pricing
  // path. SPL token symbols/names remain honest mint labels when RPC supplies no metadata.
  let priced: NormalizedWalletTokenBalance[] = [];
  try { priced = await priceTokens(inventory); } catch { /* Keep every read balance unpriced. */ }
  const prices = new Map(priced.filter((token) => token.chainId === "solana"
    && typeof token.priceUsd === "number" && Number.isFinite(token.priceUsd) && token.priceUsd > 0)
    .map((token) => [token.contract, token.priceUsd]));
  const tokens = [...(classic.data ?? []), ...(token2022.data ?? [])].map((token): NormalizedWalletTokenBalance => ({
    chainId: token.chainId, chainName: token.chainName, symbol: token.symbol, name: token.name,
    contract: token.contract, amountRaw: token.amountRaw, decimals: token.decimals, amount: token.amount,
    priceUsd: prices.get(token.contract) ?? null,
  }));
  return {
    data: {
      native: nativeInventory ? [{
        chainId: "solana", chainName: "Solana", symbol: "SOL", amount: nativeInventory.amount,
        amountRaw: nativeInventory.amountRaw, priceUsd: prices.get(SOL_MINT) ?? null,
      }] : [],
      tokens,
    },
    state: { status: "live", asOf: new Date().toISOString(), message },
  };
}
