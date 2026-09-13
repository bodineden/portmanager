import { shouldSuppressHolding } from "@/lib/dust-filter";
import { NativeChainBreakdown, type NativeChainView } from "./native-chain-breakdown";

type WalletSourceView = {
  status: "live" | "partial" | "unavailable";
  message: string;
};

type WalletNativeRowView = {
  id: string;
  symbol: string;
  chainName: string;
  chainId: number | "eth" | "solana";
  chains: NativeChainView[];
  amountValue: number;
  amount: string;
  priceUsd: string;
  valueUsd: number | null;
  valueUsdText: string;
  valueThb: string;
};

type WalletTokenRowView = {
  id: string;
  symbol: string;
  name: string;
  contract?: string;
  chainName: string;
  chainId: number | "solana";
  amount: string;
  priceUsd: string;
  valueUsd: number | null;
  valueUsdText: string;
  valueThb: string;
  priced: boolean;
};

function SourceBadge({ state }: { state: WalletSourceView }) {
  return (
    <span className={`live-source-badge is-${state.status}`} title={state.message}>
      <i aria-hidden="true" /> {state.status}
    </span>
  );
}

export function WalletBalancesPanel({
  nativeRows: allNativeRows,
  tokenRows: allTokenRows,
  nativeSource,
  tokenSource,
  solanaSource,
  walletSourcesComplete,
  totalWalletUsd,
  totalWalletThb,
}: {
  nativeRows: WalletNativeRowView[];
  tokenRows: WalletTokenRowView[];
  nativeSource: WalletSourceView;
  tokenSource: WalletSourceView;
  solanaSource: WalletSourceView;
  walletSourcesComplete: boolean;
  totalWalletUsd: string;
  totalWalletThb: string;
}) {
  const nativeRows = allNativeRows.filter((row) => !shouldSuppressHolding(row));
  const tokenRows = allTokenRows.filter((row) => !shouldSuppressHolding(row));
  const totalCount = nativeRows.length + tokenRows.length;

  return (
    <section
      className="panel home-panel home-wallet-panel"
      aria-label="Wallet balances"
      data-wallet-native-count={nativeRows.length}
      data-wallet-token-count={tokenRows.length}
    >
      <div className="panel-header home-wallet-panel-header">
        <div>
          <p className="eyebrow">EVM + SOLANA / NATIVE + TOKENS</p>
          <h2 className="panel-title">Wallet Balances</h2>
        </div>
        <div className="home-source-stack home-wallet-controls">
          <span className="home-labeled-source" data-wallet-source="walletNative">
            <span>NATIVE</span>
            <SourceBadge state={nativeSource} />
          </span>
          <span className="home-labeled-source" data-wallet-source="walletTokens">
            <span>TOKENS</span>
            <SourceBadge state={tokenSource} />
          </span>
          <span className="home-labeled-source" data-wallet-source="solana">
            <span>SOLANA</span>
            <SourceBadge state={solanaSource} />
          </span>
          <span className="home-wallet-count">
            <span className="panel-count">{nativeRows.length} NATIVE · {tokenRows.length} TOKENS</span>
          </span>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className={`home-empty ${walletSourcesComplete ? "" : "is-unavailable"}`}>
          <strong>No wallet holdings to display in this snapshot.</strong>
          {!walletSourcesComplete && <p>One or more wallet sources did not return a complete inventory; no empty-wallet conclusion is inferred.</p>}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table live-table home-wallet-table">
            <caption className="sr-only">Live native coin, ERC-20 and SPL wallet balances</caption>
            <thead>
              <tr>
                <th>Asset / Chain</th>
                <th>Type</th>
                <th className="numeric">Amount</th>
                <th className="numeric">Price (USD)</th>
                <th className="numeric">Value (USD)</th>
                <th className="numeric">Value (THB)</th>
              </tr>
            </thead>
            <tbody>
              {nativeRows.map((holding) => (
                <tr key={holding.id} id={holding.id} data-holding-id={holding.id} data-native-chains={JSON.stringify(holding.chains)} data-holding-amount={holding.amountValue} data-holding-value-usd={holding.valueUsd} data-wallet-kind="native" data-wallet-priced={holding.valueUsd !== null ? "true" : "false"}>
                  <td>
                    <span className="ticker-cell">{holding.symbol}</span>
                    <small className="sub-cell">{holding.chainName}</small>
                    <NativeChainBreakdown chains={holding.chains} symbol={holding.symbol} />
                  </td>
                  <td><span className="data-tag">NATIVE</span></td>
                  <td className="numeric">{holding.amount}</td>
                  <td className="numeric">{holding.priceUsd}</td>
                  <td className="numeric value-cell">{holding.valueUsdText}</td>
                  <td className="numeric muted">{holding.valueThb}</td>
                </tr>
              ))}
              {tokenRows.map((holding) => (
                <tr
                  key={holding.id}
                  id={holding.id}
                  data-holding-id={holding.id}
                  data-wallet-kind="token"
                  data-wallet-priced={holding.priced ? "true" : "false"}
                >
                  <td>
                    <span className="ticker-cell">{holding.symbol}</span>
                    <small className="sub-cell" title={holding.contract}>{holding.name} · {holding.chainName}</small>
                  </td>
                  <td>
                    <span className="home-wallet-type-stack">
                      <span className="data-tag">{holding.chainId === "solana" ? "SPL" : "ERC-20"}</span>
                    </span>
                  </td>
                  <td className="numeric">{holding.amount}</td>
                  <td className="numeric">{holding.priceUsd}</td>
                  <td className="numeric value-cell">{holding.valueUsdText}</td>
                  <td className="numeric muted">{holding.valueThb}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="table-total-row">
                <td><strong>Total wallet (priced)</strong></td>
                <td><span className="data-tag">PRICED</span></td>
                <td className="numeric">—</td>
                <td className="numeric">—</td>
                <td className="numeric"><strong>{totalWalletUsd}</strong></td>
                <td className="numeric"><strong>{totalWalletThb}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {nativeSource.status !== "live" ? (
        <div className={`home-availability-note ${nativeSource.status === "partial" ? "warning" : "negative"}`}>
          Native balances: {nativeSource.message}
        </div>
      ) : null}
      {tokenSource.status !== "live" ? (
        <div className={`home-availability-note ${tokenSource.status === "partial" ? "warning" : "negative"}`}>
          Token balances: {tokenSource.message}
        </div>
      ) : null}
      {solanaSource.status !== "live" ? (
        <div className={`home-availability-note ${solanaSource.status === "partial" ? "warning" : "negative"}`}>
          Solana wallet: {solanaSource.message}
        </div>
      ) : null}
    </section>
  );
}
