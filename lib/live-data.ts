/**
 * The single live-data boundary for PortManager.
 *
 * All pages consume getJoinedPortfolio(). Network payloads are normalised here,
 * all values are converted here, and every source fails independently so a
 * provider outage never prevents the rest of the portfolio from rendering.
 */

import { aggregatePnl, deriveOnchainPnl, deriveT212Pnl, type AcquisitionEvidence, type HoldingPnl, type PortfolioPnlTotals } from "./pnl";

import { isNeonConfigured } from "./assets-db";
import { recordPortfolioSnapshot } from "./pnl-history";

export type SourceStatus = "live" | "partial" | "unavailable";

export type LiveSourceState = {
  status: SourceStatus;
  asOf: string | null;
  message: string;
};

export type T212AccountSummary = {
  currency: string | null;
  cashAvailable: number | null;
  totalValue: number | null;
  investmentsCurrentValue: number | null;
};

export type NormalizedT212Position = {
  ticker: string;
  name: string;
  quantity: number;
  averagePrice: number | null;
  currentPrice: number | null;
  ppl: number | null;
  currency: string | null;
  pplCurrency: string | null;
  valueNative: number | null;
  valueAccount: number | null;
};

export type JoinedT212Position = NormalizedT212Position & HoldingPnl & {
  valueUsd: number | null;
  valueThb: number | null;
};

export type NftFloorHolding = {
  collection: string;
  collectionName: string;
  tokenCount: number;
  floorEth: number | null;
};

export type JoinedNftHolding = NftFloorHolding & HoldingPnl & {
  valueEth: number | null;
  valueUsd: number | null;
  valueThb: number | null;
};

export type NormalizedWalletNativeBalance = {
  /** Exact RPC base units, optional for backwards-compatible pure fixtures. */
  amountRaw?: string;
  chainId: number;
  chainName: string;
  symbol: string;
  amount: number;
};

export type WalletNativeHolding = NormalizedWalletNativeBalance & HoldingPnl & {
  valueUsd: number | null;
  valueThb: number | null;
};

export type NormalizedWalletTokenBalance = {
  chainId: number;
  chainName: string;
  symbol: string;
  name: string;
  contract?: string;
  amountRaw: string;
  decimals: number;
  amount: number;
  priceUsd: number | null;
};

export type WalletTokenHolding = NormalizedWalletTokenBalance & HoldingPnl & {
  valueUsd: number | null;
  valueThb: number | null;
  priced: boolean;
};

export type FiatRates = {
  usdToThb: number | null;
  gbpToThb: number | null;
  eurToThb: number | null;
  asOf: string | null;
};

export type FxRates = FiatRates & {
  ethToUsd: number | null;
};

export type JoinedPortfolio = {
  t212: {
    currency: string | null;
    cashAvailable: number | null;
    totalValue: number | null;
    investmentsCurrentValue: number | null;
    investments: JoinedT212Position[];
    asOf: string | null;
  };
  nfts: JoinedNftHolding[];
  wallet: {
    native: WalletNativeHolding[];
    tokens: WalletTokenHolding[];
  };
  fx: FxRates;
  totals: PortfolioPnlTotals & {
    t212Thb: number | null;
    nftsEth: number | null;
    nftsUsd: number | null;
    nftsThb: number | null;
    walletNativeUsd: number | null;
    walletNativeThb: number | null;
    walletTokensUsd: number | null;
    walletTokensThb: number | null;
    walletUsd: number | null;
    walletThb: number | null;
    grandTotalThb: number | null;
    grandTotalUsd: number | null;
  };
  sources: {
    t212Summary: LiveSourceState;
    t212Positions: LiveSourceState;
    nfts: LiveSourceState;
    fiatFx: LiveSourceState;
    ethPrice: LiveSourceState;
    walletNative: LiveSourceState;
    walletTokens: LiveSourceState;
  };
  asOf: string;
};

export type LiveResult<T> = {
  data: T | null;
  state: LiveSourceState;
};

export type JoinedPortfolioInputs = {
  /** Optional audited histories; balance-only fetchers do not manufacture this evidence.
   * Keys: nft:4663:<collection>, native:<chainId>:native, token:<chainId>:<lowercase contract>.
   */
  basisEvidence?: Readonly<Record<string, AcquisitionEvidence>>;
  t212Summary: LiveResult<T212AccountSummary>;
  t212Positions: LiveResult<NormalizedT212Position[]>;
  nfts: LiveResult<NftFloorHolding[]>;
  fiatFx: LiveResult<FiatRates>;
  ethPrice: LiveResult<number>;
  /** Optional only so existing pure-builder callers retain their pre-wallet result. */
  walletNative?: LiveResult<NormalizedWalletNativeBalance[]>;
  /** Optional only so existing pure-builder callers retain their pre-wallet result. */
  walletTokens?: LiveResult<NormalizedWalletTokenBalance[]>;
};

const DEFAULT_NFT_WALLET = "0xC1bd8020d08B2A1F98da54f1573A54412d99c609";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type WalletChain = {
  chainId: number;
  chainName: string;
  symbol: "ETH";
  rpcUrl: string;
  blockscoutUrl?: string;
  llamaChain: string;
  coinGeckoPlatform: string;
};

const WALLET_CHAINS: readonly WalletChain[] = Object.freeze([
  {
    chainId: 1,
    chainName: "Ethereum",
    symbol: "ETH",
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    blockscoutUrl: "https://eth.blockscout.com",
    llamaChain: "ethereum",
    coinGeckoPlatform: "ethereum",
  },
  {
    chainId: 8453,
    chainName: "Base",
    symbol: "ETH",
    rpcUrl: "https://mainnet.base.org",
    blockscoutUrl: "https://base.blockscout.com",
    llamaChain: "base",
    coinGeckoPlatform: "base",
  },
  {
    chainId: 42161,
    chainName: "Arbitrum One",
    symbol: "ETH",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    blockscoutUrl: "https://arbitrum.blockscout.com",
    llamaChain: "arbitrum",
    coinGeckoPlatform: "arbitrum-one",
  },
  {
    chainId: 4663,
    chainName: "Robinhood Chain",
    symbol: "ETH",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    llamaChain: "robinhood",
    coinGeckoPlatform: "robinhood",
  },
]);

type RhErc20RegistryEntry = {
  symbol: string;
  name: string;
  contract: string;
  decimals: number;
  priceCandidate: boolean;
};

/**
 * Static inventory metadata verified against robinhoodchain.blockscout.com on
 * 2026-09-03. The explorer is Cloudflare-walled from serverless hosts, so only
 * metadata is checked in; every balance and every price remains live data.
 */
