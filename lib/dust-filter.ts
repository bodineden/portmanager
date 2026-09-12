export type HoldingDisplayValue = {
  valueUsd: number | null;
};

/** Market-valued holdings only; operator-declared manual cash is exempt. */
export function shouldSuppressHolding(row: HoldingDisplayValue): boolean {
  return row.valueUsd === null || !Number.isFinite(row.valueUsd) || row.valueUsd < 1;
}
