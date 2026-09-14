import { describe, expect, it } from "vitest";
import { dailyChange, dailyChangeDetails, holdingDayChange, previousDayHoldings, valueAllocation } from "./pnl-view";
import { joinedHoldingsMap, joinedNativeBasketMembership, valueSetSignature } from "./holding-values";
import { createSnapshotRecorder, mapPortfolioSnapshotRow, type PortfolioSnapshot } from "./pnl-history";
import { buildJoinedPortfolio, type JoinedPortfolio, type LiveResult } from "./live-data";
import { capitalBook } from "./__fixtures__/capital-book";
import { shouldSuppressHolding } from "./dust-filter";
import { dustBook } from "../scripts/__fixtures__/dust-book";

const AS_OF = "2026-09-11T00:00:00Z";
const FX = 33.003871;
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: AS_OF, message: "fixture" } });
const sources = Object.fromEntries(["t212Summary", "t212Positions", "nfts", "fiatFx", "ethPrice", "walletNative", "walletTokens", "solana", "manualHoldings", "capital"].map((key) => [key, { status: key === "walletTokens" ? "partial" : "live", asOf: AS_OF, message: "fixture" }]));
function snapshot(date: string, valueThb: number, capitalThb: number | null, rate = FX): PortfolioSnapshot {
  return mapPortfolioSnapshotRow({ snapshot_date: date, total_value_usd: valueThb / rate, total_value_thb: valueThb,
    contributed_capital_thb: capitalThb, contributed_capital_usd: capitalThb === null ? null : capitalThb / rate,
    holdings: { "manual:T212 cash pot": 2000 * 44.6154 / rate, "token:1:unknown": null },
    coverage: { status: "partial", sourcesComplete: false, totalHoldings: 1, eligible: 0, notRecorded: 0, dust: 0, unpriced: 1, unreconciled: 0, sources },
  })!;
}

function thresholdBook(priceUsd: number | null, asOf: string, includeEdge = true) {
  const previousDay = "2026-09-10T00:00:00Z";
  return buildJoinedPortfolio({
    solana: live({ native: [], tokens: [] }),
    t212Summary: live({ currency: "USD", cashAvailable: 0, totalValue: 0, investmentsCurrentValue: 0 }),
    t212Positions: live([]), nfts: live([]), walletNative: live([]),
    walletTokens: live([
      { chainId: 1, chainName: "Ethereum", symbol: "STABLE", name: "Stable", contract: "0xbbb", amountRaw: "5", decimals: 0, amount: 5, priceUsd: 1 },
      ...(includeEdge ? [{ chainId: 1, chainName: "Ethereum", symbol: "EDGE", name: "Boundary", contract: "0xaaa", amountRaw: "1", decimals: 0, amount: 1, priceUsd }] : []),
    ]),
    fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf }), ethPrice: live(2400),
    capitalEvents: live([{ occurredAt: previousDay, kind: "contribution", amountThb: 3600 }]),
    manualHoldings: live([{ id: "cash", label: "Cash pot", kind: "cash", currency: "USD", amount: 100, recordedAt: previousDay, createdAt: previousDay }]),
  }, asOf);
}