export const RH_ERC20_REGISTRY_VERIFIED_AT = "2026-09-03";
export const RH_ERC20_REGISTRY_SOURCE_NOTE =
  "Operator-verified Robinhood Chain ERC-20 inventory; balances are fetched live by RPC.";
export const RH_ERC20_REGISTRY: readonly RhErc20RegistryEntry[] = Object.freeze([
  { symbol: "USDG", name: "Global Dollar", contract: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", decimals: 6, priceCandidate: true },
  { symbol: "GME", name: "GameStop • Robinhood Token", contract: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", decimals: 18, priceCandidate: true },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust • RH Token", contract: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", decimals: 18, priceCandidate: true },
  { symbol: "CRCL", name: "Circle Internet Group • RH Token", contract: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5", decimals: 18, priceCandidate: true },
  { symbol: "PLTR", name: "Palantir Technologies • RH Token", contract: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", decimals: 18, priceCandidate: true },
  { symbol: "AMZN", name: "Amazon • RH Token", contract: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", decimals: 18, priceCandidate: true },
  { symbol: "STACK", name: "STACKERS", contract: "0x1d5aAD3c0D6066078eA60F384a2492a550dB30b0", decimals: 18, priceCandidate: true },
  { symbol: "$BANDIT", name: "BANDIT", contract: "0xf90b2caabE33913bD16854093b934642057B1577", decimals: 18, priceCandidate: false },
  { symbol: "$BANDIT", name: "BANDIT", contract: "0x1FAc8E2efB8090b50b076A99369ed8DE7Ca51266", decimals: 18, priceCandidate: false },
  { symbol: "RAZORBILL", name: "The Razorbill", contract: "0x01Bb6Af9f3e03bF6A178Ca796A18FDd040A111bC", decimals: 18, priceCandidate: false },
  { symbol: "CROC", name: "Croc Cat", contract: "0x01C7bA09dA5C14d2F3ac74B1BEbA24ABAea7236f", decimals: 18, priceCandidate: false },
  { symbol: "Semen", name: "Semen People", contract: "0x00192589e3f943bF8EbB9a42e705e59507Be1769", decimals: 18, priceCandidate: false },
  { symbol: "USDG", name: "United States Global Dollar (imposter 18-dec contract)", contract: "0x5411257CedF60bC40F4beaD410BF8D02079056A2", decimals: 18, priceCandidate: false },
]);

const WALLET_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;
const RAW_AMOUNT_PATTERN = /^\d+$/;
const COINGECKO_REQUEST_INTERVAL_MS = 1_200;
const TOKEN_PRICE_TIMEOUT_MS = 4_000;
const MAX_COINGECKO_TOKEN_REQUESTS = 5;
const MAX_BLOCKSCOUT_PAGES = 20;
export const SNAPSHOT_TTL_MS = 30_000;

type JsonFetchResult =
  | { ok: true; data: unknown; asOf: string }
  | { ok: false; asOf: string; message: string; statusCode?: number };

function nowIso() {
  return new Date().toISOString();
}

function sourceState(
  status: SourceStatus,
  message: string,
  asOf: string | null = status === "unavailable" ? null : nowIso(),
): LiveSourceState {
  return { status, message, asOf };
}

function unavailable<T>(message: string): LiveResult<T> {
  return { data: null, state: sourceState("unavailable", message) };
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function currencyCode(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().toUpperCase();
}

function normaliseIsoTimestamp(value: unknown, fallback: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const fromUnix = new Date(value * 1000);
    if (!Number.isNaN(fromUnix.getTime())) return fromUnix.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback;
}

async function fetchJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 12_000,
): Promise<JsonFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const asOf = nowIso();

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, asOf, message: `Request unavailable (HTTP ${response.status}).`, statusCode: response.status };
    }
    try {
      return { ok: true, data: await response.json(), asOf: nowIso() };
    } catch {
      return { ok: false, asOf, message: "Provider returned an invalid response." };
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      asOf,
      message: timedOut ? "Provider request timed out." : "Provider request could not be completed.",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonRpc(
  url: string,
  method: "eth_getBalance" | "eth_call",
  params: unknown[],
  timeoutMs = 12_000,
): Promise<JsonFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const asOf = nowIso();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, asOf, message: `Request unavailable (HTTP ${response.status}).`, statusCode: response.status };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, asOf, message: "Provider returned an invalid JSON-RPC response." };
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, asOf, message: "Provider returned an invalid JSON-RPC response." };
    }
    const row = payload as Record<string, unknown>;
    if (row.error || !("result" in row)) {
      return { ok: false, asOf, message: "Provider returned a JSON-RPC error." };
    }
    return { ok: true, data: row.result, asOf: nowIso() };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      asOf,
      message: timedOut ? "Provider request timed out." : "Provider request could not be completed.",
    };
  } finally {
    clearTimeout(timer);
  }
}

function integerDecimals(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 && parsed <= 255 ? parsed : null;
}

/** Parse an exact base-unit integer without first coercing it through Number. */
export function amountFromRawUnits(rawValue: unknown, decimalsValue: unknown): number | null {
  if (typeof rawValue !== "string") return null;
  const raw = rawValue.trim();
  const decimals = integerDecimals(decimalsValue);
  if (!RAW_AMOUNT_PATTERN.test(raw) || decimals === null) return null;

  const canonical = raw.replace(/^0+(?=\d)/, "");
  const padded = canonical.padStart(decimals + 1, "0");
  const decimal = decimals === 0
    ? padded
    : `${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`;
  const amount = Number(decimal);
  if (!Number.isFinite(amount) || amount < 0) return null;
  // A positive balance too small for a JavaScript number must not become zero.
  if (amount === 0 && canonical !== "0") return null;
  return amount;
}

export function amountFromRpcHex(hexValue: unknown, decimals = 18): { amountRaw: string; amount: number } | null {
  if (typeof hexValue !== "string" || !HEX_QUANTITY_PATTERN.test(hexValue)) return null;
  try {
    const amountRaw = BigInt(hexValue).toString(10);
    const amount = amountFromRawUnits(amountRaw, decimals);
    return amount === null ? null : { amountRaw, amount };
  } catch {
    return null;
  }
}

function getT212Auth(): { baseUrl: string; headers: Record<string, string> } | null {
  const key = process.env.T212_API_KEY;
  const secret = process.env.T212_API_SECRET;
  if (!key || !secret) return null;

  const baseUrl = (process.env.T212_BASE_URL || "https://live.trading212.com/api/v0").replace(/\/$/, "");
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  return { baseUrl, headers: { Authorization: `Basic ${auth}` } };
}

