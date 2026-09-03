import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetSnapshotCacheForTests,
  amountFromRawUnits,
  amountFromRpcHex,
  buildJoinedPortfolio,
  getJoinedPortfolio,
  normalizeT212Positions,
  RH_ERC20_REGISTRY,
  RH_ERC20_REGISTRY_SOURCE_NOTE,
  RH_ERC20_REGISTRY_VERIFIED_AT,
  type JoinedPortfolioInputs,
  type LiveResult,
  type LiveSourceState,
} from "./live-data";

const AS_OF = "2026-09-01T12:00:00.000Z";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const GME = "0x1b0E319c6A659F002271B69dB8A7df2F911c153E";
const CAT = "0x53FdCa91fd33B9131B5CEADe42A3EdBd9B38edFf";
const SECOND_TOKEN = "0x0000000000000000000000000000000000000001";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});

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

function walletNetworkFetchMock() {
  const nativeByRpc: Record<string, string> = {
    "https://ethereum-rpc.publicnode.com": "0x2c6bb0e600f7b",
    "https://mainnet.base.org": "0x5a0fee4a24a7",
    "https://arb1.arbitrum.io/rpc": "0x3727acfccd683a0",
    "https://rpc.mainnet.chain.robinhood.com": "0x1deb76d9f1be0",
  };

  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/equity/account/summary")) {
      return json({
        cash: { availableToTrade: 487 },
        currency: "GBP",
        investments: { currentValue: 0 },
        totalValue: 487,
      });
    }
    if (url.endsWith("/equity/positions")) return json([]);
    if (url.includes("api.opensea.io/api/v2/chain/")) return json({ nfts: [] });
    if (url.includes("open.er-api.com")) {
      return json({ rates: { THB: 36, GBP: 0.8, EUR: 0.9 }, time_last_update_unix: 1_788_264_000 });
    }
    if (url.includes("simple/price?ids=ethereum")) return json({ ethereum: { usd: 2_000 } });
    if (url.includes("eth.blockscout.com")) {
      return json({
        items: [{
          token: {
            address_hash: CAT,
            decimals: "18",
            exchange_rate: null,
            name: "Royal Cat",
            symbol: "CAT",
            type: "ERC-20",
          },
          value: "1000000000000000000",
        }],
        next_page_params: null,
      });
    }
    if (url.includes("base.blockscout.com") || url.includes("arbitrum.blockscout.com")) {
      return json({ items: [], next_page_params: null });
    }
    if (url.includes("coins.llama.fi")) {
      return json({ coins: { [`robinhood:${USDG}`]: { price: 1 } } });
    }
    if (url.includes("simple/token_price/")) return json({});
    if (init?.method === "POST" && url in nativeByRpc) {
      const body = JSON.parse(String(init.body)) as {
        method: string;
        params: Array<string | { to?: string }>;
      };
      if (body.method === "eth_getBalance") {
        return json({ jsonrpc: "2.0", id: 1, result: nativeByRpc[url] });
      }
      if (body.method === "eth_call") {
        const call = body.params[0] as { to?: string };
        const raw = call.to?.toLowerCase() === USDG.toLowerCase() ? BigInt("1475469") : BigInt(0);
        return json({ jsonrpc: "2.0", id: 1, result: `0x${raw.toString(16)}` });
      }
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
}

