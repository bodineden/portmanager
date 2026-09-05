import { shouldHideWalletDust } from "./dust-filter";
import type { FiatRates, NormalizedT212Position } from "./live-data";

/** Recorded does not mean free. Only verified no-payment acquisitions are free. */
export type BasisStatus = "t212-live" | "onchain-derived" | "airdrop-free" | "not-recorded";
/** Mutually exclusive coverage buckets; unpriced is not also counted as dust. */
export type PnlEligibility = "eligible" | "not-recorded" | "dust" | "unpriced" | "unreconciled";

/** Flat additive fields on every joined holding. THB uses snapshot FX, not acquisition FX. */
export type HoldingPnl = {
  costBasisUsd: number | null;
  costBasisThb: number | null;
  basisStatus: BasisStatus;
  basisNote: string;
  pnlUsd: number | null;
  pnlThb: number | null;
  /** No percentage for zero basis, including verified free acquisitions. */
  pnlPct: number | null;
  pnlEligibility: PnlEligibility;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegative(value: number | null | undefined): value is number {
  return finite(value) && value >= 0;
}

function positive(value: number | null | undefined): value is number {
  return finite(value) && value > 0;
}

function thb(value: number | null, rate: number | null | undefined): number | null {
  return value !== null && positive(rate) && finite(value * rate) ? value * rate : null;
}

function usd(amount: number | null, currency: string | null, fx: FiatRates | null): number | null {
  if (!finite(amount)) return null;
  if (currency === "USD") return amount;
  if (!positive(fx?.usdToThb)) return null;
  const rate = currency === "THB" ? 1 : currency === "GBP" ? fx?.gbpToThb : currency === "EUR" ? fx?.eurToThb : null;
  const result = positive(rate) ? amount * (rate / fx.usdToThb) : null;
  return finite(result) ? result : null;
}

function unknown(note: string, eligibility: PnlEligibility = "not-recorded"): HoldingPnl {
  return { costBasisUsd: null, costBasisThb: null, basisStatus: "not-recorded", basisNote: note,
    pnlUsd: null, pnlThb: null, pnlPct: null, pnlEligibility: eligibility };
}

function excluded(valueUsd: number | null): HoldingPnl | null {
  if (!nonNegative(valueUsd)) return unknown("Unpriced or invalid current value; basis derivation skipped", "unpriced");
  // Share the shipped strict < $1 test, but exclude unpriced native from P&L too.
  if (shouldHideWalletDust({ kind: "native", valueUsd, priced: true }, true)) {
    return unknown("Dust: current value below $1; basis derivation skipped", "dust");
  }
  return null;
}

function recorded(basis: number, pnl: number, status: BasisStatus, note: string, rate: number | null | undefined): HoldingPnl {
  if (!nonNegative(basis) || !finite(pnl)) return unknown("Invalid or overflowing basis/P&L");
  const pct = basis > 0 ? pnl / basis * 100 : null;
  return { costBasisUsd: basis, costBasisThb: thb(basis, rate), basisStatus: status, basisNote: note,
    pnlUsd: pnl, pnlThb: thb(pnl, rate), pnlPct: finite(pct) ? pct : null, pnlEligibility: "eligible" };
}

/** API P&L currency is independent of instrument currency; never guess an unsupported FX cross. */
export function deriveT212Pnl(position: NormalizedT212Position, fx: FiatRates | null, accountCurrency: string | null): HoldingPnl & { valueUsd: number | null } {
  const valueUsd = position.valueAccount !== null
    ? usd(position.valueAccount, position.pplCurrency ?? accountCurrency, fx)
    : usd(position.valueNative, position.currency, fx);
  const skip = excluded(valueUsd);
  if (skip) return { ...skip, valueUsd };
  const basis = nonNegative(position.averagePrice) && positive(position.quantity)
    ? usd(position.averagePrice * position.quantity, position.currency, fx) : null;
  const pnl = position.ppl !== null
    ? usd(position.ppl, position.pplCurrency, fx)
    : nonNegative(position.currentPrice) && nonNegative(position.averagePrice)
      ? usd((position.currentPrice - position.averagePrice) * position.quantity, position.currency, fx) : null;
  if (basis === null || pnl === null) return { ...unknown("T212 average cost, P&L currency or FX not recorded"), valueUsd };
  const result = recorded(basis, pnl, "t212-live", position.ppl === null
    ? "T212 average cost; (current - average) × quantity fallback"
    : "T212 average cost; API unrealized P&L", fx?.usdToThb);
  // API FX P&L can differ from spot-converted average cost. Preserve both facts,
  // but never include an inconsistent row in the value-minus-basis aggregate.
  if (valueUsd !== null && !reconciles(valueUsd, basis, pnl)) {
    result.pnlEligibility = "unreconciled";
    result.basisNote += "; P&L does not reconcile with current value minus basis; excluded from totals";
  }
  return { ...result, valueUsd };
}

export type OnchainHolding = {
  /** Joined assembly always supplies this to reject future-dated acquisitions. */
  asOf?: string;
  kind: "native" | "token" | "nft";
  chainId: number;
  /** Native: "native"; ERC-20: contract address; NFT: collection slug. */
  assetId: string;
  quantityRaw: string;
  decimals: number;
  valueUsd: number | null;
};

/**
 * Auditable normalized evidence, NOT a provider response or an operator cost override.
 * A future collector must prove full history, owned acquisition quantities and all
 * native (including internal) + ERC-20 outflows in each successful transaction.
 * `operation` requires decoded contract/order evidence, not just a method name.
 * Gas is excluded by this portfolio convention, so this is not a tax-cost ledger.
 */
export type AcquisitionEvidence = {
  source: "blockscout-v2" | "opensea-v2" | "rpc";
  chainId: number;
  assetId: string;
  decimals: number;
  complete: boolean;
  /** No lot-selection/FIFO guesses: any disposal makes the history unsupported. */
  hasDisposals: boolean;
  lots: AcquisitionLot[];
};

export type AcquisitionLot = {
  transactionHash: string;
  acquiredAt: string;
  quantityRaw: string;
  operation: "purchase" | "mint" | "claim" | "airdrop" | "transfer" | "bridge" | "exchange-deposit" | "wrapper" | "unknown";
  success: boolean;
  allPaymentLegsObserved: boolean;
  acquiredAssetCount: number;
  nativeOutflowRaw: string;
  nativePrice: HistoricalUsdPrice | null;
  tokenOutflows: { assetId: string; amountRaw: string; decimals: number; historicalPrice: HistoricalUsdPrice | null }[];
};

/** Keyless historical quote for the payment asset; never the acquired asset's current price. */
export type HistoricalUsdPrice = {
  provider: "defillama-historical" | "coingecko-history";
  assetId: string;
  timestamp: string;
  priceUsd: number;
};

function rawUnits(raw: string): bigint {
  if (typeof raw !== "string" || !/^\d+$/.test(raw) || raw.length > 100) throw new Error("Invalid raw units");
  return BigInt(raw);
}

function evidenceMatches(holding: OnchainHolding, evidence: AcquisitionEvidence): boolean {
  return evidence.complete === true && evidence.hasDisposals === false
    && evidence.chainId === holding.chainId && evidence.assetId.toLowerCase() === holding.assetId.toLowerCase()
    && evidence.decimals === holding.decimals && Number.isInteger(holding.decimals) && holding.decimals >= 0 && holding.decimals <= 36
    && ["blockscout-v2", "opensea-v2", "rpc"].includes(evidence.source)
    && (evidence.source !== "blockscout-v2" || [1, 8453, 42161].includes(holding.chainId))
    && (evidence.source !== "opensea-v2" || holding.kind === "nft")
    && evidence.lots.length > 0;
}

/** Pure and fail-independent; balance/floor endpoints alone prove no basis. */
export function deriveOnchainPnl(holding: OnchainHolding, usdToThb: number | null, evidence?: AcquisitionEvidence | null): HoldingPnl {
  const skip = excluded(holding.valueUsd);
  if (skip) return skip; // Never even inspect evidence for dust/unpriced holdings.
  if (!evidence) return unknown(holding.kind === "native"
    ? "Native balance only; no clean purchase provenance (bridge/deposit is not a basis)"
    : holding.kind === "nft"
      ? "OpenSea inventory/floor only; acquisition and payment history not recorded"
      : "Token balance only; no clean acquisition/payment history recorded");
  try {
    if (!evidenceMatches(holding, evidence)) return unknown("Incomplete, unsupported or mismatched acquisition history");
    let quantity = BigInt(0);
    let basis = 0;
    let purchased = false;
    const seen = new Set<string>();
    for (const lot of evidence.lots) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(lot.transactionHash) || seen.has(lot.transactionHash.toLowerCase())
        || !Number.isFinite(Date.parse(lot.acquiredAt))
        || (holding.asOf !== undefined && (!Number.isFinite(Date.parse(holding.asOf)) || Date.parse(lot.acquiredAt) > Date.parse(holding.asOf)))
        || lot.success !== true
        || lot.allPaymentLegsObserved !== true || lot.acquiredAssetCount !== 1) {
        return unknown("Incomplete, failed, duplicate or multi-asset acquisition transaction");
      }
      seen.add(lot.transactionHash.toLowerCase());
      const acquired = rawUnits(lot.quantityRaw);
      if (acquired <= BigInt(0)) return unknown("Invalid acquired quantity");
      quantity += acquired;
      const nativePaid = rawUnits(lot.nativeOutflowRaw);
      const noPayment = nativePaid === BigInt(0) && lot.tokenOutflows.length === 0;
      const free = holding.kind !== "native" && ["mint", "claim", "airdrop"].includes(lot.operation) && noPayment;
      if (free) continue;
      if (lot.operation !== "purchase" || noPayment || (nativePaid > BigInt(0) ? 1 : 0) + lot.tokenOutflows.length !== 1) {
        return unknown("Not a clean purchase or verified no-payment acquisition (transfer/bridge/wrapper/multi-leg unsupported)");
      }
      const payment = nativePaid > BigInt(0)
        ? { assetId: "native", amountRaw: lot.nativeOutflowRaw, decimals: 18, historicalPrice: lot.nativePrice }
        : lot.tokenOutflows[0];
      if (payment.assetId.toLowerCase() === holding.assetId.toLowerCase()) return unknown("Self-payment/wrapper is not a clean purchase");
      const paidUsd = historicalPaymentUsd(payment, lot.acquiredAt);
      if (paidUsd === null) return unknown("No clean historical USD payment-asset price at acquisition");
      basis += paidUsd;
      purchased = true;
    }
    if (quantity !== rawUnits(holding.quantityRaw)) return unknown("Acquisitions do not account for the entire current holding");
    return recorded(basis, holding.valueUsd! - basis, purchased ? "onchain-derived" : "airdrop-free",
      `${evidence.source}: ${purchased ? "clean purchase; historical USD payment price" : "verified mint/claim/airdrop — no payment leg"}; ${evidence.lots.length} acquisition(s); ${evidence.lots[0].acquiredAt.slice(0, 10)}`, usdToThb);
  } catch {
    return unknown("Acquisition derivation failed; invalid evidence");
  }
}

