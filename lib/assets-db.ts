import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type Asset = {
  id: number;
  ticker: string;
  name: string;
  type: string;
  currency: string;
  latestPrice: number;
  previousPrice: number;
  priceSource: string;
  status: "Synced" | "Review" | "Manual" | "Stale";
  lastPriceUpdate: string;
  active: boolean;
};

export type AssetChange = {
  id: number;
  ticker: string;
  action: string;
  detail: string;
  user: string;
  createdAt: string;
};

export type Investor = {
  id: number;
  name: string;
  email: string;
  capitalContributed: number;
  active: boolean;
};

export type Holding = {
  id: number;
  investorId: number;
  assetTicker: string;
  units: number;
  costBasis: number;
  active: boolean;
};

export type InvestorHolding = Holding & {
  investorName: string;
  assetName: string;
  assetType: string;
  currency: string;
  currentPrice: number;
  currentValue: number;
  gainLoss: number;
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
  await sql`
    CREATE TABLE IF NOT EXISTS assets (
      id BIGSERIAL PRIMARY KEY,
      ticker TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      latest_price NUMERIC NOT NULL DEFAULT 0,
      previous_price NUMERIC NOT NULL DEFAULT 0,
      price_source TEXT NOT NULL DEFAULT 'Manual',
      status TEXT NOT NULL DEFAULT 'Manual',
      last_price_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS asset_changes (
      id BIGSERIAL PRIMARY KEY,
      ticker TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'Admin User',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS investors (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL DEFAULT '',
      capital_contributed NUMERIC NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS holdings (
      id BIGSERIAL PRIMARY KEY,
      investor_id BIGINT NOT NULL REFERENCES investors(id),
      asset_ticker TEXT NOT NULL REFERENCES assets(ticker),
      units NUMERIC NOT NULL DEFAULT 0,
      cost_basis NUMERIC NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (investor_id, asset_ticker)
    )
  `;

  await seedDatabase(sql);
}

async function seedDatabase(sql: Sql) {
  await sql`
    INSERT INTO assets (ticker, name, type, currency, latest_price, previous_price, price_source, status, last_price_update)
    VALUES
      ('VOO', 'Vanguard S&P 500 ETF', 'ETF', 'USD', 485.23, 481.14, 'Yahoo Finance', 'Synced', '2024-05-13 10:24:00+00'),
      ('IWDA', 'iShares Core MSCI World ETF', 'ETF', 'USD', 78.91, 78.42, 'Yahoo Finance', 'Synced', '2024-05-13 10:18:00+00'),
      ('AAPL', 'Apple Inc.', 'Stock', 'USD', 189.98, 187.45, 'Nasdaq', 'Synced', '2024-05-13 09:55:00+00'),
      ('MSFT', 'Microsoft Corp.', 'Stock', 'USD', 415.37, 412.36, 'Nasdaq', 'Synced', '2024-05-13 09:52:00+00'),
      ('TSLA', 'Tesla Inc.', 'Stock', 'USD', 171.89, 172.65, 'Nasdaq', 'Review', '2024-05-12 16:00:00+00'),
      ('BND', 'Vanguard Total Bond Market ETF', 'Bond ETF', 'USD', 72.36, 72.27, 'Manual', 'Manual', '2024-05-12 15:45:00+00'),
      ('GLD', 'SPDR Gold Shares', 'Commodity', 'USD', 215.64, 214.97, 'Manual', 'Stale', '2024-05-11 17:12:00+00')
    ON CONFLICT (ticker) DO NOTHING
  `;
  await sql`
    INSERT INTO asset_changes (ticker, action, detail, actor, created_at)
    VALUES
      ('VOO', 'Updated price', '$481.14 -> $485.23', 'Alice Johnson', '2024-05-13 10:24:00+00'),
      ('AAPL', 'Added asset', 'Stock / USD / Nasdaq', 'Admin User', '2024-05-13 09:55:00+00'),
      ('BND', 'Changed source', 'Manual -> Yahoo Finance', 'Bob Smith', '2024-05-12 15:45:00+00'),
      ('ARKK', 'Removed inactive asset', 'No active holdings', 'Admin User', '2024-05-11 12:10:00+00')
  `;
  await sql`
    INSERT INTO investors (name, email, capital_contributed)
    VALUES
      ('Alice Johnson', 'alice@example.com', 1100000),
      ('Bob Smith', 'bob@example.com', 800000),
      ('Carol Williams', 'carol@example.com', 450000),
      ('David Brown', 'david@example.com', 180069.8)
    ON CONFLICT (name) DO NOTHING
  `;
  await sql`
    INSERT INTO holdings (investor_id, asset_ticker, units, cost_basis)
    SELECT investors.id, seed.asset_ticker, seed.units, seed.cost_basis
    FROM (
      VALUES
        ('Alice Johnson', 'VOO', 1200, 540000),
        ('Alice Johnson', 'AAPL', 850, 142000),
        ('Alice Johnson', 'MSFT', 400, 152000),
        ('Bob Smith', 'IWDA', 5200, 365000),
        ('Bob Smith', 'VOO', 650, 292000),
        ('Bob Smith', 'BND', 2100, 151000),
        ('Carol Williams', 'AAPL', 620, 98000),
        ('Carol Williams', 'TSLA', 740, 144000),
        ('David Brown', 'GLD', 510, 98000),
        ('David Brown', 'BND', 900, 64800)
    ) AS seed(investor_name, asset_ticker, units, cost_basis)
    JOIN investors ON investors.name = seed.investor_name
    ON CONFLICT (investor_id, asset_ticker) DO NOTHING
  `;
}

