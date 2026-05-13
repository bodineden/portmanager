import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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
  active: number;
};

export type AssetChange = {
  id: number;
  ticker: string;
  action: string;
  detail: string;
  user: string;
  createdAt: string;
};

const dbDir = path.join(process.cwd(), ".data");
const dbPath = path.join(dbDir, "portfolio-manager.sqlite");

let db: DatabaseSync | undefined;

function getDb() {
  if (db) {
    return db;
  }

  mkdirSync(dbDir, { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      latest_price REAL NOT NULL DEFAULT 0,
      previous_price REAL NOT NULL DEFAULT 0,
      price_source TEXT NOT NULL DEFAULT 'Manual',
      status TEXT NOT NULL DEFAULT 'Manual',
      last_price_update TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS asset_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      user TEXT NOT NULL DEFAULT 'Admin User',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedAssets();
  return db;
}

function seedAssets() {
  if (!db) {
    return;
  }

  const count = db.prepare("SELECT COUNT(*) AS total FROM assets").get() as { total: number };
  if (count.total > 0) {
    return;
  }

  const insertAsset = db.prepare(`
    INSERT INTO assets (ticker, name, type, currency, latest_price, previous_price, price_source, status, last_price_update)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  [
    ["VOO", "Vanguard S&P 500 ETF", "ETF", "USD", 485.23, 481.14, "Yahoo Finance", "Synced", "2024-05-13 10:24:00"],
    ["IWDA", "iShares Core MSCI World ETF", "ETF", "USD", 78.91, 78.42, "Yahoo Finance", "Synced", "2024-05-13 10:18:00"],
    ["AAPL", "Apple Inc.", "Stock", "USD", 189.98, 187.45, "Nasdaq", "Synced", "2024-05-13 09:55:00"],
    ["MSFT", "Microsoft Corp.", "Stock", "USD", 415.37, 412.36, "Nasdaq", "Synced", "2024-05-13 09:52:00"],
    ["TSLA", "Tesla Inc.", "Stock", "USD", 171.89, 172.65, "Nasdaq", "Review", "2024-05-12 16:00:00"],
    ["BND", "Vanguard Total Bond Market ETF", "Bond ETF", "USD", 72.36, 72.27, "Manual", "Manual", "2024-05-12 15:45:00"],
    ["GLD", "SPDR Gold Shares", "Commodity", "USD", 215.64, 214.97, "Manual", "Stale", "2024-05-11 17:12:00"],
  ].forEach((asset) => insertAsset.run(...asset));

  const insertChange = db.prepare(`
    INSERT INTO asset_changes (ticker, action, detail, user, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  [
    ["VOO", "Updated price", "$481.14 -> $485.23", "Alice Johnson", "2024-05-13 10:24:00"],
    ["AAPL", "Added asset", "Stock / USD / Nasdaq", "Admin User", "2024-05-13 09:55:00"],
    ["BND", "Changed source", "Manual -> Yahoo Finance", "Bob Smith", "2024-05-12 15:45:00"],
    ["ARKK", "Removed inactive asset", "No active holdings", "Admin User", "2024-05-11 12:10:00"],
  ].forEach((change) => insertChange.run(...change));
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
    active: Number(row.active),
  };
}

function mapChange(row: Record<string, unknown>): AssetChange {
  return {
    id: Number(row.id),
    ticker: String(row.ticker),
    action: String(row.action),
    detail: String(row.detail),
    user: String(row.user),
    createdAt: String(row.created_at),
  };
}

export function listAssets() {
  return getDb()
    .prepare(
      `SELECT id, ticker, name, type, currency, latest_price, previous_price, price_source, status, last_price_update, active
       FROM assets
       WHERE active = 1
       ORDER BY ticker`
    )
    .all()
    .map((row) => mapAsset(row as Record<string, unknown>));
}

export function listQueuedAssets() {
  return getDb()
    .prepare(
      `SELECT id, ticker, name, type, currency, latest_price, previous_price, price_source, status, last_price_update, active
       FROM assets
       WHERE active = 1 AND status IN ('Review', 'Manual', 'Stale')
       ORDER BY CASE status WHEN 'Stale' THEN 0 WHEN 'Review' THEN 1 ELSE 2 END, last_price_update`
    )
    .all()
    .map((row) => mapAsset(row as Record<string, unknown>));
}

export function listAssetChanges() {
  return getDb()
    .prepare(
      `SELECT id, ticker, action, detail, user, created_at
       FROM asset_changes
       ORDER BY created_at DESC, id DESC
       LIMIT 8`
    )
    .all()
    .map((row) => mapChange(row as Record<string, unknown>));
}

export function upsertAsset(input: {
  ticker: string;
  name: string;
  type: string;
  currency: string;
  latestPrice: number;
  priceSource: string;
  status: Asset["status"];
}) {
  const database = getDb();
  const ticker = input.ticker.trim().toUpperCase();
  const existing = database
    .prepare("SELECT latest_price FROM assets WHERE ticker = ?")
    .get(ticker) as { latest_price: number } | undefined;

  if (existing) {
    database
      .prepare(
        `UPDATE assets
         SET name = ?, type = ?, currency = ?, previous_price = latest_price, latest_price = ?,
             price_source = ?, status = ?, last_price_update = CURRENT_TIMESTAMP,
             active = 1, updated_at = CURRENT_TIMESTAMP
         WHERE ticker = ?`
      )
      .run(input.name, input.type, input.currency, input.latestPrice, input.priceSource, input.status, ticker);

    logChange(ticker, "Updated asset", `${formatMoney(existing.latest_price)} -> ${formatMoney(input.latestPrice)}`);
    return;
  }

  database
    .prepare(
      `INSERT INTO assets (ticker, name, type, currency, latest_price, previous_price, price_source, status, last_price_update)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .run(ticker, input.name, input.type, input.currency, input.latestPrice, input.latestPrice, input.priceSource, input.status);
  logChange(ticker, "Added asset", `${input.type} / ${input.currency} / ${input.priceSource}`);
}

export function updateAssetPrice(id: number, latestPrice: number) {
  const database = getDb();
  const asset = database.prepare("SELECT ticker, latest_price FROM assets WHERE id = ? AND active = 1").get(id) as
    | { ticker: string; latest_price: number }
    | undefined;

  if (!asset) {
    return;
  }

  database
    .prepare(
      `UPDATE assets
       SET previous_price = latest_price, latest_price = ?, status = 'Synced',
           last_price_update = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(latestPrice, id);
  logChange(asset.ticker, "Updated price", `${formatMoney(asset.latest_price)} -> ${formatMoney(latestPrice)}`);
}

export function removeAsset(id: number) {
  const database = getDb();
  const asset = database.prepare("SELECT ticker FROM assets WHERE id = ? AND active = 1").get(id) as { ticker: string } | undefined;

  if (!asset) {
    return;
  }

  database.prepare("UPDATE assets SET active = 0, status = 'Stale', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  logChange(asset.ticker, "Removed asset", "Marked inactive in Asset Master");
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
    { label: "Total Assets", value: String(assets.length), detail: "Active records in SQLite", tone: "text-emerald-600" },
    { label: "Tracked Market Value", value: formatMoney(trackedMarketValue), detail: `${formatSignedMoney(trackedMarketValue - previousMarketValue)} today`, tone: "text-emerald-600" },
    { label: "Assets Needing Update", value: String(needingUpdate), detail: `${Math.max(needingUpdate - 1, 0)} stale over 24h`, tone: "text-orange-500" },
    { label: "Avg. Daily Change", value: `${averageDailyChange >= 0 ? "+" : ""}${averageDailyChange.toFixed(2)}%`, detail: "Across active assets", tone: averageDailyChange >= 0 ? "text-emerald-600" : "text-rose-600" },
  ];
}

export function getTypeBreakdown(assets: Asset[]) {
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-orange-400", "bg-cyan-500"];
  const counts = assets.reduce<Record<string, number>>((acc, asset) => {
    acc[asset.type] = (acc[asset.type] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).map(([label, count], index) => ({
    label,
    value: assets.length === 0 ? "0.0%" : `${((count / assets.length) * 100).toFixed(1)}%`,
    color: colors[index % colors.length],
  }));
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
  }).format(new Date(`${value.replace(" ", "T")}Z`));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value.replace(" ", "T")}Z`));
}

function logChange(ticker: string, action: string, detail: string) {
  getDb()
    .prepare("INSERT INTO asset_changes (ticker, action, detail, user) VALUES (?, ?, ?, 'Admin User')")
    .run(ticker, action, detail);
}
