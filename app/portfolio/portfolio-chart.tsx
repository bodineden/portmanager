"use client";

import { useMemo, useState } from "react";

type Point = { date: string; valueThb: number };
type Range = "1M" | "3M" | "6M" | "ALL";
const W = 900;
const H = 320;
const PAD = { top: 20, right: 24, bottom: 44, left: 64 };

function compact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return value.toFixed(0);
}

function label(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PortfolioChart({ points }: { points: Point[] }) {
  const [range, setRange] = useState<Range>("ALL");
  const selected = useMemo(() => {
    if (range === "ALL" || points.length === 0) return points;
    const latest = new Date(`${points.at(-1)!.date}T00:00:00Z`);
    latest.setUTCMonth(latest.getUTCMonth() - Number.parseInt(range));
    return points.filter((point) => new Date(`${point.date}T00:00:00Z`) >= latest);
  }, [points, range]);

  const monthly = useMemo(() => {
    const groups = new Map<string, Point[]>();
    selected.forEach((point) => { const key = point.date.slice(0, 7); groups.set(key, [...(groups.get(key) ?? []), point]); });
    return [...groups.values()].map((items) => ({ date: items[Math.floor(items.length / 2)].date, valueThb: items.reduce((sum, item) => sum + item.valueThb, 0) / items.length }));
  }, [selected]);

  const allValues = [...selected, ...monthly].map((point) => point.valueThb);
  let min = Math.min(...allValues);
  let max = Math.max(...allValues);
  if (min === max) { min -= 1; max += 1; }
  const padding = Number.isFinite(max - min) ? (max - min) * 0.08 : 1;
  min -= padding; max += padding;
  const innerWidth = W - PAD.left - PAD.right;
  const innerHeight = H - PAD.top - PAD.bottom;
  const timestamp = (date: string) => new Date(`${date}T00:00:00Z`).getTime();
  const start = selected.length ? timestamp(selected[0].date) : 0;
  const end = selected.length ? timestamp(selected.at(-1)!.date) : 1;
  const x = (date: string) => PAD.left + (start === end ? innerWidth / 2 : (timestamp(date) - start) / (end - start) * innerWidth);
  const y = (value: number) => PAD.top + (1 - (value - min) / (max - min)) * innerHeight;
  const path = (items: Point[]) => items.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(1)},${y(point.valueThb).toFixed(1)}`).join(" ");
  const dailyPath = path(selected);
  const area = selected.length ? `${dailyPath} L${x(selected.at(-1)!.date)},${PAD.top + innerHeight} L${x(selected[0].date)},${PAD.top + innerHeight} Z` : "";

  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-bold text-slate-950">Value over time</h2><div className="mt-1 flex gap-4 text-xs font-semibold"><span className="text-blue-600">— Daily value</span><span className="text-amber-600">— Monthly average</span></div></div>
        <div className="inline-flex self-start rounded-lg bg-slate-100 p-1" aria-label="Chart range">
          {(["1M", "3M", "6M", "ALL"] as Range[]).map((option) => <button key={option} type="button" onClick={() => setRange(option)} className={`rounded-md px-3 py-1.5 text-xs font-bold ${range === option ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{option}</button>)}
        </div>
      </div>
      {selected.length < 2 ? <p className="rounded-lg border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">Not enough history in this range. Choose a longer range or wait for more daily cron updates.</p> : (
        <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px] w-full" role="img" aria-label={`Portfolio value over ${range === "ALL" ? "all time" : range}`}>
          {Array.from({ length: 6 }, (_, index) => { const value = min + (max - min) * index / 5; const gy = y(value); return <g key={index}><line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy} stroke="#e2e8f0" /><text x={PAD.left - 8} y={gy + 4} textAnchor="end" fill="#94a3b8" fontSize="11">{compact(value)}</text></g>; })}
          <path d={area} fill="#2563eb" opacity=".08" /><path d={dailyPath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" />
          {monthly.length > 1 ? <path d={path(monthly)} fill="none" stroke="#d97706" strokeWidth="2.5" strokeDasharray="7 5" strokeLinecap="round" /> : null}
          {selected.filter((_, index) => index % Math.max(1, Math.ceil(selected.length / 6)) === 0 || index === selected.length - 1).map((point) => <text key={point.date} x={x(point.date)} y={H - 18} textAnchor="middle" fill="#94a3b8" fontSize="11">{label(point.date)}</text>)}
        </svg></div>
      )}
    </section>
  );
}