export async function listAssets() {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT id, ticker, name, type, currency, latest_price, previous_price, price_source, status, last_price_update, active
    FROM assets
    WHERE active = TRUE
    ORDER BY ticker
  `;
  return rows.map(mapAsset);
}

export async function listQueuedAssets() {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT id, ticker, name, type, currency, latest_price, previous_price, price_source, status, last_price_update, active
    FROM assets
    WHERE active = TRUE AND status IN ('Review', 'Manual', 'Stale')
    ORDER BY CASE status WHEN 'Stale' THEN 0 WHEN 'Review' THEN 1 ELSE 2 END, last_price_update
  `;
  return rows.map(mapAsset);
}

export async function listAssetChanges() {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT id, ticker, action, detail, actor, created_at
    FROM asset_changes
    ORDER BY created_at DESC, id DESC
    LIMIT 8
  `;
  return rows.map(mapChange);
}

export async function listInvestors() {
  if (!isNeonConfigured()) {
    return [];
  }

  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT id, name, email, capital_contributed, active
    FROM investors
    WHERE active = TRUE
    ORDER BY name
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
      holdings.id,
      holdings.investor_id,
      holdings.asset_ticker,
      holdings.units,
      holdings.cost_basis,
      holdings.active,
      investors.name AS investor_name,
      assets.name AS asset_name,
      assets.type AS asset_type,
      assets.currency,
      assets.latest_price AS current_price,
      holdings.units * assets.latest_price AS current_value,
      holdings.units * assets.latest_price - holdings.cost_basis AS gain_loss
    FROM holdings
    JOIN investors ON investors.id = holdings.investor_id
    JOIN assets ON assets.ticker = holdings.asset_ticker
    WHERE holdings.active = TRUE AND investors.active = TRUE AND assets.active = TRUE
    ORDER BY investors.name, holdings.asset_ticker
  `;
  return rows.map(mapInvestorHolding);
}

