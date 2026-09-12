import { describe, expect, it } from "vitest";
import { shouldSuppressHolding } from "./dust-filter";
import { buildJoinedPortfolio, type LiveResult } from "./live-data";
import type { PnlCoverage } from "./pnl";
import type { PortfolioSnapshot } from "./pnl-history";
import {
  basisChip, calendarDays, coverageLabel, dailyChange, eligibilityLabel, formatCalendarUsd, formatHoldingQuantity,
  formatPnlMoney, formatPnlPercent, formatSnapshotAsOf, formatViewThb, formatViewUsd,
  historyLineSegments, historyPeriodRows, snapshotFiatUsd, valueAllocation, allocationPnl,
} from "./pnl-view";

const DATE = "2026-09-05T12:00:00.000Z";
const coverage: PnlCoverage = {
  totalHoldings: 3, eligible: 1, notRecorded: 1, dust: 1, unpriced: 0, unreconciled: 0,
  status: "partial", sourcesComplete: true,
};
function snapshot(date = "2026-09-05", valueUsd: number | null = 1_200): PortfolioSnapshot {
  return { date, totalValueUsd: valueUsd, totalValueThb: valueUsd === null ? null : valueUsd * 36,
    costBasisUsd: 500, costBasisThb: 18_000, pnlUsd: 50, pnlThb: 1_800, pnlPct: 10, coverage: { ...coverage },
    contributedCapitalThb: 120000, contributedCapitalUsd: 120000 / 36,
    holdings: { "t212:fixture": valueUsd }, sources: Object.fromEntries(["t212Summary", "t212Positions", "nfts", "fiatFx", "ethPrice", "walletNative", "walletTokens", "manualHoldings", "capital"].map((key) => [key, { status: "live", asOf: DATE, message: "fixture" }])) };
}
const fx = { usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: DATE };
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: DATE, message: "fixture" } });
const book = () => buildJoinedPortfolio({
  manualHoldings: live([]),
  t212Summary: live({ currency: "GBP", cashAvailable: 487, totalValue: 487, investmentsCurrentValue: 0 }),
  t212Positions: live([]), nfts: live([{ collection: "fixture", collectionName: "Fixture", tokenCount: 2, floorEth: 0.1 }]),
  walletNative: live([{ chainId: 42161, chainName: "Arbitrum One", symbol: "ETH", amount: 0.25 }]),
  walletTokens: live([]), fiatFx: live(fx), ethPrice: live(2_400),
}, DATE);

