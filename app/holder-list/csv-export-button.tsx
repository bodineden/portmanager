"use client";

import { Button } from "@blueprintjs/core";
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

  return (
    <Button
      type="button"
      icon="download"
      text="Export CSV"
      aria-label="Export holdings as CSV"
      onClick={download}
      disabled={holdings.length === 0}
      className="pm-button holder-export-button"
    />
  );
}
