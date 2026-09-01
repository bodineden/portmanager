/**
 * The single live-data boundary for PortManager.
 *
 * All pages consume getJoinedPortfolio(). Network payloads are normalised here,
 * all values are converted here, and every source fails independently so a
 * provider outage never prevents the rest of the portfolio from rendering.
 */

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

export type JoinedT212Position = NormalizedT212Position & {
  valueThb: number | null;
};

export type NftFloorHolding = {
  collection: string;
  collectionName: string;
  tokenCount: number;
  floorEth: number | null;
};

export type JoinedNftHolding = NftFloorHolding & {
  valueEth: number | null;
  valueUsd: number | null;
  valueThb: number | null;
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

export type PortfolioOwnership = {
  aShare: number;
  bShare: number;
  cShare: number;
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
  fx: FxRates;
  ownership: PortfolioOwnership;
  totals: {
    t212Thb: number | null;
    nftsEth: number | null;
    nftsUsd: number | null;
    nftsThb: number | null;
    grandTotalThb: number | null;
    grandTotalUsd: number | null;
  };
  sources: {
    t212Summary: LiveSourceState;
    t212Positions: LiveSourceState;
    nfts: LiveSourceState;
    fiatFx: LiveSourceState;
    ethPrice: LiveSourceState;
  };
  asOf: string;
};

export type LiveResult<T> = {
  data: T | null;
  state: LiveSourceState;
};

export type JoinedPortfolioInputs = {
  t212Summary: LiveResult<T212AccountSummary>;
  t212Positions: LiveResult<NormalizedT212Position[]>;
  nfts: LiveResult<NftFloorHolding[]>;
  fiatFx: LiveResult<FiatRates>;
  ethPrice: LiveResult<number>;
};

// Change this one value if Sonya later receives a beneficial share. The
// remaining ownership stays evenly split between Bodin and PP.
const INVESTOR_C_SHARE = 0;
const INVESTOR_A_B_SHARE = (1 - INVESTOR_C_SHARE) / 2;

export const PORTFOLIO_OWNERSHIP: PortfolioOwnership = Object.freeze({
  aShare: INVESTOR_A_B_SHARE,
  bShare: INVESTOR_A_B_SHARE,
  cShare: INVESTOR_C_SHARE,
});

const DEFAULT_NFT_WALLET = "0xC1bd8020d08B2A1F98da54f1573A54412d99c609";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type JsonFetchResult =
  | { ok: true; data: unknown; asOf: string }
  | { ok: false; asOf: string; message: string };

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
      return { ok: false, asOf, message: `Request unavailable (HTTP ${response.status}).` };
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
  for (const nft of response.nfts) {
    if (!nft || typeof nft !== "object" || Array.isArray(nft)) continue;
    const slug = (nft as Record<string, unknown>).collection;
    if (typeof slug !== "string" || !slug.trim()) continue;
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
  const partial = missingFloors > 0 || paginationIncomplete;
  const details = [
    missingFloors > 0 ? `${missingFloors} collection floor${missingFloors === 1 ? " is" : "s are"} unavailable.` : "",
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

function latestTimestamp(values: Array<string | null>): string | null {
  const valid = values
    .filter((value): value is string => Boolean(value) && !Number.isNaN(new Date(value as string).getTime()))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return valid[0] ?? null;
}

/** Pure assembly function used by getJoinedPortfolio and deterministic unit tests. */
export function buildJoinedPortfolio(inputs: JoinedPortfolioInputs, asOf = nowIso()): JoinedPortfolio {
  const summary = inputs.t212Summary.data;
  const fiatFx = inputs.fiatFx.data;
  const ethToUsd = inputs.ethPrice.data;
  const accountCurrency = summary?.currency ?? null;

  const investments = (inputs.t212Positions.data ?? []).map((position): JoinedT212Position => {
    const accountValue = position.valueAccount;
    const valueThb = accountValue !== null
      ? convertAmount(accountValue, rateToThb(position.pplCurrency ?? accountCurrency, fiatFx))
      : convertAmount(position.valueNative, rateToThb(position.currency, fiatFx));
    return { ...position, valueThb };
  });

  const nfts = (inputs.nfts.data ?? []).map((holding): JoinedNftHolding => {
    const valueEth = holding.floorEth === null ? null : holding.floorEth * holding.tokenCount;
    const valueUsd = valueEth === 0 ? 0 : convertAmount(valueEth, ethToUsd);
    const valueThb = valueUsd === 0 ? 0 : convertAmount(valueUsd, fiatFx?.usdToThb ?? null);
    return { ...holding, valueEth, valueUsd, valueThb };
  });

  const nftsEth = inputs.nfts.data === null ? null : sumComplete(nfts.map((holding) => holding.valueEth));
  const nftsUsd = nftsEth === 0 ? 0 : convertAmount(nftsEth, ethToUsd);
  const nftsThb = nftsUsd === 0 ? 0 : convertAmount(nftsUsd, fiatFx?.usdToThb ?? null);
  const t212Thb = convertAmount(summary?.totalValue ?? null, rateToThb(accountCurrency, fiatFx));
  const grandTotalThb = sumComplete([t212Thb, nftsThb]);
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
    fx: {
      usdToThb: fiatFx?.usdToThb ?? null,
      gbpToThb: fiatFx?.gbpToThb ?? null,
      eurToThb: fiatFx?.eurToThb ?? null,
      ethToUsd,
      asOf: fiatFx?.asOf ?? inputs.fiatFx.state.asOf,
    },
    ownership: PORTFOLIO_OWNERSHIP,
    totals: { t212Thb, nftsEth, nftsUsd, nftsThb, grandTotalThb, grandTotalUsd },
    sources: {
      t212Summary: inputs.t212Summary.state,
      t212Positions: inputs.t212Positions.state,
      nfts: inputs.nfts.state,
      fiatFx: inputs.fiatFx.state,
      ethPrice: inputs.ethPrice.state,
    },
    asOf,
  };
}

/** Fetch and assemble the complete live joined portfolio in one call. */
export async function getJoinedPortfolio(): Promise<JoinedPortfolio> {
  const snapshotAsOf = nowIso();
  const [t212, nfts, fiatFx, ethPrice] = await Promise.all([
    fetchT212Sources(),
    fetchNftSource(),
    fetchFiatFxSource(),
    fetchEthPriceSource(),
  ]);

  return buildJoinedPortfolio(
    {
      t212Summary: t212.summary,
      t212Positions: t212.positions,
      nfts,
      fiatFx,
      ethPrice,
    },
    snapshotAsOf,
  );
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