/** Read back the actual recorder INSERT values so the regression covers persistence. */
async function recordedBook(portfolio: JoinedPortfolio) {
  let inserted: unknown[] | undefined;
  const recorder = createSnapshotRecorder({ hasDb: () => true, now: () => Date.parse(portfolio.asOf),
    getDb: () => ({ query: async (sql, params = []) => {
      if (!sql.includes("INSERT")) return [];
      inserted = params;
      return [{ snapshot_date: params[0] }];
    } }),
  });
  expect(await recorder(portfolio)).toBe("recorded");
  expect(inserted).toBeDefined();
  const values = inserted!;
  const coverage = JSON.parse(String(values[8]));
  const row = mapPortfolioSnapshotRow({ snapshot_date: values[0], total_value_usd: values[1], total_value_thb: values[2],
    cost_basis_usd: values[3], cost_basis_thb: values[4], pnl_usd: values[5], pnl_thb: values[6], pnl_pct: values[7],
    coverage, as_of: values[9], contributed_capital_thb: values[10], contributed_capital_usd: values[11],
    manual_value_usd: values[12], manual_value_thb: values[13], book_pnl_thb: values[14], book_pnl_usd: values[15],
    holdings: JSON.parse(String(values[16])),
  })!;
  expect(row).not.toBeNull();
  expect(row.holdings).toEqual(joinedHoldingsMap(portfolio));
  expect(coverage.valueSetSignature).toBe(valueSetSignature(row.holdings, row.sources));
  return { row, recordedSignature: coverage.valueSetSignature };
}
describe("adjusted adjacent-day book value change", () => {
  it("treats the verified GBP 477 broker-to-pot transfer as internal, never capital withdrawal or loss", () => {
    const current = capitalBook();
    // Synthetic pre-transfer observation: reverse just the two internal cash legs.
    // This is an accounting identity test, not invented historical provider data.
    const previous = structuredClone(current);
    previous.t212.totalValue! += 477;
    previous.manualHoldings[0].amount -= 477;
    const fullThb = (previous.t212.totalValue! + previous.manualHoldings[0].amount) * 44.6154;
    expect(fullThb).toBeCloseTo(current.totals.grandTotalThb!, 8);
    const after = snapshot("2026-09-11", current.totals.grandTotalThb!, 120000);
    const before = snapshot("2026-09-10", fullThb, 120000);
    expect(dailyChange([after, before], AS_OF)).toMatchObject({ usd: 0, thb: 0 });
    expect(current.capital.contributedThb).toBe(120000);
  });
  it("continues reading legacy stable partial pricing and removes a reported contribution", () => {
    const before = snapshot("2026-09-10", 100000, 110000);
    const after = snapshot("2026-09-11", 110000, 120000);
    expect(dailyChange([after, before], AS_OF)).toMatchObject({ usd: 0, thb: 0, pct: 0 });
  });
  it("removes a withdrawal instead of calling it a loss", () => {
    expect(dailyChange([snapshot("2026-09-11", 90000, 110000), snapshot("2026-09-10", 100000, 120000)], AS_OF))
      .toMatchObject({ usd: 0, thb: 0, pct: 0 });
  });
  it("converts the THB-adjusted change once at the current snapshot rate", () => {
    const before = snapshot("2026-09-10", 100000, 120000, 32);
    const after = snapshot("2026-09-11", 101000, 120000);
    const change = dailyChange([after, before], AS_OF)!;
    expect(change.thb).toBe(1000);
    expect(change.usd).toBeCloseTo(1000 / FX, 8);
    // Percentage is THB-adjusted change / previous THB book value, not USD return.
    expect(change.pct).toBe(1);
  });
  it("pins audit A3: FX 32 → 34 cannot turn an unchanged THB book into a USD gain", () => {
    const before = snapshot("2026-09-10", 100000, 120000, 32);
    const after = snapshot("2026-09-11", 100000, 120000, 34);
    expect(valueSetSignature(before.holdings, before.sources)).toBe(valueSetSignature(after.holdings, after.sources));
    // Verbatim audit numbers: raw USD value falls −183.82; the old bug showed +36.76 / +1.18%.
    expect(after.totalValueUsd! - before.totalValueUsd!).toBeCloseTo(-183.82, 2);
    expect(dailyChangeDetails([after, before], AS_OF)).toEqual({
      change: { usd: 0, thb: 0, pct: 0, date: "2026-09-11", previousDate: "2026-09-10" }, reason: null,
    });
  });
  it("removes cash flows in THB despite FX moves and preserves the remaining change's sign", () => {
    const before = snapshot("2026-09-10", 100000, 120000, 32);
    for (const flow of [-10000, 10000]) {
      for (const movement of [-1000, 0, 1000]) {
        const after = snapshot("2026-09-11", 100000 + flow + movement, 120000 + flow, 34);
        const change = dailyChange([after, before], AS_OF)!;
        expect(change.thb).toBe(movement);
        expect(change.usd).toBeCloseTo(movement / 34, 8);
        expect(change.pct).toBe(movement / 100000 * 100);
      }
    }
  });
  it("keeps a fully withdrawn book's known zero adjusted change without guessing an FX rate", () => {
    const before = snapshot("2026-09-10", 100000, 100000, 32);
    const after = snapshot("2026-09-11", 0, 0, 34);
    expect(dailyChange([after, before], AS_OF)).toMatchObject({ usd: 0, thb: 0, pct: 0 });
  });
  it("uses only current capital mirrors for FX when the book is zero and refuses unknowable FX", () => {
    const before = snapshot("2026-09-10", 100000, 120000, 32);
    const after = snapshot("2026-09-11", 0, 120000, 34);
    expect(dailyChange([after, before], AS_OF)?.usd).toBeCloseTo(-100000 / 34, 8);
    expect(dailyChange([after, before], AS_OF)?.pct).toBe(-100);
    const unknowable = snapshot("2026-09-11", 0, 0, 34);
    expect(dailyChangeDetails([unknowable, before], AS_OF)).toEqual({ change: null, reason: "snapshot FX unavailable" });
    const invalidMirror = { ...after, contributedCapitalUsd: -1 };
    expect(dailyChangeDetails([invalidMirror, before], AS_OF).reason).toBe("snapshot FX unavailable");
  });
  it("provides an explicit missing-adjacent-day reason and no per-asset map across gaps", () => {
    const rows = [snapshot("2026-09-11", 100000, 120000), snapshot("2026-09-09", 100000, 120000)];
    expect(dailyChange(rows, AS_OF)).toBeNull();
    expect(dailyChangeDetails(rows, AS_OF).reason).toBe("no previous recorded day");
    expect(previousDayHoldings(rows, AS_OF)).toBeNull();
  });
  it("rejects a different basket even with the same number of priced holdings", () => {
    const before = snapshot("2026-09-10", 100000, 120000);
    before.holdings = { "manual:Other pot": 1000, "token:1:unknown": null };
    const after = snapshot("2026-09-11", 100000, 120000);
    expect(dailyChangeDetails([after, before], AS_OF)).toEqual({ change: null, reason: "holdings changed between days" });
    before.holdings = { ...after.holdings!, "token:1:unknown": 1 };
    expect(dailyChangeDetails([after, before], AS_OF).reason).toBe("holdings changed between days");
  });
  it("fails closed for unavailable sources, absent capital, invalid totals and legacy maps", () => {
    const previous = snapshot("2026-09-10", 100000, 120000);
    for (const patch of [ { contributedCapitalThb: null }, { contributedCapitalUsd: null }, { holdings: null },
      { totalValueThb: null }, { totalValueUsd: -1 }, { totalValueThb: Infinity },
      { sources: { ...previous.sources, fiatFx: { status: "unavailable", asOf: null, message: "outage" } } } ]) {
      const after = { ...snapshot("2026-09-11", 110000, 120000), ...patch } as PortfolioSnapshot;
      expect(dailyChange([after, previous], AS_OF)).toBeNull();
    }
    expect(dailyChange([snapshot("2026-09-11", 0, 120000), snapshot("2026-09-10", 0, 120000)], AS_OF)?.pct).toBeNull();
  });
  it("refuses the one-day native key transition and resumes after the new basket is stable", () => {
    const before = snapshot("2026-09-10", 100000, 120000);
    before.holdings = { "native:1": 1, "native:8453": 2, "native:42161": 3, "native:4663": 4 };
    const after = snapshot("2026-09-11", 100000, 120000);
    after.holdings = { "native:eth": 10 };
    expect(valueSetSignature(before.holdings, before.sources)).not.toBe(valueSetSignature(after.holdings, after.sources));
    expect(dailyChangeDetails([after, before], AS_OF)).toEqual({ change: null, reason: "holdings changed between days" });
    const next = { ...after, date: "2026-09-12" };
    expect(dailyChangeDetails([next, after], "2026-09-12T00:00:00Z")).toMatchObject({ change: { usd: 0, thb: 0 }, reason: null });
  });
  it("marks a legacy snapshot without the Solana source unavailable instead of inventing source coverage", () => {
    const legacySources = { ...sources };
    delete legacySources.solana;
    const before = mapPortfolioSnapshotRow({ snapshot_date: "2026-09-10", total_value_usd: 100000 / FX, total_value_thb: 100000,
      contributed_capital_thb: 120000, contributed_capital_usd: 120000 / FX,
      holdings: { "native:1": 10 }, coverage: { ...snapshot("2026-09-10", 100000, 120000).coverage, sources: legacySources },
    })!;
    const after = snapshot("2026-09-11", 100000, 120000);
    after.holdings = { "native:eth": 10, "native:solana:native": 4.8 };
    expect(before.sources).toBeNull();
    expect(dailyChangeDetails([after, before], AS_OF)).toEqual({ change: null, reason: "source unavailable" });
  });
  const nativeBook = (asOf: string, missingChain?: number, price = 1000) => buildJoinedPortfolio({
    solana: live({ native: [], tokens: [] }),
    t212Summary: live({ currency: "USD", cashAvailable: 0, totalValue: 0, investmentsCurrentValue: 0 }),
    t212Positions: live([]), nfts: live([]), walletTokens: live([]),
    walletNative: { data: [1, 8453, 42161, 4663].map((chainId, index) => ({
      chainId, chainName: String(chainId), symbol: "ETH", amount: 2 ** index,
      amountRaw: (BigInt(2 ** index) * BigInt("1000000000000000000")).toString(),
    })).filter((row) => row.chainId !== missingChain),
    state: { status: missingChain === undefined ? "live" : "partial", asOf, message: "fixture RPC inventory" } },
    fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf }), ethPrice: live(price),
    capitalEvents: live([{ occurredAt: "2026-09-01T00:00:00Z", kind: "contribution", amountThb: 36000 }]), manualHoldings: live([]),
  }, asOf);
  it("L2: refuses the exact Base-outage $13000 to Arbitrum-outage $11000 false loss", async () => {
    const beforeBook = nativeBook("2026-09-10T23:59:59Z", 8453);
    const afterBook = nativeBook(AS_OF, 42161);
    expect(joinedHoldingsMap(beforeBook)).toEqual({ "native:eth": 13000 });
    expect(joinedHoldingsMap(afterBook)).toEqual({ "native:eth": 11000 });
    expect(beforeBook.sources.walletNative.status).toBe("partial");
    expect(afterBook.sources.walletNative.status).toBe("partial");
    const before = await recordedBook(beforeBook);
    const after = await recordedBook(afterBook);
    expect(before.recordedSignature).toBeNull();
    expect(after.recordedSignature).toBeNull();
    expect(after.row.totalValueUsd! - before.row.totalValueUsd!).toBe(-2000);
    expect(dailyChangeDetails([after.row, before.row], AS_OF)).toEqual({ change: null, reason: "value-set evidence unavailable" });
  });
  it("L2: compares an unchanged complete combined basket across adjacent days and price changes", async () => {
    const before = await recordedBook(nativeBook("2026-09-10T23:59:59Z"));
    const after = await recordedBook(nativeBook(AS_OF, undefined, 1100));
    expect(before.recordedSignature).not.toBeNull();
    expect(after.recordedSignature).toBe(before.recordedSignature);
    expect(dailyChangeDetails([after.row, before.row], AS_OF)).toEqual({
      change: { usd: 1500, thb: 54000, pct: 10, date: "2026-09-11", previousDate: "2026-09-10" }, reason: null,
    });
  });
  it("L2 Asset Day: refuses the reviewer's Base-to-Arbitrum outage false loss after snapshot roundtrip", async () => {
    const beforeBook = nativeBook("2026-09-10T23:59:59Z", 8453);
    const afterBook = nativeBook(AS_OF, 42161);
    const before = await recordedBook(beforeBook);
    const after = await recordedBook(afterBook);
    expect(before.row.holdings).toEqual({ "native:eth": 13000 });
    expect(after.row.holdings).toEqual({ "native:eth": 11000 });
    expect(before.row.nativeBasketMembership).toEqual({ "native:eth": [1, 4663, 42161] });
    expect(after.row.nativeBasketMembership).toEqual({ "native:eth": [1, 4663, 8453] });
    const previous = previousDayHoldings([after.row, before.row], AS_OF);
    expect(previous?.sources?.walletNative.status).toBe("partial");
    expect(previous?.nativeBasketMembership).toEqual(before.row.nativeBasketMembership);
    const current = { sources: afterBook.sources, nativeBasketMembership: joinedNativeBasketMembership(afterBook) };
    const change = holdingDayChange("native:eth", afterBook.wallet.native[0].valueUsd, previous, current);
    const falseUsd = 11000 - 13000;
    const falsePct = falseUsd / 13000 * 100;
    expect(falsePct).toBe(-15.384615384615385);
    expect(change).toBeNull();
    expect(holdingDayChange("native:eth", 11000, previous, after.row)).toBeNull();
    console.log("L2 ASSET DAY COUNTEREXAMPLE " + JSON.stringify({ balancesEth: [1, 2, 4, 8], priceUsd: 1000,
      previousMissingChain: "Base", currentMissingChain: "Arbitrum", previousValueUsd: 13000,
      currentValueUsd: 11000, rejectedFalseChange: { usd: falseUsd, pct: falsePct }, assetDayChange: change }));
  });
  it("L2 Asset Day: reports the correct price-only change for two complete unchanged baskets", async () => {
    const before = await recordedBook(nativeBook("2026-09-10T23:59:59Z"));
    const afterBook = nativeBook(AS_OF, undefined, 1100);
    const after = await recordedBook(afterBook);
    expect(before.row.holdings).toEqual({ "native:eth": 15000 });
    expect(after.row.holdings).toEqual({ "native:eth": 16500 });
    expect(before.row.nativeBasketMembership).toEqual({ "native:eth": [1, 4663, 8453, 42161] });
    expect(after.row.nativeBasketMembership).toEqual(before.row.nativeBasketMembership);
    const previous = previousDayHoldings([after.row, before.row], AS_OF);
    const current = { sources: afterBook.sources, nativeBasketMembership: joinedNativeBasketMembership(afterBook) };
    const change = holdingDayChange("native:eth", afterBook.wallet.native[0].valueUsd, previous, current);
    expect(change).toEqual({ usd: 1500, pct: 10 });
    expect(holdingDayChange("native:eth", 16500, previous, after.row)).toEqual(change);
    console.log("L2 ASSET DAY POSITIVE CONTROL " + JSON.stringify({ balancesEth: [1, 2, 4, 8],
      previousPriceUsd: 1000, currentPriceUsd: 1100, previousValueUsd: 15000, currentValueUsd: 16500, assetDayChange: change }));
  });
  it.each([[8453, undefined], [undefined, 42161], [8453, 8453]])(
    "L2 Asset Day: refuses either incomplete observation, including identical partial membership (%s, %s)",
    async (earlierMissing, laterMissing) => {
      const before = await recordedBook(nativeBook("2026-09-10T23:59:59Z", earlierMissing));
      const after = await recordedBook(nativeBook(AS_OF, laterMissing));
      expect(holdingDayChange("native:eth", after.row.holdings!["native:eth"],
        previousDayHoldings([before.row], AS_OF), after.row)).toBeNull();
    },
  );
  it.each(["previous", "current"] as const)("L2 Asset Day: fails closed for missing or invalid %s evidence", async (side) => {
    const before = (await recordedBook(nativeBook("2026-09-10T23:59:59Z"))).row;
    const after = (await recordedBook(nativeBook(AS_OF, undefined, 1100))).row;
    for (const issue of ["missing-membership", "empty-membership", "duplicate-membership", "changed-membership", "missing-sources", "nine-sources", "unavailable-native"] as const) {
      const previous = structuredClone(before);
      const current = structuredClone(after);
      const invalid = side === "previous" ? previous : current;
      if (issue === "missing-membership") delete invalid.nativeBasketMembership;
      if (issue === "empty-membership") invalid.nativeBasketMembership = { "native:eth": [] };
      if (issue === "duplicate-membership") invalid.nativeBasketMembership = { "native:eth": [1, 4663, 8453, 8453] };
      if (issue === "changed-membership") invalid.nativeBasketMembership = { "native:eth": [1, 4663, 8453, 10] };
      if (issue === "missing-sources") invalid.sources = null;
      if (issue === "nine-sources") delete invalid.sources!.solana;
      if (issue === "unavailable-native") invalid.sources!.walletNative.status = "unavailable";
      expect(holdingDayChange("native:eth", 16500, previousDayHoldings([previous], AS_OF), current), issue).toBeNull();
    }
  });
  it("L2 Asset Day: compares reordered complete membership without mutating it or gating unrelated assets", async () => {
    const before = (await recordedBook(nativeBook("2026-09-10T23:59:59Z"))).row;
    const after = (await recordedBook(nativeBook(AS_OF, undefined, 1100))).row;
    after.nativeBasketMembership!["native:eth"].reverse();
    const original = structuredClone(after.nativeBasketMembership);
    expect(holdingDayChange("native:eth", 16500, previousDayHoldings([before], AS_OF), after)).toEqual({ usd: 1500, pct: 10 });
    expect(after.nativeBasketMembership).toEqual(original);
    before.holdings!["t212:UNCHANGED-CONTRACT"] = 100;
    before.holdings!["native:solana:native"] = 10;
    before.sources!.walletNative.status = "partial";
    after.sources!.walletNative.status = "partial";
    delete before.nativeBasketMembership;
    delete after.nativeBasketMembership;
    const previous = previousDayHoldings([before], AS_OF);
    expect(holdingDayChange("t212:UNCHANGED-CONTRACT", 110, previous, after)).toEqual({ usd: 10, pct: 10 });
    expect(holdingDayChange("native:solana:native", 11, previous, after)).toEqual({ usd: 1, pct: 10 });
  });
  it("L2: refuses legacy partial combined evidence and resumes with two complete observations", () => {
    const before = snapshot("2026-09-10", 468000, 0, 36);
    before.holdings = { "native:eth": 13000 };
    before.sources = { ...before.sources!, walletNative: { status: "partial", asOf: null, message: "legacy partial RPC" } };
    const after = snapshot("2026-09-11", 540000, 0, 36);
    after.holdings = { "native:eth": 15000 };
    expect(dailyChangeDetails([after, before], AS_OF)).toEqual({ change: null, reason: "value-set evidence unavailable" });
    expect(dailyChangeDetails([{ ...after, date: "2026-09-12" }, after], "2026-09-12T00:00:00Z"))
      .toMatchObject({ change: { usd: 0, thb: 0 }, reason: null });
  });
});
describe("compact snapshot holdings and book columns", () => {
  const book = () => buildJoinedPortfolio({
    solana: live({ native: [], tokens: [] }),
    t212Summary: live({ currency: "GBP", totalValue: 9.62, cashAvailable: 0.28, investmentsCurrentValue: 9.34 }),
    t212Positions: live([{ ticker: "CMCSA_US_EQ", name: "Comcast", quantity: 0.5, averagePrice: 26.32,
      currentPrice: 25.25, ppl: -0.37, currency: "USD", pplCurrency: "GBP", valueNative: 12.625, costAccount: null, valueAccount: 9.34 }]),
    nfts: live([]), walletNative: live([]), walletTokens: live([]),
    fiatFx: live({ usdToThb: FX, gbpToThb: 44.6154, eurToThb: null, asOf: AS_OF }), ethPrice: live(2578.15),
    capitalEvents: live([{ occurredAt: AS_OF, kind: "contribution", amountThb: 120000 }]),
    manualHoldings: live([{ id: "report-uuid", label: "T212 cash pot", kind: "cash", currency: "GBP", amount: 2000, recordedAt: AS_OF, createdAt: AS_OF }]),
  }, AS_OF);
  it("identifies manual cash by stable label, not append-only report UUID", () => {
    const portfolio = book();
    const map = joinedHoldingsMap(portfolio);
    expect(map).toEqual({ "manual:T212 cash pot": portfolio.totals.manualUsd, "t212:CMCSA_US_EQ": portfolio.t212.investments[0].valueUsd });
    expect(valueSetSignature(map, portfolio.sources)).not.toBeNull();
    portfolio.manualHoldings[0].id = "next-report-uuid";
    expect(joinedHoldingsMap(portfolio)).toEqual(map);
  });
  it("separates broker cash and manual cash from Stocks Port without double counting", () => {
    const portfolio = book();
    const allocations = valueAllocation(portfolio);
    expect(allocations.find((row) => row.key === "cash")?.valueThb).toBeCloseTo(portfolio.t212.cashAvailable! * portfolio.fx.gbpToThb! + portfolio.totals.manualThb!, 8);
    expect(allocations.find((row) => row.key === "t212")?.valueThb).toBeCloseTo((portfolio.t212.totalValue! - portfolio.t212.cashAvailable!) * portfolio.fx.gbpToThb!, 8);
    expect(allocations.reduce((sum, row) => sum + row.valueThb!, 0)).toBeCloseTo(portfolio.totals.grandTotalThb!, 8);
    expect(allocations.reduce((sum, row) => sum + row.sharePct!, 0)).toBeCloseTo(100, 8);
  });
  it.each([[0.5, 1.5, 1], [1.5, 0.5, -1], [0.999, 1, 0.001], [1, 0.999, -0.001]])(
    "records the same basket across $%s → $%s and retains the $%s adjusted UTC-day change",
    async (beforePrice, afterPrice, movement) => {
      const beforeBook = thresholdBook(beforePrice, "2026-09-10T23:59:59Z");
      const afterBook = thresholdBook(afterPrice, AS_OF);
      const before = await recordedBook(beforeBook);
      const after = await recordedBook(afterBook);
      expect(before.row.holdings).toEqual({ "token:1:0xaaa": beforePrice, "token:1:0xbbb": 5, "manual:Cash pot": 100 });
      expect(after.row.holdings).toEqual({ "token:1:0xaaa": afterPrice, "token:1:0xbbb": 5, "manual:Cash pot": 100 });
      expect(after.recordedSignature).toBe(before.recordedSignature);
      expect(before.row.totalValueUsd).toBeCloseTo(105 + beforePrice, 10);
      expect(after.row.totalValueUsd).toBeCloseTo(105 + afterPrice, 10);
      const beforeDisplayed = beforeBook.wallet.tokens.filter((row) => !shouldSuppressHolding(row));
      const afterDisplayed = afterBook.wallet.tokens.filter((row) => !shouldSuppressHolding(row));
      expect(beforeDisplayed).toHaveLength(beforePrice < 1 ? 1 : 2);
      expect(afterDisplayed).toHaveLength(afterPrice < 1 ? 1 : 2);
      const result = dailyChangeDetails([after.row, before.row], AS_OF);
      expect(result.reason).toBeNull();
      expect(result.change).toMatchObject({ date: "2026-09-11", previousDate: "2026-09-10" });
      expect(result.change!.usd).toBeCloseTo(movement, 10);
      expect(result.change!.thb).toBeCloseTo(movement * 36, 10);
      expect(result.change!.pct).toBeCloseTo(movement / (105 + beforePrice) * 100, 10);
    },
  );
  it.each([{ change: "removed", previouslyPresent: true }, { change: "added", previouslyPresent: false }])(
    "still refuses a genuinely $change holding between recorded days", async ({ previouslyPresent }) => {
    const before = await recordedBook(thresholdBook(0.5, "2026-09-10T23:59:59Z", previouslyPresent));
    const after = await recordedBook(thresholdBook(0.5, AS_OF, !previouslyPresent));
    expect(before.recordedSignature).not.toBe(after.recordedSignature);
    expect(dailyChangeDetails([after.row, before.row], AS_OF)).toEqual({ change: null, reason: "holdings changed between days" });
    },
  );
  it("records suppressed and unknown holdings across every class, plus small and zero manual cash", async () => {
    const portfolio = dustBook("mixed");
    const { row } = await recordedBook(portfolio);
    expect(row.holdings).toEqual({
      "t212:SECURITY-ONE": 1, "t212:SECURITY-SMALL": 0.999, "t212:SECURITY-UNKNOWN": null,
      "nft:collection-one": 1, "nft:collection-small": expect.closeTo(0.999, 10), "nft:collection-unknown": null,
      "native:eth": expect.closeTo(1.999, 10),
      "token:1:0x0000000000000000000000000000000000000001": 1,
      "token:1:0x0000000000000000000000000000000000000002": 0.999,
      "token:1:0x0000000000000000000000000000000000000003": null,
      "manual:Quarter cash pot": 0.25, "manual:Zero cash pot": 0,
    });
    expect(row.totalValueUsd).toBeCloseTo(8.246, 10);
    expect(row.totalValueThb).toBeCloseTo(296.856, 10);
    expect(row.coverage).toMatchObject({ status: "complete", totalHoldings: 4, eligible: 4, dust: 0, unpriced: 0 });
  });
  it("records all seven extensions, leaves eligible-subset columns unchanged, reads maps back", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const portfolio = book();
    const record = createSnapshotRecorder({ hasDb: () => true, now: () => Date.parse(AS_OF), getDb: () => ({ query: async (sql, params = []) => {
      calls.push({ sql, params }); return sql.includes("INSERT") ? [{ snapshot_date: "2026-09-11" }] : [];
    } }) });
    expect(await record(portfolio)).toBe("recorded");
    expect(calls.some(({ sql }) => sql.includes("ADD COLUMN IF NOT EXISTS holdings"))).toBe(true);
    const insert = calls.find(({ sql }) => sql.includes("INSERT"))!;
    expect(insert.params.slice(10, 16)).toEqual([120000, 120000 / FX, portfolio.totals.manualUsd, portfolio.totals.manualThb, portfolio.totals.bookPnl!.pnlThb, portfolio.totals.bookPnl!.pnlUsd]);
    expect(JSON.parse(String(insert.params[16]))).toEqual(joinedHoldingsMap(portfolio));
    expect(insert.params[1]).toBe(portfolio.totals.grandTotalUsd);
    expect(insert.params[3]).toBe(portfolio.totals.costBasisUsd);
    const row = snapshot("2026-09-10", 100000, 120000);
    expect(previousDayHoldings([row], AS_OF)).toEqual({ holdings: row.holdings, sources: row.sources,
      nativeBasketMembership: row.nativeBasketMembership });
  });
});
