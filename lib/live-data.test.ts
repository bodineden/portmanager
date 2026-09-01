import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildJoinedPortfolio,
  getJoinedPortfolio,
  normalizeT212Positions,
  type JoinedPortfolioInputs,
  type LiveResult,
  type LiveSourceState,
} from "./live-data";

const AS_OF = "2026-09-01T12:00:00.000Z";

function state(status: LiveSourceState["status"] = "live", message = "fixture"): LiveSourceState {
  return { status, message, asOf: status === "unavailable" ? null : AS_OF };
}

function live<T>(data: T): LiveResult<T> {
  return { data, state: state() };
}

function unavailable<T>(): LiveResult<T> {
  return { data: null, state: state("unavailable", "fixture unavailable") };
}

function fixtureInputs(): JoinedPortfolioInputs {
  return {
    t212Summary: live({
      currency: "GBP",
      cashAvailable: 487,
      totalValue: 487,
      investmentsCurrentValue: 0,
    }),
    t212Positions: live([]),
    nfts: live([
      { collection: "stackersv2", collectionName: "Stackers V2", tokenCount: 2, floorEth: 0.0910577 },
      { collection: "g00fyz", collectionName: "G00fyz", tokenCount: 2, floorEth: 0.0005 },
    ]),
    fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: AS_OF }),
    ethPrice: live(2_000),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("buildJoinedPortfolio", () => {
  it("matches the required NFT arithmetic and joined totals", () => {
    const portfolio = buildJoinedPortfolio(fixtureInputs(), AS_OF);
    const expectedEth = 2 * 0.0910577 + 2 * 0.0005;
    const expectedNftThb = expectedEth * 2_000 * 36;

    console.info(
      `Arithmetic QA: formula=${expectedEth} ETH × 2000 USD/ETH × 36 THB/USD = ${expectedNftThb} THB; core=${portfolio.totals.nftsEth} ETH / ${portfolio.totals.nftsThb} THB`,
    );

    expect(expectedEth).toBe(0.1831154);
    expect(portfolio.totals.nftsEth).toBeCloseTo(expectedEth, 10);
    expect(portfolio.totals.nftsUsd).toBeCloseTo(366.2308, 8);
    expect(portfolio.totals.nftsThb).toBeCloseTo(13_184.3088, 6);
    expect(portfolio.totals.t212Thb).toBe(21_915);
    expect(portfolio.totals.grandTotalThb).toBeCloseTo(35_099.3088, 6);
    expect(portfolio.totals.grandTotalUsd).toBeCloseTo(974.9808, 6);
  });

  it("keeps the operator-verified 50/50/0 ownership in one derived config", () => {
    const { ownership } = buildJoinedPortfolio(fixtureInputs(), AS_OF);

    expect(ownership).toEqual({ aShare: 0.5, bShare: 0.5, cShare: 0 });
    expect(ownership.aShare + ownership.bShare + ownership.cShare).toBe(1);
  });

  it("preserves live cash and a successful empty-positions response", () => {
    const portfolio = buildJoinedPortfolio(fixtureInputs(), AS_OF);

    expect(portfolio.t212).toMatchObject({
      currency: "GBP",
      cashAvailable: 487,
      totalValue: 487,
      investmentsCurrentValue: 0,
      investments: [],
    });
    expect(portfolio.sources.t212Positions.status).toBe("live");
  });

  it("converts position currencies but uses summary total as authoritative", () => {
    const inputs = fixtureInputs();
    inputs.t212Summary = live({
      currency: "GBP",
      cashAvailable: 40,
      totalValue: 100,
      investmentsCurrentValue: 60,
    });
    inputs.t212Positions = live([
      {
        ticker: "GBP_EQ",
        name: "GBP position",
        quantity: 2,
        averagePrice: 8,
        currentPrice: 10,
        ppl: 4,
        currency: "GBP",
        pplCurrency: "GBP",
        valueNative: 20,
        valueAccount: 20,
      },
      {
        ticker: "USD_EQ",
        name: "USD position",
        quantity: 2,
        averagePrice: 0.8,
        currentPrice: 1,
        ppl: null,
        currency: "USD",
        pplCurrency: null,
        valueNative: 2,
        valueAccount: null,
      },
      {
        ticker: "EUR_EQ",
        name: "EUR position",
        quantity: 3,
        averagePrice: 1.5,
        currentPrice: 2,
        ppl: null,
        currency: "EUR",
        pplCurrency: null,
        valueNative: 6,
        valueAccount: null,
      },
    ]);

    const portfolio = buildJoinedPortfolio(inputs, AS_OF);

    expect(portfolio.t212.investments.map((position) => position.valueThb)).toEqual([900, 72, 240]);
    expect(portfolio.totals.t212Thb).toBe(4_500);
  });

  it("keeps ETH holdings known when CoinGecko is unavailable", () => {
    const inputs = fixtureInputs();
    inputs.ethPrice = unavailable();
    const portfolio = buildJoinedPortfolio(inputs, AS_OF);

    expect(portfolio.totals.nftsEth).toBeCloseTo(0.1831154, 10);
    expect(portfolio.totals.nftsUsd).toBeNull();
    expect(portfolio.totals.nftsThb).toBeNull();
    expect(portfolio.totals.grandTotalThb).toBeNull();
  });

  it("returns a complete unavailable shape without inventing zeroes", () => {
    const portfolio = buildJoinedPortfolio({
      t212Summary: unavailable(),
      t212Positions: unavailable(),
      nfts: unavailable(),
      fiatFx: unavailable(),
      ethPrice: unavailable(),
    }, AS_OF);

    expect(portfolio.t212.cashAvailable).toBeNull();
    expect(portfolio.t212.investments).toEqual([]);
    expect(portfolio.nfts).toEqual([]);
    expect(portfolio.totals).toEqual({
      t212Thb: null,
      nftsEth: null,
      nftsUsd: null,
      nftsThb: null,
      grandTotalThb: null,
      grandTotalUsd: null,
    });
  });
});

