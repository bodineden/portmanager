import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type Currency = {
  code: string;
  name: string;
  symbol: string;
};

export type ExchangeRate = {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  recordedAt: string;
};

export type Asset = {
  id: string;
  ticker: string;
  fullName: string;
  sourceLink: string;
  currencyCode: string;
  currentPrice: number;
  priceUpdatedAt: string;
  previousPrice: number;
  deletedAt?: string;
};

export type Investor = {
  id: string;
  name: string;
  deletedAt?: string;
};

export type Holding = {
  id: string;
  investorId: string;
  assetId: string;
  shares: number;
  acquiredCost: number;
  acquiredAt: string;
};

export type InvestorHolding = Holding & {
  investorName: string;
  ticker: string;
  assetName: string;
  sourceLink: string;
  currencyCode: string;
  currentPrice: number;
  exchangeRateToBase: number;
  currentValueNative: number;
  currentValueBase: number;
  gainLoss: number;
};

export type PriceHistory = {
  id: string;
  assetId: string;
  ticker: string;
  price: number;
  recordedAt: string;
};

export type PortfolioValuePoint = {
  date: string;
  valueThb: number;
  holdingCount: number;
};

type Sql = NeonQueryFunction<false, false>;

let schemaReady: Promise<void> | undefined;

export function isNeonConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to use Neon.");
  }

  return neon(databaseUrl);
}

async function ensureSchema(sql = getSql()) {
  if (!schemaReady) {
    schemaReady = createSchema(sql);
  }

  await schemaReady;
}

async function createSchema(sql: Sql) {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`
    CREATE TABLE IF NOT EXISTS currency (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      symbol TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS investor (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      deleted_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS asset (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticker TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      source_link TEXT,
      currency_code TEXT NOT NULL REFERENCES currency(code),
      current_price NUMERIC NOT NULL,
      price_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS holding (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      investor_id UUID NOT NULL REFERENCES investor(id) ON DELETE CASCADE,
      asset_id UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
      shares NUMERIC NOT NULL,
      acquired_cost NUMERIC NOT NULL,
      acquired_at DATE NOT NULL,
      UNIQUE (investor_id, asset_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS price_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
      price NUMERIC NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS exchange_rate (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_currency TEXT NOT NULL REFERENCES currency(code),
      to_currency TEXT NOT NULL REFERENCES currency(code),
      rate NUMERIC NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      occurred_at TIMESTAMPTZ NOT NULL,
      investor_id UUID NOT NULL REFERENCES investor(id) ON DELETE CASCADE,
      from_asset_id UUID REFERENCES asset(id) ON DELETE CASCADE,
      to_asset_id UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
      amount NUMERIC NOT NULL,
      shares NUMERIC NOT NULL,
      price NUMERIC NOT NULL,
      cost_basis_delta NUMERIC NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE investor ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE asset ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE asset ADD COLUMN IF NOT EXISTS previous_price NUMERIC`;
  // one-time backfill: previous = last history row before the last update
  await sql`
    UPDATE asset
    SET previous_price = COALESCE((
      SELECT price_history.price FROM price_history
      WHERE price_history.asset_id = asset.id
        AND price_history.recorded_at < asset.price_updated_at
      ORDER BY price_history.recorded_at DESC LIMIT 1
    ), current_price)
    WHERE previous_price IS NULL
  `;

  await seedDatabase(sql);
}

