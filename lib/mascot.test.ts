import { describe, expect, it } from "vitest";
import { buildJoinedPortfolio, type JoinedPortfolioInputs, type LiveResult } from "./live-data";
import { deriveMascotState, type MascotMood, type MascotPortfolio } from "./mascot";
import type { PnlCoverage } from "./pnl";

const AS_OF = "2026-09-05T12:00:00.000Z";
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: AS_OF, message: "fixture" } });
const SOURCE_KEYS = ["t212Summary", "t212Positions", "nfts", "fiatFx", "ethPrice", "walletNative", "walletTokens"] as const;

function book(
  totals: Partial<MascotPortfolio["totals"]> = {},
  coverage: Partial<PnlCoverage> = {},
): MascotPortfolio {
  return {
    asOf: AS_OF,
    snapshotHistoryAvailable: true,
    sources: {
      t212Summary: live(null).state, t212Positions: live(null).state, nfts: live(null).state,
      fiatFx: live(null).state, ethPrice: live(null).state, walletNative: live(null).state,
      walletTokens: live(null).state,
    },
    totals: {
      grandTotalUsd: 100.5, pnlUsd: 0, pnlPct: 0,
      ...totals,
      pnlCoverage: {
        totalHoldings: 2, eligible: 1, notRecorded: 0, dust: 1, unpriced: 0, unreconciled: 0,
        status: "partial", sourcesComplete: true, ...coverage,
      },
    },
  };
}

const complete = { totalHoldings: 1, eligible: 1, dust: 0, status: "complete" as const };
const empty = { totalHoldings: 0, eligible: 0, dust: 0, status: "complete" as const };
const unavailable = () => {
  const portfolio = book({ grandTotalUsd: null, pnlUsd: null, pnlPct: null }, { eligible: 0, sourcesComplete: false });
  for (const source of Object.values(portfolio.sources)) source.status = "unavailable";
  return portfolio;
};

const moodFixtures: { mood: MascotMood; portfolio: MascotPortfolio; now?: string; message: string }[] = [
  { mood: "calm", portfolio: book(), message: "All quiet. I'm tracking value now; P&L lands when basis does." },
  { mood: "happy", portfolio: book({ pnlUsd: 2, pnlPct: 2 }), message: "Recorded gains on the eligible set. Basis-verified, not vibes." },
  { mood: "excited", portfolio: book({ pnlUsd: 2, pnlPct: 2 }, complete), message: "Now that's a picture — recorded gains with full basis coverage." },
  { mood: "thinking", portfolio: book({ pnlUsd: null, pnlPct: null }, { eligible: 0, notRecorded: 1 }), message: "Still mapping cost basis. Where I have no clean acquisition record I won't guess a number." },
  { mood: "worried", portfolio: book({ pnlUsd: -2, pnlPct: -2 }), message: "Recorded P&L is down on the eligible set. It's data, not a verdict." },
  { mood: "sad", portfolio: unavailable(), message: "I can't see the full book right now — sources are offline. Value stays honest: unknown, not zero." },
  { mood: "sleepy", portfolio: book(), now: "2026-09-05T02:00:00Z", message: "It's late UTC — I'll keep the night watch. The book renders as-is." },
  { mood: "proud", portfolio: book({}, complete), message: "Full picture: every holding has a recorded basis. That's the ideal state." },
  { mood: "alert", portfolio: { ...book(), sources: { ...book().sources, nfts: { ...live(null).state, status: "partial" } } }, message: "Heads up — some sources are partial or offline. I'll only cheer what I can verify." },
];

