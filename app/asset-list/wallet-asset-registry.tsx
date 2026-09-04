"use client";

import { useState } from "react";
import { shouldHideWalletDust } from "@/lib/dust-filter";

type WalletSourceView = {
  status: "live" | "partial" | "unavailable";
  label: string;
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

export function WalletAssetRegistry({
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
    <>
      <div className="panel-header asset-live-panel-header">
        <div>
          <p className="eyebrow">EVM WALLET / NATIVE + ERC-20</p>
          <h2 className="panel-title">Live Wallet Asset Registry</h2>
          <p className="panel-subtitle">Positive native coin and token balances across the managed EVM chains</p>
        </div>
        <div className="asset-panel-status">
          <span className="asset-wallet-source-label">
            <small>NATIVE</small>
            <span className={`asset-source-badge is-${nativeSource.status}`}>{nativeSource.label}</span>
          </span>
          <span className="asset-wallet-source-label">
            <small>TOKENS</small>
            <span className={`asset-source-badge is-${tokenSource.status}`}>{tokenSource.label}</span>
          </span>
          <label className="asset-wallet-filter">
            <input
              type="checkbox"
              aria-label="Hide assets under $1"
              checked={hideUnderOne}
              onChange={(event) => setHideUnderOne(event.target.checked)}
            />
            <span>Hide under $1</span>
          </label>
          <span className="asset-wallet-count">
            <span className="panel-count">{visibleCount} ASSETS</span>
            {hideUnderOne && hiddenCount > 0 ? (
              <small className="asset-wallet-hidden-count">({hiddenCount} hidden under $1)</small>
            ) : null}
          </span>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className={`asset-empty-state${walletSourcesComplete ? "" : " is-unavailable"}`}>
          <span className="asset-empty-code">WALLET / —</span>
          <div>
            <strong>{walletSourcesComplete
              ? "No wallet assets found"
              : walletSourcesUnavailable
                ? "Wallet assets are unavailable"
                : "Wallet asset snapshot incomplete"}</strong>
            <p>
              {walletSourcesComplete
                ? "The connected EVM wallet returned no positive native coin or ERC-20 balances in this snapshot."
                : "One or more wallet sources did not return a complete inventory; no empty-wallet conclusion is inferred."}
            </p>
          </div>
        </div>
      ) : (
        <div className="asset-table-scroll">
          <table className="asset-live-table asset-wallet-table">
            <caption className="sr-only">Live native coin and ERC-20 wallet registry</caption>
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col">Chain</th>
                <th scope="col">Type</th>
                <th scope="col" className="asset-cell-right">Amount</th>
                <th scope="col" className="asset-cell-right">Price (USD)</th>
                <th scope="col" className="asset-cell-right">Value (USD)</th>
                <th scope="col" className="asset-cell-right">Value (THB)</th>
              </tr>
            </thead>
            <tbody>
              {visibleNativeRows.map((holding) => (
                <tr key={holding.id} data-wallet-kind="native">
                  <td><span className="ticker-badge">{holding.symbol}</span></td>
                  <td>
                    <strong className="asset-collection-name">{holding.chainName}</strong>
                    <small className="asset-row-name mono">CHAIN {holding.chainId}</small>
                  </td>
                  <td><span className="data-tag">NATIVE</span></td>
                  <td className="asset-cell-right numeric">{holding.amount}</td>
                  <td className="asset-cell-right numeric">{holding.priceUsd}</td>
                  <td className="asset-cell-right numeric">{holding.valueUsdText}</td>
                  <td className="asset-cell-right numeric asset-thb-value">{holding.valueThb}</td>
                </tr>
              ))}
              {visibleTokenRows.map((holding) => (
                <tr
                  key={holding.id}
                  data-wallet-kind="token"
                  data-wallet-priced={holding.priced ? "true" : "false"}
                >
                  <td>
                    <span className="ticker-badge">{holding.symbol}</span>
                    <small className="asset-row-name" title={holding.contract}>{holding.name}</small>
                  </td>
                  <td>
                    <strong className="asset-collection-name">{holding.chainName}</strong>
                    <small className="asset-row-name mono">CHAIN {holding.chainId}</small>
                  </td>
                  <td>
                    <span className="asset-wallet-type">
                      <span className="data-tag">ERC-20</span>
                      {holding.priced ? null : <span className="data-tag asset-wallet-unpriced">UNPRICED</span>}
                    </span>
                  </td>
                  <td className="asset-cell-right numeric">{holding.amount}</td>
                  <td className="asset-cell-right numeric">{holding.priceUsd}</td>
                  <td className="asset-cell-right numeric">{holding.valueUsdText}</td>
                  <td className="asset-cell-right numeric asset-thb-value">{holding.valueThb}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total wallet (priced)</strong></td>
                <td>—</td>
                <td><span className="data-tag">PRICED</span></td>
                <td className="asset-cell-right">—</td>
                <td className="asset-cell-right">—</td>
                <td className="asset-cell-right numeric"><strong>{totalWalletUsd}</strong></td>
                <td className="asset-cell-right numeric asset-thb-value"><strong>{totalWalletThb}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