function parseT212Summary(payload: unknown, asOf: string): LiveResult<T212AccountSummary> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return unavailable("Trading 212 account summary returned an invalid response.");
  }

  const row = payload as Record<string, unknown>;
  const cash = row.cash && typeof row.cash === "object" ? row.cash as Record<string, unknown> : {};
  const investments = row.investments && typeof row.investments === "object"
    ? row.investments as Record<string, unknown>
    : {};
  const data: T212AccountSummary = {
    currency: currencyCode(row.currency),
    cashAvailable: nonNegativeNumber(cash.availableToTrade),
    totalValue: nonNegativeNumber(row.totalValue),
    investmentsCurrentValue: nonNegativeNumber(investments.currentValue),
  };
  const missing = Object.values(data).filter((value) => value === null).length;

  return {
    data,
    state: sourceState(
      missing === 0 ? "live" : "partial",
      missing === 0 ? "Trading 212 account summary is live." : "Trading 212 summary is missing one or more values.",
      asOf,
    ),
  };
}

/** Current Trading 212 schema first, with compatibility for its retired flat schema. */
export function normalizeT212Positions(
  payload: unknown,
  accountCurrency: string | null,
  asOf = nowIso(),
): LiveResult<NormalizedT212Position[]> {
  if (!Array.isArray(payload)) {
    return unavailable("Trading 212 positions returned an invalid response.");
  }

  let ignored = 0;
  const positions: NormalizedT212Position[] = [];

  for (const item of payload) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      ignored += 1;
      continue;
    }

    const row = item as Record<string, unknown>;
    const instrument = row.instrument && typeof row.instrument === "object"
      ? row.instrument as Record<string, unknown>
      : {};
    const walletImpact = row.walletImpact && typeof row.walletImpact === "object"
      ? row.walletImpact as Record<string, unknown>
      : {};
    const tickerValue = instrument.ticker ?? row.ticker;
    const quantity = positiveNumber(row.quantity);
    if (typeof tickerValue !== "string" || !tickerValue.trim() || quantity === null) {
      ignored += 1;
      continue;
    }

    const ticker = tickerValue.trim();
    const currentPrice = nonNegativeNumber(row.currentPrice);
    const nativeCurrency = currencyCode(instrument.currency ?? row.currencyCode ?? row.pplCurrency);
    const walletCurrency = currencyCode(walletImpact.currency ?? row.pplCurrency ?? accountCurrency);
    const nameValue = instrument.name ?? row.name;

    positions.push({
      ticker,
      name: typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : ticker,
      quantity,
      averagePrice: nonNegativeNumber(row.averagePricePaid ?? row.averagePrice),
      currentPrice,
      ppl: finiteNumber(walletImpact.unrealizedProfitLoss ?? row.ppl),
      currency: nativeCurrency,
      pplCurrency: walletCurrency,
      valueNative: currentPrice === null ? null : currentPrice * quantity,
      valueAccount: nonNegativeNumber(walletImpact.currentValue),
    });
  }

  return {
    data: positions,
    state: sourceState(
      ignored === 0 ? "live" : "partial",
      ignored === 0
        ? "Trading 212 positions are live."
        : `${ignored} malformed Trading 212 position${ignored === 1 ? " was" : "s were"} ignored.`,
      asOf,
    ),
  };
}

async function fetchT212Sources(): Promise<{
  summary: LiveResult<T212AccountSummary>;
  positions: LiveResult<NormalizedT212Position[]>;
}> {
  const auth = getT212Auth();
  if (!auth) {
    return {
      summary: unavailable("Trading 212 API credentials are not configured."),
      positions: unavailable("Trading 212 API credentials are not configured."),
    };
  }

  const [summaryResponse, positionsResponse] = await Promise.all([
    fetchJson(`${auth.baseUrl}/equity/account/summary`, auth.headers),
    fetchJson(`${auth.baseUrl}/equity/positions`, auth.headers),
  ]);

  const summary = summaryResponse.ok
    ? parseT212Summary(summaryResponse.data, summaryResponse.asOf)
    : unavailable<T212AccountSummary>(summaryResponse.message);
  const accountCurrency = summary.data?.currency ?? null;
  const positions = positionsResponse.ok
    ? normalizeT212Positions(positionsResponse.data, accountCurrency, positionsResponse.asOf)
    : unavailable<NormalizedT212Position[]>(positionsResponse.message);

  return { summary, positions };
}

function collectionNameFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || slug;
}

