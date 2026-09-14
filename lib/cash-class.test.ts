import { describe, expect, it } from "vitest";
import { isCashToken, isStablecoinSymbol } from "./cash-class";

describe("USD stablecoin cash classification", () => {
  it.each(["USDC", "USDT", "USDG", "DAI", "PYUSD", "USDE", "USDS", "TUSD", "FDUSD", "USD1", "USDP", "GUSD", "LUSD", "FRAX", "CRVUSD", "USDTB"])("recognizes only the approved symbol %s, case-insensitively", (symbol) => {
    expect(isStablecoinSymbol(symbol)).toBe(true);
    expect(isStablecoinSymbol(symbol.toLowerCase())).toBe(true);
  });
  it.each([null, undefined, "", "BTC", "SOL", "HcRL…", "USDC.e", " USDG"])("does not guess for %s", (symbol) => {
    expect(isStablecoinSymbol(symbol)).toBe(false);
  });
  it("requires a priced finite value, not merely the imposter's USDG symbol", () => {
    expect(isCashToken({ symbol: "USDG", priced: false, valueUsd: null })).toBe(false);
    expect(isCashToken({ symbol: "USDG", priced: false, valueUsd: 13 })).toBe(false);
    for (const valueUsd of [null, NaN, Infinity]) expect(isCashToken({ symbol: "USDC", priced: true, valueUsd })).toBe(false);
    expect(isCashToken({ symbol: "USDC", priced: true, valueUsd: 89.4168 })).toBe(true);
    expect(isCashToken({ symbol: "USDG", priced: true, valueUsd: 2.1886 })).toBe(true);
    expect(isCashToken({ symbol: "BTC", priced: true, valueUsd: 10 })).toBe(false);
  });
});