export async function upsertAsset(input: {
  ticker: string;
  name: string;
  type: string;
  currency: string;
  latestPrice: number;
  priceSource: string;
  status: Asset["status"];
}) {
  const sql = getSql();
  await ensureSchema(sql);
  const ticker = input.ticker.trim().toUpperCase();
  const existing = await sql`SELECT latest_price FROM assets WHERE ticker = ${ticker}`;
  const previousPrice = existing[0] ? Number(existing[0].latest_price) : input.latestPrice;

  await sql`
    INSERT INTO assets (ticker, name, type, currency, latest_price, previous_price, price_source, status, last_price_update, active, updated_at)
    VALUES (${ticker}, ${input.name}, ${input.type}, ${input.currency}, ${input.latestPrice}, ${input.latestPrice}, ${input.priceSource}, ${input.status}, NOW(), TRUE, NOW())
    ON CONFLICT (ticker) DO UPDATE SET
      name = EXCLUDED.name,
      type = EXCLUDED.type,
      currency = EXCLUDED.currency,
      previous_price = assets.latest_price,
      latest_price = EXCLUDED.latest_price,
      price_source = EXCLUDED.price_source,
      status = EXCLUDED.status,
      last_price_update = NOW(),
      active = TRUE,
      updated_at = NOW()
  `;
  await logChange(sql, ticker, existing[0] ? "Updated asset" : "Added asset", existing[0] ? `${formatMoney(previousPrice)} -> ${formatMoney(input.latestPrice)}` : `${input.type} / ${input.currency} / ${input.priceSource}`);
}

export async function updateAssetPrice(id: number, latestPrice: number) {
  const sql = getSql();
  await ensureSchema(sql);
  const existing = await sql`SELECT ticker, latest_price FROM assets WHERE id = ${id} AND active = TRUE`;

  if (!existing[0]) {
    return;
  }

  await sql`
    UPDATE assets
    SET previous_price = latest_price,
      latest_price = ${latestPrice},
      status = 'Synced',
      last_price_update = NOW(),
      updated_at = NOW()
    WHERE id = ${id}
  `;
  await logChange(sql, String(existing[0].ticker), "Updated price", `${formatMoney(Number(existing[0].latest_price))} -> ${formatMoney(latestPrice)}`);
}

export async function removeAsset(id: number) {
  const sql = getSql();
  await ensureSchema(sql);
  const existing = await sql`SELECT ticker FROM assets WHERE id = ${id} AND active = TRUE`;

  if (!existing[0]) {
    return;
  }

  await sql`UPDATE assets SET active = FALSE, status = 'Stale', updated_at = NOW() WHERE id = ${id}`;
  await sql`UPDATE holdings SET active = FALSE, updated_at = NOW() WHERE asset_ticker = ${existing[0].ticker}`;
  await logChange(sql, String(existing[0].ticker), "Removed asset", "Marked inactive in Asset List");
}

export async function upsertInvestor(input: { name: string; email: string; capitalContributed: number }) {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`
    INSERT INTO investors (name, email, capital_contributed, active, updated_at)
    VALUES (${input.name.trim()}, ${input.email}, ${input.capitalContributed}, TRUE, NOW())
    ON CONFLICT (name) DO UPDATE SET
      email = EXCLUDED.email,
      capital_contributed = EXCLUDED.capital_contributed,
      active = TRUE,
      updated_at = NOW()
  `;
}

export async function removeInvestor(id: number) {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`UPDATE investors SET active = FALSE, updated_at = NOW() WHERE id = ${id}`;
  await sql`UPDATE holdings SET active = FALSE, updated_at = NOW() WHERE investor_id = ${id}`;
}

export async function addInvestorHolding(input: { investorId: number; assetTicker: string; units: number; costBasis: number }) {
  const sql = getSql();
  await ensureSchema(sql);
  const assetTicker = input.assetTicker.trim().toUpperCase();
  await sql`
    INSERT INTO holdings (investor_id, asset_ticker, units, cost_basis, active, updated_at)
    VALUES (${input.investorId}, ${assetTicker}, ${input.units}, ${input.costBasis}, TRUE, NOW())
    ON CONFLICT (investor_id, asset_ticker) DO UPDATE SET
      units = EXCLUDED.units,
      cost_basis = EXCLUDED.cost_basis,
      active = TRUE,
      updated_at = NOW()
  `;
}

export async function removeInvestorHolding(id: number) {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`UPDATE holdings SET active = FALSE, updated_at = NOW() WHERE id = ${id}`;
}

