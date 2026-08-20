"use client";

import { Button, ButtonGroup, Icon } from "@blueprintjs/core";
import { useEffect, useMemo, useRef, useState } from "react";

type Point = { date: string; valueThb: number };
type Range = "1M" | "3M" | "6M" | "ALL";

const ranges: Range[] = ["1M", "3M", "6M", "ALL"];

function dateValue(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function pointLabel(point: Point) {
  const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(dateValue(point.date));
  const value = new Intl.NumberFormat("en-US", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(point.valueThb);
  return `${date} · ${value}`;
}

export function PortfolioChart({ points }: { points: Point[] }) {
  const [range, setRange] = useState<Range>("ALL");
  const [chartError, setChartError] = useState("");
  const target = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => {
    if (range === "ALL" || points.length === 0) return points;
    const latest = dateValue(points.at(-1)!.date);
    latest.setUTCMonth(latest.getUTCMonth() - Number.parseInt(range, 10));
    return points.filter((point) => dateValue(point.date) >= latest);
  }, [points, range]);

  const monthly = useMemo(() => {
    const groups = new Map<string, Point[]>();
    selected.forEach((point) => {
      const key = point.date.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), point]);
    });
    return [...groups.values()].map((items) => ({
      date: items[Math.floor(items.length / 2)].date,
      valueThb: items.reduce((sum, item) => sum + item.valueThb, 0) / items.length,
    }));
  }, [selected]);

  useEffect(() => {
    if (!target.current || selected.length < 2) return undefined;

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
        const dailyDataset = new Plottable.Dataset(selected);
        const monthlyDataset = new Plottable.Dataset(monthly);

        const dailyLine = new Plottable.Plots.Line<Date>()
          .addDataset(dailyDataset)
          .x((point: Point) => dateValue(point.date), xScale)
          .y((point: Point) => Number(point.valueThb), yScale)
          .attr("stroke", "#38BDF8")
          .attr("stroke-width", 2.5);

        const dailyDots = new Plottable.Plots.Scatter<Date, number>()
          .addDataset(dailyDataset)
          .x((point: Point) => dateValue(point.date), xScale)
          .y((point: Point) => Number(point.valueThb), yScale)
          .size(5)
          .attr("fill", "#38BDF8")
          .attr("stroke", "#0B0E14")
          .attr("stroke-width", 1.5);

        const monthlyLine = new Plottable.Plots.Line<Date>()
          .addDataset(monthlyDataset)
          .x((point: Point) => dateValue(point.date), xScale)
          .y((point: Point) => Number(point.valueThb), yScale)
          .attr("stroke", "#FBBF24")
          .attr("stroke-width", 2.25)
          .attr("stroke-dasharray", "7 5");

        const gridlines = new Plottable.Components.Gridlines(xScale, yScale);
        const plotGroup = new Plottable.Components.Group([gridlines, dailyLine, monthlyLine, dailyDots]);
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
        pointer.attachTo(dailyDots);
        pointer.onPointerMove((position) => {
          const entity = dailyDots.entityNearest(position);
          if (!entity) {
            tooltip.classList.remove("is-visible");
            return;
          }
          tooltip.textContent = pointLabel(entity.datum);
          tooltip.style.left = `${Math.min(host.clientWidth - 12, Math.max(58, entity.position.x + 48))}px`;
          tooltip.style.top = `${Math.max(12, entity.position.y - 4)}px`;
          tooltip.classList.add("is-visible");
        });
        pointer.onPointerExit(() => tooltip.classList.remove("is-visible"));

        const observer = new ResizeObserver(() => chart.redraw());
        observer.observe(host);

        release = () => {
          pointer.detachFrom(dailyDots);
          observer.disconnect();
          tooltip.remove();
          delete host.dataset.chartReady;
          chart.destroy();
        };

        if (disposed) release();
      } catch {
        if (!disposed) setChartError("The chart engine could not render this series.");
      }
    }

    void renderChart();
    return () => {
      disposed = true;
      release?.();
    };
  }, [monthly, selected]);

  const latest = selected.at(-1);
  const earliest = selected[0];
  const ariaLabel = selected.length > 0
    ? `Portfolio value over ${range === "ALL" ? "all time" : range}, from ${pointLabel(earliest)} to ${pointLabel(latest!)}, with a dashed monthly average trend.`
    : `No portfolio history for ${range === "ALL" ? "all time" : range}.`;

  return (
    <section className="panel portfolio-chart-panel">
      <div className="portfolio-chart-header">
        <div>
          <p className="eyebrow">VALUE SERIES / THB</p>
          <h2 className="panel-title">Value over time</h2>
          <div className="chart-legend" aria-label="Chart legend">
            <span><i className="legend-line daily" /> Daily portfolio total</span>
            <span><i className="legend-line monthly" /> Monthly average</span>
          </div>
        </div>
        <ButtonGroup className="range-selector" aria-label="Chart range" minimal>
          {ranges.map((option) => (
            <Button key={option} type="button" active={range === option} onClick={() => setRange(option)} text={option} aria-pressed={range === option} />
          ))}
        </ButtonGroup>
      </div>

      {selected.length < 2 ? (
        <div className="portfolio-chart-empty"><Icon icon="timeline-line-chart" size={24} /><span>Not enough history in this range.</span><small>Choose a longer range or wait for more daily price updates.</small></div>
      ) : chartError ? (
        <div className="portfolio-chart-empty is-error"><Icon icon="error" size={24} /><span>{chartError}</span></div>
      ) : (
        <div ref={target} className="portfolio-chart-host" role="img" aria-label={ariaLabel} data-range={range} />
      )}
    </section>
  );
}
