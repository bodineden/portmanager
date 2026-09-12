import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../app/page";
import AssetListPage from "../app/asset-list/page";
import PortfolioPage from "../app/portfolio/page";
import { buildJoinedPortfolio, getJoinedPortfolio, type LiveResult } from "./live-data";
import { observedNftFloors, oneUnpricedNft } from "./__fixtures__/nft-floors";

vi.mock("./live-data", async (original) => ({ ...await original<typeof import("./live-data")>(), getJoinedPortfolio: vi.fn() }));
vi.mock("./assets-db", () => ({ isNeonConfigured: () => false }));
vi.mock("./auth", () => ({ requireSession: async () => null }));
vi.mock("./pnl-history", () => ({
  readPortfolioSnapshotHistory: async () => ({ snapshots: [], available: true }), recordPortfolioSnapshot: vi.fn(),
}));
// Keep financial pages real; isolate unrelated auth/navigation and browser-only rendering.
vi.mock("../app/components/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("../app/mascot-companion", () => ({ default: () => null }));
vi.mock("../app/portfolio/portfolio-chart", () => ({ PortfolioChart: () => null }));

const AS_OF = "2026-09-12T04:49:50.350Z";
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: AS_OF, message: "Offline arithmetic fixture" } });
function book(scenario: "mixed" | "all-unpriced" | "wallet-failure" | "incomplete" = "mixed") {
  return buildJoinedPortfolio({
    t212Summary: live({ currency: "USD", cashAvailable: 487, totalValue: 487, investmentsCurrentValue: 0 }),
    t212Positions: live([]), walletNative: live([]), walletTokens: live([]), manualHoldings: live([]),
    capitalEvents: live([{ occurredAt: AS_OF, kind: "contribution", amountThb: 120000 }]),
    nfts: scenario === "wallet-failure" ? { data: null, state: { status: "unavailable", asOf: null, message: "Wallet call failed" } }
      : scenario === "incomplete" ? { ...live(oneUnpricedNft), state: { status: "partial", asOf: AS_OF, message: "Wallet pagination is incomplete" } }
      : live(scenario === "all-unpriced" ? observedNftFloors.map((row) => ({ ...row, floorEth: null })) : oneUnpricedNft),
    fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: AS_OF }), ethPrice: live(2400),
  }, AS_OF);
}
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("displayed NFT value across read-only pages", () => {
  it("omits the missing-floor registry row and counts only five displayed collections / six tokens", async () => {
    vi.mocked(getJoinedPortfolio).mockResolvedValue(book());
    const html = renderToStaticMarkup(await AssetListPage());
    const table = html.match(/<table[^>]*asset-nft-table[\s\S]*?<\/table>/)?.[0];
    expect(table).toBeDefined();
    const rows = table!.match(/<tbody>([\s\S]*?)<\/tbody>/)![1];
    expect([...rows.matchAll(/<tr\b/g)]).toHaveLength(5);
    expect(text(html)).toContain("5 COLLECTIONS · 6 TOKENS");
    for (const row of observedNftFloors.filter((row) => row.collection !== "wasteland-art")) expect(text(rows)).toContain(row.collection);
    expect(html).not.toContain("wasteland-art");
    expect(text(rows)).not.toMatch(/—|\$0|฿0/);
    expect(text(html)).not.toContain("Live NFT collections are unavailable");
    expect(book().sources.nfts.status).toBe("live");
  });
  it.each(["all-unpriced", "wallet-failure"] as const)("keeps %s on the outage path with no unknown registry rows", async (scenario) => {
    const portfolio = book(scenario);
    vi.mocked(getJoinedPortfolio).mockResolvedValue(portfolio);
    const html = renderToStaticMarkup(await AssetListPage());
    expect(html).not.toContain('class="asset-live-table asset-nft-table"');
    for (const row of observedNftFloors) expect(html).not.toContain(row.collection);
    expect(text(html)).toContain("0 COLLECTIONS · 0 TOKENS");
    expect(text(html)).toContain("Live NFT collections are unavailable");
    expect(text(html)).not.toContain("No NFT collections found");
    expect(portfolio.totals.nftsUsd).toBeNull();
    expect(portfolio.sources.nfts.status).toBe("unavailable");
    const home = renderToStaticMarkup(await Home());
    expect(text(home)).toContain("Value unavailable");
    expect(home).not.toMatch(/data-pnl-eligibility="(?:dust|unpriced)"/);
  });
  it("shows a joined snapshot without omission copy and pins the daily THB denominator", async () => {
    vi.mocked(getJoinedPortfolio).mockResolvedValue(book());
    const html = renderToStaticMarkup(await Home());
    expect(text(html)).toContain("Joined snapshot");
    expect(text(html)).not.toContain("Partial joined value");
    expect(text(html)).not.toContain("Shares describe known priced class subtotals, not the entire inventory.");
    expect(text(html)).not.toMatch(/dust|unpriced|hidden|under \$1/i);
    expect(text(html)).toContain("% uses the previous THB book value");
    expect(text(html)).not.toContain("percentages wait for all class values");
  });
  it("does not mark mixed NFT pricing as partial on Portfolio", async () => {
    vi.mocked(getJoinedPortfolio).mockResolvedValue(book());
    const html = renderToStaticMarkup(await PortfolioPage());
    expect(text(html)).toContain("LIVE JOINED");
    expect(text(html)).not.toContain("LIVE JOINED · PARTIAL VALUE");
    expect(text(html)).not.toContain("Known priced subtotal; source coverage is incomplete.");
    expect(html).not.toContain('class="header-status is-partial"');
  });
  it("retains partial value copy when NFT inventory is genuinely incomplete", async () => {
    vi.mocked(getJoinedPortfolio).mockResolvedValue(book("incomplete"));
    const home = renderToStaticMarkup(await Home());
    expect(text(home)).toContain("Partial joined value");
    const html = renderToStaticMarkup(await PortfolioPage());
    expect(text(html)).toContain("LIVE JOINED · PARTIAL VALUE");
    expect(text(html)).toContain("Known priced subtotal; source coverage is incomplete.");
    expect(html).toContain('class="header-status is-partial"');
  });
});