describe("mascot mood and copy fixtures", () => {
  it.each(moodFixtures)("derives $mood with the contracted qualitative copy", ({ portfolio, now, mood, message }) => {
    expect(deriveMascotState(portfolio, now)).toEqual({ mood, message });
  });

  it("keeps every bubble number-free, concise and free of advice or predictions", () => {
    const additional = [
      book({ pnlUsd: 5, pnlPct: 5 }),
      book({}, { unreconciled: 1 }),
      { ...book(), snapshotHistoryAvailable: false },
    ];
    const states = [...moodFixtures.map(({ portfolio, now }) => deriveMascotState(portfolio, now)),
      ...additional.map((portfolio) => deriveMascotState(portfolio))];
    for (const { message } of states) {
      expect(message.length).toBeLessThanOrEqual(100);
      expect(message).not.toMatch(/[\d$฿%]|\b(?:USD|THB|buy|sell|guarantee|predict|moon)\b/i);
    }
  });
});

describe("source health and evidence outrank recorded outcomes", () => {
  it.each(SOURCE_KEYS)("alerts when %s is partial or unavailable while other sources remain live", (key) => {
    for (const status of ["partial", "unavailable"] as const) {
      const portfolio = book({ pnlUsd: 10, pnlPct: 10 }, complete);
      portfolio.sources[key].status = status;
      expect(deriveMascotState(portfolio).mood).toBe("alert");
    }
  });

  it("specializes a total outage into sad so the all-down state is reachable", () => {
    const portfolio = unavailable();
    portfolio.totals.pnlCoverage.unreconciled = 1;
    expect(deriveMascotState(portfolio).mood).toBe("sad");
    expect(deriveMascotState(portfolio).message).toContain("unknown, not zero");
  });

  it("is sad when every account/inventory value source is down and total value is unknown despite live quotes", () => {
    const portfolio = unavailable();
    portfolio.sources.fiatFx.status = "live";
    portfolio.sources.ethPrice.status = "live";
    expect(deriveMascotState(portfolio).mood).toBe("sad");
    portfolio.sources.walletNative.status = "live";
    expect(deriveMascotState(portfolio).mood).toBe("alert");
  });

  it("does not infer a total outage from an unknown grand total alone", () => {
    expect(deriveMascotState(book({ grandTotalUsd: null })).mood).toBe("calm");
  });

  it("prioritizes unreconciled holdings over source partial and missing basis without claiming an outage", () => {
    const portfolio = book({ pnlUsd: 10, pnlPct: 10 }, { notRecorded: 1, unreconciled: 1 });
    portfolio.sources.nfts.status = "partial";
    expect(deriveMascotState(portfolio)).toEqual({
      mood: "alert", message: "Heads up — some holdings are unreconciled. I'll only cheer what I can verify.",
    });
    portfolio.sources.nfts.status = "live";
    expect(deriveMascotState(portfolio).message).not.toMatch(/offline|sources are partial/);
  });

  it("alerts on explicit snapshot-reader failure, while a successful empty history remains healthy", () => {
    const portfolio = { ...book(), snapshotHistoryAvailable: false };
    expect(deriveMascotState(portfolio)).toEqual({
      mood: "alert", message: "Heads up — snapshot history is unavailable. I'll only cheer what I can verify.",
    });
    expect(deriveMascotState({ ...portfolio, snapshotHistoryAvailable: true }).mood).toBe("calm");
    expect(deriveMascotState({ ...portfolio, snapshotHistoryAvailable: undefined }).mood).toBe("calm");
  });

  it("keeps the source-specific alert when source and snapshot failures coexist", () => {
    const portfolio = { ...book(), snapshotHistoryAvailable: false };
    portfolio.sources.ethPrice.status = "partial";
    expect(deriveMascotState(portfolio).message).toContain("sources are partial or offline");
  });

  it.each([-10, 0, 10, null])("maps missing acquisition basis before interpreting recorded P&L %s", (pnlUsd) => {
    expect(deriveMascotState(book({ pnlUsd, pnlPct: 10 }, { notRecorded: 1 })).mood).toBe("thinking");
  });

  it("respects explicit incomplete basis history even before a not-recorded bucket appears", () => {
    const portfolio = { ...book({ pnlUsd: 10, pnlPct: 10 }), basisHistoryComplete: false };
    expect(deriveMascotState(portfolio).mood).toBe("thinking");
    expect(deriveMascotState({ ...portfolio, basisHistoryComplete: true }).mood).toBe("excited");
  });
});

