import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AS_OF, capitalBook, live } from "./__fixtures__/capital-book";
import { BookPnlMetric } from "../app/book-pnl-metric";
import { PnlAssetTable } from "../app/pnl-asset-table";
import { buildJoinedPortfolio, formatUsd, formatThb } from "./live-data";
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
  it.each([0, 0.25, 1, null])("keeps manual cash value %s while removing every small or unknown market row", (valueUsd) => {
    const portfolio = buildJoinedPortfolio({
      t212Summary: live({ currency: "USD", cashAvailable: 0, totalValue: 0, investmentsCurrentValue: 0 }),
      t212Positions: live([]), nfts: live([]), walletNative: live([]),
      walletTokens: live([
        { chainId: 1, chainName: "Ethereum", contract: "0xsmall", symbol: "SMALL", name: "Small token", amountRaw: "1", amount: 1, decimals: 0, priceUsd: 0.99 },
        { chainId: 1, chainName: "Ethereum", contract: "0xunknown", symbol: "UNKNOWN", name: "Unknown token", amountRaw: "1", amount: 1, decimals: 0, priceUsd: null },
      ]),
      manualHoldings: live([{ id: "cash", label: "Operator cash", kind: "cash", currency: valueUsd === null ? "GBP" : "USD", amount: valueUsd ?? 5, recordedAt: AS_OF, createdAt: AS_OF }]),
      capitalEvents: live([]),
      fiatFx: live({ usdToThb: 36, gbpToThb: null, eurToThb: 40, asOf: AS_OF }), ethPrice: live(2400),
    }, AS_OF);
    const html = render(React.createElement(PnlAssetTable, { portfolio }));
    const rows = [...html.matchAll(/<tr[^>]*data-holding-id[^>]*>[\s\S]*?<\/tr>/g)].map(([row]) => row);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("data-manual-cash");
    expect(text(rows[0])).toContain("Operator cash");
    const value = rows[0].match(/data-pnl-cell="value"[^>]*>([\s\S]*?)<\/td>/)![1];
    expect(text(value)).toContain(formatUsd(valueUsd));
    expect(text(html)).not.toMatch(/SMALL|UNKNOWN|dust|unpriced/i);
    expect(html).not.toMatch(/0xsmall|0xunknown/);
    expect(html).not.toMatch(/<(?:form|button|input|select)\b/);
    expect(portfolio.manualHoldings).toHaveLength(1);
    expect(portfolio.manualHoldings[0].valueUsd).toBe(valueUsd);
    expect(portfolio.totals.pnlCoverage).toMatchObject({ totalHoldings: 0, dust: 0, unpriced: 0 });
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
