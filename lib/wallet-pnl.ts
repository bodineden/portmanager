import type { NormalizedWalletNativeBalance, WalletNativeHolding } from "./live-data";
import { deriveOnchainPnl, isManualBasis, type AcquisitionEvidence, type HoldingPnl, type ManualBasis } from "./pnl";
import { shouldSuppressHolding } from "./dust-filter";

function unknown(note: string, eligibility: HoldingPnl["pnlEligibility"] = "not-recorded"): HoldingPnl {
  return { costBasisUsd: null, costBasisThb: null, basisStatus: "not-recorded", basisNote: note,
    pnlUsd: null, pnlThb: null, pnlPct: null, pnlEligibility: eligibility };
}

function toThb(value: number, rate: number | null): number | null {
  return rate !== null && rate > 0 && Number.isFinite(value * rate) ? value * rate : null;
}

function recorded(value: number, basis: number, rate: number | null,
  status: HoldingPnl["basisStatus"], note: string): HoldingPnl {
  const pnl = value - basis;
  if (!Number.isFinite(basis) || basis < 0 || !Number.isFinite(pnl)) return unknown("Invalid or overflowing basis/P&L");
  const pct = basis > 0 ? pnl / basis * 100 : null;
  return { costBasisUsd: basis, costBasisThb: toThb(basis, rate), pnlUsd: pnl, pnlThb: toThb(pnl, rate),
    pnlPct: pct !== null && Number.isFinite(pct) ? pct : null, basisStatus: status, basisNote: note, pnlEligibility: "eligible" };
}

/** Solana currently has operator statements only; EVM acquisition evidence is never repurposed. */
export function deriveSolanaPnl(value: number | null, rate: number | null, basis?: ManualBasis): HoldingPnl {
  if (value === null || !Number.isFinite(value) || value < 0) return unknown("Solana holding price unavailable", "unpriced");
  if (shouldSuppressHolding({ valueUsd: value })) return unknown("Dust: current value below $1; basis derivation skipped", "dust");
  if (!basis) return unknown("Solana balance only; acquisition basis not recorded");
  if (!isManualBasis(basis)) return unknown("Invalid operator-recorded basis");
  return recorded(value, basis.costUsd, rate, "operator-recorded", `operator-recorded: ${basis.note}`);
}

/** Combine only joined ETH assembly: exact per-chain quantities and basis keys stay intact. */
export function combineNativeEth(balances: NormalizedWalletNativeBalance[], ethPrice: number | null,
  rate: number | null, asOf: string, evidence?: Readonly<Record<string, AcquisitionEvidence>>,
  manual?: Readonly<Record<string, ManualBasis>>): WalletNativeHolding[] {
  if (!balances.length) return [];
  const chains = balances.map((row) => ({ chainId: row.chainId, chainName: row.chainName, amount: row.amount,
    valueUsd: row.amount === 0 ? 0 : ethPrice === null ? null : row.amount * ethPrice }));
  const valueUsd = chains.some((row) => row.valueUsd === null) ? null : chains.reduce((sum, row) => sum + row.valueUsd!, 0);
  // Apply the engine's exclusion gate to the combined holding value. Chain quantities,
  // evidence and manual keys are unchanged; only basis results are used from each call.
  // This allows recorded sub-$1 constituents to contribute to a displayable ETH holding.
  const bases = balances.map((balance) => deriveOnchainPnl({ asOf, kind: "native", chainId: balance.chainId,
    assetId: "native", quantityRaw: balance.amountRaw ?? "", decimals: 18, valueUsd }, rate,
  evidence?.[`native:${balance.chainId}:native`], manual?.[`native:${balance.chainId}:native`]));
  const missing = bases.find((basis) => basis.pnlEligibility !== "eligible" || basis.costBasisUsd === null || basis.basisStatus === "not-recorded");
  const status = bases.some((basis) => basis.basisStatus === "operator-recorded") ? "operator-recorded"
    : bases.some((basis) => basis.basisStatus === "arrival-priced") ? "arrival-priced"
      : bases.some((basis) => basis.basisStatus === "onchain-derived") ? "onchain-derived" : "airdrop-free";
  const notes = bases.map((basis, index) => `${balances[index].chainName}: ${basis.basisNote}`).join("; ");
  const pnl = missing ? { ...unknown(`Combined ETH requires basis for every chain. ${notes}`, missing.pnlEligibility),
    // A basis failure can never promote a combined holding to eligible.
    pnlEligibility: missing.pnlEligibility === "eligible" ? "not-recorded" as const : missing.pnlEligibility }
    : recorded(valueUsd!, bases.reduce((sum, basis) => sum + basis.costBasisUsd!, 0), rate, status, notes);
  const raw = balances.every((row) => row.amountRaw !== undefined && /^\d{1,100}$/.test(row.amountRaw))
    ? balances.reduce((sum, row) => sum + BigInt(row.amountRaw!), BigInt(0)).toString() : undefined;
  return [{ key: "native:eth", chainId: "eth", chainName: chains.map((row) => row.chainName).join(" · "),
    symbol: "ETH", amount: balances.reduce((sum, row) => sum + row.amount, 0), amountRaw: raw,
    priceUsd: ethPrice, valueUsd, valueThb: valueUsd === null ? null : toThb(valueUsd, rate), chains, ...pnl }];
}