async function seedDatabase(sql: Sql) {
  await sql`
    INSERT INTO currency (code, name, symbol)
    VALUES
      ('USD', 'US Dollar', '$'),
      ('EUR', 'Euro', '€'),
      ('GBP', 'British Pound', '£'),
      ('THB', 'Thai Baht', '฿')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol
  `;
  await sql`
    INSERT INTO investor (name)
    VALUES ('Alice Johnson'), ('Bob Smith'), ('Carol Williams'), ('David Brown')
    ON CONFLICT (name) DO NOTHING
  `;
  await sql`
    INSERT INTO asset (ticker, full_name, source_link, currency_code, current_price, price_updated_at)
    VALUES
      ('VOO', 'Vanguard S&P 500 ETF', 'https://investor.vanguard.com/investment-products/etfs/profile/voo', 'USD', 485.23, '2024-05-13 10:24:00+00'),
      ('IWDA', 'iShares Core MSCI World UCITS ETF', 'https://www.ishares.com/uk/individual/en/products/251882/', 'USD', 78.91, '2024-05-13 10:18:00+00'),
      ('AAPL', 'Apple Inc.', 'https://finance.yahoo.com/quote/AAPL', 'USD', 189.98, '2024-05-13 09:55:00+00'),
      ('MSFT', 'Microsoft Corp.', 'https://finance.yahoo.com/quote/MSFT', 'USD', 415.37, '2024-05-13 09:52:00+00'),
      ('TSLA', 'Tesla Inc.', 'https://finance.yahoo.com/quote/TSLA', 'USD', 171.89, '2024-05-12 16:00:00+00'),
      ('BND', 'Vanguard Total Bond Market ETF', 'https://investor.vanguard.com/investment-products/etfs/profile/bnd', 'USD', 72.36, '2024-05-12 15:45:00+00'),
      ('GLD', 'SPDR Gold Shares', 'https://finance.yahoo.com/quote/GLD', 'USD', 215.64, '2024-05-11 17:12:00+00')
    ON CONFLICT (ticker) DO NOTHING
  `;
  await sql`
    INSERT INTO price_history (asset_id, price, recorded_at)
    SELECT asset.id, seed.price, seed.recorded_at::timestamptz
    FROM (
      VALUES
        ('VOO', 481.14, '2024-05-12 10:24:00+00'),
        ('VOO', 485.23, '2024-05-13 10:24:00+00'),
        ('IWDA', 78.42, '2024-05-12 10:18:00+00'),
        ('IWDA', 78.91, '2024-05-13 10:18:00+00'),
        ('AAPL', 187.45, '2024-05-12 09:55:00+00'),
        ('AAPL', 189.98, '2024-05-13 09:55:00+00'),
        ('MSFT', 412.36, '2024-05-12 09:52:00+00'),
        ('MSFT', 415.37, '2024-05-13 09:52:00+00')
    ) AS seed(ticker, price, recorded_at)
    JOIN asset ON asset.ticker = seed.ticker
    WHERE NOT EXISTS (
      SELECT 1 FROM price_history
      WHERE price_history.asset_id = asset.id
        AND price_history.recorded_at = seed.recorded_at::timestamptz
    )
  `;
  await sql`
    INSERT INTO holding (investor_id, asset_id, shares, acquired_cost, acquired_at)
    SELECT investor.id, asset.id, seed.shares, seed.acquired_cost, seed.acquired_at::date
    FROM (
      VALUES
        ('Alice Johnson', 'VOO', 1200, 540000, '2023-06-15'),
        ('Alice Johnson', 'AAPL', 850, 142000, '2023-08-02'),
        ('Alice Johnson', 'MSFT', 400, 152000, '2023-09-18'),
        ('Bob Smith', 'IWDA', 5200, 365000, '2023-07-05'),
        ('Bob Smith', 'VOO', 650, 292000, '2023-10-10'),
        ('Bob Smith', 'BND', 2100, 151000, '2023-11-21'),
        ('Carol Williams', 'AAPL', 620, 98000, '2024-01-11'),
        ('Carol Williams', 'TSLA', 740, 144000, '2024-02-09'),
        ('David Brown', 'GLD', 510, 98000, '2024-03-19'),
        ('David Brown', 'BND', 900, 64800, '2024-04-03')
    ) AS seed(investor_name, ticker, shares, acquired_cost, acquired_at)
    JOIN investor ON investor.name = seed.investor_name
    JOIN asset ON asset.ticker = seed.ticker
    ON CONFLICT (investor_id, asset_id) DO NOTHING
  `;
  await sql`
    INSERT INTO exchange_rate (from_currency, to_currency, rate, recorded_at)
    SELECT from_currency, to_currency, rate, NOW()
    FROM (
      VALUES
        ('THB', 'THB', 1),
        ('USD', 'THB', 36.50),
        ('EUR', 'THB', 39.40),
        ('GBP', 'THB', 45.60),
        ('USD', 'USD', 1),
        ('EUR', 'USD', 1.08),
        ('GBP', 'USD', 1.25),
        ('THB', 'USD', 0.027)
    ) AS seed(from_currency, to_currency, rate)
    WHERE NOT EXISTS (
      SELECT 1 FROM exchange_rate
      WHERE exchange_rate.from_currency = seed.from_currency
        AND exchange_rate.to_currency = seed.to_currency
    )
  `;
}

