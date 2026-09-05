import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PnlAssetTable } from "../app/pnl-asset-table";
import { buildJoinedPortfolio, formatUsd, type JoinedPortfolio, type LiveResult } from "./live-data";
import { aggregatePnl, type HoldingPnl } from "./pnl";

const DATE = "2026-09-05T12:00:00.000Z";
const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: DATE, message: "offline fixture" } });
const unavailable = <T>(): LiveResult<T> => ({ data: null, state: { status: "unavailable", asOf: null, message: "offline fixture unavailable" } });
const unknown: HoldingPnl = {
  costBasisUsd: null, costBasisThb: null, basisStatus: "not-recorded", basisNote: "Fixture: acquisition evidence is absent",
  pnlUsd: null, pnlThb: null, pnlPct: null, pnlEligibility: "not-recorded",
};

function fixture(): JoinedPortfolio {
  const book = buildJoinedPortfolio({
    t212Summary: live({ currency: "USD", cashAvailable: 487, totalValue: 717, investmentsCurrentValue: 230 }),
    t212Positions: live([
      { ticker: "RECORDED", name: "Recorded security", quantity: 1, averagePrice: 100, currentPrice: 110,
        ppl: 10, currency: "USD", pplCurrency: "USD", valueNative: 110, valueAccount: 110 },
      { ticker: "FX-DIFFERENCE", name: "Unreconciled security", quantity: 1, averagePrice: 100, currentPrice: 120,
        ppl: 15, currency: "USD", pplCurrency: "USD", valueNative: 120, valueAccount: 120 },
    ]),
    nfts: live([{ collection: "unknown-nft", collectionName: "Unknown NFT", tokenCount: 2, floorEth: 0.1 }]),
    walletNative: live([
      { chainId: 42161, chainName: "Arbitrum One", symbol: "NATIVE", amount: 0.25 },
      { chainId: 8453, chainName: "Base", symbol: "NATIVE-DUST", amount: 0.000001 },
    ]),
    walletTokens: live([
      { chainId: 1, chainName: "Ethereum", symbol: "UNPRICED", name: "Unpriced token", amountRaw: "7", decimals: 0, amount: 7, priceUsd: null },
      { chainId: 1, chainName: "Ethereum", symbol: "FREE", name: "Verified free token", amountRaw: "2", decimals: 0, amount: 2, priceUsd: 20 },
      { chainId: 1, chainName: "Ethereum", symbol: "PURCHASED", name: "Derived purchase token", amountRaw: "3", decimals: 0, amount: 3, priceUsd: 20 },
      { chainId: 1, chainName: "Ethereum", symbol: "TOKEN-DUST", name: "Dust token", amountRaw: "1", decimals: 0, amount: 1, priceUsd: 0.02 },
    ]),
    fiatFx: live({ usdToThb: 36, gbpToThb: 45, eurToThb: 40, asOf: DATE }), ethPrice: live(2_400),
  }, DATE);
  // Explicit presentation fixtures for future evidence-backed rows. No provider
  // response or current balance is being asserted to prove a free acquisition.
  Object.assign(book.wallet.tokens.find(({ symbol }) => symbol === "FREE")!, {
    costBasisUsd: 0, costBasisThb: 0, basisStatus: "airdrop-free", basisNote: "Fixture: verified no-payment acquisition",
    pnlUsd: 40, pnlThb: 1_440, pnlPct: null, pnlEligibility: "eligible",
  } satisfies HoldingPnl);
  Object.assign(book.wallet.tokens.find(({ symbol }) => symbol === "PURCHASED")!, {
    costBasisUsd: 50, costBasisThb: 1_800, basisStatus: "onchain-derived", basisNote: "Fixture: audited historical payment value",
    pnlUsd: 10, pnlThb: 360, pnlPct: 20, pnlEligibility: "eligible",
  } satisfies HoldingPnl);
  Object.assign(book.totals, aggregatePnl({
    t212: { holdings: book.t212.investments, sourceComplete: true },
    nfts: { holdings: book.nfts, sourceComplete: true },
    walletNative: { holdings: book.wallet.native, sourceComplete: true },
    walletTokens: { holdings: book.wallet.tokens, sourceComplete: true },
  }, book.fx.usdToThb));
  return book;
}

