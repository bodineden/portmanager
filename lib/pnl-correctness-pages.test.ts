import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../app/page";
import AssetListPage from "../app/asset-list/page";
import PortfolioPage from "../app/portfolio/page";
import { buildJoinedPortfolio, getJoinedPortfolio, type LiveResult } from "./live-data";
import { createSnapshotRecorder } from "./pnl-history";
import { shouldSuppressHolding } from "./dust-filter";
import { observedNftFloors, oneUnpricedNft } from "./__fixtures__/nft-floors";
import { dustBook } from "../scripts/__fixtures__/dust-book";

vi.mock("./live-data", async (original) => ({ ...await original<typeof import("./live-data")>(), getJoinedPortfolio: vi.fn() }));
vi.mock("./assets-db", async (original) => ({ ...await original<typeof import("./assets-db")>(), isNeonConfigured: () => false }));
vi.mock("./auth", () => ({ requireSession: async () => null }));
vi.mock("./pnl-history", async (original) => ({
  ...await original<typeof import("./pnl-history")>(),
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

function displayBoundaryBook() {
  return buildJoinedPortfolio({
    t212Summary: live({ currency: "USD", cashAvailable: 100, totalValue: 101.5, investmentsCurrentValue: 1.5 }),
    t212Positions: live([0.5, 1].map((value) => ({
      ticker: value < 1 ? "SMALL-SECURITY" : "ONE-SECURITY", name: "Security fixture", quantity: 1,
      averagePrice: value, currentPrice: value, ppl: 0, currency: "USD", pplCurrency: "USD", valueNative: value, valueAccount: value,
    }))),
    nfts: live([
      { collection: "small-nft", collectionName: "Small collection", tokenCount: 1, floorEth: 0.00025 },
      { collection: "one-nft", collectionName: "One-dollar collection", tokenCount: 2, floorEth: 0.00025 },
    ]),
    walletNative: live([
      { chainId: 1, chainName: "Ethereum", symbol: "SMALL-NATIVE", amount: 0.00025 },
      { chainId: 8453, chainName: "Base", symbol: "ONE-NATIVE", amount: 0.0005 },
    ]),
    walletTokens: live([
      { chainId: 1, chainName: "Ethereum", contract: "0xaaa", symbol: "SMALL-TOKEN", name: "Small token", amountRaw: "1", decimals: 0, amount: 1, priceUsd: 0.5 },
      { chainId: 1, chainName: "Ethereum", contract: "0xbbb", symbol: "ONE-TOKEN", name: "One-dollar token", amountRaw: "1", decimals: 0, amount: 1, priceUsd: 1 },
      { chainId: 1, chainName: "Ethereum", contract: "0xccc", symbol: "FIVE-TOKEN", name: "Five-dollar token", amountRaw: "1", decimals: 0, amount: 1, priceUsd: 5 },
      { chainId: 1, chainName: "Ethereum", contract: "0xddd", symbol: "UNKNOWN-TOKEN", name: "Unknown token", amountRaw: "1", decimals: 0, amount: 1, priceUsd: null },
    ]),
    manualHoldings: live([{ id: "cash", label: "Operator cash", kind: "cash", currency: "USD", amount: 0.25, recordedAt: AS_OF, createdAt: AS_OF }]),
    capitalEvents: live([{ occurredAt: AS_OF, kind: "contribution", amountThb: 3600 }]),
    fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: AS_OF }), ethPrice: live(2000),
  }, AS_OF);
}

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("render-only holding suppression", () => {
  it.each(["all-suppressed", "genuinely-empty"] as const)("uses neutral empty-view copy for %s inventory while preserving full portfolio value and book P&L", async (scenario) => {
    const portfolio = scenario === "all-suppressed" ? dustBook("empty") : buildJoinedPortfolio({
      t212Summary: live({ currency: "USD", cashAvailable: 0, totalValue: 0, investmentsCurrentValue: 0 }),
      t212Positions: live([]), nfts: live([]), walletNative: live([]), walletTokens: live([]), manualHoldings: live([]),
      fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: AS_OF }), ethPrice: live(1000),
      capitalEvents: live([{ occurredAt: AS_OF, kind: "contribution", amountThb: 153 }]),
    }, AS_OF);
    const original = structuredClone(portfolio);
    const holdings = [...portfolio.t212.investments, ...portfolio.nfts, ...portfolio.wallet.native, ...portfolio.wallet.tokens];
    const fullValueUsd = scenario === "all-suppressed" ? 3.996 : 0;
    expect(holdings).toHaveLength(scenario === "all-suppressed" ? 7 : 0);
    expect(holdings.filter((row) => !shouldSuppressHolding(row))).toHaveLength(0);
    expect(holdings.reduce((sum, row) => sum + (row.valueUsd ?? 0), 0)).toBeCloseTo(fullValueUsd, 10);
    expect(portfolio.totals.grandTotalUsd).toBeCloseTo(fullValueUsd, 10);
    expect(portfolio.totals.grandTotalThb).toBeCloseTo(fullValueUsd * 36, 10);
    expect(portfolio.totals.bookPnl!.pnlUsd).toBeCloseTo(fullValueUsd - 4.25, 10);
    expect(portfolio.totals.bookPnl!.pnlThb).toBeCloseTo(fullValueUsd * 36 - 153, 10);
    expect(portfolio.totals.pnlCoverage).toMatchObject({ totalHoldings: 0, eligible: 0, dust: 0, unpriced: 0, sourcesComplete: true });

    vi.mocked(getJoinedPortfolio).mockResolvedValue(portfolio);
    const home = renderToStaticMarkup(await Home());
    const registry = renderToStaticMarkup(await AssetListPage());
    for (const html of [home, registry]) {
      expect(text(html)).not.toMatch(/No holdings in this snapshot|No positions yet|No NFT collections found|No complete positions available/);
      expect(text(html)).not.toMatch(/dust|unpriced|hidden|filter|threshold|under \$1|all rows|Every joined holding/i);
      expect(text(html)).toContain("No positions to display.");
      expect(html).not.toMatch(/data-holding-id=|data-wallet-kind=/);
    }
    expect(text(home)).toContain("No holdings to display in this snapshot.");
    expect(text(home)).toContain("0 holdings to display");
    expect(text(home)).not.toContain("Holdings unavailable — P&L coverage is incomplete");
    expect(text(registry)).toContain("No NFT collections to display.");
    expect(text(registry)).toContain("Account cash and investment values are represented in the summary above.");
    expect(text(registry)).toContain("Collection values are represented in the portfolio summary.");
    expect(text(registry)).not.toMatch(/Live positions are unavailable|Live NFT collections are unavailable/);
    const displayedValue = scenario === "all-suppressed" ? "US$4.00" : "US$0.00";
    expect(home.match(/data-value-currency="USD">([^<]*)<\/strong>/)?.[1]).toBe(displayedValue);
    expect(registry.match(/id="asset-registry-total"[^>]*>([^<]*)<\/h2>/)?.[1]).toBe(displayedValue);
    const bookPnl = text(home.match(/<article[^>]*data-book-pnl="available"[\s\S]*?<\/article>/)![0]);
    expect(bookPnl).toContain(scenario === "all-suppressed" ? "-US$0.25 -5.98%" : "-US$4.25 -100.00%");
    expect(bookPnl).toContain(scenario === "all-suppressed" ? "฿-9.14 THB" : "฿-153.00 THB");
    expect(bookPnl).toContain("Contributed capital ฿153.00");
    expect(portfolio).toEqual(original);
  });

  it("keeps a partial securities source explanation with neutral copy when all positions are suppressed", async () => {
    const portfolio = dustBook("empty");
    portfolio.sources.t212Positions = { status: "partial", asOf: AS_OF, message: "Position pagination is incomplete." };
    vi.mocked(getJoinedPortfolio).mockResolvedValue(portfolio);
    const registry = renderToStaticMarkup(await AssetListPage());
    expect(registry).toContain('class="asset-empty-state is-partial"');
    expect(text(registry)).toContain("No positions to display. Position pagination is incomplete.");
    expect(text(registry)).not.toContain("No complete positions available");
    expect(portfolio.t212.investments).toHaveLength(2);
  });

  it("preserves unavailable inventory messages instead of using the neutral empty-view copy", async () => {
    const unavailable = <T,>(): LiveResult<T> => ({ data: null, state: { status: "unavailable", asOf: null, message: "Provider request failed." } });
    vi.mocked(getJoinedPortfolio).mockResolvedValue(buildJoinedPortfolio({
      t212Summary: unavailable(), t212Positions: unavailable(), nfts: unavailable(),
      walletNative: unavailable(), walletTokens: unavailable(), fiatFx: unavailable(), ethPrice: unavailable(),
      manualHoldings: live([]), capitalEvents: live([]),
    }, AS_OF));
    const home = renderToStaticMarkup(await Home());
    const registry = renderToStaticMarkup(await AssetListPage());
    expect(text(home)).toContain("Holdings unavailable — P&L coverage is incomplete");
    expect(text(home)).toContain("No recorded cost basis is available to display. Missing source data is never treated as an empty account.");
    expect(text(home)).toContain("Open positions — Trading 212 positions unavailable");
    expect(text(registry)).toContain("Live positions are unavailable Provider request failed.");
    expect(text(registry)).toContain("Live NFT collections are unavailable Provider request failed.");
    for (const html of [home, registry]) {
      expect(text(html)).not.toMatch(/No holdings to display in this snapshot|No positions to display|No NFT collections to display/);
    }
  });

  it("keeps small holdings in hero/class totals and recorded inventory while every row and count shows the displayable subset", async () => {
    const portfolio = displayBoundaryBook();
    const allHoldings = [...portfolio.t212.investments, ...portfolio.nfts, ...portfolio.wallet.native, ...portfolio.wallet.tokens];
    const displayed = allHoldings.filter((row) => !shouldSuppressHolding(row));
    const suppressed = allHoldings.filter(shouldSuppressHolding);
    const small = suppressed.filter((row) => row.valueUsd !== null);
    expect(allHoldings).toHaveLength(10);
    expect(displayed).toHaveLength(5);
    expect(small.map((row) => row.valueUsd)).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(small.every((row) => row.valueUsd! < 1)).toBe(true);
    const displayedValue = displayed.reduce((sum, row) => sum + row.valueUsd!, 0);
    const suppressedValue = small.reduce((sum, row) => sum + row.valueUsd!, 0);
    expect(displayedValue).toBe(9);
    expect(suppressedValue).toBe(2);
    expect(portfolio.totals.grandTotalUsd).toBe(111.25);
    expect(portfolio.totals.grandTotalUsd! - 100 - 0.25 - displayedValue).toBe(suppressedValue);
    expect(portfolio.totals).toMatchObject({ nftsUsd: 1.5, walletNativeUsd: 1.5, walletTokensUsd: 6.5, walletUsd: 8, grandTotalThb: 4005 });
    expect(portfolio.totals.pnlCoverage).toMatchObject({ totalHoldings: 5, dust: 0, unpriced: 0 });

    vi.mocked(getJoinedPortfolio).mockResolvedValue(portfolio);
    const home = renderToStaticMarkup(await Home());
    const registry = renderToStaticMarkup(await AssetListPage());
    for (const html of [home, registry]) {
      for (const name of ["SMALL-SECURITY", "Small collection", "SMALL-NATIVE", "SMALL-TOKEN", "UNKNOWN-TOKEN"]) expect(html).not.toContain(name);
      for (const name of ["ONE-SECURITY", "One-dollar collection", "ONE-NATIVE", "ONE-TOKEN", "FIVE-TOKEN"]) expect(html).toContain(name);
      expect(text(html)).not.toMatch(/dust|unpriced|hidden|under \$1/i);
    }
    expect(home).toMatch(/data-value-currency="USD">US\$111\.25<\/strong>/);
    expect(home).toContain('data-wallet-summary-count="3">3 wallet assets');
    expect(home).toContain('data-wallet-native-count="1" data-wallet-token-count="2"');
    expect(text(home)).toContain("1 NATIVE · 2 TOKENS");
    expect(text(home)).toContain("Open positions 1 Included in per-asset P&L");
    expect(text(home)).toContain("6 holdings to display");
    expect(text(home)).not.toMatch(/all rows|Every joined holding/);
    expect(home).toContain('data-manual-cash="true"');
    expect(home).toContain("Operator cash");
    expect(home).toMatch(/data-value-class="nfts">[\s\S]*?<strong>US\$1\.50<\/strong>/);
    expect(home).toMatch(/data-value-class="walletNative">[\s\S]*?<strong>US\$1\.50<\/strong>/);
    expect(home).toMatch(/data-value-class="walletTokens">[\s\S]*?<strong>US\$6\.50<\/strong>/);
    expect(registry).toMatch(/id="asset-registry-total"[^>]*>US\$111\.25<\/h2>/);
    expect(text(registry)).toContain("1 T212 · 1 NFT · 3 wallet assets");
    expect(text(registry)).toContain("1 POSITIONS");
    expect(text(registry)).toContain("1 COLLECTIONS · 2 TOKENS");
    expect(text(registry)).toContain("3 ASSETS");
    const nftFooter = registry.match(/asset-nft-table[\s\S]*?<tfoot>([\s\S]*?)<\/tfoot>/)![1];
    expect(text(nftFooter)).toBe("Total NFT port 2 — 0.00075 ETH US$1.50 ฿54.00");

    let recorded: unknown[] | undefined;
    const recorder = createSnapshotRecorder({ hasDb: () => true, now: () => Date.parse(AS_OF), getDb: () => ({
      query: async (sql, params) => {
        if (!sql.includes("INSERT INTO portfolio_snapshot")) return [];
        recorded = params;
        return [{ snapshot_date: AS_OF.slice(0, 10) }];
      },
    }) });
    expect(await recorder(portfolio)).toBe("recorded");
    expect(recorded![1]).toBe(111.25);
    expect(JSON.parse(recorded![16] as string)).toEqual({
      "t212:SMALL-SECURITY": 0.5, "t212:ONE-SECURITY": 1,
      "nft:small-nft": 0.5, "nft:one-nft": 1,
      "native:1": 0.5, "native:8453": 1,
      "token:1:0xaaa": 0.5, "token:1:0xbbb": 1, "token:1:0xccc": 5, "token:1:0xddd": null,
      "manual:Operator cash": 0.25,
    });
  });
});

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