export async function listAssets() {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT
      asset.id,
      asset.ticker,
      asset.full_name,
      COALESCE(asset.source_link, '') AS source_link,
      asset.currency_code,
      asset.current_price,
      asset.price_updated_at,
      COALESCE(asset.deleted_at::text, '') AS deleted_at,
      COALESCE(asset.previous_price, asset.current_price) AS previous_price
    FROM asset
    WHERE asset.deleted_at IS NULL
    ORDER BY asset.ticker
  `;
  return rows.map(mapAsset);
}

export async function listQueuedAssets() {
  return listAssets();
}

export async function listDeletedAssets() {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT
      asset.id,
      asset.ticker,
      asset.full_name,
      COALESCE(asset.source_link, '') AS source_link,
      asset.currency_code,
      asset.current_price,
      asset.price_updated_at,
      COALESCE(asset.deleted_at::text, '') AS deleted_at,
      COALESCE(asset.previous_price, asset.current_price) AS previous_price
    FROM asset
    WHERE asset.deleted_at IS NOT NULL
    ORDER BY asset.deleted_at DESC
  `;
  return rows.map(mapAsset);
}

export async function listPriceHistory() {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT price_history.id, price_history.asset_id, asset.ticker, price_history.price, price_history.recorded_at
    FROM price_history
    JOIN asset ON asset.id = price_history.asset_id
    ORDER BY price_history.recorded_at DESC
    LIMIT 8
  `;
  return rows.map(mapPriceHistory);
}

export async function listCurrencies() {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`SELECT code, name, COALESCE(symbol, '') AS symbol FROM currency ORDER BY code`;
  return rows.map(mapCurrency);
}

export async function listExchangeRates() {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT DISTINCT ON (from_currency, to_currency)
      id, from_currency, to_currency, rate, recorded_at
    FROM exchange_rate
    ORDER BY from_currency, to_currency, recorded_at DESC
  `;
  return rows.map(mapExchangeRate);
}

export async function listInvestors() {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`SELECT id, name, COALESCE(deleted_at::text, '') AS deleted_at FROM investor WHERE deleted_at IS NULL ORDER BY name`;
  return rows.map(mapInvestor);
}

