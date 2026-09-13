"use client";

import { Button, ButtonGroup, Icon } from "@blueprintjs/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PortfolioSnapshot } from "@/lib/pnl-history";

type SnapshotPoint = Pick<PortfolioSnapshot, "date" | "totalValueThb" | "totalValueUsd">;
type LivePoint = { date: string; asOf: string; valueThb: number | null; valueUsd: number | null };
type ChartPoint = { date: string; valueThb: number; valueUsd: number | null; asOf?: string };
type Range = "1M" | "3M" | "6M" | "ALL";

const ranges: Range[] = ["1M", "3M", "6M", "ALL"];
const DAY_MS = 24 * 60 * 60 * 1000;

function dateValue(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function dateLabel(date: string, includeYear = true) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: includeYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(dateValue(date));
}

export function pointLabel(point: ChartPoint) {
  const value = `฿${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(point.valueThb)}`;
  const usd = point.valueUsd !== null
    ? ` · US$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(point.valueUsd)}`
    : "";
  return `${dateLabel(point.date)} · ${value}${usd}`;
}

/** Presentation only: recorded THB, one observation per date, live wins today. */
export function snapshotSeries(snapshots: SnapshotPoint[], livePoint: LivePoint, range: Range): ChartPoint[] {
  const byDate = new Map<string, ChartPoint>();
  for (const snapshot of snapshots) {
    if (snapshot.totalValueThb !== null) byDate.set(snapshot.date, {
      date: snapshot.date, valueThb: snapshot.totalValueThb, valueUsd: snapshot.totalValueUsd,
    });
  }
  if (livePoint.valueThb !== null && Number.isFinite(livePoint.valueThb)) {
    byDate.set(livePoint.date, { ...livePoint, valueThb: livePoint.valueThb });
  }
  const cutoff = dateValue(livePoint.date);
  if (range !== "ALL") cutoff.setUTCMonth(cutoff.getUTCMonth() - Number.parseInt(range, 10));
  return [...byDate.values()].filter((point) => range === "ALL" || dateValue(point.date) >= cutoff)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function PortfolioChart({ snapshots, livePoint }: { snapshots: SnapshotPoint[]; livePoint: LivePoint }) {
  const [range, setRange] = useState<Range>("ALL");
  const [chartError, setChartError] = useState("");
  const target = useRef<HTMLDivElement>(null);
  const points = useMemo(() => snapshotSeries(snapshots, livePoint, range), [snapshots, livePoint, range]);
  const hasChartData = points.length > 0;

  useEffect(() => {
    if (!target.current || !hasChartData) return undefined;

    const host = target.current;
    let disposed = false;
    let release: (() => void) | undefined;
    setChartError("");

    async function renderChart() {
      try {
        const Plottable = await import("plottable");
        if (disposed || !host.isConnected) return;

        host.replaceChildren();
        const xScale = new Plottable.Scales.Time();
        const yScale = new Plottable.Scales.Linear();
        const xTimes = points.map((point) => dateValue(point.date).getTime());
        const values = points.map((point) => point.valueThb);
        const minTime = Math.min(...xTimes);
        const maxTime = Math.max(...xTimes);
        const timePadding = minTime === maxTime ? DAY_MS : Math.max(DAY_MS, (maxTime - minTime) * 0.04);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const valuePadding = Math.max(1, Math.abs(maxValue) * 0.08, (maxValue - minValue) * 0.12);

        xScale.domain([new Date(minTime - timePadding), new Date(maxTime + timePadding)]);
        yScale.domain([Math.max(0, minValue - valuePadding), maxValue + valuePadding]);

        const dataset = new Plottable.Dataset(points);
        const line = new Plottable.Plots.Line<Date>()
          .addDataset(dataset)
          .x((point: ChartPoint) => dateValue(point.date), xScale)
          .y((point: ChartPoint) => point.valueThb, yScale)
          .attr("stroke", "#355CC9")
          .attr("stroke-width", 1.75);
        const markers = new Plottable.Plots.Scatter<Date, number>()
          .addDataset(dataset)
          .x((point: ChartPoint) => dateValue(point.date), xScale)
          .y((point: ChartPoint) => point.valueThb, yScale)
          .size(10)
          .symbol(() => Plottable.SymbolFactories.diamond())
          .attr("fill", "#355CC9")
          .attr("stroke", "#FFFFFF")
          .attr("stroke-width", 1.5);
        const gridlines = new Plottable.Components.Gridlines(xScale, yScale);
        const plotGroup = new Plottable.Components.Group([gridlines, line, markers]);
        const xAxis = new Plottable.Axes.Time(xScale, "bottom");
        const yAxis = new Plottable.Axes.Numeric(yScale, "left").formatter(compactNumber);
        const chart = new Plottable.Components.Table([[yAxis, plotGroup], [null, xAxis]]);

        chart.renderTo(host);
        host.dataset.chartReady = "true";

        const tooltip = document.createElement("div");
        tooltip.className = "portfolio-chart-tooltip";
        tooltip.setAttribute("role", "tooltip");
        host.appendChild(tooltip);

        const pointer = new Plottable.Interactions.Pointer();
        pointer.attachTo(plotGroup);
        pointer.onPointerMove((position) => {
          const entity = markers.entityNearest(position);
          const distance = entity
            ? Math.hypot(entity.position.x - position.x, entity.position.y - position.y)
            : Number.POSITIVE_INFINITY;

          if (!entity || distance > 34) {
            tooltip.classList.remove("is-visible");
            return;
          }

          tooltip.textContent = pointLabel(entity.datum as ChartPoint);
          tooltip.style.left = `${Math.min(host.clientWidth - 84, Math.max(84, entity.position.x + 50))}px`;
          tooltip.style.top = `${Math.max(18, entity.position.y - 4)}px`;
          tooltip.classList.add("is-visible");
        });
        pointer.onPointerExit(() => tooltip.classList.remove("is-visible"));

        const observer = new ResizeObserver(() => chart.redraw());
        observer.observe(host);

        release = () => {
          pointer.detachFrom(plotGroup);
          observer.disconnect();
          tooltip.remove();
          delete host.dataset.chartReady;
          chart.destroy();
        };

        if (disposed) release();
      } catch {
        if (!disposed) setChartError("The chart engine could not render this snapshot.");
      }
    }

    void renderChart();
    return () => {
      disposed = true;
      release?.();
    };
  }, [points, hasChartData]);

  const ariaLabel = `Live recorded daily portfolio snapshots in THB. ${points.length} points. ${
    livePoint.valueThb === null ? "The live joined total is unavailable." : `Latest live joined value: ${pointLabel({ ...livePoint, valueThb: livePoint.valueThb })}.`
  }`;
  return (
    <section className="panel portfolio-chart-panel">
      <div className="portfolio-chart-header">
        <div>
          <p className="eyebrow">RECORDED DAILY SNAPSHOTS / THB</p>
          <h2 className="panel-title">Live portfolio value</h2>
          <p className="panel-subtitle">Each point is a recorded daily joined snapshot, THB first; recorded USD is shown in the tooltip.</p>
          <div className="chart-legend" aria-label="Chart legend">
            <span><i className="legend-marker live" /> Live joined snapshot</span>
          </div>
        </div>
        <ButtonGroup className="range-selector" aria-label="Snapshot range" minimal>
          {ranges.map((option) => (
            <Button key={option} type="button" active={range === option} onClick={() => setRange(option)} text={option} aria-pressed={range === option} />
          ))}
        </ButtonGroup>
      </div>

      {!hasChartData ? (
        <div className="portfolio-chart-empty"><Icon icon="timeline-line-chart" size={24} /><span>No recorded daily snapshot yet.</span><small>The chart will populate as daily snapshots are recorded.</small></div>
      ) : chartError ? (
        <div className="portfolio-chart-empty is-error"><Icon icon="error" size={24} /><span>{chartError}</span></div>
      ) : (
        <div ref={target} className="portfolio-chart-host" role="img" aria-label={ariaLabel} data-range={range} />
      )}
    </section>
  );
}