async function fetchNftSource(): Promise<LiveResult<NftFloorHolding[]>> {
  const key = process.env.OPENSEA_API_KEY;
  if (!key) return unavailable("OpenSea API credentials are not configured.");

  const wallet = process.env.NFT_WALLET || DEFAULT_NFT_WALLET;
  const walletResponse = await fetchJson(
    `https://api.opensea.io/api/v2/chain/robinhood/account/${wallet}/nfts?limit=200`,
    { "X-API-KEY": key },
  );
  if (!walletResponse.ok) return unavailable(walletResponse.message);

  const response = walletResponse.data as { nfts?: unknown; next?: unknown } | null;
  if (!response || !Array.isArray(response.nfts)) {
    return unavailable("OpenSea wallet holdings returned an invalid response.");
  }

  const counts = new Map<string, number>();
  let ignoredNfts = 0;
  for (const nft of response.nfts) {
    if (!nft || typeof nft !== "object" || Array.isArray(nft)) {
      ignoredNfts += 1;
      continue;
    }
    const slug = (nft as Record<string, unknown>).collection;
    if (typeof slug !== "string" || !slug.trim()) {
      ignoredNfts += 1;
      continue;
    }
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  const holdings = await Promise.all(
    [...counts.entries()].map(async ([collection, tokenCount]): Promise<NftFloorHolding> => {
      const stats = await fetchJson(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(collection)}/stats`, {
        "X-API-KEY": key,
      });
      if (!stats.ok || !stats.data || typeof stats.data !== "object") {
        return { collection, collectionName: collectionNameFromSlug(collection), tokenCount, floorEth: null };
      }
      const row = stats.data as Record<string, unknown>;
      const total = row.total && typeof row.total === "object" ? row.total as Record<string, unknown> : {};
      const collectionData = row.collection && typeof row.collection === "object"
        ? row.collection as Record<string, unknown>
        : {};
      const liveName = typeof row.name === "string"
        ? row.name
        : typeof collectionData.name === "string"
          ? collectionData.name
          : null;
      return {
        collection,
        collectionName: liveName?.trim() || collectionNameFromSlug(collection),
        tokenCount,
        floorEth: nonNegativeNumber(total.floor_price),
      };
    }),
  );

  const missingFloors = holdings.filter((holding) => holding.floorEth === null).length;
  const paginationIncomplete = typeof response.next === "string" && response.next.length > 0;
  const partial = missingFloors > 0 || paginationIncomplete || ignoredNfts > 0;
  const details = [
    missingFloors > 0 ? `${missingFloors} collection floor${missingFloors === 1 ? " is" : "s are"} unavailable.` : "",
    ignoredNfts > 0 ? `${ignoredNfts} wallet item${ignoredNfts === 1 ? " was" : "s were"} missing collection metadata.` : "",
    paginationIncomplete ? "The wallet contains more than 200 NFTs; this snapshot is partial." : "",
  ].filter(Boolean).join(" ");

  return {
    data: holdings.sort((a, b) => (b.floorEth ?? -1) * b.tokenCount - (a.floorEth ?? -1) * a.tokenCount),
    state: sourceState(partial ? "partial" : "live", details || "OpenSea wallet holdings and floors are live.", walletResponse.asOf),
  };
}

async function fetchFiatFxSource(): Promise<LiveResult<FiatRates>> {
  const response = await fetchJson("https://open.er-api.com/v6/latest/USD");
  if (!response.ok) return unavailable(response.message);

  const payload = response.data as { rates?: unknown; time_last_update_utc?: unknown; time_last_update_unix?: unknown } | null;
  const rawRates = payload?.rates;
  if (!rawRates || typeof rawRates !== "object" || Array.isArray(rawRates)) {
    return unavailable("The live fiat-rate provider returned an invalid response.");
  }

  const rates = rawRates as Record<string, unknown>;
  const usdToThb = positiveNumber(rates.THB);
  if (usdToThb === null) return unavailable("USD/THB is unavailable from the live fiat-rate provider.");
  const usdToGbp = positiveNumber(rates.GBP);
  const usdToEur = positiveNumber(rates.EUR);
  const providerAsOf = normaliseIsoTimestamp(payload?.time_last_update_unix ?? payload?.time_last_update_utc, response.asOf);
  const data: FiatRates = {
    usdToThb,
    gbpToThb: usdToGbp === null ? null : usdToThb / usdToGbp,
    eurToThb: usdToEur === null ? null : usdToThb / usdToEur,
    asOf: providerAsOf,
  };
  const partial = data.gbpToThb === null || data.eurToThb === null;

  return {
    data,
    state: sourceState(
      partial ? "partial" : "live",
      partial ? "One or more fiat crosses are unavailable." : "Fiat rates are live from open.er-api.com.",
      providerAsOf,
    ),
  };
}

async function fetchEthPriceSource(): Promise<LiveResult<number>> {
  const response = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
  if (!response.ok) return unavailable(response.message);

  const payload = response.data as { ethereum?: { usd?: unknown } } | null;
  const price = positiveNumber(payload?.ethereum?.usd);
  if (price === null) return unavailable("ETH/USD is unavailable from CoinGecko.");
  return { data: price, state: sourceState("live", "ETH/USD is live from CoinGecko.", response.asOf) };
}

type WalletTokenInventoryRow = Omit<NormalizedWalletTokenBalance, "priceUsd" | "contract"> & {
  contract: string;
  priceHintUsd: number | null;
  priceCandidate: boolean;
  llamaChain: string;
  coinGeckoPlatform: string;
};

const BLOCKSCOUT_CHAINS = WALLET_CHAINS.filter(
  (chain): chain is WalletChain & { blockscoutUrl: string } => typeof chain.blockscoutUrl === "string",
);

function tokenKey(chainId: number, contract: string): string {
  return `${chainId}:${contract.toLowerCase()}`;
}

async function fetchWalletNativeSource(wallet: string): Promise<LiveResult<NormalizedWalletNativeBalance[]>> {
  if (!WALLET_ADDRESS_PATTERN.test(wallet)) return unavailable("The configured EVM wallet address is invalid.");

  const results = await Promise.all(WALLET_CHAINS.map(async (chain): Promise<{
    row: NormalizedWalletNativeBalance | null;
    asOf: string | null;
  }> => {
    const response = await fetchJsonRpc(chain.rpcUrl, "eth_getBalance", [wallet, "latest"]);
    if (!response.ok) return { row: null, asOf: null };
    const parsed = amountFromRpcHex(response.data);
    if (!parsed) return { row: null, asOf: null };
    return {
      row: {
        chainId: chain.chainId,
        chainName: chain.chainName,
        symbol: chain.symbol,
        amount: parsed.amount,
        amountRaw: parsed.amountRaw,
      } satisfies NormalizedWalletNativeBalance,
      asOf: response.asOf,
    };
  }));

  const balances = results
    .map((result) => result.row)
    .filter((row): row is NormalizedWalletNativeBalance => row !== null);
  const failed = WALLET_CHAINS.length - balances.length;
  if (balances.length === 0) return unavailable("Native wallet balances are unavailable from every configured RPC.");

  return {
    data: balances,
    state: sourceState(
      failed === 0 ? "live" : "partial",
      failed === 0
        ? "Native wallet balances are live from four chain RPCs."
        : `${failed} of ${WALLET_CHAINS.length} native chain balance${failed === 1 ? " is" : "s are"} unavailable.`,
      latestTimestamp(results.map((result) => result.asOf)),
    ),
  };
}

async function fetchBlockscoutTokenInventory(
  chain: WalletChain & { blockscoutUrl: string },
  wallet: string,
): Promise<LiveResult<WalletTokenInventoryRow[]>> {
  const endpoint = `${chain.blockscoutUrl}/api/v2/addresses/${wallet}/tokens`;
  let nextUrl: string | null = `${endpoint}?type=ERC-20`;
  let asOf: string | null = null;
  let ignored = 0;
  let pages = 0;
  let paginationIssue = "";
  const tokens: WalletTokenInventoryRow[] = [];
  const seenUrls = new Set<string>();

  while (nextUrl !== null) {
    if (seenUrls.has(nextUrl)) {
      paginationIssue = `${chain.chainName}: Blockscout repeated a pagination cursor.`;
      break;
    }
    seenUrls.add(nextUrl);

    const response = await fetchJson(nextUrl);
    if (!response.ok) {
      if (pages === 0) return unavailable(`${chain.chainName}: ${response.message}`);
      paginationIssue = `${chain.chainName}: a later Blockscout page was unavailable. ${response.message}`;
      break;
    }
    if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
      if (pages === 0) return unavailable(`${chain.chainName} token inventory returned an invalid response.`);
      paginationIssue = `${chain.chainName}: a later Blockscout page returned an invalid response.`;
      break;
    }

    const payload = response.data as Record<string, unknown>;
    if (!Array.isArray(payload.items)) {
      if (pages === 0) return unavailable(`${chain.chainName} token inventory returned an invalid response.`);
      paginationIssue = `${chain.chainName}: a later Blockscout page returned an invalid item list.`;
      break;
    }
    pages += 1;
    asOf = latestTimestamp([asOf, response.asOf]);

    for (const item of payload.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        ignored += 1;
        continue;
      }
      const itemRow = item as Record<string, unknown>;
      const token = itemRow.token;
      if (!token || typeof token !== "object" || Array.isArray(token)) {
        ignored += 1;
        continue;
      }
      const tokenRow = token as Record<string, unknown>;
      const contract = typeof tokenRow.address_hash === "string" ? tokenRow.address_hash.trim() : "";
      const symbol = typeof tokenRow.symbol === "string" ? tokenRow.symbol.trim() : "";
      const name = typeof tokenRow.name === "string" ? tokenRow.name.trim() : "";
      const decimals = integerDecimals(tokenRow.decimals);
      const raw = typeof itemRow.value === "string" ? itemRow.value.trim() : "";
      const amount = amountFromRawUnits(raw, decimals);

      if (!WALLET_ADDRESS_PATTERN.test(contract) || !symbol || !name || decimals === null || amount === null) {
        ignored += 1;
        continue;
      }
      if (raw.replace(/^0+(?=\d)/, "") === "0") continue;

      tokens.push({
        chainId: chain.chainId,
        chainName: chain.chainName,
        symbol,
        name,
        contract,
        amountRaw: raw.replace(/^0+(?=\d)/, ""),
        decimals,
        amount,
        priceHintUsd: positiveNumber(tokenRow.exchange_rate),
        priceCandidate: true,
        llamaChain: chain.llamaChain,
        coinGeckoPlatform: chain.coinGeckoPlatform,
      });
    }

    const nextPage = payload.next_page_params;
    if (nextPage === null || nextPage === undefined) {
      nextUrl = null;
      continue;
    }
    if (pages >= MAX_BLOCKSCOUT_PAGES) {
      paginationIssue = `${chain.chainName}: Blockscout inventory exceeded the ${MAX_BLOCKSCOUT_PAGES}-page safety limit.`;
      break;
    }
    if (!nextPage || typeof nextPage !== "object" || Array.isArray(nextPage)) {
      paginationIssue = `${chain.chainName}: Blockscout returned an invalid pagination cursor.`;
      break;
    }

    const params = new URLSearchParams({ type: "ERC-20" });
    let cursorFields = 0;
    for (const [key, value] of Object.entries(nextPage as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        params.set(key, String(value));
        cursorFields += 1;
      }
    }
    if (cursorFields === 0) {
      paginationIssue = `${chain.chainName}: Blockscout returned an empty pagination cursor.`;
      break;
    }
    nextUrl = `${endpoint}?${params.toString()}`;
  }

  const partial = ignored > 0 || Boolean(paginationIssue);
  const details = [
    ignored > 0 ? `${ignored} malformed token row${ignored === 1 ? " was" : "s were"} ignored.` : "",
    paginationIssue,
  ].filter(Boolean).join(" ");
  return {
    data: tokens,
    state: sourceState(
      partial ? "partial" : "live",
      details || `${chain.chainName} ERC-20 inventory is live from Blockscout.`,
      asOf,
    ),
  };
}

async function fetchRhTokenInventory(wallet: string): Promise<LiveResult<WalletTokenInventoryRow[]>> {
  if (!WALLET_ADDRESS_PATTERN.test(wallet)) return unavailable("The configured EVM wallet address is invalid.");
  const chain = WALLET_CHAINS.find((candidate) => candidate.chainId === 4663);
  if (!chain) return unavailable("Robinhood Chain configuration is unavailable.");
  const balanceOfData = `0x70a08231${wallet.slice(2).toLowerCase().padStart(64, "0")}`;

  const results = await Promise.all(RH_ERC20_REGISTRY.map(async (entry): Promise<{
    row: WalletTokenInventoryRow | null;
    asOf: string | null;
    succeeded: boolean;
  }> => {
    const response = await fetchJsonRpc(
      chain.rpcUrl,
      "eth_call",
      [{ to: entry.contract, data: balanceOfData }, "latest"],
    );
    if (!response.ok) return { row: null, asOf: null, succeeded: false };
    const parsed = amountFromRpcHex(response.data, entry.decimals);
    if (!parsed) return { row: null, asOf: null, succeeded: false };
    if (parsed.amountRaw === "0") return { row: null, asOf: response.asOf, succeeded: true };
    return {
      row: {
        chainId: chain.chainId,
        chainName: chain.chainName,
        symbol: entry.symbol,
        name: entry.name,
        contract: entry.contract,
        amountRaw: parsed.amountRaw,
        decimals: entry.decimals,
        amount: parsed.amount,
        priceHintUsd: null,
        priceCandidate: entry.priceCandidate,
        llamaChain: chain.llamaChain,
        coinGeckoPlatform: chain.coinGeckoPlatform,
      } satisfies WalletTokenInventoryRow,
      asOf: response.asOf,
      succeeded: true,
    };
  }));

  const succeeded = results.filter((result) => result.succeeded).length;
  if (succeeded === 0) return unavailable("Robinhood Chain token balances are unavailable from RPC.");
  const failed = RH_ERC20_REGISTRY.length - succeeded;
  const tokens = results
    .map((result) => result.row)
    .filter((row): row is WalletTokenInventoryRow => row !== null);
  return {
    data: tokens,
    state: sourceState(
      failed === 0 ? "live" : "partial",
      failed === 0
        ? "Robinhood Chain ERC-20 balances are live from RPC."
        : `${failed} Robinhood Chain token balance${failed === 1 ? " is" : "s are"} unavailable.`,
      latestTimestamp(results.map((result) => result.asOf)),
    ),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWalletTokenSource(wallet: string): Promise<LiveResult<NormalizedWalletTokenBalance[]>> {
  if (!WALLET_ADDRESS_PATTERN.test(wallet)) return unavailable("The configured EVM wallet address is invalid.");
  const inventoryResults = await Promise.all([
    ...BLOCKSCOUT_CHAINS.map((chain) => fetchBlockscoutTokenInventory(chain, wallet)),
    fetchRhTokenInventory(wallet),
  ]);
  const availableInventories = inventoryResults.filter((result) => result.data !== null);
  if (availableInventories.length === 0) {
    return unavailable("ERC-20 wallet inventory is unavailable on every configured chain.");
  }

  const deduped = new Map<string, WalletTokenInventoryRow>();
  for (const result of availableInventories) {
    for (const token of result.data ?? []) {
      const key = tokenKey(token.chainId, token.contract);
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, token);
      } else if (existing.priceHintUsd === null && token.priceHintUsd !== null) {
        deduped.set(key, { ...existing, priceHintUsd: token.priceHintUsd });
      }
    }
  }
  const inventory = [...deduped.values()];
  const prices = new Map<string, number>();
  const pricingTimestamps: string[] = [];
  const explorerHintKeys = new Set<string>();
  const verifiedExplorerHintKeys = new Set<string>();
  for (const token of inventory) {
    if (token.priceHintUsd !== null) {
      const key = tokenKey(token.chainId, token.contract);
      prices.set(key, token.priceHintUsd);
      explorerHintKeys.add(key);
    }
  }

  // Query the full candidate set once: missing prices can use DefiLlama, while
  // Blockscout hints retain precedence but still receive an independent check.
  const llamaCandidates = inventory.filter((token) => token.priceCandidate);
  if (llamaCandidates.length > 0) {
    const identifiers = llamaCandidates.map((token) => `${token.llamaChain}:${token.contract}`).join(",");
    const response = await fetchJson(`https://coins.llama.fi/prices/current/${identifiers}`);
    if (response.ok && response.data && typeof response.data === "object" && !Array.isArray(response.data)) {
      const coinsValue = (response.data as Record<string, unknown>).coins;
      if (coinsValue && typeof coinsValue === "object" && !Array.isArray(coinsValue)) {
        const coins = new Map(
          Object.entries(coinsValue as Record<string, unknown>).map(([key, value]) => [key.toLowerCase(), value]),
        );
        for (const token of llamaCandidates) {
          const value = coins.get(`${token.llamaChain}:${token.contract}`.toLowerCase());
          const price = value && typeof value === "object" && !Array.isArray(value)
            ? positiveNumber((value as Record<string, unknown>).price)
            : null;
          if (price !== null) {
            const key = tokenKey(token.chainId, token.contract);
            if (explorerHintKeys.has(key)) {
              verifiedExplorerHintKeys.add(key);
            } else {
              prices.set(key, price);
            }
          }
        }
        pricingTimestamps.push(response.asOf);
      }
    }
  }

  const coinGeckoCandidates = inventory
    .filter((token) => token.priceCandidate && !prices.has(tokenKey(token.chainId, token.contract)))
    // Preserve scarce free-tier calls for the registry's verified price
    // candidates before probing dynamic tokens with no known market.
    .sort((left, right) => Number(right.chainId === 4663) - Number(left.chainId === 4663));
  for (
    let index = 0;
    index < coinGeckoCandidates.length && index < MAX_COINGECKO_TOKEN_REQUESTS;
    index += 1
  ) {
    if (index > 0) await delay(COINGECKO_REQUEST_INTERVAL_MS);
    const token = coinGeckoCandidates[index];
    const response = await fetchJson(
      `https://api.coingecko.com/api/v3/simple/token_price/${token.coinGeckoPlatform}`
        + `?contract_addresses=${encodeURIComponent(token.contract)}&vs_currencies=usd`,
      {},
      TOKEN_PRICE_TIMEOUT_MS,
    );
    if (!response.ok) {
      // A rate limit, network/timeout failure, or server error is provider-wide;
      // stop this snapshot instead of serially compounding the outage.
      if (response.statusCode === 429 || response.statusCode === undefined || response.statusCode >= 500) break;
      continue;
    }
    pricingTimestamps.push(response.asOf);
    if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) continue;
    const match = Object.entries(response.data as Record<string, unknown>)
      .find(([contract]) => contract.toLowerCase() === token.contract.toLowerCase());
    const price = match?.[1] && typeof match[1] === "object" && !Array.isArray(match[1])
      ? positiveNumber((match[1] as Record<string, unknown>).usd)
      : null;
    if (price !== null) prices.set(tokenKey(token.chainId, token.contract), price);
  }

  const tokens = inventory.map((token): NormalizedWalletTokenBalance => ({
    chainId: token.chainId,
    chainName: token.chainName,
    symbol: token.symbol,
    name: token.name,
    contract: token.contract,
    amountRaw: token.amountRaw,
    decimals: token.decimals,
    amount: token.amount,
    priceUsd: prices.get(tokenKey(token.chainId, token.contract)) ?? null,
  }));
  const unpriced = tokens.filter((token) => token.priceUsd === null).length;
  const unverifiedExplorerHints = explorerHintKeys.size - verifiedExplorerHintKeys.size;
  const inventoryPartial = inventoryResults.some((result) => result.state.status !== "live");
  const partial = inventoryPartial || unpriced > 0 || unverifiedExplorerHints > 0;
  const inventoryAsOf = latestTimestamp(inventoryResults.map((result) => result.state.asOf));
  const asOf = latestTimestamp([inventoryAsOf, ...pricingTimestamps]);
  const coverage = `${availableInventories.length} of ${inventoryResults.length} chain inventories responded.`;
  const inventoryMessages = inventoryResults
    .filter((result) => result.state.status !== "live")
    .map((result) => result.state.message)
    .join(" ");
  const priceMessage = unpriced > 0
    ? ` ${unpriced} token${unpriced === 1 ? " is" : "s are"} unpriced and excluded from totals.`
    : " Token prices are live.";
  const verificationMessage = unverifiedExplorerHints > 0
    ? ` ${unverifiedExplorerHints} Blockscout price hint${unverifiedExplorerHints === 1 ? "" : "s"} could not be independently checked.`
    : explorerHintKeys.size > 0
      ? ` ${explorerHintKeys.size} Blockscout price hint${explorerHintKeys.size === 1 ? " was" : "s were"} cross-checked with DefiLlama.`
      : "";

  return {
    data: tokens,
    state: sourceState(
      partial ? "partial" : "live",
      `${coverage}${priceMessage}${verificationMessage}${inventoryMessages ? ` ${inventoryMessages}` : ""}`,
      asOf,
    ),
  };
}

function rateToThb(currency: string | null, fx: FiatRates | null): number | null {
  if (!currency) return null;
  if (currency === "THB") return 1;
  if (!fx) return null;
  if (currency === "USD") return fx.usdToThb;
  if (currency === "GBP") return fx.gbpToThb;
  if (currency === "EUR") return fx.eurToThb;
  return null;
}

function convertAmount(amount: number | null, rate: number | null): number | null {
  if (amount === null) return null;
  if (amount === 0) return 0;
  return rate === null ? null : amount * rate;
}

function sumComplete(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((sum, value) => sum + (value as number), 0);
}

function pricedSubtotal<T>(
  rows: T[],
  state: LiveSourceState,
  amountOf: (row: T) => number,
  valueOf: (row: T) => number | null,
): number | null {
  const positiveRows = rows.filter((row) => amountOf(row) > 0);
  if (positiveRows.length === 0) return state.status === "live" ? 0 : null;
  const pricedValues = positiveRows
    .map(valueOf)
    .filter((value): value is number => value !== null);
  return pricedValues.length > 0
    ? pricedValues.reduce((sum, value) => sum + value, 0)
    : null;
}

function combineWalletSubtotals(first: number | null, second: number | null): number | null {
  if (first === 0 && second === 0) return 0;
  const known = [first, second].filter((value): value is number => value !== null);
  // A lone known zero must not disguise an unavailable or wholly unpriced source.
  if (!known.some((value) => value > 0)) return null;
  return known.reduce((sum, value) => sum + value, 0);
}

function latestTimestamp(values: Array<string | null>): string | null {
  const valid = values
    .filter((value): value is string => Boolean(value) && !Number.isNaN(new Date(value as string).getTime()))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return valid[0] ?? null;
}

/** Pure assembly function used by getJoinedPortfolio and deterministic unit tests. */
export function buildJoinedPortfolio(inputs: JoinedPortfolioInputs, asOf: string): JoinedPortfolio {
  const summary = inputs.t212Summary.data;
  const fiatFx = inputs.fiatFx.data;
  const ethToUsd = inputs.ethPrice.data;
  const accountCurrency = summary?.currency ?? null;
  const walletWasProvided = inputs.walletNative !== undefined || inputs.walletTokens !== undefined;
  const walletNativeState = inputs.walletNative?.state ?? {
    status: "unavailable",
    asOf: null,
    message: "Native wallet balances were not included in this snapshot.",
  } satisfies LiveSourceState;
  const walletTokenState = inputs.walletTokens?.state ?? {
    status: "unavailable",
    asOf: null,
    message: "Wallet token balances were not included in this snapshot.",
  } satisfies LiveSourceState;

  const investments = (inputs.t212Positions.data ?? []).map((position): JoinedT212Position => {
    const accountValue = position.valueAccount;
    const valueThb = accountValue !== null
      ? convertAmount(accountValue, rateToThb(position.pplCurrency ?? accountCurrency, fiatFx))
      : convertAmount(position.valueNative, rateToThb(position.currency, fiatFx));
    return { ...position, valueThb, ...deriveT212Pnl(position, fiatFx, accountCurrency) };
  });

  const nfts = (inputs.nfts.data ?? []).map((holding): JoinedNftHolding => {
    const valueEth = holding.floorEth === null ? null : holding.floorEth * holding.tokenCount;
    const valueUsd = valueEth === 0 ? 0 : convertAmount(valueEth, ethToUsd);
    const valueThb = valueUsd === 0 ? 0 : convertAmount(valueUsd, fiatFx?.usdToThb ?? null);
    return { ...holding, valueEth, valueUsd, valueThb, ...deriveOnchainPnl({
      asOf, kind: "nft", chainId: 4663, assetId: holding.collection,
      quantityRaw: String(holding.tokenCount), decimals: 0, valueUsd,
    }, fiatFx?.usdToThb ?? null, inputs.basisEvidence?.[`nft:4663:${holding.collection}`]) };
  });

  const walletNative = (inputs.walletNative?.data ?? []).map((balance): WalletNativeHolding => {
    const valueUsd = convertAmount(balance.amount, ethToUsd);
    const valueThb = convertAmount(valueUsd, fiatFx?.usdToThb ?? null);
    return { ...balance, valueUsd, valueThb, ...deriveOnchainPnl({
      asOf, kind: "native", chainId: balance.chainId, assetId: "native",
      // Never reconstruct exact units from a floating-point balance.
      quantityRaw: balance.amountRaw ?? "", decimals: 18, valueUsd,
    }, fiatFx?.usdToThb ?? null, inputs.basisEvidence?.[`native:${balance.chainId}:native`]) };
  });

  const walletTokens = (inputs.walletTokens?.data ?? []).map((token): WalletTokenHolding => {
    const priced = token.priceUsd !== null;
    const valueUsd = priced ? token.amount * (token.priceUsd as number) : null;
    const valueThb = convertAmount(valueUsd, fiatFx?.usdToThb ?? null);
    return { ...token, valueUsd, valueThb, priced, ...deriveOnchainPnl({
      asOf, kind: "token", chainId: token.chainId, assetId: token.contract ?? "",
      quantityRaw: token.amountRaw, decimals: token.decimals, valueUsd,
    }, fiatFx?.usdToThb ?? null, token.contract ? inputs.basisEvidence?.[`token:${token.chainId}:${token.contract.toLowerCase()}`] : undefined) };
  });

  const nftsEth = inputs.nfts.data === null || inputs.nfts.state.status === "partial"
    ? null
    : sumComplete(nfts.map((holding) => holding.valueEth));
  const nftsUsd = nftsEth === 0 ? 0 : convertAmount(nftsEth, ethToUsd);
  const nftsThb = nftsUsd === 0 ? 0 : convertAmount(nftsUsd, fiatFx?.usdToThb ?? null);
  const t212Thb = convertAmount(summary?.totalValue ?? null, rateToThb(accountCurrency, fiatFx));
  const walletNativeUsd = inputs.walletNative?.data === null
    ? null
    : pricedSubtotal(walletNative, walletNativeState, (row) => row.amount, (row) => row.valueUsd);
  const walletNativeThb = inputs.walletNative?.data === null
    ? null
    : pricedSubtotal(walletNative, walletNativeState, (row) => row.amount, (row) => row.valueThb);
  const walletTokensUsd = inputs.walletTokens?.data === null
    ? null
    : pricedSubtotal(walletTokens, walletTokenState, (row) => row.amount, (row) => row.valueUsd);
  const walletTokensThb = inputs.walletTokens?.data === null
    ? null
    : pricedSubtotal(walletTokens, walletTokenState, (row) => row.amount, (row) => row.valueThb);
  const walletUsd = combineWalletSubtotals(walletNativeUsd, walletTokensUsd);
  const walletThb = combineWalletSubtotals(walletNativeThb, walletTokensThb);
  const legacyGrandTotalThb = sumComplete([t212Thb, nftsThb]);
  const grandTotalThb = walletWasProvided
    ? sumComplete([legacyGrandTotalThb, walletThb])
    : legacyGrandTotalThb;
  const grandTotalUsd = grandTotalThb === 0
    ? 0
    : convertAmount(grandTotalThb, fiatFx?.usdToThb ? 1 / fiatFx.usdToThb : null);

  return {
    t212: {
      currency: accountCurrency,
      cashAvailable: summary?.cashAvailable ?? null,
      totalValue: summary?.totalValue ?? null,
      investmentsCurrentValue: summary?.investmentsCurrentValue ?? null,
      investments,
      asOf: latestTimestamp([inputs.t212Summary.state.asOf, inputs.t212Positions.state.asOf]),
    },
    nfts,
    wallet: { native: walletNative, tokens: walletTokens },
    fx: {
      usdToThb: fiatFx?.usdToThb ?? null,
      gbpToThb: fiatFx?.gbpToThb ?? null,
      eurToThb: fiatFx?.eurToThb ?? null,
      ethToUsd,
      asOf: fiatFx?.asOf ?? inputs.fiatFx.state.asOf,
    },
    totals: {
      ...aggregatePnl({
        t212: { holdings: investments, sourceComplete: inputs.t212Positions.data !== null && inputs.t212Positions.state.status === "live" },
        nfts: { holdings: nfts, sourceComplete: inputs.nfts.data !== null && inputs.nfts.state.status === "live" },
        walletNative: { holdings: walletNative, sourceComplete: inputs.walletNative?.data != null && walletNativeState.status === "live" },
        walletTokens: { holdings: walletTokens, sourceComplete: inputs.walletTokens?.data != null && walletTokenState.status === "live" },
      }, fiatFx?.usdToThb ?? null, grandTotalUsd !== null && grandTotalThb !== null
        && inputs.t212Summary.state.status === "live" && inputs.fiatFx.state.status === "live" && inputs.ethPrice.state.status === "live"),
      t212Thb,
      nftsEth,
      nftsUsd,
      nftsThb,
      walletNativeUsd,
      walletNativeThb,
      walletTokensUsd,
      walletTokensThb,
      walletUsd,
      walletThb,
      grandTotalThb,
      grandTotalUsd,
    },
    sources: {
      t212Summary: inputs.t212Summary.state,
      t212Positions: inputs.t212Positions.state,
      nfts: inputs.nfts.state,
      fiatFx: inputs.fiatFx.state,
      ethPrice: inputs.ethPrice.state,
      walletNative: walletNativeState,
      walletTokens: walletTokenState,
    },
    asOf,
  };
}

type FetchedPortfolioSnapshot = {
  inputs: JoinedPortfolioInputs;
  asOf: string;
};

export type SnapshotOptions = {
  now?: () => number;
  ttlMs?: number;
};

let completedSnapshot: { value: FetchedPortfolioSnapshot; expiresAt: number } | null = null;
let inFlightSnapshot: Promise<FetchedPortfolioSnapshot> | null = null;
let snapshotGeneration = 0;

async function fetchPortfolioSnapshot(asOf: string): Promise<FetchedPortfolioSnapshot> {
  const wallet = process.env.NFT_WALLET || DEFAULT_NFT_WALLET;
  const [t212, nfts, fiatFx, ethPrice, walletNative, walletTokens] = await Promise.all([
    fetchT212Sources(),
    fetchNftSource(),
    fetchFiatFxSource(),
    fetchEthPriceSource(),
    fetchWalletNativeSource(wallet),
    fetchWalletTokenSource(wallet),
  ]);

  return {
    inputs: {
      t212Summary: t212.summary,
      t212Positions: t212.positions,
      nfts,
      fiatFx,
      ethPrice,
      walletNative,
      walletTokens,
    },
    asOf,
  };
}

async function getSnapshot(options: SnapshotOptions): Promise<FetchedPortfolioSnapshot> {
  if (inFlightSnapshot) return inFlightSnapshot;

  const candidateNow = options.now?.() ?? Date.now();
  const now = Number.isFinite(candidateNow) ? candidateNow : Date.now();
  if (completedSnapshot && now < completedSnapshot.expiresAt) return completedSnapshot.value;
  completedSnapshot = null;

  const requestedTtl = options.ttlMs ?? SNAPSHOT_TTL_MS;
  const ttlMs = Number.isFinite(requestedTtl) && requestedTtl >= 0 ? requestedTtl : SNAPSHOT_TTL_MS;
  const generation = snapshotGeneration;
  const promise = fetchPortfolioSnapshot(new Date(now).toISOString());
  inFlightSnapshot = promise;
  try {
    const snapshot = await promise;
    if (generation === snapshotGeneration) {
      const candidateCompletedAt = options.now?.() ?? Date.now();
      const completedAt = Number.isFinite(candidateCompletedAt) ? candidateCompletedAt : Date.now();
      completedSnapshot = { value: snapshot, expiresAt: completedAt + ttlMs };
    }
    return snapshot;
  } finally {
    if (inFlightSnapshot === promise) inFlightSnapshot = null;
  }
}

/** Test-only cache reset; production callers should use the default 30-second TTL. */
export function __resetSnapshotCacheForTests(): void {
  snapshotGeneration += 1;
  completedSnapshot = null;
  inFlightSnapshot = null;
}

/** Fetch and assemble the complete live joined portfolio in one call. */
export async function getJoinedPortfolio(options: SnapshotOptions = {}): Promise<JoinedPortfolio> {
  const snapshot = await getSnapshot(options);
  const portfolio = buildJoinedPortfolio(snapshot.inputs, snapshot.asOf);
  // Await a bounded, fail-soft write: fire-and-forget can be dropped by serverless runtimes.
  if (isNeonConfigured()) await recordPortfolioSnapshot(portfolio, { now: options.now });
  return portfolio;
}

export function formatCurrency(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || !currency) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
  }
}

export function formatUsd(value: number | null | undefined): string {
  return formatCurrency(value, "USD");
}

export function formatThb(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `฿${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatEth(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 7 })} ETH`;
}
