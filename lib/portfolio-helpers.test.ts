import { describe, expect, it } from "vitest";
import { buildHoldingsCsv, calculateChangePercent } from "./portfolio-helpers";

describe("calculateChangePercent", () => {
  it("calculates gains and losses", () => {
    expect(calculateChangePercent(110, 100)).toBe(10);
    expect(calculateChangePercent(75, 100)).toBe(-25);
  });
  it("returns zero when the previous price is zero", () => expect(calculateChangePercent(12, 0)).toBe(0));
});

describe("buildHoldingsCsv", () => {
  it("builds columns and escapes names", () => {
    expect(buildHoldingsCsv([{ ticker: "ABC", name: 'Growth, "Plus"', shares: 2, currentPrice: 12.5, valueThb: 900 }])).toBe(
      'ticker,name,shares,current price,value in THB\r\nABC,"Growth, ""Plus""",2,12.5,900',
    );
  });
});
