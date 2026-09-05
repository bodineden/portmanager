"use client";

import { Button, ButtonGroup, Icon } from "@blueprintjs/core";
import { useEffect, useMemo, useRef, useState } from "react";

type LegacyPoint = { date: string; valueThb: number };
type LivePoint = { date: string; asOf: string; valueThb: number | null; valueUsd: number | null };
type ChartPoint = LegacyPoint & { series: "legacy" | "live"; asOf?: string; valueUsd?: number | null };
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

function pointLabel(point: ChartPoint) {
  const value = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(point.valueThb);
  const usd = point.series === "live" && point.valueUsd !== null && point.valueUsd !== undefined
    ? `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(point.valueUsd)} · `
    : "";
  return `${point.series === "live" ? "LIVE JOINED" : "LEGACY RECORD"} · ${dateLabel(point.date)} · ${usd}${value}`;
}

export function PortfolioChart({
  legacyPoints,
  livePoint,
}: {
  legacyPoints: LegacyPoint[];
  livePoint: LivePoint;
}) {
  const [range, setRange] = useState<Range>("ALL");
  const [chartError, setChartError] = useState("");
  const target = useRef<HTMLDivElement>(null);

  const selectedLegacy = useMemo(() => {
    if (range === "ALL" || legacyPoints.length === 0) return legacyPoints;
    const cutoff = dateValue(livePoint.date);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - Number.parseInt(range, 10));
    return legacyPoints.filter((point) => dateValue(point.date) >= cutoff);
  }, [legacyPoints, livePoint.date, range]);

  const chartLegacy = useMemo<ChartPoint[]>(
    () => selectedLegacy.map((point) => ({ ...point, series: "legacy" })),
    [selectedLegacy],
  );
  const chartLive = useMemo<ChartPoint | null>(() => {
    if (livePoint.valueThb === null || !Number.isFinite(livePoint.valueThb)) return null;
    return {
      date: livePoint.date,
      asOf: livePoint.asOf,
      valueThb: livePoint.valueThb,
      valueUsd: livePoint.valueUsd,
      series: "live",
    };
  }, [livePoint]);
  const hasChartData = chartLegacy.length > 0 || chartLive !== null;

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
        const allPoints = chartLive ? [...chartLegacy, chartLive] : chartLegacy;
        const xTimes = allPoints.map((point) => dateValue(point.date).getTime());
        const values = allPoints.map((point) => point.valueThb);
        const minTime = Math.min(...xTimes);
        const maxTime = Math.max(...xTimes);
        const timePadding = minTime === maxTime ? DAY_MS : Math.max(DAY_MS, (maxTime - minTime) * 0.04);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const valuePadding = Math.max(1, Math.abs(maxValue) * 0.08, (maxValue - minValue) * 0.12);

        xScale.domain([new Date(minTime - timePadding), new Date(maxTime + timePadding)]);
        yScale.domain([Math.max(0, minValue - valuePadding), maxValue + valuePadding]);

        const legacyDataset = new Plottable.Dataset(chartLegacy);
        const liveDataset = new Plottable.Dataset(chartLive ? [chartLive] : []);

        // This line belongs only to the retired Neon series. It deliberately
        // stops before the live point so the two valuation models are not joined.
        const legacyLine = new Plottable.Plots.Line<Date>()
          .addDataset(legacyDataset)
          .x((point: ChartPoint) => dateValue(point.date), xScale)
          .y((point: ChartPoint) => point.valueThb, yScale)
          .attr("stroke", "#64748B")
          .attr("stroke-width", 1.75)
          .attr("stroke-dasharray", "4 5");

        const legacyDots = new Plottable.Plots.Scatter<Date, number>()
          .addDataset(legacyDataset)
          .x((point: ChartPoint) => dateValue(point.date), xScale)
          .y((point: ChartPoint) => point.valueThb, yScale)
          .size(4)
          .attr("fill", "#8290A5")
          .attr("stroke", "#FFFFFF")
          .attr("stroke-width", 1);

        const liveHalo = new Plottable.Plots.Scatter<Date, number>()
          .addDataset(liveDataset)
          .x((point: ChartPoint) => dateValue(point.date), xScale)
          .y((point: ChartPoint) => point.valueThb, yScale)
          .size(22)
          .symbol(() => Plottable.SymbolFactories.diamond())
          .attr("fill", "rgba(53, 92, 201, 0.12)")
          .attr("stroke", "rgba(53, 92, 201, 0.28)")
          .attr("stroke-width", 1);

        const liveMarker = new Plottable.Plots.Scatter<Date, number>()
          .addDataset(liveDataset)
          .x((point: ChartPoint) => dateValue(point.date), xScale)
          .y((point: ChartPoint) => point.valueThb, yScale)
          .size(10)
          .symbol(() => Plottable.SymbolFactories.diamond())
          .attr("fill", "#355CC9")
          .attr("stroke", "#FFFFFF")
          .attr("stroke-width", 1.5);

        const transitionGuide = chartLive
          ? new Plottable.Components.GuideLineLayer<Date>("vertical")
            .scale(xScale)
            .value(dateValue(chartLive.date))
          : null;
        const gridlines = new Plottable.Components.Gridlines(xScale, yScale);
        const plotGroup = new Plottable.Components.Group([
          gridlines,
          ...(transitionGuide ? [transitionGuide] : []),
          legacyLine,
          legacyDots,
          liveHalo,
          liveMarker,
        ]);
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
          const legacyEntity = chartLegacy.length > 0 ? legacyDots.entityNearest(position) : undefined;
          const liveEntity = chartLive ? liveMarker.entityNearest(position) : undefined;
          const distance = (entity: typeof legacyEntity) => entity
            ? Math.hypot(entity.position.x - position.x, entity.position.y - position.y)
            : Number.POSITIVE_INFINITY;
          const entity = distance(liveEntity) < distance(legacyEntity) ? liveEntity : legacyEntity;

          if (!entity || distance(entity) > 34) {
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
  }, [chartLegacy, chartLive, hasChartData]);

  const boundaryMessage = chartLive && legacyPoints.length > 0
    ? `Legacy Neon context ends ${dateLabel(legacyPoints.at(-1)!.date)}. The live joined snapshot begins ${dateLabel(livePoint.date)}; no line or return comparison crosses this boundary.`
    : chartLive
      ? `The live joined snapshot on ${dateLabel(livePoint.date)} is shown as a standalone baseline. No legacy history is inferred.`
      : "The live joined total is unavailable from one or more sources. Any legacy values shown remain retired-ledger context only.";
  const ariaLabel = chartLive
    ? `Live joined portfolio value is ${pointLabel(chartLive)}. ${selectedLegacy.length} legacy Neon records are shown separately, with no connecting line.`
    : `The live joined portfolio value is unavailable. ${selectedLegacy.length} legacy Neon records are shown only as retired-ledger context.`;

  return (
    <section className="panel portfolio-chart-panel">
      <div className="portfolio-chart-header">
        <div>
          <p className="eyebrow">VALUATION CONTEXT / ORIGINAL THB UNITS</p>
          <h2 className="panel-title">Live value with legacy context</h2>
          <p className="panel-subtitle">The archive records THB only. No historical USD conversion is inferred.</p>
          <div className="chart-legend" aria-label="Chart legend">
            <span><i className="legend-line legacy" /> Legacy Neon ledger</span>
            <span className={chartLive ? "" : "is-unavailable"}><i className="legend-marker live" /> Live joined snapshot{chartLive ? "" : " unavailable"}</span>
            <span><i className="legend-boundary" /> Valuation boundary</span>
          </div>
        </div>
        <ButtonGroup className="range-selector" aria-label="Legacy context range" minimal>
          {ranges.map((option) => (
            <Button key={option} type="button" active={range === option} onClick={() => setRange(option)} text={option} aria-pressed={range === option} />
          ))}
        </ButtonGroup>
      </div>

      <div className={`portfolio-transition-note ${chartLive ? "" : "is-unavailable"}`}>
        <span>{chartLive && legacyPoints.length > 0 ? "SERIES BOUNDARY" : chartLive ? "LIVE BASELINE" : "LIVE UNAVAILABLE"}</span>
        <p>{boundaryMessage}</p>
      </div>

      {!hasChartData ? (
        <div className="portfolio-chart-empty"><Icon icon="timeline-line-chart" size={24} /><span>No valuation snapshot is available.</span><small>The page will populate when a live total or legacy context can be read.</small></div>
      ) : chartError ? (
        <div className="portfolio-chart-empty is-error"><Icon icon="error" size={24} /><span>{chartError}</span></div>
      ) : (
        <div ref={target} className="portfolio-chart-host" role="img" aria-label={ariaLabel} data-range={range} />
      )}
    </section>
  );
}