afterEach(() => {
  __resetSnapshotCacheForTests();
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

  it("adds exact native balances and only priced tokens to the joined total", () => {
    const inputs = fixtureInputs();
    inputs.walletNative = live([
      { chainId: 1, chainName: "Ethereum", symbol: "ETH", amount: amountFromRpcHex("0x2c6bb0e600f7b")!.amount },
      { chainId: 8453, chainName: "Base", symbol: "ETH", amount: amountFromRpcHex("0x5a0fee4a24a7")!.amount },
      { chainId: 42161, chainName: "Arbitrum One", symbol: "ETH", amount: amountFromRpcHex("0x3727acfccd683a0")!.amount },
      { chainId: 4663, chainName: "Robinhood Chain", symbol: "ETH", amount: amountFromRpcHex("0x1deb76d9f1be0")!.amount },
    ]);
    inputs.walletTokens = live([
      {
        chainId: 4663,
        chainName: "Robinhood Chain",
        symbol: "USDG",
        name: "Global Dollar",
        contract: USDG,
        amountRaw: "1475469",
        decimals: 6,
        amount: amountFromRawUnits("1475469", 6)!,
        priceUsd: 1,
      },
      {
        chainId: 1,
        chainName: "Ethereum",
        symbol: "CAT",
        name: "Royal Cat",
        contract: CAT,
        amountRaw: "1000000000000000000",
        decimals: 18,
        amount: amountFromRawUnits("1000000000000000000", 18)!,
        priceUsd: null,
      },
    ]);

    const portfolio = buildJoinedPortfolio(inputs, AS_OF);
    const arbitrum = portfolio.wallet.native.find((row) => row.chainId === 42161);
    const nativeEth = portfolio.wallet.native.reduce((sum, row) => sum + row.amount, 0);
    const nativeUsd = nativeEth * 2_000;
    const nativeThb = nativeUsd * 36;
    const usdgThb = 1.475469 * 36;
    const expectedGrand = 21_915 + 13_184.3088 + nativeThb + usdgThb;

    console.info(
      `Wallet arithmetic QA: native=${nativeEth} ETH / ${nativeUsd} USD / ${nativeThb} THB; `
        + `USDG=${usdgThb} THB; grand=${expectedGrand} THB`,
    );

    expect(nativeEth).toBe(0.24980279787309149);
    expect(arbitrum?.amount).toBe(0.248395962372228);
    expect(arbitrum?.valueUsd).toBeCloseTo(496.791924744456, 12);
    expect(portfolio.totals.walletNativeUsd).toBeCloseTo(499.60559574618298, 12);
    expect(portfolio.totals.walletNativeThb).toBeCloseTo(17_985.80144686259, 10);
    expect(portfolio.wallet.tokens.find((row) => row.symbol === "USDG")).toMatchObject({
      amount: 1.475469,
      priced: true,
      valueUsd: 1.475469,
      valueThb: 53.116884,
    });
    expect(portfolio.wallet.tokens.find((row) => row.symbol === "CAT")).toMatchObject({
      priced: false,
      valueUsd: null,
      valueThb: null,
    });
    expect(portfolio.totals.walletTokensUsd).toBe(1.475469);
    expect(portfolio.totals.walletTokensThb).toBe(53.116884);
    expect(portfolio.totals.walletUsd).toBeCloseTo(501.081064746183, 12);
    expect(portfolio.totals.walletThb).toBeCloseTo(18_038.91833086259, 10);
    expect(portfolio.totals.grandTotalThb).toBeCloseTo(53_138.22713086259, 10);
  });

  it("keeps a wholly unpriced non-empty wallet null rather than inventing zero", () => {
    const inputs = fixtureInputs();
    inputs.walletNative = live([]);
    inputs.walletTokens = live([{
      chainId: 1,
      chainName: "Ethereum",
      symbol: "CAT",
      name: "Royal Cat",
      contract: CAT,
      amountRaw: "1000000000000000000",
      decimals: 18,
      amount: 1,
      priceUsd: null,
    }]);

    const portfolio = buildJoinedPortfolio(inputs, AS_OF);

    expect(portfolio.totals.walletNativeUsd).toBe(0);
    expect(portfolio.totals.walletTokensUsd).toBeNull();
    expect(portfolio.totals.walletUsd).toBeNull();
    expect(portfolio.totals.walletThb).toBeNull();
    expect(portfolio.totals.grandTotalThb).toBeNull();
  });

  it("omits ownership from the joined portfolio", () => {
    const portfolio = buildJoinedPortfolio(fixtureInputs(), AS_OF);

    expect("ownership" in portfolio).toBe(false);
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

  it("does not present a partial NFT inventory as a complete total", () => {
    const inputs = fixtureInputs();
    inputs.nfts.state = state("partial", "fixture wallet page is incomplete");
    const portfolio = buildJoinedPortfolio(inputs, AS_OF);

    expect(portfolio.nfts).toHaveLength(2);
    expect(portfolio.nfts[0].valueEth).not.toBeNull();
    expect(portfolio.totals.nftsEth).toBeNull();
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
      walletNativeUsd: null,
      walletNativeThb: null,
      walletTokensUsd: null,
      walletTokensThb: null,
      walletUsd: null,
      walletThb: null,
      grandTotalThb: null,
      grandTotalUsd: null,
    });
  });
});

