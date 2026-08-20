"use client";

import { useMemo, useState } from "react";
import { PendingButton } from "../components/pending-button";
import { calculateChangePercent } from "@/lib/portfolio-helpers";

export type DashboardAsset = {
  id: string;
  ticker: string;
  fullName: string;
  currencyCode: string;
  currentPrice: number;
  previousPrice: number;
  valueThb: number;
  updatedAt: string;
};

export function AssetDashboard({ assets, updatePriceAction }: {
  assets: DashboardAsset[];
  updatePriceAction: (formData: FormData) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("ticker");
  const visible = useMemo(() => assets
    .filter((asset) => `${asset.ticker} ${asset.fullName}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      if (sort === "value") return b.valueThb - a.valueThb;
      if (sort === "change") return calculateChangePercent(b.currentPrice, b.previousPrice) - calculateChangePercent(a.currentPrice, a.previousPrice);
      return a.ticker.localeCompare(b.ticker);
    }), [assets, query, sort]);

  return (
    <section className="asset-dashboard">
      <div className="asset-dashboard-header">
        <div>
          <p className="eyebrow">Live price controls</p>
          <h2 className="panel-title">Tracked Assets</h2>
          <p className="panel-subtitle">Current prices and one-day performance</p>
        </div>
        <div className="asset-dashboard-controls">
          <input aria-label="Search assets" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker or name" className="asset-field-control asset-dashboard-search" />
          <select aria-label="Sort assets" value={sort} onChange={(event) => setSort(event.target.value)} className="asset-field-control asset-dashboard-sort mono">
            <option value="ticker">Sort: Ticker</option>
            <option value="value">Sort: Value</option>
            <option value="change">Sort: Change</option>
          </select>
          <span className="panel-count">{visible.length} / {assets.length}</span>
        </div>
      </div>
      {visible.length === 0 ? <p className="asset-empty-state asset-dashboard-empty">No assets match your search.</p> : null}
      <div className="asset-price-grid">
        {visible.map((asset) => {
          const change = calculateChangePercent(asset.currentPrice, asset.previousPrice);
          const positive = change >= 0;
          return (
            <form key={asset.id} action={updatePriceAction} className={`asset-price-card ${positive ? "is-positive" : "is-negative"}`}>
              <input type="hidden" name="id" value={asset.id} />
              <div className="asset-price-card-head">
                <div className="asset-price-identity">
                  <div><span className="ticker-badge">{asset.ticker}</span><span className="currency-badge">{asset.currencyCode}</span></div>
                  <h3>{asset.fullName}</h3>
                </div>
                <span className={`change-badge numeric ${positive ? "positive" : "negative"}`}>{positive ? "+" : ""}{change.toFixed(2)}%</span>
              </div>
              <div className="asset-price-readout">
                <div><span>Previous</span><strong className="numeric muted">{asset.previousPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                <div><span>Current</span><strong className="numeric">{asset.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              </div>
              <div className="asset-price-update">
                <label className="asset-field"><span>Update price</span><input aria-label={`${asset.ticker} price`} name="currentPrice" defaultValue={asset.currentPrice.toFixed(2)} inputMode="decimal" className="asset-field-control asset-number-input" /></label>
                <PendingButton className="pm-button pm-button-primary asset-price-save" pendingLabel="Saving">Save</PendingButton>
              </div>
              <div className="asset-price-foot">
                <span><small>Position value</small><strong className="numeric">{asset.valueThb.toLocaleString("en-US", { style: "currency", currency: "THB", maximumFractionDigits: 0 })}</strong></span>
                <span><small>Updated</small><strong className="mono">{asset.updatedAt}</strong></span>
              </div>
            </form>
          );
        })}
      </div>
    </section>
  );
}
