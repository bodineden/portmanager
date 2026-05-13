import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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

type AssetStore = {
  assets: Asset[];
  changes: AssetChange[];
  nextAssetId: number;
  nextChangeId: number;
};

const dbDir = path.join(process.cwd(), ".data");
const dbPath = path.join(dbDir, "portfolio-manager.json");

const seedStore: AssetStore = {
  nextAssetId: 8,
  nextChangeId: 5,
  assets: [
    createSeedAsset(1, "VOO", "Vanguard S&P 500 ETF", "ETF", "USD", 485.23, 481.14, "Yahoo Finance", "Synced", "2024-05-13 10:24:00"),
    createSeedAsset(2, "IWDA", "iShares Core MSCI World ETF", "ETF", "USD", 78.91, 78.42, "Yahoo Finance", "Synced", "2024-05-13 10:18:00"),
    createSeedAsset(3, "AAPL", "Apple Inc.", "Stock", "USD", 189.98, 187.45, "Nasdaq", "Synced", "2024-05-13 09:55:00"),
    createSeedAsset(4, "MSFT", "Microsoft Corp.", "Stock", "USD", 415.37, 412.36, "Nasdaq", "Synced", "2024-05-13 09:52:00"),
    createSeedAsset(5, "TSLA", "Tesla Inc.", "Stock", "USD", 171.89, 172.65, "Nasdaq", "Review", "2024-05-12 16:00:00"),
    createSeedAsset(6, "BND", "Vanguard Total Bond Market ETF", "Bond ETF", "USD", 72.36, 72.27, "Manual", "Manual", "2024-05-12 15:45:00"),
    createSeedAsset(7, "GLD", "SPDR Gold Shares", "Commodity", "USD", 215.64, 214.97, "Manual", "Stale", "2024-05-11 17:12:00"),
  ],
  changes: [
    createSeedChange(1, "VOO", "Updated price", "$481.14 -> $485.23", "Alice Johnson", "2024-05-13 10:24:00"),
    createSeedChange(2, "AAPL", "Added asset", "Stock / USD / Nasdaq", "Admin User", "2024-05-13 09:55:00"),
    createSeedChange(3, "BND", "Changed source", "Manual -> Yahoo Finance", "Bob Smith", "2024-05-12 15:45:00"),
    createSeedChange(4, "ARKK", "Removed inactive asset", "No active holdings", "Admin User", "2024-05-11 12:10:00"),
  ],
};

function createSeedAsset(
  id: number,
  ticker: string,
  name: string,
  type: string,
  currency: string,
  latestPrice: number,
  previousPrice: number,
  priceSource: string,
  status: Asset["status"],
  lastPriceUpdate: string
): Asset {
  return {
    id,
    ticker,
    name,
    type,
    currency,
    latestPrice,
    previousPrice,
    priceSource,
    status,
    lastPriceUpdate,
    active: 1,
  };
}

function createSeedChange(id: number, ticker: string, action: string, detail: string, user: string, createdAt: string): AssetChange {
  return { id, ticker, action, detail, user, createdAt };
}

function readStore(): AssetStore {
  mkdirSync(dbDir, { recursive: true });

  try {
    return JSON.parse(readFileSync(dbPath, "utf8")) as AssetStore;
  } catch {
    writeStore(seedStore);
    return structuredClone(seedStore);
  }
}

function writeStore(store: AssetStore) {
  mkdirSync(dbDir, { recursive: true });
  writeFileSync(dbPath, `${JSON.stringify(store, null, 2)}\n`);
}

function nowSqlDate() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function listAssets() {
  return readStore()
    .assets.filter((asset) => asset.active === 1)
    .sort((left, right) => left.ticker.localeCompare(right.ticker));
}

export function listQueuedAssets() {
  const sortOrder: Record<Asset["status"], number> = {
    Stale: 0,
    Review: 1,
    Manual: 2,
    Synced: 3,
  };

  return listAssets()
    .filter((asset) => asset.status !== "Synced")
    .sort((left, right) => sortOrder[left.status] - sortOrder[right.status] || left.lastPriceUpdate.localeCompare(right.lastPriceUpdate));
}

export function listAssetChanges() {
  return readStore()
    .changes.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id - left.id)
    .slice(0, 8);
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
  const store = readStore();
  const ticker = input.ticker.trim().toUpperCase();
  const existing = store.assets.find((asset) => asset.ticker === ticker);

  if (existing) {
    const previousPrice = existing.latestPrice;
    existing.name = input.name;
    existing.type = input.type;
    existing.currency = input.currency;
    existing.previousPrice = existing.latestPrice;
    existing.latestPrice = input.latestPrice;
    existing.priceSource = input.priceSource;
    existing.status = input.status;
    existing.lastPriceUpdate = nowSqlDate();
    existing.active = 1;
    pushChange(store, ticker, "Updated asset", `${formatMoney(previousPrice)} -> ${formatMoney(input.latestPrice)}`);
    writeStore(store);
    return;
  }

  store.assets.push({
    id: store.nextAssetId,
    ticker,
    name: input.name,
    type: input.type,
    currency: input.currency,
    latestPrice: input.latestPrice,
    previousPrice: input.latestPrice,
    priceSource: input.priceSource,
    status: input.status,
    lastPriceUpdate: nowSqlDate(),
    active: 1,
  });
  store.nextAssetId += 1;
  pushChange(store, ticker, "Added asset", `${input.type} / ${input.currency} / ${input.priceSource}`);
  writeStore(store);
}

export function updateAssetPrice(id: number, latestPrice: number) {
  const store = readStore();
  const asset = store.assets.find((item) => item.id === id && item.active === 1);

  if (!asset) {
    return;
  }

  const previousPrice = asset.latestPrice;
  asset.previousPrice = asset.latestPrice;
  asset.latestPrice = latestPrice;
  asset.status = "Synced";
  asset.lastPriceUpdate = nowSqlDate();
  pushChange(store, asset.ticker, "Updated price", `${formatMoney(previousPrice)} -> ${formatMoney(latestPrice)}`);
  writeStore(store);
}

export function removeAsset(id: number) {
  const store = readStore();
  const asset = store.assets.find((item) => item.id === id && item.active === 1);

  if (!asset) {
    return;
  }

  asset.active = 0;
  asset.status = "Stale";
  pushChange(store, asset.ticker, "Removed asset", "Marked inactive in Asset Master");
  writeStore(store);
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
    { label: "Total Assets", value: String(assets.length), detail: "Active records in local store", tone: "text-emerald-600" },
    { label: "Tracked Market Value", value: formatMoney(trackedMarketValue), detail: `${formatSignedMoney(trackedMarketValue - previousMarketValue)} today`, tone: "text-emerald-600" },
    { label: "Assets Needing Update", value: String(needingUpdate), detail: `${Math.max(needingUpdate - 1, 0)} stale over 24h`, tone: "text-orange-500" },
    { label: "Avg. Daily Change", value: `${averageDailyChange >= 0 ? "+" : ""}${averageDailyChange.toFixed(2)}%`, detail: "Across active assets", tone: averageDailyChange >= 0 ? "text-emerald-600" : "text-rose-600" },
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
  }).format(new Date(`${value.replace(" ", "T")}Z`));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value.replace(" ", "T")}Z`));
}

function pushChange(store: AssetStore, ticker: string, action: string, detail: string) {
  store.changes.push({
    id: store.nextChangeId,
    ticker,
    action,
    detail,
    user: "Admin User",
    createdAt: nowSqlDate(),
  });
  store.nextChangeId += 1;
}