describe("Trading 212 normalisation", () => {
  it("parses the current nested positions schema", () => {
    const result = normalizeT212Positions([
      {
        averagePricePaid: 95,
        currentPrice: 100,
        quantity: 2,
        instrument: { ticker: "TEST_US_EQ", name: "Test Plc", currency: "USD" },
        walletImpact: { currency: "GBP", currentValue: 160, unrealizedProfitLoss: 8 },
      },
    ], "GBP", AS_OF);

    expect(result.state.status).toBe("live");
    expect(result.data).toEqual([
      {
        ticker: "TEST_US_EQ",
        name: "Test Plc",
        quantity: 2,
        averagePrice: 95,
        currentPrice: 100,
        ppl: 8,
        currency: "USD",
        pplCurrency: "GBP",
        valueNative: 200,
        valueAccount: 160,
      },
    ]);
  });

  it("retains compatibility with the retired flat response shape", () => {
    const result = normalizeT212Positions([
      { ticker: "OLD_EQ", quantity: 1.5, averagePrice: 10, currentPrice: 12, ppl: 3, currencyCode: "EUR" },
    ], "GBP", AS_OF);

    expect(result.data?.[0]).toMatchObject({
      ticker: "OLD_EQ",
      quantity: 1.5,
      averagePrice: 10,
      currentPrice: 12,
      ppl: 3,
      currency: "EUR",
      valueNative: 18,
    });
  });
});

describe("getJoinedPortfolio", () => {
  it("wires the live endpoints with Basic auth and no-store fetches", async () => {
    vi.stubEnv("T212_API_KEY", "api-key");
    vi.stubEnv("T212_API_SECRET", "api-secret");
    vi.stubEnv("OPENSEA_API_KEY", "opensea-key");

    const json = (data: unknown) => new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/equity/account/summary")) {
        return json({
          cash: { availableToTrade: 487, inPies: 0, reservedForOrders: 0 },
          currency: "GBP",
          investments: { currentValue: 0, realizedProfitLoss: 0, totalCost: 0, unrealizedProfitLoss: 0 },
          totalValue: 487,
        });
      }
      if (url.endsWith("/equity/positions")) return json([]);
      if (url.includes("api.opensea.io/api/v2/chain/")) return json({ nfts: [] });
      if (url.includes("open.er-api.com")) {
        return json({ rates: { THB: 36, GBP: 0.8, EUR: 0.9 }, time_last_update_unix: 1_788_264_000 });
      }
      if (url.includes("api.coingecko.com")) return json({ ethereum: { usd: 2_000 } });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const portfolio = await getJoinedPortfolio();
    const summaryCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/equity/account/summary"));
    const positionsCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/equity/positions"));

    expect(summaryCall).toBeDefined();
    expect(positionsCall).toBeDefined();
    expect(summaryCall?.[1]).toMatchObject({ cache: "no-store" });
    expect((summaryCall?.[1] as RequestInit).headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("api-key:api-secret").toString("base64")}`,
    });
    expect(portfolio.t212.cashAvailable).toBe(487);
    expect(portfolio.t212.investments).toEqual([]);
    expect(portfolio.sources.t212Positions.status).toBe("live");
  });

  it("resolves fail-soft when every network source rejects", async () => {
    vi.stubEnv("T212_API_KEY", "api-key");
    vi.stubEnv("T212_API_SECRET", "api-secret");
    vi.stubEnv("OPENSEA_API_KEY", "opensea-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const portfolio = await getJoinedPortfolio();

    expect(portfolio.sources.t212Summary.status).toBe("unavailable");
    expect(portfolio.sources.t212Positions.status).toBe("unavailable");
    expect(portfolio.sources.nfts.status).toBe("unavailable");
    expect(portfolio.sources.fiatFx.status).toBe("unavailable");
    expect(portfolio.sources.ethPrice.status).toBe("unavailable");
    expect(portfolio.totals.grandTotalThb).toBeNull();
  });
});