export function getAssetMetrics(assets: Asset[]) {
  const trackedMarketValue = assets.reduce((sum, asset) => sum + asset.latestPrice, 0);
  const previousMarketValue = assets.reduce((sum, asset) => sum + asset.previousPrice, 0);
  const needingUpdate = assets.filter((asset) => asset.status !== "Synced").length;
  const averageDailyChange =
    assets.length === 0
      ? 0
      : assets.reduce((sum, asset) => sum + getDailyChangePercent(asset), 0) / assets.length;

  return [
    { label: "Total Assets", value: String(assets.length), detail: "Active records in Neon", tone: "text-emerald-600" },
    { label: "Tracked Market Value", value: formatMoney(trackedMarketValue), detail: `${formatSignedMoney(trackedMarketValue - previousMarketValue)} today`, tone: "text-emerald-600" },
    { label: "Assets Needing Update", value: String(needingUpdate), detail: `${Math.max(needingUpdate - 1, 0)} stale over 24h`, tone: "text-orange-500" },
    { label: "Avg. Daily Change", value: `${averageDailyChange >= 0 ? "+" : ""}${averageDailyChange.toFixed(2)}%`, detail: "Across active assets", tone: averageDailyChange >= 0 ? "text-emerald-600" : "text-rose-600" },
  ];
}

export function getHoldingMetrics(investors: Investor[], holdings: InvestorHolding[]) {
  const totalCostBasis = holdings.reduce((sum, holding) => sum + holding.costBasis, 0);
  const currentValue = holdings.reduce((sum, holding) => sum + holding.currentValue, 0);
  const gainLoss = currentValue - totalCostBasis;

  return [
    { label: "Active Investors", value: String(investors.length), detail: "Holding records grouped by owner", tone: "text-emerald-600" },
    { label: "Active Holdings", value: String(holdings.length), detail: "Investor-asset positions", tone: "text-emerald-600" },
    { label: "Total Cost Basis", value: formatMoney(totalCostBasis), detail: "Across all holdings", tone: "text-slate-600" },
    { label: "Current Value", value: formatMoney(currentValue), detail: `${formatSignedMoney(gainLoss)} vs. cost`, tone: gainLoss >= 0 ? "text-emerald-600" : "text-rose-600" },
  ];
}

export function getDailyChangePercent(asset: Asset) {
  if (asset.previousPrice === 0) {
    return 0;
  }

  return ((asset.latestPrice - asset.previousPrice) / asset.previousPrice) * 100;
}

export function formatMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatSignedMoney(value: number) {
  const formatted = formatMoney(Math.abs(value));
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

function mapAsset(row: Record<string, unknown>): Asset {
  return {
    id: Number(row.id),
    ticker: String(row.ticker),
    name: String(row.name),
    type: String(row.type),
    currency: String(row.currency),
    latestPrice: Number(row.latest_price),
    previousPrice: Number(row.previous_price),
    priceSource: String(row.price_source),
    status: row.status as Asset["status"],
    lastPriceUpdate: String(row.last_price_update),
    active: Boolean(row.active),
  };
}

function mapChange(row: Record<string, unknown>): AssetChange {
  return {
    id: Number(row.id),
    ticker: String(row.ticker),
    action: String(row.action),
    detail: String(row.detail),
    user: String(row.actor),
    createdAt: String(row.created_at),
  };
}

function mapInvestor(row: Record<string, unknown>): Investor {
  return {
    id: Number(row.id),
    name: String(row.name),
    email: String(row.email),
    capitalContributed: Number(row.capital_contributed),
    active: Boolean(row.active),
  };
}

function mapInvestorHolding(row: Record<string, unknown>): InvestorHolding {
  return {
    id: Number(row.id),
    investorId: Number(row.investor_id),
    assetTicker: String(row.asset_ticker),
    units: Number(row.units),
    costBasis: Number(row.cost_basis),
    active: Boolean(row.active),
    investorName: String(row.investor_name),
    assetName: String(row.asset_name),
    assetType: String(row.asset_type),
    currency: String(row.currency),
    currentPrice: Number(row.current_price),
    currentValue: Number(row.current_value),
    gainLoss: Number(row.gain_loss),
  };
}

async function logChange(sql: Sql, ticker: string, action: string, detail: string) {
  await sql`
    INSERT INTO asset_changes (ticker, action, detail, actor)
    VALUES (${ticker}, ${action}, ${detail}, 'Admin User')
  `;
}
