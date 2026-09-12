export type HoldingDisplayValue = {
  valueUsd: number | null;
  manualCash?: boolean;
};

/** Market-valued holdings only; operator-declared manual cash is exempt. */
export function shouldSuppressHolding(row: HoldingDisplayValue): boolean {
  if (row.manualCash) return false;
  return row.valueUsd === null || !Number.isFinite(row.valueUsd) || row.valueUsd < 1;
}
