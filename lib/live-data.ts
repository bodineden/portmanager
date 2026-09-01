/**
 * Live portfolio data for the JOINED home view.
 *
 * Sources (all transparent, no scraping):
 *  - Stocks: Trading 212 Public API /equity/positions (quantity, averagePrice,
 *    currentPrice, ppl). Env: T212_API_KEY + T212_API_SECRET.
 *  - Crypto/NFT port: OpenSea API v2 — wallet NFT holdings on Robinhood Chain,
 *    floor prices per collection. Env: OPENSEA_API_KEY + NFT_WALLET.
 *  - FX: open.er-api.com (ECB-sourced), same source the old cron used.
 *  - ETH price: CoinGecko simple price.
 *
 * All fetches fail soft (return empty/undefined) so the page renders with an
 * honest "unavailable" state instead of crashing.
 */

export type StockPosition = {
  ticker: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  ppl: number;
  currencyCode: string;
};

export type NftHolding = {
  collection: string;
  collectionName: string;
  tokenCount: number;
  floorEth: number | null;
  valueEth: number | null;
};

export type FxRates = {
  usdToThb: number;
  gbpToThb: number;
  eurToThb: number;
  ethToUsd: number | null;
  asOf: string;
};

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchJson(url: string, headers: Record<string, string> = {}, timeoutMs = 20000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** T212 open positions. Returns [] on any failure (empty stocks port is honest). */
export async function fetchT212Positions(): Promise<StockPosition[]> {
  const key = process.env.T212_API_KEY;
  const secret = process.env.T212_API_SECRET;
  if (!key || !secret) return [];

  const base = process.env.T212_BASE_URL || "https://live.trading212.com/api/v0";
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const data = await fetchJson(`${base}/equity/positions`, { Authorization: `Basic ${auth}` });
  if (!Array.isArray(data)) return [];

  return data
    .filter((p: any) => p && typeof p.ticker === "string" && p.quantity > 0)
    .map((p: any) => ({
      ticker: p.ticker as string,
      quantity: Number(p.quantity) || 0,
      averagePrice: Number(p.averagePrice) || 0,
      currentPrice: Number(p.currentPrice) || 0,
      ppl: Number(p.ppl) || 0,
      currencyCode: (p.pplCurrency as string) || (p.currencyCode as string) || "USD",
    }));
}

/** Wallet NFT holdings grouped by collection, with live floor prices (ETH). */
export async function fetchNftPort(): Promise<NftHolding[]> {
  const key = process.env.OPENSEA_API_KEY;
  const wallet = process.env.NFT_WALLET || "0xC1bd8020d08B2A1F98da54f1573A54412d99c609";
  if (!key) return [];

  const chain = "robinhood";
  const data = await fetchJson(
    `https://api.opensea.io/api/v2/chain/${chain}/account/${wallet}/nfts?limit=50`,
    { "X-API-KEY": key }
  );
  const nfts: any[] = Array.isArray(data?.nfts) ? data.nfts : [];
  if (nfts.length === 0) return [];

  const byCollection = new Map<string, { slug: string; count: number; displayName: string }>();
  for (const n of nfts) {
    const slug = typeof n.collection === "string" ? n.collection : null;
    if (!slug) continue;
    const name = typeof n.name === "string" ? n.name : slug;
    const entry = byCollection.get(slug) ?? { slug, count: 0, displayName: name };
    entry.count += 1;
    byCollection.set(slug, entry);
  }

  const holdings: NftHolding[] = [];
  for (const entry of byCollection.values()) {
    const stats = await fetchJson(`https://api.opensea.io/api/v2/collections/${entry.slug}/stats`, {
      "X-API-KEY": key,
    });
    const floor = Number(stats?.total?.floor_price) || null;
    holdings.push({
      collection: entry.slug,
      collectionName: entry.displayName,
      tokenCount: entry.count,
      floorEth: floor,
      valueEth: floor !== null ? floor * entry.count : null,
    });
  }
  return holdings.sort((a, b) => (b.valueEth ?? 0) - (a.valueEth ?? 0));
}

/** FX: USD/GBP/EUR -> THB (open.er-api, ECB-sourced) + ETH -> USD (CoinGecko). */
export async function fetchFxRates(): Promise<FxRates> {
  const rates: FxRates = {
    usdToThb: 0,
    gbpToThb: 0,
    eurToThb: 0,
    ethToUsd: null,
    asOf: new Date().toISOString(),
  };

  const [fx, eth] = await Promise.all([
    fetchJson("https://open.er-api.com/v6/latest/USD"),
    fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"),
  ]);

  const usdBase = fx?.rates as Record<string, number> | undefined;
  if (usdBase) {
    const thb = Number(usdBase["THB"]);
    if (thb > 0) {
      rates.usdToThb = thb;
      const gbp = Number(usdBase["GBP"]);
      const eur = Number(usdBase["EUR"]);
      if (gbp > 0) rates.gbpToThb = thb / gbp;
      if (eur > 0) rates.eurToThb = thb / eur;
      rates.asOf = typeof fx?.time_last_update_utc === "string" ? fx.time_last_update_utc : rates.asOf;
    }
  }

  const ethUsd = Number(eth?.ethereum?.usd);
  if (ethUsd > 0) rates.ethToUsd = ethUsd;

  return rates;
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function formatThb(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `฿${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatEth(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH`;
}