describe("honest presentation formatting", () => {
  it("keeps calendar USD labels compact without turning unknown or sub-cent P&L into zero", () => {
    expect(formatCalendarUsd(200)).toBe("$200");
    expect(formatCalendarUsd(-25.5)).toBe("-$25.50");
    expect(formatCalendarUsd(1_200)).toBe("$1.2K");
    expect(formatCalendarUsd(-1_250_000)).toBe("-$1.3M");
    expect(formatCalendarUsd(0)).toBe("$0");
    expect(formatCalendarUsd(-0)).toBe("$0");
    expect(formatCalendarUsd(0.001)).toBe("<$0.01");
    expect(formatCalendarUsd(-0.001)).toBe("−<$0.01");
    for (const value of [null, undefined, Number.NaN, Infinity, -Infinity]) expect(formatCalendarUsd(value)).toBe("—");
  });

  it("preserves null and non-finite figures as em dashes across all formatters", () => {
    for (const value of [null, undefined, Number.NaN, Infinity, -Infinity]) {
      for (const formatter of [formatPnlPercent, formatViewUsd, formatViewThb, formatPnlMoney, formatHoldingQuantity]) {
        expect(formatter(value)).toBe("—");
      }
    }
    expect(formatSnapshotAsOf(null)).toBe("—");
    expect(formatSnapshotAsOf("not-a-date")).toBe("—");
  });

  it("formats signed percentage points without multiplying them by 100 or dividing by basis", () => {
    expect(formatPnlPercent(12.5)).toBe("+12.50%");
    expect(formatPnlPercent(-3.125)).toBe("-3.13%");
    expect(formatPnlPercent(0)).toBe("0.00%");
    expect(formatPnlPercent(-0)).toBe("0.00%");
    expect(formatPnlMoney(25)).toBe("+US$25.00");
    expect(formatPnlMoney(-25)).toBe("-US$25.00");
    expect(formatPnlMoney(25, "THB")).toBe("+฿25.00");
    expect(formatViewUsd(0)).toBe("US$0.00"); // Verified free basis is a known zero.
  });

  it("formats UTC observation time and guards quantity precision", () => {
    expect(formatSnapshotAsOf("2026-09-06T01:15:00+07:00")).toBe("05 Sept 2026, 18:15 UTC");
    expect(formatHoldingQuantity(0.248396, 6)).toBe("0.248396");
    expect(formatHoldingQuantity(0.248396, -1)).toBe("0.2484");
  });

  it("distinguishes no basis, partial/complete coverage and unreconciled-only exclusions", () => {
    expect(coverageLabel({ ...coverage, eligible: 0, notRecorded: 2 }))
      .toBe("No recorded cost basis yet — P&L unavailable");
    expect(coverageLabel(coverage)).toBe("Partial P&L (1 of 3 holdings have recorded basis)");
    expect(coverageLabel({ ...coverage, eligible: 3, notRecorded: 0, dust: 0, status: "complete" }))
      .toBe("Complete P&L (3 of 3 holdings have recorded basis)");
    expect(coverageLabel({ ...coverage, eligible: 0, unreconciled: 1 })).toContain("unreconciled holdings are excluded");
    expect(basisChip("not-recorded")).toEqual({ label: "not-recorded", description: "Basis not recorded; excluded from recorded P&L" });
    expect(basisChip("airdrop-free").description).toContain("percentage is unavailable for zero basis");
    for (const status of ["not-recorded", "unreconciled"] as const) {
      expect(eligibilityLabel(status)).toContain("excluded from P&L");
    }
    for (const status of ["dust", "unpriced"] as const) expect(eligibilityLabel(status)).toBeNull();
    expect(eligibilityLabel("eligible")).toBe("Included in recorded P&L");
  });
});