function markup(book: JoinedPortfolio): string {
  return renderToStaticMarkup(React.createElement(PnlAssetTable, { portfolio: book }));
}
function rows(html: string): string[] {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  return [...body.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(([row]) => row);
}
function rowNamed(html: string, name: string): string {
  const row = rows(html).find((value) => value.includes(`>${name}</strong>`));
  if (!row) throw new Error(`Missing fixture row ${name}`);
  return row;
}
function cell(row: string, name: "value" | "basis" | "pnl"): string {
  const result = row.match(new RegExp(`<td\\b[^>]*data-pnl-cell="${name}"[^>]*>([\\s\\S]*?)<\\/td>`));
  if (!result) throw new Error(`Missing fixture cell ${name}`);
  return text(result[1]);
}
function text(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replaceAll("&amp;", "&").replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"').replace(/\s+/g, " ").trim();
}

// Existing Vitest configuration uses the classic JSX transform, while Next's
// production transform is automatic. Keep its React global scoped to this file.
beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("rendered per-asset P&L honesty (offline fixtures)", () => {
  it("renders every joined holding once, excludes cash, retains provenance and adds no mutation controls", () => {
    const book = fixture();
    const original = structuredClone(book);
    const html = markup(book);
    expect(rows(html)).toHaveLength(9);
    for (const name of ["RECORDED", "FX-DIFFERENCE", "Unknown NFT", "NATIVE", "NATIVE-DUST", "UNPRICED", "FREE", "PURCHASED", "TOKEN-DUST"]) {
      expect(rows(html).filter((row) => row.includes(`>${name}</strong>`))).toHaveLength(1);
    }
    expect(html).toContain('title="Fixture: verified no-payment acquisition"');
    expect(html).toContain('title="Fixture: audited historical payment value"');
    expect(text(html)).toContain("Cash has no P&L");
    expect(rows(html).some((row) => text(row).includes("Cash available"))).toBe(false);
    expect(html).not.toMatch(/<(?:form|button|input|select)\b|contenteditable=/i);
    expect(text(html)).not.toMatch(/\b(?:undefined|NaN|null)\b/);
    expect(book).toEqual(original);
  });

  it("shows unknown basis and P&L as dashes while retaining current value, even if stale numeric fields are supplied", () => {
    const book = fixture();
    Object.assign(book.nfts[0], { costBasisUsd: 0, costBasisThb: 0, pnlUsd: 0, pnlThb: 0, pnlPct: 0 });
    const row = rowNamed(markup(book), "Unknown NFT");
    expect(row).toContain('data-basis-status="not-recorded"');
    expect(cell(row, "value")).toBe("US$480.00 ฿17,280.00");
    expect(cell(row, "basis")).toBe("— — basis not recorded");
    expect(cell(row, "pnl")).toBe("— — · — Excluded from P&L totals");
    expect(cell(row, "basis") + cell(row, "pnl")).not.toMatch(/\$0|฿0|0\.00%/);
  });

  it("distinguishes verified free basis zero from unknown basis and never emits a zero-basis percentage", () => {
    const book = fixture();
    book.wallet.tokens.find(({ symbol }) => symbol === "FREE")!.pnlPct = 0; // Presentation guard rejects stale 0/0 too.
    const row = rowNamed(markup(book), "FREE");
    expect(row).toContain('data-basis-status="airdrop-free"');
    expect(cell(row, "basis")).toBe("US$0.00 ฿0.00");
    expect(cell(row, "pnl")).toBe("US$40.00 ฿1,440.00 · —");
    expect(text(row)).toContain("Verified free acquisition · percentage unavailable");
    expect(cell(row, "pnl")).not.toContain("0.00%");
  });

  it("preserves unreconciled API P&L visibly but excludes it and unknown/dust holdings from totals", () => {
    const book = fixture();
    const html = markup(book);
    const row = rowNamed(html, "FX-DIFFERENCE");
    expect(row).toContain('data-pnl-eligibility="unreconciled"');
    expect(cell(row, "basis")).toBe("US$100.00 ฿3,600.00");
    expect(cell(row, "pnl")).toBe("US$15.00 ฿540.00 · +15.00% Excluded from P&L totals");
    expect(text(row)).toContain("Unreconciled · excluded from P&L");
    expect(book.totals.pnlUsd).toBe(60); // 10 recorded security + 40 free + 10 purchase.
    expect(book.totals.costBasisUsd).toBe(150);
    const footer = text(html.match(/<tfoot>([\s\S]*?)<\/tfoot>/)![1]);
    expect(footer).toContain("3 of 9 holdings");
    expect(footer).toContain("US$150.00 ฿5,400.00 US$60.00 ฿2,160.00 · +40.00%");
    expect(footer).not.toContain("US$75.00");
  });

  it("preserves known USD basis and P&L when all THB mirrors are unavailable", () => {
    const book = fixture();
    for (const row of [...book.t212.investments, ...book.nfts, ...book.wallet.native, ...book.wallet.tokens]) {
      row.valueThb = null; row.costBasisThb = null; row.pnlThb = null;
    }
    book.totals.costBasisThb = null; book.totals.pnlThb = null; book.fx.usdToThb = null;
    const html = markup(book);
    const row = rowNamed(html, "PURCHASED");
    expect(cell(row, "value")).toBe("US$60.00 —");
    expect(cell(row, "basis")).toBe("US$50.00 —");
    expect(cell(row, "pnl")).toBe("US$10.00 — · +20.00%");
    expect(text(html)).not.toContain("฿");
    expect(text(html.match(/<tfoot>([\s\S]*?)<\/tfoot>/)![1])).toContain("US$150.00 — US$60.00 — · +40.00%");
  });

  it("keeps all dust values, orders wallet native before token and priced before unpriced, and preserves attributes", () => {
    const book = fixture();
    // A missing native quote remains a visible row and sorts behind priced native.
    Object.assign(book.wallet.native[0], unknown, { valueUsd: null, valueThb: null, pnlEligibility: "unpriced" });
    const html = markup(book);
    const walletRows = rows(html).filter((row) => row.includes("data-wallet-kind="));
    expect(walletRows).toHaveLength(6);
    expect(walletRows.map((row) => row.match(/data-wallet-kind="([^"]+)"/)![1]))
      .toEqual(["native", "native", "token", "token", "token", "token"]);
    expect(walletRows.map((row) => row.match(/data-wallet-priced="([^"]+)"/)![1]))
      .toEqual(["true", "false", "true", "true", "true", "false"]);
    expect(cell(rowNamed(html, "NATIVE"), "value")).toBe("— — Unpriced");
    expect(cell(rowNamed(html, "UNPRICED"), "value")).toBe("— — Unpriced");
    expect(cell(rowNamed(html, "TOKEN-DUST"), "value")).toBe("US$0.02 ฿0.72 Dust · below $1");
    expect(cell(rowNamed(html, "NATIVE-DUST"), "value")).toContain(formatUsd(book.wallet.native[1].valueUsd));
    expect(cell(rowNamed(html, "TOKEN-DUST"), "pnl")).toContain("Excluded from P&L totals");
    expect(book.totals.pnlUsd).toBe(60);
  });

  it("renders unavailable inventory explicitly instead of emitting zero P&L or an empty-account claim", () => {
    const book = buildJoinedPortfolio({
      t212Summary: unavailable(), t212Positions: unavailable(), nfts: unavailable(),
      walletNative: unavailable(), walletTokens: unavailable(), fiatFx: unavailable(), ethPrice: unavailable(),
    }, DATE);
    const html = markup(book);
    expect(rows(html)).toHaveLength(0);
    expect(text(html)).toContain("Holdings unavailable — P&L coverage is incomplete");
    expect(text(html)).toContain("No recorded cost basis is available to display");
    expect(text(html)).not.toMatch(/\$0|฿0|\b(?:undefined|NaN|null)\b/);
  });
});
