"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PortfolioSnapshot } from "@/lib/pnl-history";
import { calendarDays, coverageLabel, formatCalendarUsd, formatPnlPercent, formatViewThb, formatViewUsd, historyLineSegments, historyPeriodRows, type HistoryPeriod } from "@/lib/pnl-view";

const periods: HistoryPeriod[] = ["1M", "3M", "All"];

export function PnlPerformance({ snapshots, asOf }: { snapshots: PortfolioSnapshot[]; asOf: string }) {
  const [period, setPeriod] = useState<HistoryPeriod>("All");
  const [chartError, setChartError] = useState(false);
  const target = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => historyPeriodRows(snapshots, period, asOf), [snapshots, period, asOf]);
  const valueRows = useMemo(() => rows.filter((row) => row.totalValueUsd !== null), [rows]);

  useEffect(() => {
    if (chartError || !target.current || valueRows.length === 0) return;
    const host = target.current;
    let disposed = false;
    let release: (() => void) | undefined;
    async function draw() {
      try {
        const P = await import("plottable");
        if (disposed || !host.isConnected) return;
        host.replaceChildren();
        const x = new P.Scales.Time();
        const y = new P.Scales.Linear();
        const times = valueRows.map((row) => Date.parse(`${row.date}T00:00:00Z`));
        const values = rows.flatMap((row) => [row.totalValueUsd, row.costBasisUsd].filter((value): value is number => value !== null));
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const maxValue = Math.max(...values);
        const minValue = Math.min(...values);
        const pad = Math.max(1, (maxValue - minValue) * .12, maxValue * .06);
        x.domain([new Date(minTime - 86_400_000), new Date(maxTime + 86_400_000)]);
        y.domain([Math.max(0, minValue - pad), maxValue + pad]);
        const plots: NonNullable<ConstructorParameters<typeof P.Components.Group>[0]> = [new P.Components.Gridlines(null, y)];
        for (const field of ["totalValueUsd", "costBasisUsd"] as const) {
          const color = field === "totalValueUsd" ? "#355CC9" : "#7454B6";
          // No line spans a missing observation or a missing cost basis.
          for (const segment of historyLineSegments(rows, field)) {
            const line = new P.Plots.Line<Date>().addDataset(new P.Dataset(segment))
              .x((row: PortfolioSnapshot) => new Date(`${row.date}T00:00:00Z`), x)
              .y((row: PortfolioSnapshot) => row[field]!, y)
              .attr("stroke", color).attr("stroke-width", 2.5);
            if (field === "costBasisUsd") line.attr("stroke-dasharray", "5 4");
            plots.push(line);
          }
          const dots = new P.Plots.Scatter<Date, number>().addDataset(new P.Dataset(rows.filter((row) => row[field] !== null)))
            .x((row: PortfolioSnapshot) => new Date(`${row.date}T00:00:00Z`), x)
            .y((row: PortfolioSnapshot) => row[field]!, y).size(6)
            .attr("fill", color).attr("stroke", "#FFFFFF").attr("stroke-width", 1.5);
          plots.push(dots);
        }
        const plot = new P.Components.Group(plots);
        const chart = new P.Components.Table([
          [new P.Axes.Numeric(y, "left").formatter(formatCalendarUsd), plot],
          [null, new P.Axes.Time(x, "bottom")],
        ]);
        chart.renderTo(host);
        host.dataset.chartReady = "true";
        const observer = new ResizeObserver(() => chart.redraw());
        observer.observe(host);
        release = () => { observer.disconnect(); delete host.dataset.chartReady; chart.destroy(); };
        if (disposed) release();
      } catch {
        if (!disposed) setChartError(true);
      }
    }
    void draw();
    return () => { disposed = true; release?.(); };
  }, [chartError, rows, valueRows]);

  return <section className="panel pnl-performance" data-history-count={snapshots.length} data-period-count={rows.length}>
    <div className="panel-header"><div><p className="eyebrow">DAILY OBSERVATIONS / USD</p><h2 className="panel-title">Performance</h2></div>
      <div className="pnl-periods" role="group" aria-label="Performance period">{periods.map((option) => <button key={option} type="button" disabled={snapshots.length === 0} aria-pressed={period === option} onClick={() => { setChartError(false); setPeriod(option); }}>{option}</button>)}</div>
    </div>
    <div className="pnl-chart-legend"><span><i />Portfolio value</span><span><i className="is-cost" />Recorded cost basis</span></div>
    {rows.length === 0 ? <div className="pnl-history-empty"><span className="pnl-empty-symbol" aria-hidden="true">↗</span><h3>{snapshots.length === 0 ? "History starts today" : "No snapshots in this period"}</h3><p>{snapshots.length === 0 ? "Daily observations will appear as snapshots are recorded. There is no backfilled performance history." : "Choose All to view earlier recorded observations."}</p><small>No historical value or cost basis is inferred.</small></div>
      : chartError || valueRows.length === 0 ? <div className="pnl-history-empty"><h3>Chart unavailable</h3><p>The recorded observations are available in the table below.</p></div>
        : <div className="pnl-chart-host" ref={target} role="img" aria-label={`${rows.length} daily snapshots in USD. Portfolio value and eligible recorded cost basis are separate series; their difference is not whole-portfolio P&L when coverage is partial.`} />}
    <p className="pnl-panel-note">Cost covers eligible holdings only; value includes cash and excluded holdings. The gap between the lines is not whole-portfolio P&amp;L. Missing days and basis remain gaps.</p>
    {rows.length > 0 && <details className="pnl-history-details"><summary>Recorded observations · {rows.length}</summary><div className="table-scroll"><table className="data-table"><caption className="sr-only">Performance observations and coverage</caption><thead><tr><th>UTC date</th><th>Value · USD / THB</th><th>Basis · USD / THB</th><th>Coverage</th></tr></thead><tbody>{rows.map((row) => <tr key={row.date}><td>{row.date}</td><td>{formatViewUsd(row.totalValueUsd)}<small className="sub-cell">{formatViewThb(row.totalValueThb)}</small></td><td>{formatViewUsd(row.costBasisUsd)}<small className="sub-cell">{formatViewThb(row.costBasisThb)}</small></td><td>{row.coverage.status}<small className="sub-cell">{row.coverage.eligible}/{row.coverage.totalHoldings} eligible</small></td></tr>)}</tbody></table></div></details>}
  </section>;
}