describe("snapshot currency and value allocation", () => {
  it("uses only current snapshot FX and keeps known USD when FX is absent", () => {
    expect(snapshotFiatUsd(487, "GBP", fx)).toBe(608.75);
    expect(snapshotFiatUsd(36, "THB", fx)).toBe(1);
    expect(snapshotFiatUsd(90, "EUR", fx)).toBe(100);
    expect(snapshotFiatUsd(10, "USD", null)).toBe(10);
    for (const currency of ["THB", "GBP", "EUR", "JPY", null]) {
      expect(snapshotFiatUsd(10, currency, null)).toBeNull();
    }
    expect(snapshotFiatUsd(null, "USD", fx)).toBeNull();
    expect(snapshotFiatUsd(100, "GBP", { ...fx, gbpToThb: null })).toBeNull();
    expect(snapshotFiatUsd(100, "THB", { ...fx, usdToThb: 0 })).toBeNull();
  });

  it("allocates full current class value including cash while no recorded P&L exists", () => {
    const portfolio = book();
    expect(portfolio.totals.pnlUsd).toBeNull();
    const allocation = valueAllocation(portfolio);
    expect(allocation.map(({ key }) => key)).toEqual(["t212", "crypto"]);
    expect(allocation.map(({ label }) => label)).toEqual(["Stocks Port", "Crypto Port"]);
    expect(allocation.map(({ valueUsd }) => valueUsd)).toEqual([608.75, 1080]);
    expect(allocation[1].valueThb).toBe(38_880);
    expect(allocation.reduce((sum, { sharePct }) => sum + sharePct!, 0)).toBeCloseTo(100);
    expect(allocation[0].valueThb).toBe(21_915);
  });

  it("keeps suppressed values in every class allocation and the authoritative account remainder", () => {
    const portfolio = buildJoinedPortfolio({
      manualHoldings: live([]),
      t212Summary: live({ currency: "USD", cashAvailable: 100, totalValue: 101.5, investmentsCurrentValue: 1.5 }),
      t212Positions: live([
        { ticker: "BOUNDARY", name: "Boundary security", quantity: 1, averagePrice: 1, currentPrice: 1,
          ppl: 0, currency: "USD", pplCurrency: "USD", valueNative: 1, valueAccount: 1 },
        { ticker: "SMALL", name: "Small security", quantity: 1, averagePrice: 0.5, currentPrice: 0.5,
          ppl: 0, currency: "USD", pplCurrency: "USD", valueNative: 0.5, valueAccount: 0.5 },
      ]),
      nfts: live([{ collection: "small-nft", collectionName: "Small NFT", tokenCount: 1, floorEth: 0.00025 }]),
      walletNative: live([{ chainId: 1, chainName: "Ethereum", symbol: "ETH", amount: 0.00025 }]),
      walletTokens: live([{ chainId: 1, chainName: "Ethereum", symbol: "SMALL", name: "Small token",
        amountRaw: "1", amount: 1, decimals: 0, priceUsd: 0.5 }]),
      fiatFx: live(fx), ethPrice: live(2_000),
    }, DATE);
    const allocation = valueAllocation(portfolio);
    expect(portfolio.t212.investments.map(({ ticker }) => ticker)).toEqual(["BOUNDARY", "SMALL"]);
    expect(portfolio.t212.investments.filter((row) => !shouldSuppressHolding(row)).map(({ ticker }) => ticker)).toEqual(["BOUNDARY"]);
    expect(portfolio.t212.totalValue).toBe(101.5);
    expect(portfolio.t212.investmentsCurrentValue).toBe(1.5);
    expect(portfolio.totals.t212Thb).toBe(3_654);
    expect(allocation.map(({ valueUsd }) => valueUsd)).toEqual([101.5, 1.5]);
    for (const rows of [portfolio.nfts, portfolio.wallet.native, portfolio.wallet.tokens]) {
      expect(rows.map((row) => row.valueUsd)).toEqual([0.5]);
      expect(rows.filter((row) => !shouldSuppressHolding(row))).toHaveLength(0);
    }
    expect(portfolio.totals.grandTotalUsd).toBe(103);
    expect(allocation[0].valueThb).toBe(3_654);
    expect(allocation.reduce((sum, { valueUsd }) => sum + valueUsd!, 0)).toBe(portfolio.totals.grandTotalUsd);
    expect(allocation.reduce((sum, { sharePct }) => sum + sharePct!, 0)).toBeCloseTo(100);
  });

  it("preserves broker cash beyond available-to-trade cash inside the account remainder", () => {
    const portfolio = buildJoinedPortfolio({
      manualHoldings: live([]),
      t212Summary: live({ currency: "USD", cashAvailable: 10, totalValue: 160, investmentsCurrentValue: 100 }),
      t212Positions: live([
        { ticker: "STOCK", name: "Security", quantity: 1, averagePrice: 100, currentPrice: 100,
          ppl: 0, currency: "USD", pplCurrency: "USD", valueNative: 100, valueAccount: 100 },
      ]),
      nfts: live([]), walletNative: live([]), walletTokens: live([]), fiatFx: live(fx), ethPrice: live(2_400),
    }, DATE);
    const allocation = valueAllocation(portfolio);
    expect(allocation.map(({ valueUsd }) => valueUsd)).toEqual([160, 0]);
    expect(allocation.map(({ valueThb }) => valueThb)).toEqual([5_760, 0]);
    expect(allocation.reduce((sum, { valueUsd }) => sum + valueUsd!, 0)).toBe(160);
    expect(allocation.reduce((sum, { valueUsd }) => sum + valueUsd!, 0)).toBe(portfolio.totals.grandTotalUsd);
    expect(allocation.reduce((sum, { sharePct }) => sum + sharePct!, 0)).toBeCloseTo(100);
  });

  it("never assigns unknown classes zero value or presents incomplete/zero totals as 100%", () => {
    const portfolio = book();
    portfolio.totals.walletTokensUsd = null;
    const partial = valueAllocation(portfolio);
    expect(partial.find(({ key }) => key === "crypto")!.valueUsd).toBeNull();
    expect(partial.every(({ sharePct }) => sharePct === null)).toBe(true);
    portfolio.totals.walletTokensUsd = 0;
    portfolio.totals.walletNativeUsd = 0;
    portfolio.totals.nftsUsd = 0;
    portfolio.totals.t212Thb = 0;
    portfolio.t212.totalValue = 0;
    portfolio.t212.cashAvailable = 0;
    expect(valueAllocation(portfolio).every(({ sharePct }) => sharePct === null)).toBe(true);
  });

  it("merges recorded crypto P&L and every coverage bucket without changing the internal book", () => {
    const portfolio = book();
    const classes = portfolio.totals.pnlByClass;
    Object.assign(classes.nfts, { pnlUsd: 15, costBasisUsd: 50, pnlCoverage: { ...coverage } });
    Object.assign(classes.walletNative, { pnlUsd: -5, costBasisUsd: 40, pnlCoverage: { ...coverage, unreconciled: 2 } });
    Object.assign(classes.walletTokens, { pnlUsd: null, costBasisUsd: null, pnlCoverage: { ...coverage, eligible: 0, unpriced: 3 } });
    // Recorded-subset P&L stays visible even when the full crypto value is unknown.
    portfolio.totals.walletTokensUsd = null;
    const before = JSON.stringify(portfolio);
    expect(allocationPnl(portfolio, "crypto")).toEqual({ pnlUsd: 10, costBasisUsd: 90,
      pnlCoverage: { totalHoldings: 9, eligible: 2, notRecorded: 3, unreconciled: 2, dust: 3, unpriced: 3, status: "partial", sourcesComplete: true } });
    expect(allocationPnl(portfolio, "t212")).toEqual(classes.t212);
    expect(JSON.stringify(portfolio)).toBe(before);
  });

  it.each(["nfts", "walletNative", "walletTokens"] as const)("requires the %s subtotal separately for each currency", (key) => {
    for (const currency of ["Usd", "Thb"] as const) {
      const portfolio = book();
      portfolio.totals[`${key}${currency}`] = null;
      const crypto = valueAllocation(portfolio)[1];
      expect(crypto[`value${currency}`]).toBeNull();
      expect(formatViewUsd(crypto[`value${currency}`])).toBe("—");
      expect(crypto[currency === "Usd" ? "valueThb" : "valueUsd"]).not.toBeNull();
      if (currency === "Usd") expect(valueAllocation(portfolio).every((row) => row.sharePct === null)).toBe(true);
    }
  });

  it("keeps all-unknown recorded crypto amounts null and known zero distinct", () => {
    const portfolio = book();
    for (const summary of Object.values(portfolio.totals.pnlByClass)) {
      summary.pnlUsd = null;
      summary.costBasisUsd = null;
      summary.pnlCoverage.sourcesComplete = false;
    }
    expect(allocationPnl(portfolio, "crypto")).toMatchObject({ pnlUsd: null, costBasisUsd: null, pnlCoverage: { sourcesComplete: false } });
    portfolio.totals.pnlByClass.walletTokens.pnlUsd = 0;
    portfolio.totals.pnlByClass.walletTokens.costBasisUsd = 0;
    expect(allocationPnl(portfolio, "crypto")).toMatchObject({ pnlUsd: 0, costBasisUsd: 0 });
  });

  it.each(["crypto", "cash"] as const)("does not let a positive sibling mask an invalid negative %s subtotal in allocation shares", (group) => {
    const portfolio = book();
    if (group === "crypto") portfolio.totals.walletTokensUsd = -1;
    else { portfolio.t212.totalValue = 1000; portfolio.totals.manualUsd = -700; }
    const allocation = valueAllocation(portfolio);
    expect(allocation.every((row) => row.valueUsd !== null && row.valueUsd > 0)).toBe(true);
    expect(allocation.every((row) => row.sharePct === null)).toBe(true);
  });

  it("withholds all shares when a finite constituent sum overflows the merged class value", () => {
    const portfolio = book();
    portfolio.totals.nftsUsd = Number.MAX_VALUE;
    portfolio.totals.walletNativeUsd = Number.MAX_VALUE;
    const allocation = valueAllocation(portfolio);
    expect(allocation.find((row) => row.key === "crypto")?.valueUsd).toBeNull();
    expect(allocation.every((row) => row.sharePct === null)).toBe(true);
  });

  it("requires both the account remainder and cash constituents for Stocks Port", () => {
    for (const missing of ["account", "brokerCash", "manualUsd", "manualThb", "remainder"] as const) {
      const portfolio = book();
      if (missing === "account") portfolio.t212.totalValue = null;
      if (missing === "brokerCash") portfolio.t212.cashAvailable = null;
      if (missing === "manualUsd") portfolio.totals.manualUsd = null;
      if (missing === "manualThb") portfolio.totals.manualThb = null;
      if (missing === "remainder") portfolio.t212.totalValue = portfolio.t212.cashAvailable! - 1;
      const stocks = valueAllocation(portfolio)[0];
      const unknown = missing === "manualThb" ? stocks.valueThb : stocks.valueUsd;
      expect(unknown).toBeNull();
      expect(formatViewUsd(unknown)).toBe("—");
      if (missing !== "manualThb") expect(valueAllocation(portfolio).every((row) => row.sharePct === null)).toBe(true);
      // Cash cannot manufacture an eligible holding or recorded P&L.
      expect(allocationPnl(portfolio, "t212")).toEqual(portfolio.totals.pnlByClass.t212);
      expect(allocationPnl(portfolio, "t212").pnlCoverage.eligible).toBe(0);
    }
  });

  it("withholds shares when one grouped crypto constituent is negative even if a sibling offsets it", () => {
    for (const key of ["nftsUsd", "walletNativeUsd", "walletTokensUsd"] as const) {
      const portfolio = book();
      portfolio.totals[key] = -5;
      const allocation = valueAllocation(portfolio);
      expect(allocation.some((row) => row.valueUsd !== null && row.valueUsd >= 0)).toBe(true);
      expect(allocation.every((row) => row.sharePct === null)).toBe(true);
    }
    // A negative account remainder must also stay fail-closed.
    const portfolio = book();
    portfolio.t212.totalValue = portfolio.t212.cashAvailable! - 1;
    expect(valueAllocation(portfolio).every((row) => row.sharePct === null)).toBe(true);
  });

  it("retains a directly known USD account value when its THB FX mirror is unavailable", () => {
    const portfolio = book();
    portfolio.t212.currency = "USD";
    portfolio.t212.totalValue = 487;
    portfolio.totals.t212Thb = null;
    portfolio.fx.usdToThb = null;
    expect(valueAllocation(portfolio)[0]).toMatchObject({ valueUsd: 487, valueThb: null });
  });
});

