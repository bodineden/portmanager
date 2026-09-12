import { neon } from "@neondatabase/serverless";
import { isNeonConfigured } from "./assets-db";
import type { AcquisitionEvidence } from "./pnl";
import type { SnapshotDb, SnapshotReaderOptions } from "./pnl-history";

function defaultDb(): SnapshotDb {
  const sql = neon(process.env.DATABASE_URL!);
  return { query: (text, params, signal) => sql.query(text, params, { fetchOptions: { signal } }) };
}

async function bounded<T>(options: SnapshotReaderOptions, action: (db: SnapshotDb, signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const requested = options.timeoutMs ?? 2000;
  const ms = Number.isFinite(requested) && requested > 0 && requested <= 30000 ? requested : 2000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([action((options.getDb ?? defaultDb)(), controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Basis evidence read timed out"));
        controller.abort();
      }, ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}
function decimals(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 36;
}
function raw(value: unknown): boolean {
  return typeof value === "string" && /^\d{1,100}$/.test(value);
}
function price(value: unknown): boolean {
  return value === null || (object(value) && typeof value.provider === "string" && ["defillama-historical", "coingecko-history"].includes(value.provider)
    && text(value.assetId) && text(value.timestamp) && typeof value.priceUsd === "number" && Number.isFinite(value.priceUsd));
}
function evidenceShape(value: unknown): value is AcquisitionEvidence {
  if (!object(value) || typeof value.source !== "string" || !["rpc", "blockscout-v2", "opensea-v2"].includes(value.source)
    || typeof value.chainId !== "number" || !Number.isSafeInteger(value.chainId) || value.chainId <= 0
    || !text(value.assetId) || !decimals(value.decimals) || typeof value.complete !== "boolean"
    || typeof value.hasDisposals !== "boolean" || !Array.isArray(value.lots)) return false;
  return value.lots.every((lot: unknown) => object(lot) && text(lot.transactionHash) && text(lot.acquiredAt)
    && raw(lot.quantityRaw) && typeof lot.operation === "string"
    && ["purchase", "funding-arrival", "mint", "claim", "airdrop", "transfer", "bridge", "exchange-deposit", "wrapper", "unknown"].includes(lot.operation)
    && typeof lot.success === "boolean" && typeof lot.allPaymentLegsObserved === "boolean"
    && typeof lot.acquiredAssetCount === "number" && Number.isSafeInteger(lot.acquiredAssetCount) && lot.acquiredAssetCount > 0
    && (lot.acquiredAssetIds === undefined || (Array.isArray(lot.acquiredAssetIds) && lot.acquiredAssetIds.every(text)))
    && raw(lot.nativeOutflowRaw) && price(lot.nativePrice) && Array.isArray(lot.tokenOutflows)
    && lot.tokenOutflows.every((payment: unknown) => object(payment) && text(payment.assetId)
      && raw(payment.amountRaw) && decimals(payment.decimals) && price(payment.historicalPrice)));
}

/** SELECT-only latest cache. Collection time is not acquisition time; the pure
 * engine checks lot dates against asOf. Never initialize schema or add a source. */
export async function readBasisEvidence(asOf: string, options: SnapshotReaderOptions = {}): Promise<Record<string, AcquisitionEvidence>> {
  void asOf; // Deliberately no date filter on this latest-collection cache.
  try {
    if (!(options.hasDb ?? isNeonConfigured)()) return {};
    const rows = await bounded(options, (db, signal) => db.query("SELECT holding_key, evidence FROM basis_evidence", [], signal));
    if (!Array.isArray(rows)) return {};
    const entries: [string, AcquisitionEvidence][] = [];
    for (const row of rows) {
      try {
        if (object(row) && text(row.holding_key) && /^(nft|native|token):/.test(row.holding_key) && evidenceShape(row.evidence)) {
          entries.push([row.holding_key, row.evidence]);
        }
      } catch { /* A malformed row must not discard valid siblings. */ }
    }
    return Object.fromEntries(entries);
  } catch {
    try { (options.log ?? console.warn)("[basis_evidence] Read unavailable; page remains available."); } catch { /* fail soft */ }
    return {};
  }
}
