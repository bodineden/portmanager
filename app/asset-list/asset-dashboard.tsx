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
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Assets</h2>
          <p className="text-sm text-slate-500">Current prices and one-day performance</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="Search assets" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker or name" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 sm:w-60" />
          <select aria-label="Sort assets" value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
            <option value="ticker">Sort: Ticker</option>
            <option value="value">Sort: Value</option>
            <option value="change">Sort: Change</option>
          </select>
        </div>
      </div>
      {visible.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No assets match your search.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {visible.map((asset) => {
          const change = calculateChangePercent(asset.currentPrice, asset.previousPrice);
          const positive = change >= 0;
          return (
            <form key={asset.id} action={updatePriceAction} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <input type="hidden" name="id" value={asset.id} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="rounded-md bg-slate-950 px-2 py-1 text-xs font-bold text-white">{asset.ticker}</span><span className="text-xs font-semibold text-slate-400">{asset.currencyCode}</span></div>
                  <h3 className="mt-3 truncate font-semibold text-slate-800">{asset.fullName}</h3>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{positive ? "+" : ""}{change.toFixed(2)}%</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 border-y border-slate-100 py-4">
                <div><p className="text-xs font-medium text-slate-400">Previous</p><p className="mt-1 text-sm font-semibold text-slate-600">{asset.previousPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
                <div className="text-right"><p className="text-xs font-medium text-slate-400">Current</p><p className="mt-1 text-xl font-bold text-slate-950">{asset.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
              </div>
              <div className="mt-4 flex items-end gap-2">
                <label className="min-w-0 flex-1"><span className="mb-1 block text-xs font-semibold text-slate-500">Update price</span><input aria-label={`${asset.ticker} price`} name="currentPrice" defaultValue={asset.currentPrice.toFixed(2)} inputMode="decimal" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-right text-sm font-semibold outline-none focus:border-blue-400" /></label>
                <PendingButton className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700" pendingLabel="Saving">Save</PendingButton>
              </div>
              <p className="mt-3 flex justify-between text-xs text-slate-400"><span>Value {asset.valueThb.toLocaleString("en-US", { style: "currency", currency: "THB", maximumFractionDigits: 0 })}</span><span>{asset.updatedAt}</span></p>
            </form>
          );
        })}
      </div>
    </section>
  );
}
