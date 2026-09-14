import { describe, expect, it } from "vitest";
import { isCashToken, isStablecoinContract, isStablecoinSymbol } from "./cash-class";

const solanaUsdc = {
  chainId: "solana", chainName: "Solana", symbol: "EPjF…Dt1v",
  name: "SPL token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  contract: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amountRaw: "89432083", decimals: 6, amount: 89.432083,
  priceUsd: 89.4168 / 89.432083, priced: true, valueUsd: 89.4168,
};

describe("USD stablecoin cash classification", () => {
  it("recognizes priced Solana USDC with the real normalizer's mint label", () => {
    expect(isStablecoinSymbol(solanaUsdc.symbol)).toBe(false);
    expect(isCashToken(solanaUsdc)).toBe(true);
  });
  it.each([
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
  ])("recognizes the canonical stablecoin contract %s without changing symbol recognition", (contract) => {
    expect(isStablecoinSymbol(contract)).toBe(false);
    for (const variant of [contract, contract.toLowerCase(), contract.toUpperCase()]) {
      expect(isStablecoinContract(variant)).toBe(true);
      expect(isCashToken({ ...solanaUsdc, contract: variant })).toBe(true);
    }
  });
  it.each([null, NaN, Infinity, -Infinity])("rejects a known mint with non-finite/absent value %s", (valueUsd) => {
    expect(isCashToken({ ...solanaUsdc, valueUsd })).toBe(false);
  });
  it("requires priced true even for a known mint", () => {
    expect(isCashToken({ ...solanaUsdc, priced: false })).toBe(false);
    expect(isCashToken({ ...solanaUsdc, priced: false, valueUsd: null })).toBe(false);
    expect(isCashToken({ ...solanaUsdc, valueUsd: 0 })).toBe(true);
  });
  it.each([null, undefined, "", "HcRLc9VDgjLeK154xDawfb1dmVJ98DoSqcwTHGqiDeJR",
    "0x5411257cedf60bc40f4bead410bf8d02079056a2", "EPjF…Dt1v", "USDC",
    " EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"])("fails closed for unknown/absent contract %s with a mint label", (contract) => {
    expect(isStablecoinContract(contract)).toBe(false);
    if (contract !== null) expect(isCashToken({ ...solanaUsdc, contract })).toBe(false);
  });
  it("keeps the real unpriced RH USDG imposter out of Cash", () => {
    const contract = "0x5411257cedf60bc40f4bead410bf8d02079056a2";
    expect(isStablecoinContract(contract)).toBe(false);
    expect(isCashToken({ symbol: "USDG", contract, priced: false, valueUsd: null })).toBe(false);
  });
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