describe("eligible-subset outcomes and coverage boundaries", () => {
  it.each([null, Number.NaN, Infinity, -Infinity])("does not read missing or non-finite P&L %s as a signed outcome", (pnlUsd) => {
    for (const eligible of [0, 1]) {
      expect(deriveMascotState(book({ pnlUsd, pnlPct: 25 }, { eligible })).mood).toBe("calm");
    }
  });

  it.each([-10, 10])("does not read P&L %s from an empty eligible subset", (pnlUsd) => {
    expect(deriveMascotState(book({ pnlUsd, pnlPct: 25 }, { eligible: 0 })).mood).toBe("calm");
  });

  it.each([
    [4.999999, "happy"], [5, "excited"], [5.000001, "excited"],
    [null, "happy"], [Number.NaN, "happy"], [Infinity, "happy"],
  ] as const)("compares percentage-point threshold %s without inferring a missing percentage", (pnlPct, mood) => {
    expect(deriveMascotState(book({ pnlUsd: 5, pnlPct })).mood).toBe(mood);
  });

  it("excited copy preserves partial coverage when only the eligible-set threshold is met", () => {
    expect(deriveMascotState(book({ pnlUsd: 5, pnlPct: 5 }))).toEqual({
      mood: "excited", message: "Now that's a picture — recorded gains on the eligible set. Basis coverage is partial.",
    });
  });

  it("complete positive coverage is excited even below the threshold, before proud", () => {
    for (const pnlPct of [0.001, null]) {
      expect(deriveMascotState(book({ pnlUsd: 0.001, pnlPct }, complete)).mood).toBe("excited");
    }
  });

  it("negative recorded P&L outranks complete-coverage pride and the night window", () => {
    expect(deriveMascotState(book({ pnlUsd: -0.001, pnlPct: -0.001 }, complete), "2026-09-05T01:00:00Z").mood).toBe("worried");
  });

  it("flat complete coverage is proud only when every nonempty holding is eligible without exclusions", () => {
    expect(deriveMascotState(book({}, complete), "2026-09-05T01:00:00Z").mood).toBe("proud");
    for (const exclusion of ["dust", "unpriced"] as const) {
      expect(deriveMascotState(book({}, { ...complete, [exclusion]: 1 })).mood).toBe("calm");
    }
    expect(deriveMascotState(book({}, { ...complete, totalHoldings: 2 })).mood).toBe("calm");
    expect(deriveMascotState(book({}, { ...complete, sourcesComplete: false })).mood).toBe("calm");
    expect(deriveMascotState(book({ pnlUsd: null }, complete)).mood).toBe("calm");
  });

  it("does not confuse known flat recorded P&L with a gain or loss", () => {
    for (const pnlUsd of [0, -0]) expect(deriveMascotState(book({ pnlUsd })).mood).toBe("calm");
  });
});