function historicalPaymentUsd(payment: AcquisitionLot["tokenOutflows"][number], acquiredAt: string): number | null {
  const quote = payment.historicalPrice;
  if (!quote || !positive(quote.priceUsd) || quote.assetId.toLowerCase() !== payment.assetId.toLowerCase()
    || !Number.isInteger(payment.decimals) || payment.decimals < 0 || payment.decimals > 36) return null;
  const acquired = Date.parse(acquiredAt);
  const quoted = Date.parse(quote.timestamp);
  if (!Number.isFinite(acquired) || !Number.isFinite(quoted)) return null;
  // DefiLlama historical: at most one-hour sample distance. CoinGecko /history:
  // documented date quote, same UTC acquisition date (daily, not execution-price precision).
  const atAcquisition = quote.provider === "defillama-historical" ? Math.abs(acquired - quoted) <= 3_600_000
    : quote.provider === "coingecko-history" && new Date(acquired).toISOString().slice(0, 10) === new Date(quoted).toISOString().slice(0, 10);
  if (!atAcquisition) return null;
  const raw = rawUnits(payment.amountRaw);
  if (raw <= BigInt(0)) return null;
  const padded = raw.toString().padStart(payment.decimals + 1, "0");
  const amount = Number(payment.decimals === 0 ? padded : `${padded.slice(0, -payment.decimals)}.${padded.slice(-payment.decimals)}`);
  const value = amount * quote.priceUsd;
  return positive(value) ? value : null;
}

