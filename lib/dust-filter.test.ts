import { describe, expect, it } from "vitest";
import { shouldSuppressHolding } from "./dust-filter";

describe("shouldSuppressHolding", () => {
  describe.each(["native", "token", "t212", "nft"])("%s market holding", (kind) => {
    it.each([null, 0, 0.24, 0.99, 1 - Number.EPSILON])("always suppresses a value of %s", (valueUsd) => {
      expect(shouldSuppressHolding(Object.freeze({ kind, valueUsd }))).toBe(true);
    });

    it.each([1, 1 + Number.EPSILON, 2])("keeps a value of %s without a filter control", (valueUsd) => {
      expect(shouldSuppressHolding(Object.freeze({ kind, valueUsd }))).toBe(false);
    });
  });

  it("uses the current value as the source of truth", () => {
    const known = Object.freeze({ kind: "token", priced: false, valueUsd: 2 });
    const unknown = Object.freeze({ kind: "native", priced: true, valueUsd: null });
    expect(shouldSuppressHolding(known)).toBe(false);
    expect(shouldSuppressHolding(unknown)).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("does not display an invalid numeric value %s", (valueUsd) => {
    expect(shouldSuppressHolding({ valueUsd })).toBe(true);
  });

  it.each([null, 0, 0.24, 0.99, 1])("keeps operator-declared manual cash valued at %s", (valueUsd) => {
    expect(shouldSuppressHolding({ manualCash: true, valueUsd })).toBe(false);
  });
});
