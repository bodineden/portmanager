import { describe, expect, it } from "vitest";
import { shouldHideWalletDust, type WalletDustRow } from "./dust-filter";

const row = (overrides: Partial<WalletDustRow>): WalletDustRow => ({
  kind: "token",
  valueUsd: 2,
  priced: true,
  ...overrides,
});

describe("shouldHideWalletDust", () => {
  it("hides an unpriced token when the filter is on", () => {
    expect(shouldHideWalletDust(row({ priced: false, valueUsd: null }), true)).toBe(true);
  });

  it("hides a token valued at $0.99 when the filter is on", () => {
    expect(shouldHideWalletDust(row({ valueUsd: 0.99 }), true)).toBe(true);
  });

  it("keeps a token valued at exactly $1.00 when the filter is on", () => {
    expect(shouldHideWalletDust(row({ valueUsd: 1 }), true)).toBe(false);
  });

  it("hides a native row valued at $0.24 when the filter is on", () => {
    expect(shouldHideWalletDust(row({ kind: "native", valueUsd: 0.24 }), true)).toBe(true);
  });

  it("keeps a native row with a null USD value when the filter is on", () => {
    expect(shouldHideWalletDust(row({ kind: "native", valueUsd: null }), true)).toBe(false);
  });

  it("shows an unpriced token when the filter is off", () => {
    expect(shouldHideWalletDust(row({ priced: false, valueUsd: null }), false)).toBe(false);
  });

  it("shows a sub-dollar native row when the filter is off", () => {
    expect(shouldHideWalletDust(row({ kind: "native", valueUsd: 0.24 }), false)).toBe(false);
  });
});