export type PnlClass = "t212" | "nfts" | "walletNative" | "walletTokens";
export type PnlCoverage = {
  /** Counts joined rows, so an NFT collection row is one holding, not tokenCount. */
  totalHoldings: number;
  eligible: number;
  notRecorded: number;
  dust: number;
  unpriced: number;
  unreconciled: number;
  /** Complete requires no exclusions, live sources and available USD/THB. */
  status: "complete" | "partial";
  sourcesComplete: boolean;
};
export type PnlSummary = {
  costBasisUsd: number | null;
  costBasisThb: number | null;
  pnlUsd: number | null;
  pnlThb: number | null;
  pnlPct: number | null;
  pnlCoverage: PnlCoverage;
};
export type PortfolioPnlTotals = PnlSummary & { pnlByClass: Record<PnlClass, PnlSummary> };
export type PnlClassInput = { holdings: readonly (HoldingPnl & { valueUsd: number | null })[]; sourceComplete: boolean };

function completeSum(values: (number | null)[]): number | null {
  if (!values.every(finite)) return null;
  const sum = values.reduce<number>((total, value) => total + value!, 0);
  return finite(sum) ? sum : null;
}

function summarizePnl(rows: PnlClassInput["holdings"], sourcesComplete: boolean, usdToThb: number | null): PnlSummary {
  const coverage: PnlCoverage = { totalHoldings: rows.length, eligible: 0, notRecorded: 0, dust: 0, unpriced: 0,
    unreconciled: 0, status: "partial", sourcesComplete };
  const eligible: PnlClassInput["holdings"][number][] = [];
  for (const row of rows) {
    // Revalidate the aggregate boundary too: do not trust a forged/stale eligibility flag.
    const skip = excluded(row.valueUsd);
    if (skip?.pnlEligibility === "unpriced") coverage.unpriced += 1;
    else if (skip?.pnlEligibility === "dust") coverage.dust += 1;
    else if (row.basisStatus === "not-recorded" || !nonNegative(row.costBasisUsd) || !finite(row.pnlUsd)) coverage.notRecorded += 1;
    else if (row.pnlEligibility !== "eligible" || !reconciles(row.valueUsd!, row.costBasisUsd, row.pnlUsd)) coverage.unreconciled += 1;
    else { coverage.eligible += 1; eligible.push(row); }
  }
  // Empty live inventory is known empty; zero eligible among existing/unknown rows is NOT zero P&L.
  const knownEmpty = rows.length === 0 && sourcesComplete;
  const costBasisUsd = eligible.length > 0 || knownEmpty ? completeSum(eligible.map((row) => row.costBasisUsd)) : null;
  const pnlUsd = eligible.length > 0 || knownEmpty ? completeSum(eligible.map((row) => row.pnlUsd)) : null;
  const costBasisThb = thb(costBasisUsd, usdToThb);
  const pnlThb = thb(pnlUsd, usdToThb);
  const pct = positive(costBasisUsd) && finite(pnlUsd) ? pnlUsd / costBasisUsd * 100 : null;
  if (sourcesComplete && coverage.eligible === rows.length && costBasisUsd !== null && pnlUsd !== null && costBasisThb !== null && pnlThb !== null) coverage.status = "complete";
  return { costBasisUsd, costBasisThb, pnlUsd, pnlThb, pnlPct: finite(pct) ? pct : null, pnlCoverage: coverage };
}

/** Eligible-subset unrealized P&L, never whole-book P&L unless coverage is complete. Cash is absent by design. */
export function aggregatePnl(classes: Record<PnlClass, PnlClassInput>, usdToThb: number | null, sourcesComplete = true): PortfolioPnlTotals {
  const names: PnlClass[] = ["t212", "nfts", "walletNative", "walletTokens"];
  const pnlByClass = Object.fromEntries(names.map((name) => [name,
    summarizePnl(classes[name].holdings, classes[name].sourceComplete, usdToThb),
  ])) as Record<PnlClass, PnlSummary>;
  return { ...summarizePnl(names.flatMap((name) => [...classes[name].holdings]),
    sourcesComplete && names.every((name) => classes[name].sourceComplete), usdToThb), pnlByClass };
}

/** Floating-point noise only, not a cent-level accounting discrepancy allowance. */
function reconciles(value: number, basis: number, pnl: number): boolean {
  return Math.abs(value - basis - pnl) <= Number.EPSILON * 16 * Math.max(1, Math.abs(value), Math.abs(basis), Math.abs(pnl));
}