describe("UTC clock and pure observation handling", () => {
  it.each([
    ["2026-09-04T23:59:59.999Z", "calm"], ["2026-09-05T00:00:00.000Z", "sleepy"],
    ["2026-09-05T05:59:59.999Z", "sleepy"], ["2026-09-05T06:00:00.000Z", "calm"],
    ["2026-09-05T07:00:00+07:00", "sleepy"], ["2026-09-05T06:59:59+07:00", "calm"],
  ] as const)("derives %s in UTC as %s", (now, mood) => {
    expect(deriveMascotState(book(), now).mood).toBe(mood);
  });

  it("accepts injectable dates and epoch clocks, defaulting deterministically to the observation", () => {
    const portfolio = { ...book(), asOf: "2026-09-05T01:00:00Z" };
    const now = new Date(portfolio.asOf);
    expect(deriveMascotState(portfolio).mood).toBe("sleepy");
    expect(deriveMascotState(portfolio, now)).toEqual(deriveMascotState(portfolio, now.getTime()));
    expect(now.toISOString()).toBe("2026-09-05T01:00:00.000Z");
    expect(deriveMascotState(portfolio, AS_OF).mood).toBe("calm");
    expect(deriveMascotState(portfolio, "invalid").mood).toBe("calm");
  });

  it("keeps a healthy empty book calm through the entire night", () => {
    for (const hour of [0, 1, 5, 6, 12, 23]) {
      expect(deriveMascotState(book({}, empty), `2026-09-05T${String(hour).padStart(2, "0")}:00:00Z`).mood).toBe("calm");
    }
    const portfolio = book({}, empty);
    portfolio.sources.t212Summary.status = "unavailable";
    expect(deriveMascotState(portfolio, "2026-09-05T01:00:00Z").mood).toBe("alert");
  });

  it("preserves input facts and returns only fresh serializable mood/message props", () => {
    const portfolio = book({ pnlUsd: 5, pnlPct: 5 });
    const before = structuredClone(portfolio);
    Object.freeze(portfolio.totals.pnlCoverage);
    Object.freeze(portfolio.totals);
    for (const source of Object.values(portfolio.sources)) Object.freeze(source);
    Object.freeze(portfolio.sources);
    Object.freeze(portfolio);
    const result = deriveMascotState(portfolio);
    expect(portfolio).toEqual(before);
    expect(Object.keys(result).sort()).toEqual(["message", "mood"]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    result.message = "caller-owned text";
    expect(deriveMascotState(portfolio).message).not.toBe(result.message);
  });
});

describe("real pure joined-portfolio fixtures", () => {
  function inputs(): JoinedPortfolioInputs {
    return {
      t212Summary: live({ currency: "USD", cashAvailable: 100, totalValue: 100, investmentsCurrentValue: 0 }),
      t212Positions: live([]), nfts: live([]), walletNative: live([]), walletTokens: live([]),
      fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: AS_OF }), ethPrice: live(2_400),
    };
  }

  it("keeps live cash-only value calm with no holdings at night", () => {
    const portfolio = buildJoinedPortfolio(inputs(), AS_OF);
    expect(portfolio.totals).toMatchObject({ grandTotalUsd: 100, pnlUsd: 0, pnlCoverage: { totalHoldings: 0 } });
    expect(deriveMascotState(portfolio, "2026-09-05T01:00:00Z").mood).toBe("calm");
  });

  it("allows happy for verified airdrop-free gains without inventing a percentage or full coverage", () => {
    const data = inputs();
    data.nfts = live([{ collection: "fixture-free", collectionName: "Synthetic free acquisition", tokenCount: 1, floorEth: 0.01 }]);
    data.walletNative = live([{ chainId: 8453, chainName: "Base", symbol: "ETH", amount: 0.0001 }]);
    data.basisEvidence = {
      "nft:4663:fixture-free": {
        source: "opensea-v2", chainId: 4663, assetId: "fixture-free", decimals: 0, complete: true, hasDisposals: false,
        lots: [{ transactionHash: `0x${"a".repeat(64)}`, acquiredAt: "2026-06-01T12:00:00Z", quantityRaw: "1",
          operation: "airdrop", success: true, allPaymentLegsObserved: true, acquiredAssetCount: 1,
          nativeOutflowRaw: "0", nativePrice: null, tokenOutflows: [] }],
      },
    };
    const portfolio = buildJoinedPortfolio(data, AS_OF);
    expect(portfolio.nfts[0]).toMatchObject({ basisStatus: "airdrop-free", costBasisUsd: 0, pnlUsd: 24, pnlPct: null });
    expect(portfolio.totals.pnlCoverage).toMatchObject({ eligible: 1, dust: 1, notRecorded: 0, status: "partial" });
    expect(deriveMascotState(portfolio).mood).toBe("happy");
    data.walletNative = live([]);
    expect(deriveMascotState(buildJoinedPortfolio(data, AS_OF)).mood).toBe("excited");
  });
});
