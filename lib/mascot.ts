import type { JoinedPortfolio } from "./live-data";

export type MascotMood = "calm" | "happy" | "excited" | "thinking" | "worried" | "sad" | "sleepy" | "proud" | "alert";
export type MascotState = { mood: MascotMood; message: string };

/** Only facts used by the guide; the full joined portfolio satisfies this shape. */
export type MascotPortfolio = Pick<JoinedPortfolio, "sources" | "asOf"> & {
  totals: Pick<JoinedPortfolio["totals"], "grandTotalUsd" | "pnlCoverage" | "pnlUsd" | "pnlPct">;
  /** Explicit reader result: a successful empty history is still available. */
  snapshotHistoryAvailable?: boolean;
  /** Optional audited fact; absent history is already represented by notRecorded. */
  basisHistoryComplete?: boolean;
};

const MESSAGES: Record<MascotMood, string> = {
  alert: "Heads up — some sources are partial or offline. I'll only cheer what I can verify.",
  sad: "I can't see the full book right now — sources are offline. Value stays honest: unknown, not zero.",
  thinking: "Still mapping cost basis. Where I have no clean acquisition record I won't guess a number.",
  worried: "Recorded P&L is down on the eligible set. It's data, not a verdict.",
  happy: "Recorded gains on the eligible set. Basis-verified, not vibes.",
  excited: "Now that's a picture — recorded gains with full basis coverage.",
  proud: "Full picture: every holding has a recorded basis. That's the ideal state.",
  sleepy: "It's late UTC — I'll keep the night watch. The book renders as-is.",
  calm: "All quiet. I'm tracking value now; P&L lands when basis does.",
};

const VALUE_SOURCES = ["t212Summary", "t212Positions", "nfts", "walletNative", "walletTokens"] as const;

function state(mood: MascotMood, message = MESSAGES[mood]): MascotState {
  return { mood, message };
}

function finite(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Pure display derivation: no IO, ambient clock, arithmetic over holdings or advice.
 * Callers can inject current time; the default is the joined observation's UTC time.
 * Total outages specialize alert into sad, otherwise the brief's priority applies.
 */
export function deriveMascotState(
  portfolio: MascotPortfolio,
  now: Date | number | string = portfolio.asOf,
): MascotState {
  const { totals, sources } = portfolio;
  const coverage = totals.pnlCoverage;
  const sourceStates = Object.values(sources);

  // A total outage would otherwise be swallowed by "any unavailable" forever.
  if ((sourceStates.length > 0 && sourceStates.every(({ status }) => status === "unavailable"))
    || (totals.grandTotalUsd === null && VALUE_SOURCES.every((key) => sources[key].status === "unavailable"))) {
    return state("sad");
  }
  if (coverage.unreconciled > 0) {
    return state("alert", "Heads up — some holdings are unreconciled. I'll only cheer what I can verify.");
  }
  if (sourceStates.some(({ status }) => status === "partial" || status === "unavailable")) return state("alert");
  if (portfolio.snapshotHistoryAvailable === false) {
    return state("alert", "Heads up — snapshot history is unavailable. I'll only cheer what I can verify.");
  }
  if (coverage.notRecorded > 0 || portfolio.basisHistoryComplete === false) return state("thinking");

  const hasRecordedPnl = coverage.eligible > 0 && finite(totals.pnlUsd);
  if (hasRecordedPnl && totals.pnlUsd! < 0) return state("worried");
  if (hasRecordedPnl && totals.pnlUsd! > 0) {
    if (coverage.status === "complete") return state("excited");
    if (finite(totals.pnlPct) && totals.pnlPct >= 5) {
      // A threshold on the eligible subset does not prove whole-book coverage.
      return state("excited", "Now that's a picture — recorded gains on the eligible set. Basis coverage is partial.");
    }
    return state("happy");
  }
  if (hasRecordedPnl && coverage.status === "complete" && coverage.sourcesComplete
    && coverage.eligible === coverage.totalHoldings
    && coverage.notRecorded === 0 && coverage.dust === 0 && coverage.unpriced === 0 && coverage.unreconciled === 0) {
    return state("proud");
  }

  // The brief explicitly keeps a healthy empty/cash-only book calm, even at night.
  if (coverage.totalHoldings === 0 && coverage.sourcesComplete) return state("calm");
  const hourUtc = new Date(now).getUTCHours();
  if (hourUtc >= 0 && hourUtc < 6) return state("sleepy");
  return state("calm");
}
