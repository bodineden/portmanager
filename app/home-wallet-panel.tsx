"use client";

import { useState } from "react";
import { shouldHideWalletDust } from "@/lib/dust-filter";

type WalletSourceView = {
  status: "live" | "partial" | "unavailable";
  message: string;
};

type WalletNativeRowView = {
  id: string;
  symbol: string;
  chainName: string;
  chainId: number;
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
  chainId: number;
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
  nativeRows,
  tokenRows,
  nativeSource,
  tokenSource,
  walletSourcesComplete,
  walletSourcesUnavailable,
  totalWalletUsd,
  totalWalletThb,
}: {
  nativeRows: WalletNativeRowView[];
  tokenRows: WalletTokenRowView[];
  nativeSource: WalletSourceView;
  tokenSource: WalletSourceView;
  walletSourcesComplete: boolean;
  walletSourcesUnavailable: boolean;
  totalWalletUsd: string;
  totalWalletThb: string;
}) {
  const [hideUnderOne, setHideUnderOne] = useState(true);
  const visibleNativeRows = nativeRows.filter((row) => !shouldHideWalletDust({
    kind: "native",
    valueUsd: row.valueUsd,
    priced: true,
  }, hideUnderOne));
  const visibleTokenRows = tokenRows.filter((row) => !shouldHideWalletDust({
    kind: "token",
    valueUsd: row.valueUsd,
    priced: row.priced,
  }, hideUnderOne));
  const totalCount = nativeRows.length + tokenRows.length;
  const visibleCount = visibleNativeRows.length + visibleTokenRows.length;
  const hiddenCount = totalCount - visibleCount;

  return (
    <section
      className="panel home-panel home-wallet-panel"
      aria-label="Wallet balances"
      data-wallet-native-count={nativeRows.length}
      data-wallet-token-count={tokenRows.length}
    >
      <div className="panel-header home-wallet-panel-header">
        <div>
          <p className="eyebrow">EVM WALLET / NATIVE + TOKENS</p>
          <h2 className="panel-title">Wallet Balances</h2>
        </div>
        <div className="home-source-stack home-wallet-controls">
          <span className="home-labeled-source">
            <span>NATIVE</span>
            <SourceBadge state={nativeSource} />
          </span>
          <span className="home-labeled-source">
            <span>TOKENS</span>
            <SourceBadge state={tokenSource} />
          </span>
          <label className="home-wallet-filter">
            <input
              type="checkbox"
              aria-label="Hide assets under $1"
              checked={hideUnderOne}
              onChange={(event) => setHideUnderOne(event.target.checked)}
            />
            <span>Hide under $1</span>
          </label>
          <span className="home-wallet-count">
            <span className="panel-count">{visibleNativeRows.length} NATIVE · {visibleTokenRows.length} TOKENS</span>
            {hideUnderOne && hiddenCount > 0 ? (
              <small className="home-wallet-hidden-count">({hiddenCount} hidden under $1)</small>
            ) : null}
          </span>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className={`home-empty ${walletSourcesComplete ? "" : "is-unavailable"}`}>
          <strong>{walletSourcesComplete
            ? "No non-NFT wallet holdings found"
            : walletSourcesUnavailable
              ? "Wallet balances unavailable"
              : "Wallet balance snapshot incomplete"}</strong>
          <p>
            {walletSourcesComplete
              ? "The connected EVM wallet returned no positive native coin or ERC-20 balances in this snapshot."
              : "One or more wallet sources did not return a complete inventory; no empty-wallet conclusion is inferred."}
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table live-table home-wallet-table">
            <caption className="sr-only">Live native coin and ERC-20 wallet balances</caption>
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
              {visibleCount === 0 ? (
                <tr className="home-wallet-filtered-empty">
                  <td colSpan={6}>All {totalCount} wallet assets are hidden under $1 — uncheck &quot;Hide under $1&quot; to show them</td>
                </tr>
              ) : null}
              {visibleNativeRows.map((holding) => (
                <tr key={holding.id} data-wallet-kind="native" data-wallet-priced={holding.valueUsd !== null ? "true" : "false"}>
                  <td>
                    <span className="ticker-cell">{holding.symbol}</span>
                    <small className="sub-cell">{holding.chainName} · CHAIN {holding.chainId}</small>
                  </td>
                  <td><span className="data-tag">NATIVE</span></td>
                  <td className="numeric">{holding.amount}</td>
                  <td className="numeric">{holding.priceUsd}</td>
                  <td className="numeric value-cell">{holding.valueUsdText}</td>
                  <td className="numeric muted">{holding.valueThb}</td>
                </tr>
              ))}
              {visibleTokenRows.map((holding) => (
                <tr
                  key={holding.id}
                  data-wallet-kind="token"
                  data-wallet-priced={holding.priced ? "true" : "false"}
                >
                  <td>
                    <span className="ticker-cell">{holding.symbol}</span>
                    <small className="sub-cell" title={holding.contract}>{holding.name} · {holding.chainName}</small>
                  </td>
                  <td>
                    <span className="home-wallet-type-stack">
                      <span className="data-tag">ERC-20</span>
                      {holding.priced ? null : <span className="data-tag home-unpriced-tag">UNPRICED</span>}
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
    </section>
  );
}