describe("adjacent adjusted snapshot value changes, never investment P&L", () => {
  it("derives adjacent UTC-day changes from equal coverage even when basis coverage is partial", () => {
    const rows = [snapshot("2026-09-04", 1_000), snapshot("2026-09-05", 1_200)];
    expect(dailyChange(rows, DATE)).toEqual({ usd: 200, thb: 7_200, pct: 20, date: "2026-09-05", previousDate: "2026-09-04" });
    expect(dailyChange(rows, "2026-09-06T01:00:00+07:00")?.date).toBe("2026-09-05");
    expect(rows[0].date).toBe("2026-09-04");
  });

  it("requires adjacent days, the current as-of date, comparable source coverage and both USD values", () => {
    expect(dailyChange([], DATE)).toBeNull();
    expect(dailyChange([snapshot()], DATE)).toBeNull();
    expect(dailyChange([snapshot(), snapshot("2026-09-03")], DATE)).toBeNull();
    expect(dailyChange([snapshot(), snapshot("2026-09-04")], "2026-09-06T00:00:00Z")).toBeNull();
    const changed = snapshot(); changed.holdings = { "t212:different-fixture": 1200 };
    expect(dailyChange([changed, snapshot("2026-09-04")], DATE)).toBeNull();
    const partial = snapshot(); partial.sources!.walletTokens.status = "partial";
    expect(dailyChange([partial, snapshot("2026-09-04")], DATE)).toBeNull();
    expect(dailyChange([snapshot(), snapshot("2026-09-04", null)], DATE)).toBeNull();
  });

  it("rejects missing THB and preserves zero-denominator percentages and negative changes", () => {
    const current = snapshot(); current.totalValueThb = null;
    expect(dailyChange([current, snapshot("2026-09-04", 0)], DATE))
      .toBeNull();
    expect(dailyChange([snapshot(), snapshot("2026-09-04", 0)], DATE)?.pct).toBeNull();
    expect(dailyChange([snapshot("2026-09-05", 900), snapshot("2026-09-04", 1_000)], DATE))
      .toMatchObject({ usd: -100, thb: -3_600, pct: -10 });
  });
});

