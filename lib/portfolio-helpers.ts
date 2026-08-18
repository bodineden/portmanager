export function calculateChangePercent(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

export type CsvHolding = {
  ticker: string;
  name: string;
  shares: number;
  currentPrice: number;
  valueThb: number;
};

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildHoldingsCsv(rows: CsvHolding[]) {
  const header = ["ticker", "name", "shares", "current price", "value in THB"];
  return [header, ...rows.map((row) => [row.ticker, row.name, row.shares, row.currentPrice, row.valueThb])]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
