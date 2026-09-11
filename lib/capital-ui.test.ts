import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capitalBook } from "./__fixtures__/capital-book";
import { BookPnlMetric } from "../app/book-pnl-metric";
import { PnlAssetTable } from "../app/pnl-asset-table";
import { formatUsd, formatThb } from "./live-data";
import { valueDirection } from "./pnl-view";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();
const render = (element: React.ReactElement) => renderToStaticMarkup(element);
describe("capital and cash-pot UI fixtures", () => {
  it("distinguishes flat change from gains and losses", () => {
    expect(valueDirection(0)).toBe("flat");
    expect(valueDirection(-0)).toBe("flat");
    expect(valueDirection(1)).toBe("up");
    expect(valueDirection(-1)).toBe("down");
    expect(valueDirection(null)).toBeNull();
  });
  it("shows manual cash USD/THB value only, dashes for basis/P&L and manual-cash chip", () => {
    const portfolio = capitalBook();
    const html = render(React.createElement(PnlAssetTable, { portfolio }));
    const row = html.match(/<tr[^>]*data-manual-cash[\s\S]*?<\/tr>/)?.[0];
    expect(row).toBeDefined();
    expect(text(row!)).toContain("T212 cash pot");
    expect(text(row!)).toContain(formatUsd(portfolio.totals.manualUsd));
    expect(text(row!)).toContain(formatThb(portfolio.totals.manualThb));
    expect(text(row!)).toContain("manual-cash Manually reported · value only · no P&L");
    for (const cell of ["basis", "pnl"]) {
      const value = text(row!.match(new RegExp(`data-pnl-cell="${cell}"[^>]*>([\\s\\S]*?)<\/td>`))![1]);
      expect(value).toContain("—");
      expect(value).not.toMatch(/\$0|฿0|\d/);
    }
    expect(html).not.toMatch(/<(?:form|button|input)\b/);
  });
  it("renders book P&L against the exact opening THB 120000 even without eligible asset P&L", () => {
    const portfolio = capitalBook();
    const html = render(React.createElement(BookPnlMetric, { portfolio }));
    expect(text(html)).toContain("Book P&L");
    expect(text(html)).toContain("Contributed capital ฿120,000.00");
    expect(text(html)).toContain(formatUsd(portfolio.totals.bookPnl!.pnlUsd));
    expect(text(html)).toContain(formatThb(portfolio.totals.bookPnl!.pnlThb));
    expect(text(html)).not.toContain("No recorded cost basis");
  });
  it("renders unavailable capital honestly instead of THB zero or an invented book P&L", () => {
    const html = render(React.createElement(BookPnlMetric, { portfolio: capitalBook(false) }));
    expect(text(html)).toContain("Contributed capital not recorded — book P&L unavailable");
    expect(text(html)).toContain("—");
    expect(text(html)).not.toMatch(/\$0|฿0|\d/);
  });
  it("renders Day with plus/up and minus/down, absent identity remains a dash", () => {
    const portfolio = capitalBook();
    const previousHoldings = { "manual:T212 cash pot": portfolio.totals.manualUsd! - 10, "t212:CMCSA_US_EQ": portfolio.t212.investments[0].valueUsd! + 1 };
    const html = render(React.createElement(PnlAssetTable, { portfolio, previousHoldings }));
    expect(text(html)).toContain("Day");
    expect(html).toMatch(/data-pnl-cell="day"[^>]*data-day-direction="up"/);
    expect(html).toMatch(/data-pnl-cell="day"[^>]*data-day-direction="down"/);
    expect(text(html)).toContain("↑ +US$10.00");
    expect(text(html)).toContain("↓ -US$1.00");
    const absent = render(React.createElement(PnlAssetTable, { portfolio, previousHoldings: {} }));
    for (const match of absent.matchAll(/data-pnl-cell="day"[^>]*>([\s\S]*?)<\/td>/g)) expect(text(match[1])).toBe("—");
  });
});