export function PnlCalendar({ snapshots, asOf }: { snapshots: PortfolioSnapshot[]; asOf: string }) {
  const currentMonth = asOf.slice(0, 7);
  const months = [...new Set([currentMonth, ...snapshots.map((row) => row.date.slice(0, 7))])].sort();
  const [month, setMonth] = useState(currentMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const days = calendarDays(month);
  const monthRows = snapshots.filter((row) => row.date.startsWith(month));
  const byDate = new Map(monthRows.map((row) => [row.date, row]));
  const selected = monthRows.find((row) => row.date === selectedDate) ?? [...monthRows].sort((a, b) => b.date.localeCompare(a.date))[0];
  const monthIndex = months.indexOf(month);
  const monthTitle = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

  return <section className="panel pnl-calendar" data-history-count={monthRows.length}>
    <div className="panel-header"><div><p className="eyebrow">RECORDED UNREALIZED P&amp;L / UTC</p><h2 className="panel-title">P&amp;L calendar</h2></div>
      <div className="pnl-month-controls"><button type="button" aria-label="Previous recorded month" disabled={monthIndex <= 0} onClick={() => { setMonth(months[monthIndex - 1]); setSelectedDate(null); }}>‹</button><strong>{monthTitle}</strong><button type="button" aria-label="Next recorded month" disabled={monthIndex >= months.length - 1} onClick={() => { setMonth(months[monthIndex + 1]); setSelectedDate(null); }}>›</button></div>
    </div>
    <div className="pnl-calendar-body"><div className="pnl-calendar-grid" role="group" aria-label={`${monthTitle} recorded P&L`}>
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span className="pnl-weekday" key={day}>{day}</span>)}
      {days.map((date, index) => {
        if (date === null) return <div key={`blank:${index}`} className="pnl-calendar-blank" aria-hidden="true" />;
        const row = byDate.get(date);
        const available = row !== undefined && row.coverage.eligible > 0 && row.pnlUsd !== null;
        const label = row ? `${date}: P&L USD ${formatViewUsd(available ? row.pnlUsd : null)}; THB ${formatViewThb(available ? row.pnlThb : null)}; ${row.coverage.status} coverage; ${row.coverage.eligible} of ${row.coverage.totalHoldings} eligible. Value USD ${formatViewUsd(row.totalValueUsd)}; THB ${formatViewThb(row.totalValueThb)}.` : `${date}: no snapshot recorded`;
        return <button key={date} type="button" className={`pnl-calendar-day ${row ? "has-snapshot" : ""} ${available ? row.pnlUsd! >= 0 ? "is-positive" : "is-negative" : ""}`} disabled={!row}
          data-snapshot-date={row ? date : undefined} data-snapshot-coverage={row?.coverage.status} data-pnl-available={row ? String(available) : undefined}
          aria-label={label} title={label} aria-pressed={row ? selected?.date === date : undefined} onClick={() => setSelectedDate(date)}>
          <span>{Number(date.slice(-2))}</span><strong>{formatCalendarUsd(available ? row!.pnlUsd : null)}</strong><small>{row ? row.coverage.status : "No snapshot"}</small>
        </button>;
      })}
    </div>
    <aside className="pnl-calendar-detail" aria-live="polite">{selected ? <>
      <p className="eyebrow">DAILY SNAPSHOT</p><h3>{selected.date}</h3><p>{coverageLabel(selected.coverage)}</p>
      <dl><div><dt>P&amp;L (recorded)</dt><dd>{formatViewUsd(selected.coverage.eligible > 0 ? selected.pnlUsd : null)}<small>{formatViewThb(selected.coverage.eligible > 0 ? selected.pnlThb : null)} · {formatPnlPercent(selected.coverage.eligible > 0 ? selected.pnlPct : null)}</small></dd></div>
        <div><dt>Portfolio value</dt><dd>{formatViewUsd(selected.totalValueUsd)}<small>{formatViewThb(selected.totalValueThb)}</small></dd></div>
        <div><dt>Recorded basis</dt><dd>{formatViewUsd(selected.coverage.eligible > 0 ? selected.costBasisUsd : null)}<small>{formatViewThb(selected.coverage.eligible > 0 ? selected.costBasisThb : null)}</small></dd></div>
        <div><dt>Coverage</dt><dd>{selected.coverage.status}<small>{selected.coverage.eligible} / {selected.coverage.totalHoldings} holdings eligible</small></dd></div></dl>
    </> : <><span className="pnl-empty-symbol" aria-hidden="true">▦</span><h3>{snapshots.length === 0 ? "History starts today" : "No snapshots this month"}</h3><p>No recorded daily P&amp;L is available. Future observations will show their value, basis and coverage here.</p></>}
    </aside></div>
    <p className="pnl-panel-note">Each day shows that snapshot’s unrealized P&amp;L, not a daily return. Day cells use compact USD; select a recorded day for exact USD/THB. Blank days have no observation. First qualifying observation per UTC day; no backfill.</p>
  </section>;
}
