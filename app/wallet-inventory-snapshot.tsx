import type { JoinedPortfolio } from "@/lib/live-data";

/** Preserve the page's numeric input snapshot for independent total reconciliation. */
export function WalletInventorySnapshot({ portfolio }: { portfolio: JoinedPortfolio }) {
  const inventory = ["native", "tokens"].map((kind) => {
    const key = kind as "native" | "tokens";
    return {
      status: portfolio.sources[key === "native" ? "walletNative" : "walletTokens"].status,
      rows: portfolio.wallet[key].map(({ amount, valueUsd, valueThb }) => ({ amount, valueUsd, valueThb })),
    };
  });
  return <script type="application/json" data-wallet-inventory="" dangerouslySetInnerHTML={{
    __html: JSON.stringify(inventory).replace(/</g, "\\u003c"),
  }} />;
}
