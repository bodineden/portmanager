export type WalletDustRow = {
  kind: "native" | "token";
  valueUsd: number | null;
  priced: boolean;
};

export function shouldHideWalletDust(row: WalletDustRow, hideUnderOne: boolean): boolean {
  if (!hideUnderOne) return false;
  if (row.kind === "token" && !row.priced) return true;
  return row.valueUsd !== null && row.valueUsd < 1;
}
