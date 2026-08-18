"use client";

import { buildHoldingsCsv, type CsvHolding } from "@/lib/portfolio-helpers";

export function CsvExportButton({ holdings }: { holdings: CsvHolding[] }) {
  function download() {
    const blob = new Blob(["\ufeff", buildHoldingsCsv(holdings)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `portmanager-holdings-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return <button type="button" onClick={download} disabled={holdings.length === 0} className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">Export CSV</button>;
}
