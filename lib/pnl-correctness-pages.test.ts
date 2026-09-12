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
function book(scenario: "partial" | "all-unpriced" | "wallet-failure" = "partial") {
  return buildJoinedPortfolio({
    t212Summary: live({ currency: "USD", cashAvailable: 487, totalValue: 487, investmentsCurrentValue: 0 }),
    t212Positions: live([]), walletNative: live([]), walletTokens: live([]), manualHoldings: live([]),
    capitalEvents: live([{ occurredAt: AS_OF, kind: "contribution", amountThb: 120000 }]),
    nfts: scenario === "wallet-failure" ? { data: null, state: { status: "unavailable", asOf: null, message: "Wallet call failed" } }
      : live(scenario === "all-unpriced" ? observedNftFloors.map((row) => ({ ...row, floorEth: null })) : oneUnpricedNft),
    fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: AS_OF }), ethPrice: live(2400),
  }, AS_OF);
}
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("partial NFT value across read-only pages", () => {
  it.each(["partial", "all-unpriced"] as const)("retains all six known registry rows and seven tokens when pricing is %s", async (scenario) => {
    vi.mocked(getJoinedPortfolio).mockResolvedValue(book(scenario));
    const html = renderToStaticMarkup(await AssetListPage());
    const table = html.match(/<table[^>]*asset-nft-table[\s\S]*?<\/table>/)?.[0];
    expect(table).toBeDefined();
    const rows = table!.match(/<tbody>([\s\S]*?)<\/tbody>/)![1];
    expect([...rows.matchAll(/<tr\b/g)]).toHaveLength(6);
    expect(text(html)).toContain("6 COLLECTIONS · 7 TOKENS");
    for (const row of observedNftFloors) expect(text(rows)).toContain(row.collection);
    const missing = [...rows.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(([row]) => row).find((row) => row.includes("wasteland-art"))!;
    expect(text(missing)).toContain("1 — — — —");
    expect(text(missing)).not.toMatch(/\$0|฿0/);
    expect(text(html)).not.toContain("Live NFT collections are unavailable");
  });
  it("still distinguishes a failed NFT wallet call from a known empty inventory", async () => {
    vi.mocked(getJoinedPortfolio).mockResolvedValue(book("wallet-failure"));
    const html = renderToStaticMarkup(await AssetListPage());
    expect(html).not.toContain('class="asset-live-table asset-nft-table"');
    expect(text(html)).toContain("— COLLECTIONS · — TOKENS");
    expect(text(html)).toContain("Live NFT collections are unavailable");
    expect(text(html)).not.toContain("No NFT collections found");
  });
  it("explains that allocation percentages normalize priced subtotals and pins the daily THB denominator", async () => {
    vi.mocked(getJoinedPortfolio).mockResolvedValue(book());
    const html = renderToStaticMarkup(await Home());
    expect(text(html)).toContain("Partial joined value");
    expect(text(html)).toContain("Shares describe known priced class subtotals, not the entire inventory.");
    expect(text(html)).toContain("% uses the previous THB book value");
    expect(text(html)).not.toContain("percentages wait for all class values");
  });
  it("labels a finite partial NFT book on Portfolio rather than implying complete live coverage", async () => {
    vi.mocked(getJoinedPortfolio).mockResolvedValue(book());
    const html = renderToStaticMarkup(await PortfolioPage());
    expect(text(html)).toContain("LIVE JOINED · PARTIAL VALUE");
    expect(text(html)).toContain("Known priced subtotal; source coverage is incomplete.");
    expect(html).toContain('class="header-status is-partial"');
  });
});
