export type NativeChainView = {
  chainId: number | "solana";
  chainName: string;
  amount: number;
  valueUsd: number | null;
};

/** Keep the chain inventory accessible while displaying one native asset row. */
export function NativeChainBreakdown({ chains, symbol }: { chains: NativeChainView[]; symbol: string }) {
  if (chains.length < 2) return null;
  return <details className="native-chain-breakdown">
    <summary>{chains.length} chains</summary>
    {chains.map((chain) => <div key={chain.chainId}>
      {chain.chainName}: {chain.amount.toLocaleString("en-US", { maximumFractionDigits: 18 })} {symbol}
      {" · "}{chain.valueUsd === null ? "Unpriced" : chain.valueUsd.toLocaleString("en-US", { style: "currency", currency: "USD" })}
    </div>)}
  </details>;
}
