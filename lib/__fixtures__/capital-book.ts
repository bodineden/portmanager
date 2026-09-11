import { buildJoinedPortfolio, type LiveResult } from "../live-data";

export const AS_OF = "2026-09-11T00:00:00Z";
export const live = <T>(data: T): LiveResult<T> => ({ data, state: { status: "live", asOf: AS_OF, message: "Fixture only" } });
export function capitalBook(withCapital = true) {
  return buildJoinedPortfolio({
    t212Summary: live({ currency: "GBP", totalValue: 9.62, cashAvailable: 0.28, investmentsCurrentValue: 9.34 }),
    t212Positions: live([{ ticker: "CMCSA_US_EQ", name: "Comcast", quantity: 0.5, averagePrice: 26.32,
      currentPrice: 25.25, ppl: -0.37, currency: "USD", pplCurrency: "GBP", valueNative: 12.625, valueAccount: 9.34 }]),
    nfts: live([]), walletNative: live([]), walletTokens: live([]),
    fiatFx: live({ usdToThb: 33.003871, gbpToThb: 44.6154, eurToThb: null, asOf: AS_OF }), ethPrice: live(2578.15),
    capitalEvents: live(withCapital ? [{ occurredAt: AS_OF, kind: "contribution", amountThb: 120000 }] : []),
    manualHoldings: live([{ id: "opening", label: "T212 cash pot", kind: "cash", currency: "GBP", amount: 2000, recordedAt: AS_OF, createdAt: AS_OF }]),
  }, AS_OF);
}