describe("wallet amount parsing", () => {
  it("converts JSON-RPC hex and decimal token units without unsafe integer coercion", () => {
    expect(amountFromRpcHex("0x3727acfccd683a0")).toEqual({
      amountRaw: "248395962372228000",
      amount: 0.248395962372228,
    });
    expect(amountFromRawUnits("1475469", "6")).toBe(1.475469);
    expect(amountFromRawUnits("112334000000000000000000", 18)).toBe(112_334);
    expect(amountFromRpcHex("not-hex")).toBeNull();
    expect(amountFromRawUnits("1.2", 18)).toBeNull();
    expect(amountFromRawUnits("1", -1)).toBeNull();
  });

  it("keeps the operator-verified Robinhood token registry complete and deduplicated", () => {
    const keys = RH_ERC20_REGISTRY.map((token) => token.contract.toLowerCase());

    expect(RH_ERC20_REGISTRY_VERIFIED_AT).toBe("2026-09-03");
    expect(RH_ERC20_REGISTRY_SOURCE_NOTE).toContain("balances are fetched live by RPC");
    expect(RH_ERC20_REGISTRY).toEqual([
      { symbol: "USDG", name: "Global Dollar", contract: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", decimals: 6, priceCandidate: true },
      { symbol: "GME", name: "GameStop • Robinhood Token", contract: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", decimals: 18, priceCandidate: true },
      { symbol: "SPY", name: "SPDR S&P 500 ETF Trust • RH Token", contract: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", decimals: 18, priceCandidate: true },
      { symbol: "CRCL", name: "Circle Internet Group • RH Token", contract: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5", decimals: 18, priceCandidate: true },
      { symbol: "PLTR", name: "Palantir Technologies • RH Token", contract: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", decimals: 18, priceCandidate: true },
      { symbol: "AMZN", name: "Amazon • RH Token", contract: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", decimals: 18, priceCandidate: true },
      { symbol: "STACK", name: "STACKERS", contract: "0x1d5aAD3c0D6066078eA60F384a2492a550dB30b0", decimals: 18, priceCandidate: true },
      { symbol: "$BANDIT", name: "BANDIT", contract: "0xf90b2caabE33913bD16854093b934642057B1577", decimals: 18, priceCandidate: false },
      { symbol: "$BANDIT", name: "BANDIT", contract: "0x1FAc8E2efB8090b50b076A99369ed8DE7Ca51266", decimals: 18, priceCandidate: false },
      { symbol: "RAZORBILL", name: "The Razorbill", contract: "0x01Bb6Af9f3e03bF6A178Ca796A18FDd040A111bC", decimals: 18, priceCandidate: false },
      { symbol: "CROC", name: "Croc Cat", contract: "0x01C7bA09dA5C14d2F3ac74B1BEbA24ABAea7236f", decimals: 18, priceCandidate: false },
      { symbol: "Semen", name: "Semen People", contract: "0x00192589e3f943bF8EbB9a42e705e59507Be1769", decimals: 18, priceCandidate: false },
      { symbol: "USDG", name: "United States Global Dollar (imposter 18-dec contract)", contract: "0x5411257CedF60bC40F4beaD410BF8D02079056A2", decimals: 18, priceCandidate: false },
    ]);
    expect(new Set(keys).size).toBe(13);
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
      void _init;
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

  it("fetches exact RPC balances and merges live token inventory fail-soft", async () => {
    const fetchMock = walletNetworkFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const portfolio = await getJoinedPortfolio();

    expect(portfolio.sources.walletNative.status).toBe("live");
    expect(portfolio.sources.walletTokens.status).toBe("partial");
    expect(portfolio.wallet.native).toHaveLength(4);
    const arbitrum = portfolio.wallet.native.find((row) => row.chainId === 42161);
    expect(arbitrum?.amount).toBe(0.248395962372228);
    expect(arbitrum?.valueUsd).toBeCloseTo(496.791924744456, 12);
    expect(portfolio.wallet.tokens).toHaveLength(2);
    expect(portfolio.wallet.tokens.find((row) => row.contract === USDG)).toMatchObject({
      amountRaw: "1475469",
      amount: 1.475469,
      priceUsd: 1,
      priced: true,
    });
    expect(portfolio.wallet.tokens.find((row) => row.contract === CAT)).toMatchObject({
      amountRaw: "1000000000000000000",
      amount: 1,
      priceUsd: null,
      priced: false,
    });
    expect(portfolio.totals.walletNativeUsd).toBeCloseTo(499.60559574618298, 12);
    expect(portfolio.totals.walletTokensUsd).toBe(1.475469);

    const rpcCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    const balanceCalls = rpcCalls.filter(([, init]) => JSON.parse(String(init?.body)).method === "eth_getBalance");
    const tokenCalls = rpcCalls.filter(([, init]) => JSON.parse(String(init?.body)).method === "eth_call");
    expect(balanceCalls).toHaveLength(4);
    expect(tokenCalls).toHaveLength(13);
    expect(rpcCalls.every(([, init]) => init?.cache === "no-store")).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("coins.llama.fi"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("simple/token_price/"))).toHaveLength(1);
  });

  it("keeps successful native chains visible when one RPC is unavailable", async () => {
    const liveFetch = walletNetworkFetchMock();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "https://mainnet.base.org" && init?.method === "POST") {
        return json({ error: "unavailable" }, 503);
      }
      return liveFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);

    const portfolio = await getJoinedPortfolio();

    expect(portfolio.sources.walletNative.status).toBe("partial");
    expect(portfolio.wallet.native).toHaveLength(3);
    expect(portfolio.wallet.native.some((row) => row.chainId === 8453)).toBe(false);
    expect(portfolio.wallet.native.find((row) => row.chainId === 42161)?.valueUsd)
      .toBeCloseTo(496.791924744456, 12);
  });

  it("follows Blockscout cursors so later token pages are not omitted", async () => {
    const liveFetch = walletNetworkFetchMock();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("eth.blockscout.com")) return liveFetch(input, init);

      const cursor = new URL(url).searchParams.get("items_count");
      if (cursor) {
        return json({
          items: [{
            token: {
              address_hash: SECOND_TOKEN,
              decimals: "18",
              exchange_rate: "3",
              name: "Second Page Token",
              symbol: "PAGE2",
              type: "ERC-20",
            },
            value: "2000000000000000000",
          }],
          next_page_params: null,
        });
      }
      return json({
        items: [{
          token: {
            address_hash: CAT,
            decimals: "18",
            exchange_rate: "2",
            name: "Royal Cat",
            symbol: "CAT",
            type: "ERC-20",
          },
          value: "1000000000000000000",
        }],
        next_page_params: { items_count: 1 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const portfolio = await getJoinedPortfolio();
    const ethereumCalls = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("eth.blockscout.com"));

    expect(ethereumCalls).toHaveLength(2);
    expect(portfolio.wallet.tokens.find((token) => token.contract === CAT)?.valueUsd).toBe(2);
    expect(portfolio.wallet.tokens.find((token) => token.contract === SECOND_TOKEN)?.valueUsd).toBe(6);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("simple/token_price/"))).toBe(false);
  });

  it("prioritizes verified RH candidates and stops CoinGecko fallback on 429", async () => {
    const liveFetch = walletNetworkFetchMock();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("simple/token_price/")) return json({}, 429);
      if (url === "https://rpc.mainnet.chain.robinhood.com" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          method: string;
          params: Array<{ to?: string } | string>;
        };
        const call = body.params[0];
        if (body.method === "eth_call" && typeof call === "object" && call.to?.toLowerCase() === GME.toLowerCase()) {
          return json({ jsonrpc: "2.0", id: 1, result: "0x1" });
        }
      }
      return liveFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);

    const portfolio = await getJoinedPortfolio();
    const coinGeckoCalls = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("simple/token_price/"));

    expect(coinGeckoCalls).toHaveLength(1);
    expect(String(coinGeckoCalls[0][0])).toContain("simple/token_price/robinhood");
    expect(String(coinGeckoCalls[0][0]).toLowerCase()).toContain(encodeURIComponent(GME).toLowerCase());
    expect(portfolio.wallet.tokens.find((token) => token.contract === GME)?.priceUsd).toBeNull();
  });

  it("coalesces rapid calls and refreshes the complete snapshot after TTL expiry", async () => {
    vi.stubEnv("T212_API_KEY", "api-key");
    vi.stubEnv("T212_API_SECRET", "api-secret");
    const fetchMock = walletNetworkFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    let now = Date.parse("2026-09-03T10:00:00.000Z");
    const options = { now: () => now, ttlMs: 30_000 };

    const [first, second] = await Promise.all([
      getJoinedPortfolio(options),
      getJoinedPortfolio(options),
    ]);
    const rapidSummaryCalls = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/equity/account/summary"));

    expect(first.asOf).toBe("2026-09-03T10:00:00.000Z");
    expect(second.asOf).toBe(first.asOf);
    expect(second.totals).toEqual(first.totals);
    expect(rapidSummaryCalls).toHaveLength(1);

    now += 29_999;
    const cached = await getJoinedPortfolio(options);
    const cachedSummaryCalls = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/equity/account/summary"));

    expect(cached.asOf).toBe(first.asOf);
    expect(cachedSummaryCalls).toHaveLength(1);

    now += 2;
    const refreshed = await getJoinedPortfolio(options);
    const refreshedSummaryCalls = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/equity/account/summary"));

    console.info(
      `Snapshot cache QA: rapid=${first.asOf}/${second.asOf}; cached=${cached.asOf}; refreshed=${refreshed.asOf}; `
        + `T212 fetches=${refreshedSummaryCalls.length}`,
    );
    expect(refreshed.asOf).toBe("2026-09-03T10:00:30.001Z");
    expect(refreshed.asOf).not.toBe(first.asOf);
    expect(refreshedSummaryCalls).toHaveLength(2);
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
    expect(portfolio.sources.walletNative.status).toBe("unavailable");
    expect(portfolio.sources.walletTokens.status).toBe("unavailable");
    expect(portfolio.totals.grandTotalThb).toBeNull();
  });
});