export async function listDeletedInvestors() {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT id, name, COALESCE(deleted_at::text, '') AS deleted_at
    FROM investor
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `;
  return rows.map(mapInvestor);
}

export async function listInvestorHoldings() {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);

  const rows = await sql`
    SELECT
      holding.id,
      holding.investor_id,
      holding.asset_id,
      holding.shares,
      holding.acquired_cost,
      holding.acquired_at,
      investor.name AS investor_name,
      asset.ticker,
      asset.full_name AS asset_name,
      COALESCE(asset.source_link, '') AS source_link,
      asset.currency_code,
      asset.current_price,
      COALESCE(rate.rate, CASE WHEN asset.currency_code = 'THB' THEN 1 ELSE 0 END) AS exchange_rate_to_base,
      holding.shares * asset.current_price AS current_value_native,
      holding.shares * asset.current_price * COALESCE(rate.rate, CASE WHEN asset.currency_code = 'THB' THEN 1 ELSE 0 END) AS current_value_base,
      holding.shares * asset.current_price * COALESCE(rate.rate, CASE WHEN asset.currency_code = 'THB' THEN 1 ELSE 0 END) - holding.acquired_cost AS gain_loss
    FROM holding
    JOIN investor ON investor.id = holding.investor_id
    JOIN asset ON asset.id = holding.asset_id
    LEFT JOIN LATERAL (
      SELECT exchange_rate.rate
      FROM exchange_rate
      WHERE exchange_rate.from_currency = asset.currency_code
        AND exchange_rate.to_currency = 'THB'
      ORDER BY recorded_at DESC
      LIMIT 1
    ) rate ON TRUE
    WHERE investor.deleted_at IS NULL AND asset.deleted_at IS NULL
    ORDER BY investor.name, asset.ticker
  `;
  return rows.map(mapInvestorHolding);
}

function toDateKey(value: string | Date): string {
  // Neon returns timestamptz as Date objects and DATE as "YYYY-MM-DD" strings;
  // never slice a String(Date) — it renders "Mon Aug 17 ..." and breaks keys.
  return new Date(value).toISOString().slice(0, 10);
}

function toMs(value: string | Date): number {
  return new Date(value).getTime();
}

export async function listPortfolioValueSeries(): Promise<PortfolioValuePoint[]> {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);

  const holdings = await sql`
    SELECT h.id, h.asset_id, h.shares, h.acquired_at,
           a.ticker, a.currency_code, a.current_price
    FROM holding h
    JOIN asset a ON a.id = h.asset_id
    JOIN investor i ON i.id = h.investor_id
    WHERE a.deleted_at IS NULL AND i.deleted_at IS NULL
  `;
  const priceRows = await sql`SELECT asset_id, price, recorded_at FROM price_history ORDER BY recorded_at`;
  const rateRows = await sql`
    SELECT from_currency, to_currency, rate, recorded_at
    FROM exchange_rate
    ORDER BY recorded_at
  `;

  // as-of indexes: asset_id -> sorted [{t, price}], "FROM->TO" -> sorted [{t, rate}]
  const priceByAsset = new Map<string, { t: number; price: number }[]>();
  for (const r of priceRows) {
    const key = String(r.asset_id);
    if (!priceByAsset.has(key)) priceByAsset.set(key, []);
    priceByAsset.get(key)!.push({ t: toMs(r.recorded_at), price: Number(r.price) });
  }
  const rateByPair = new Map<string, { t: number; rate: number }[]>();
  for (const r of rateRows) {
    const key = `${String(r.from_currency)}->${String(r.to_currency)}`;
    if (!rateByPair.has(key)) rateByPair.set(key, []);
    rateByPair.get(key)!.push({ t: toMs(r.recorded_at), rate: Number(r.rate) });
  }

  function asOf<T extends { t: number }>(list: T[] | undefined, t: number): T | undefined {
    if (!list || list.length === 0) return undefined;
    // list is sorted by t; find last entry with entry.t <= t
    let lo = 0;
    let hi = list.length - 1;
    let ans: T | undefined;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t <= t) {
        ans = list[mid];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  // series dates: every date that has price or FX data, plus today
  const dateSet = new Set<string>();
  for (const r of priceRows) dateSet.add(toDateKey(r.recorded_at));
  for (const r of rateRows) dateSet.add(toDateKey(r.recorded_at));
  dateSet.add(toDateKey(new Date()));
  const dates = [...dateSet].sort();

  const points: PortfolioValuePoint[] = [];
  for (const date of dates) {
    const dayEnd = new Date(`${date}T23:59:59.999Z`).getTime();
    let value = 0;
    let counted = 0;
    for (const h of holdings) {
      const acquiredDate = toDateKey(h.acquired_at);
      if (acquiredDate > date) continue; // holding didn't exist yet

      const history = priceByAsset.get(String(h.asset_id));
      const priceRec = asOf(history, dayEnd);
      if (history && history.length > 0 && !priceRec) {
        continue; // asset was not tracked yet on this date — no fake prices
      }
      const price = priceRec ? priceRec.price : Number(h.current_price);

      const pair = `${String(h.currency_code)}->THB`;
      const rateRec = asOf(rateByPair.get(pair), dayEnd);
      const rate = rateRec ? rateRec.rate : String(h.currency_code) === "THB" ? 1 : 0;

      value += Number(h.shares) * price * rate;
      counted += 1;
    }
    points.push({ date, valueThb: Math.round(value * 100) / 100, holdingCount: counted });
  }

  // drop dates with no holdings at all (e.g. 2024 seed-era price_history rows
  // whose assets are deleted) — they are noise, not portfolio history
  return points.filter((p) => p.holdingCount > 0);
}

export async function upsertAsset(input: {
  ticker: string;
  fullName: string;
  sourceLink: string;
  currencyCode: string;
  currentPrice: number;
}) {
  const sql = getSql();
  await ensureSchema(sql);
  const ticker = input.ticker.trim().toUpperCase();
  const existing = await sql`SELECT id, current_price FROM asset WHERE ticker = ${ticker}`;
  const rows = await sql`
    INSERT INTO asset (ticker, full_name, source_link, currency_code, current_price, previous_price, price_updated_at)
    VALUES (${ticker}, ${input.fullName}, ${input.sourceLink || null}, ${input.currencyCode}, ${input.currentPrice}, ${input.currentPrice}, NOW())
    ON CONFLICT (ticker) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      source_link = EXCLUDED.source_link,
      currency_code = EXCLUDED.currency_code,
      previous_price = asset.current_price,
      current_price = EXCLUDED.current_price,
      price_updated_at = NOW(),
      deleted_at = NULL
    RETURNING id
  `;
  const assetId = String(rows[0].id);

  if (!existing[0] || Number(existing[0].current_price) !== input.currentPrice) {
    await sql`INSERT INTO price_history (asset_id, price, recorded_at) VALUES (${assetId}, ${input.currentPrice}, NOW())`;
  }
}

export async function updateAssetPrice(id: string, currentPrice: number) {
  const sql = getSql();
  await ensureSchema(sql);
  const existing = await sql`SELECT id FROM asset WHERE id = ${id}`;

  if (!existing[0]) {
    return;
  }

  await sql`UPDATE asset SET previous_price = current_price, current_price = ${currentPrice}, price_updated_at = NOW() WHERE id = ${id}`;
  await sql`INSERT INTO price_history (asset_id, price, recorded_at) VALUES (${id}, ${currentPrice}, NOW())`;
}

export async function removeAsset(id: string) {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`UPDATE asset SET deleted_at = NOW() WHERE id = ${id}`;
}

export async function recoverAsset(id: string) {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`UPDATE asset SET deleted_at = NULL WHERE id = ${id}`;
}

export async function upsertInvestor(input: { name: string }) {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`
    INSERT INTO investor (name)
    VALUES (${input.name.trim()})
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL
  `;
}

export async function removeInvestor(id: string) {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`UPDATE investor SET deleted_at = NOW() WHERE id = ${id}`;
}

export async function recoverInvestor(id: string) {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`UPDATE investor SET deleted_at = NULL WHERE id = ${id}`;
}

export async function addInvestorHolding(input: { investorId: string; assetId: string; shares: number; acquiredCost: number; acquiredAt: string }) {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`
    INSERT INTO holding (investor_id, asset_id, shares, acquired_cost, acquired_at)
    VALUES (${input.investorId}, ${input.assetId}, ${input.shares}, ${input.acquiredCost}, ${input.acquiredAt})
    ON CONFLICT (investor_id, asset_id) DO UPDATE SET
      shares = EXCLUDED.shares,
      acquired_cost = EXCLUDED.acquired_cost,
      acquired_at = EXCLUDED.acquired_at
  `;
}

export async function removeInvestorHolding(id: string) {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`DELETE FROM holding WHERE id = ${id}`;
}

export async function addExchangeRate(input: { fromCurrency: string; toCurrency: string; rate: number }) {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`
    INSERT INTO exchange_rate (from_currency, to_currency, rate, recorded_at)
    VALUES (${input.fromCurrency}, ${input.toCurrency}, ${input.rate}, NOW())
  `;
}

export const upsertExchangeRate = addExchangeRate;

export function getAssetMetrics(assets: Asset[]) {
  const trackedMarketValue = assets.reduce((sum, asset) => sum + asset.currentPrice, 0);
  const previousMarketValue = assets.reduce((sum, asset) => sum + asset.previousPrice, 0);
  const updatedToday = assets.filter((asset) => isToday(asset.priceUpdatedAt)).length;
  const averageDailyChange =
    assets.length === 0
      ? 0
      : assets.reduce((sum, asset) => sum + getDailyChangePercent(asset), 0) / assets.length;

  return [
    { label: "Total Assets", value: String(assets.length), detail: "Rows in ERD Asset", tone: "text-emerald-600" },
    { label: "Current Price Sum", value: formatMoney(trackedMarketValue), detail: `${formatSignedMoney(trackedMarketValue - previousMarketValue, "USD")} vs. history`, tone: "text-emerald-600" },
    { label: "Updated Today", value: String(updatedToday), detail: "price_updated_at is today", tone: "text-blue-600" },
    { label: "Avg. Price Change", value: `${averageDailyChange >= 0 ? "+" : ""}${averageDailyChange.toFixed(2)}%`, detail: "Current vs. previous price", tone: averageDailyChange >= 0 ? "text-emerald-600" : "text-rose-600" },
  ];
}

export function getHoldingMetrics(investors: Investor[], holdings: InvestorHolding[]) {
  const totalAcquiredCost = holdings.reduce((sum, holding) => sum + holding.acquiredCost, 0);
  const currentValue = holdings.reduce((sum, holding) => sum + holding.currentValueBase, 0);
  const gainLoss = currentValue - totalAcquiredCost;

  return [
    { label: "Investors", value: String(investors.length), detail: "Rows in ERD Investor", tone: "text-emerald-600" },
    { label: "Holdings", value: String(holdings.length), detail: "Investor-asset joins", tone: "text-emerald-600" },
    { label: "Acquired Cost", value: formatMoney(totalAcquiredCost, "THB"), detail: "Base currency: THB", tone: "text-slate-600" },
    { label: "Current Value", value: formatMoney(currentValue, "THB"), detail: `${formatSignedMoney(gainLoss)} vs. acquired`, tone: gainLoss >= 0 ? "text-emerald-600" : "text-rose-600" },
  ];
}

export function getDailyChangePercent(asset: Asset) {
  if (asset.previousPrice === 0) {
    return 0;
  }

  return ((asset.currentPrice - asset.previousPrice) / asset.previousPrice) * 100;
}

export function formatMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatSignedMoney(value: number, currency = "THB") {
  const formatted = formatMoney(Math.abs(value), currency);
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function isToday(value: string) {
  return new Date(value).toDateString() === new Date().toDateString();
}

function mapAsset(row: Record<string, unknown>): Asset {
  return {
    id: String(row.id),
    ticker: String(row.ticker),
    fullName: String(row.full_name),
    sourceLink: String(row.source_link),
    currencyCode: String(row.currency_code),
    currentPrice: Number(row.current_price),
    priceUpdatedAt: String(row.price_updated_at),
    previousPrice: Number(row.previous_price),
    deletedAt: String(row.deleted_at ?? ""),
  };
}

function mapCurrency(row: Record<string, unknown>): Currency {
  return {
    code: String(row.code),
    name: String(row.name),
    symbol: String(row.symbol),
  };
}

function mapInvestor(row: Record<string, unknown>): Investor {
  return {
    id: String(row.id),
    name: String(row.name),
    deletedAt: String(row.deleted_at ?? ""),
  };
}

function mapInvestorHolding(row: Record<string, unknown>): InvestorHolding {
  return {
    id: String(row.id),
    investorId: String(row.investor_id),
    assetId: String(row.asset_id),
    shares: Number(row.shares),
    acquiredCost: Number(row.acquired_cost),
    acquiredAt: String(row.acquired_at),
    investorName: String(row.investor_name),
    ticker: String(row.ticker),
    assetName: String(row.asset_name),
    sourceLink: String(row.source_link),
    currencyCode: String(row.currency_code),
    currentPrice: Number(row.current_price),
    exchangeRateToBase: Number(row.exchange_rate_to_base),
    currentValueNative: Number(row.current_value_native),
    currentValueBase: Number(row.current_value_base),
    gainLoss: Number(row.gain_loss),
  };
}

function mapExchangeRate(row: Record<string, unknown>): ExchangeRate {
  return {
    id: String(row.id),
    fromCurrency: String(row.from_currency),
    toCurrency: String(row.to_currency),
    rate: Number(row.rate),
    recordedAt: String(row.recorded_at),
  };
}

function mapPriceHistory(row: Record<string, unknown>): PriceHistory {
  return {
    id: String(row.id),
    assetId: String(row.asset_id),
    ticker: String(row.ticker),
    price: Number(row.price),
    recordedAt: String(row.recorded_at),
  };
}