describe("honest calendar and chart periods", () => {
  it("breaks history lines at missing observations, missing figures and changed cost coverage", () => {
    const absentCost = snapshot("2026-09-03"); absentCost.costBasisUsd = null;
    const changedCoverage = snapshot("2026-09-05"); changedCoverage.coverage.eligible += 1; changedCoverage.coverage.notRecorded -= 1;
    const rows = [snapshot("2026-09-07"), changedCoverage, snapshot("2026-09-04"), absentCost, snapshot("2026-09-02"), snapshot("2026-09-01")];
    const dates = (segments: PortfolioSnapshot[][]) => segments.map((segment) => segment.map(({ date }) => date));
    expect(dates(historyLineSegments(rows, "costBasisUsd"))).toEqual([
      ["2026-09-01", "2026-09-02"], ["2026-09-04"], ["2026-09-05"], ["2026-09-07"],
    ]);
    expect(dates(historyLineSegments(rows, "totalValueUsd"))).toEqual([
      ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"], ["2026-09-07"],
    ]);
    const absentValue = snapshot("2026-09-02", null);
    expect(historyLineSegments([snapshot("2026-09-01", 0), absentValue, snapshot("2026-09-03")], "totalValueUsd"))
      .toHaveLength(2);
    expect(historyLineSegments([], "costBasisUsd")).toEqual([]);
    expect(rows[0].date).toBe("2026-09-07");
  });

  it("filters UTC calendar months inclusively, clamps month ends and never fills gaps", () => {
    const rows = [snapshot("2026-03-31"), snapshot("2026-02-28"), snapshot("2026-02-27"), snapshot("2026-04-01")];
    expect(historyPeriodRows(rows, "1M", "2026-03-31T12:00:00Z").map(({ date }) => date))
      .toEqual(["2026-02-28", "2026-03-31"]);
    expect(historyPeriodRows([snapshot("2025-12-30"), snapshot("2025-12-31"), ...rows], "3M", "2026-03-31")
      .map(({ date }) => date)).toEqual(["2025-12-31", "2026-02-27", "2026-02-28", "2026-03-31"]);
    expect(rows[0].date).toBe("2026-03-31");
  });

  it("All still excludes future observations and invalid as-of dates stay empty", () => {
    const rows = [snapshot("2026-09-05"), snapshot("2025-01-01"), snapshot("2026-09-06")];
    expect(historyPeriodRows(rows, "All", DATE).map(({ date }) => date)).toEqual(["2025-01-01", "2026-09-05"]);
    expect(historyPeriodRows(rows, "All", "invalid")).toEqual([]);
    expect(historyPeriodRows(rows, "All", "2026-09-05invalid")).toEqual([]);
    expect(historyPeriodRows([], "1M", DATE)).toEqual([]);
  });

  it("builds Monday-first UTC month grids including leap days and blank padding only", () => {
    const september = calendarDays("2026-09");
    expect(september).toHaveLength(35);
    expect(september.slice(0, 3)).toEqual([null, "2026-09-01", "2026-09-02"]);
    expect(september.filter(Boolean)).toHaveLength(30);
    const february = calendarDays("2024-02");
    expect(february).toContain("2024-02-29");
    expect(calendarDays("2026-02")).not.toContain("2026-02-29");
    expect(calendarDays("2026-13")).toEqual([]);
    expect(calendarDays("invalid")).toEqual([]);
  });
});
