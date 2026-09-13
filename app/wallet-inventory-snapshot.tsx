import type { JoinedPortfolio } from "@/lib/live-data";
import { holdingId } from "@/lib/holding-values";

/** Preserve the page's numeric input snapshot for independent total reconciliation. */
export function WalletInventorySnapshot({ portfolio }: { portfolio: JoinedPortfolio }) {
  const inventory = ["native", "tokens"].map((kind) => {
    const key = kind as "native" | "tokens";
    const statuses = [portfolio.sources[key === "native" ? "walletNative" : "walletTokens"].status, portfolio.sources.solana.status];
    return {
      status: statuses.every((status) => status === "live") ? "live" : statuses.every((status) => status === "unavailable") ? "unavailable" : "partial",
      rows: portfolio.wallet[key].map((row) => ({ amount: row.amount, valueUsd: row.valueUsd, valueThb: row.valueThb,
        ...("chains" in row ? { key: row.key, chains: row.chains } : { key: holdingId.token(row.chainId, row.contract ?? row.symbol) }),
      })),
    };
  });
  return <script type="application/json" data-wallet-inventory="" dangerouslySetInnerHTML={{
    __html: JSON.stringify(inventory).replace(/</g, "\\u003c"),
  }} />;
}
