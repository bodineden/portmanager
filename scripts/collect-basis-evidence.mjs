#!/usr/bin/env node
/** Read-only chain collector. No signing dependencies, key material or app imports.
 * Run: node scripts/collect-basis-evidence.mjs [--out-dir /absolute/path]
 * Exit 2 = honest partial run (excluded holdings or unreachable sources); 1 = fatal.
 * RPC reads are pinned to a block. Every run discovers holdings anew; saved raw
 * responses are audit artifacts, NEVER inputs to a subsequent collection.
 * A fixed local filesystem lock serializes this wallet on THIS single host only;
 * it is not a distributed or multi-host lock.
 */
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export const WALLET = '0xc1bd8020d08b2a1f98da54f1573a54412d99c609';
export const ZERO = '0x0000000000000000000000000000000000000000';
export const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const RUN_LOCK_DIR = `/tmp/portmanager-basis-collector-${WALLET}.lock`;
const ORDER_FULFILLED = '0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31';
const SEAPORT = new Set(['0x0000000000000068f116a894984e2db1123eb395']);
const RH_RPC = 'https://rpc.mainnet.chain.robinhood.com';
const LLAMA_ETH = `ethereum:${ZERO}`;
const CHAINS = [
  { id: 1, rpc: 'https://ethereum-rpc.publicnode.com', scout: 'https://eth.blockscout.com/api/v2' },
  { id: 8453, rpc: 'https://mainnet.base.org', scout: 'https://base.blockscout.com/api/v2' },
  { id: 42161, rpc: 'https://arb1.arbitrum.io/rpc', scout: 'https://arbitrum.blockscout.com/api/v2' },
  { id: 4663, rpc: RH_RPC },
];
const HASH = /^0x[\da-f]{64}$/i;
const ADDRESS = /^0x[\da-f]{40}$/i;
const TOPIC = /^0x[\da-f]{64}$/i;
const DIGITS = /^\d+$/;
const RPC_QUANTITY = /^0x[\da-f]+$/i;
const SUPPORTED_CHAINS = new Set(CHAINS.map(chain => chain.id));
const pad = address => address.slice(2).padStart(64, '0');
const addressOf = topic => `0x${topic.slice(-40)}`.toLowerCase();
const hex = value => `0x${BigInt(value).toString(16)}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sum = values => values.reduce((total, raw) => total + BigInt(raw), 0n);
const fail = message => { throw new Error(message); };
class AuditedRejection extends Error {}
const rejectAcquisition = message => { throw new AuditedRejection(message); };
const isRaw = value => typeof value === 'string' && DIGITS.test(value);
export function units(raw, decimals) {
  if (!isRaw(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) fail('invalid raw units/decimals');
  const s = raw.padStart(decimals + 1, '0');
  return Number(decimals ? `${s.slice(0, -decimals)}.${s.slice(-decimals)}` : s);
}
export function holdingKey(holding) { return `${holding.kind}:${holding.chainId}:${holding.assetId.toLowerCase()}`; }

async function writeOwnerOnly(file, data, append = false) {
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW
    | (append ? fsConstants.O_APPEND : 0);
  const handle = await fs.open(file, flags, 0o600);
  try {
    const info = await handle.stat();
    if (!info.isFile()) fail('audit artifact must be a regular file');
    await handle.chmod(0o600); // Repair an existing mode before exposing new bytes.
    if (!append) await handle.truncate(0);
    await handle.writeFile(data);
  } finally { await handle.close(); }
}
export async function prepareAuditDirectory(outDir) {
  if (typeof outDir !== 'string' || !path.isAbsolute(outDir)) fail('audit directory must be absolute');
  await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
  const info = await fs.lstat(outDir);
  if (!info.isDirectory() || info.isSymbolicLink()) fail('audit path must be a real directory');
  await fs.chmod(outDir, 0o700);
}
export async function withCollectionLock(lockDir, action) {
  if (typeof lockDir !== 'string' || !path.isAbsolute(lockDir) || typeof action !== 'function') fail('invalid collection lock');
  try { await fs.mkdir(lockDir, { mode: 0o700 }); }
  catch (error) {
    if (error.code === 'EEXIST') fail(`collector lock exists at ${lockDir}; already running or requires owner removal`);
    throw error;
  }
  try {
    await fs.chmod(lockDir, 0o700);
    return await action();
  } finally {
    await fs.rmdir(lockDir); // Never guess whether an existing lock is stale.
  }
}

function pricedUsd(raw, decimals, quote, asset, acquiredAt) {
  if (!isRaw(raw) || !quote || quote.provider !== 'defillama-historical' || typeof quote.assetId !== 'string'
    || quote.assetId.toLowerCase() !== asset.toLowerCase()
    || !(quote.priceUsd > 0) || !Number.isFinite(quote.priceUsd)
    || typeof quote.timestamp !== 'string' || !Number.isFinite(Date.parse(quote.timestamp))
    || Math.abs(Date.parse(quote.timestamp) - Date.parse(acquiredAt)) > 3600000) fail('missing/invalid historical payment price');
  const result = units(raw, decimals) * quote.priceUsd;
  if (!Number.isFinite(result) || result < 0) fail('invalid USD total');
  return result;
}

/** Last boundary before SQL: quantities never pass through floating-point. */
export function validateEvidence(holding, evidence) {
  const reasons = [];
  let quantity = 0n, basisUsd = 0;
  try {
    if (!holding || typeof holding !== 'object' || !evidence || typeof evidence !== 'object') fail('malformed holding/evidence');
    const kind = holding.kind;
    const chainId = holding.chainId;
    const assetId = holding.assetId;
    const decimals = holding.decimals;
    const supportedIdentity = SUPPORTED_CHAINS.has(chainId) && Number.isSafeInteger(chainId)
      && typeof assetId === 'string' && (
        kind === 'native' && assetId === 'native' && decimals === 18
        || kind === 'nft' && chainId === 4663 && assetId.length > 0 && decimals === 0
        || kind === 'token' && ADDRESS.test(assetId) && assetId.toLowerCase() !== ZERO
          && typeof holding.contract === 'string' && ADDRESS.test(holding.contract)
          && assetId.toLowerCase() === holding.contract.toLowerCase()
          && Number.isInteger(decimals) && decimals >= 0 && decimals <= 36
      );
    const evidenceIdentity = evidence.chainId === chainId && evidence.decimals === decimals
      && typeof evidence.assetId === 'string' && (kind === 'native'
        ? evidence.assetId === assetId : evidence.assetId.toLowerCase() === assetId.toLowerCase());
    if (!supportedIdentity || !evidenceIdentity) reasons.push('holding identity mismatch');
    // RPC is permitted on every tracked chain, including carried native ETH
    // at native:4663:native. Only Blockscout and OpenSea have source restrictions.
    const supportedProvenance = evidence.source === 'opensea-v2' && kind === 'nft' && chainId === 4663
      || evidence.source === 'rpc' && SUPPORTED_CHAINS.has(chainId)
      || evidence.source === 'blockscout-v2' && ['native', 'token'].includes(kind) && [1, 8453, 42161].includes(chainId);
    if (!supportedProvenance) reasons.push('unsupported provenance');
    if (!isRaw(holding.quantityRaw)) fail('invalid holding quantityRaw; expected digit string');
    if (evidence.complete !== true || evidence.hasDisposals !== false) reasons.push('incomplete history or disposals');
    if (!Array.isArray(evidence.lots)) fail('invalid acquisition lots');
    if (!evidence.lots.length) reasons.push('no proven acquisition lots');
    const seen = new Set();
    for (const lot of evidence.lots) {
      if (!lot || typeof lot !== 'object' || !isRaw(lot.quantityRaw) || BigInt(lot.quantityRaw) <= 0n) fail('invalid acquired quantityRaw; expected positive digit string');
      quantity += BigInt(lot.quantityRaw);
      if (typeof lot.transactionHash !== 'string' || !HASH.test(lot.transactionHash) || seen.has(lot.transactionHash.toLowerCase())) fail('invalid/duplicate transaction');
      seen.add(lot.transactionHash.toLowerCase());
      if (typeof lot.acquiredAt !== 'string' || !Number.isFinite(Date.parse(lot.acquiredAt)) || Date.parse(lot.acquiredAt) > Date.now()) fail('invalid/future acquisition date');
      if (lot.success !== true || lot.allPaymentLegsObserved !== true) fail('unproven receipt/payment legs');
      if (!Number.isSafeInteger(lot.acquiredAssetCount) || lot.acquiredAssetCount < 1
        || kind === 'nft' && BigInt(lot.acquiredAssetCount) !== BigInt(lot.quantityRaw)
        || kind !== 'nft' && lot.acquiredAssetCount !== 1) fail('unsupported acquired-asset count');
      if (!isRaw(lot.nativeOutflowRaw)) fail('invalid nativeOutflowRaw; expected digit string');
      if (!Array.isArray(lot.tokenOutflows)) fail('invalid token payment legs');
      for (const payment of lot.tokenOutflows) {
        if (!payment || typeof payment !== 'object' || typeof payment.assetId !== 'string'
          || !ADDRESS.test(payment.assetId) || payment.assetId.toLowerCase() === ZERO
          || !isRaw(payment.amountRaw) || BigInt(payment.amountRaw) <= 0n
          || !Number.isInteger(payment.decimals) || payment.decimals < 0 || payment.decimals > 36) {
          fail('invalid token payment amountRaw/identity');
        }
      }
      const noPayment = BigInt(lot.nativeOutflowRaw) === 0n && lot.tokenOutflows.length === 0;
      if (lot.operation === 'funding-arrival') {
        if (kind !== 'native' || !noPayment) fail('funding-arrival is native ETH only');
        basisUsd += pricedUsd(lot.quantityRaw, 18, lot.nativePrice, lot.nativePrice?.assetId === LLAMA_ETH ? LLAMA_ETH : 'native', lot.acquiredAt);
      } else if (['mint', 'claim', 'airdrop'].includes(lot.operation)) {
        if (kind === 'native' || !noPayment) fail('unproven free acquisition');
      } else if (lot.operation === 'purchase') {
        if (noPayment || (BigInt(lot.nativeOutflowRaw) > 0n ? 1 : 0) + lot.tokenOutflows.length !== 1) fail('not a single-payment purchase');
        if (BigInt(lot.nativeOutflowRaw) > 0n) {
          if (kind === 'native') fail('self payment');
          basisUsd += pricedUsd(lot.nativeOutflowRaw, 18, lot.nativePrice, 'native', lot.acquiredAt);
        } else {
          const p = lot.tokenOutflows[0];
          if (p.assetId.toLowerCase() === assetId.toLowerCase()) fail('self/invalid payment');
          basisUsd += pricedUsd(p.amountRaw, p.decimals, p.historicalPrice, p.assetId, lot.acquiredAt);
        }
      } else fail('unsupported operation; transfer/bridge/wrapper is not a new basis');
    }
    if (!Number.isFinite(basisUsd) || basisUsd < 0) reasons.push('invalid/overflowing aggregate USD basis');
    if (quantity !== BigInt(holding.quantityRaw)) reasons.push('lot quantity does not equal current on-chain quantity');
  } catch (error) { reasons.push(error.message); }
  return { ok: reasons.length === 0, quantityRaw: quantity.toString(), basisUsd: reasons.length ? null : basisUsd, reasons };
}

function transfer(log) {
  if (typeof log?.topics?.[0] !== 'string' || log.topics[0].toLowerCase() !== TRANSFER || ![3, 4].includes(log.topics.length)) return null;
  if (typeof log.address !== 'string' || !ADDRESS.test(log.address) || !TOPIC.test(log.topics[1]) || !TOPIC.test(log.topics[2])
    || log.topics.length === 4 && (!TOPIC.test(log.topics[3]) || log.data !== '0x')
    || log.topics.length === 3 && (typeof log.data !== 'string' || !TOPIC.test(log.data))) fail('malformed Transfer event');
  return { contract: log.address.toLowerCase(), from: addressOf(log.topics[1]), to: addressOf(log.topics[2]),
    kind: log.topics.length === 4 ? 'nft' : 'token',
    tokenId: log.topics.length === 4 ? BigInt(log.topics[3]).toString() : null,
    quantityRaw: log.topics.length === 4 ? '1' : BigInt(log.data).toString(), log };
}
function walletTransfers(receipt) {
  return receipt.logs.map(transfer).filter(t => t && (t.from === WALLET || t.to === WALLET));
}
function referencesWallet(log) {
  const needle = WALLET.slice(2);
  return [...(Array.isArray(log?.topics) ? log.topics : []), log?.data]
    .some(value => typeof value === 'string' && value.toLowerCase().includes(needle));
}
function rejectUnsupportedWalletEvents(receipt, understood = new Set()) {
  if (!Array.isArray(receipt?.logs)) fail('missing receipt logs');
  for (const log of receipt.logs) {
    if (transfer(log) || understood.has(log)) continue;
    if (referencesWallet(log)) fail('unsupported wallet-affecting receipt event');
  }
}
export function decodeSeaportOrder(data) {
  if (!/^0x(?:[\da-f]{64})+$/i.test(data)) fail('malformed Seaport ABI');
  const words = data.slice(2).match(/.{64}/g);
  const num = index => {
    if (!words[index]) fail('truncated Seaport ABI');
    return BigInt(`0x${words[index]}`);
  };
  const list = (pointer, width) => {
    const offset = num(pointer);
    if (offset % 32n !== 0n || offset > BigInt(data.length)) fail('invalid Seaport ABI offset');
    const start = Number(offset / 32n), length = Number(num(start));
    if (!Number.isSafeInteger(length) || length < 1 || length > 1000) fail('invalid Seaport item count');
    return Array.from({ length }, (_, i) => {
      const p = start + 1 + i * width;
      return { itemType: Number(num(p)), token: addressOf(words[p + 1]), identifier: num(p + 2).toString(),
        amount: num(p + 3).toString(), ...(width === 5 ? { recipient: addressOf(words[p + 4]) } : {}) };
    });
  };
  return { recipient: addressOf(words[1]), offer: list(2, 4), consideration: list(3, 5) };
}

/** A Transfer alone is NOT purchase semantics. Decode the canonical settlement.
 * Exact msg.value = ETH consideration proves no refund/unallocated payment.
 * Only direct EOA→Seaport, a single acquired collection, and exact ERC20 receipt
 * outflows are admitted. Aggregators, other assets and ambiguous refunds fail.
 */
export function proveSeaportPurchase(tx, receipt, contract, tokenIds) {
  if (receipt.status !== '0x1' || receipt.transactionHash !== tx.hash || tx.from?.toLowerCase() !== WALLET
    || !SEAPORT.has(tx.to?.toLowerCase()) || typeof tx.value !== 'string' || !RPC_QUANTITY.test(tx.value)) {
    fail('not a successful direct Seaport purchase/value proof');
  }
  const settlementLogs = receipt.logs.filter(l => SEAPORT.has(l.address?.toLowerCase())
    && typeof l.topics?.[0] === 'string' && l.topics[0].toLowerCase() === ORDER_FULFILLED);
  const settlements = settlementLogs.map(l => decodeSeaportOrder(l.data));
  if (!settlements.length) fail('missing order settlement');
  if (settlements.some(s => s.recipient !== WALLET)) rejectAcquisition('other-recipient order settlement');
  rejectUnsupportedWalletEvents(receipt, new Set(settlementLogs));
  const offers = settlements.flatMap(s => s.offer);
  if (offers.some(o => o.itemType !== 2 || o.token !== contract || o.amount !== '1')) rejectAcquisition('multi-asset/non-ERC721 order');
  const expected = [...tokenIds].sort().join(',');
  if (offers.map(o => o.identifier).sort().join(',') !== expected) rejectAcquisition('order acquired IDs mismatch');
  const flows = walletTransfers(receipt);
  if (flows.filter(t => t.to === WALLET).some(t => t.kind !== 'nft' || t.contract !== contract)
    || flows.some(t => t.kind === 'nft' && t.from === WALLET)) rejectAcquisition('other acquired asset or NFT disposal in purchase');
  if (flows.filter(t => t.kind === 'nft' && t.to === WALLET).map(t => t.tokenId).sort().join(',') !== expected) rejectAcquisition('receipt acquired IDs mismatch');
  const payments = settlements.flatMap(s => s.consideration);
  if (payments.some(p => ![0, 1].includes(p.itemType) || p.recipient === WALLET || p.identifier !== '0'
    || p.itemType === 0 && p.token !== ZERO || BigInt(p.amount) <= 0n)) rejectAcquisition('unsupported order consideration');
  const native = sum(payments.filter(p => p.itemType === 0).map(p => p.amount));
  if (native !== BigInt(tx.value)) rejectAcquisition('msg.value differs from decoded ETH consideration; refund/extra-leg ambiguous');
  const tokenPayments = [];
  for (const token of new Set(payments.filter(p => p.itemType === 1).map(p => p.token))) {
    const expectedAmount = sum(payments.filter(p => p.token === token && p.itemType === 1).map(p => p.amount));
    const paid = sum(flows.filter(t => t.kind === 'token' && t.from === WALLET && t.contract === token).map(t => t.quantityRaw));
    if (paid !== expectedAmount) rejectAcquisition('ERC20 consideration differs from observed wallet outflows');
    tokenPayments.push({ assetId: token, amountRaw: paid.toString() });
  }
  if (flows.some(t => t.kind === 'token' && t.from === WALLET && !tokenPayments.some(p => p.assetId === t.contract))) rejectAcquisition('extra ERC20 outflow');
  if ((native > 0n ? 1 : 0) + tokenPayments.length !== 1) rejectAcquisition('not a single-payment purchase');
  return { nativeOutflowRaw: native.toString(), tokenPayments, acquiredAssetCount: offers.length };
}

export function traceNativeFlows(tx, receipt, trace) {
  if (!trace || trace.error || trace.from?.toLowerCase() !== tx.from?.toLowerCase()
    || trace.to?.toLowerCase() !== tx.to?.toLowerCase() || trace.input !== tx.input
    || BigInt(trace.value ?? '0x0') !== BigInt(tx.value)
    || BigInt(trace.gasUsed) !== BigInt(receipt.gasUsed)) fail('call trace/transaction/receipt mismatch');
  let outflow = 0n, inflow = 0n;
  function walk(call) {
    if (call.error) return; // Reverted subtree had no economic transfers.
    if (!['CALL', 'STATICCALL', 'DELEGATECALL', 'CALLCODE', 'CREATE', 'CREATE2', 'SELFDESTRUCT'].includes(call.type)) fail('unknown call trace type');
    if (['CALL', 'CREATE', 'CREATE2', 'SELFDESTRUCT'].includes(call.type)) {
      const value = BigInt(call.value ?? '0x0'), from = call.from?.toLowerCase(), to = call.to?.toLowerCase();
      if (from === WALLET && to !== WALLET) outflow += value;
      if (to === WALLET && from !== WALLET) inflow += value;
    }
    for (const child of call.calls ?? []) walk(child);
  }
  for (const movement of [...(trace.beforeEVMTransfers ?? []), ...(trace.afterEVMTransfers ?? [])]) {
    if (!['feePayment', 'gasRefund', 'feeCollection'].includes(movement.purpose)) fail('unattributed protocol native transfer');
  }
  walk(trace);
  return { outflowRaw: outflow.toString(), inflowRaw: inflow.toString() };
}

export class SourceClient {
  constructor({ outDir, request, fetchImpl = fetch, sleepImpl = sleep } = {}) {
    this.outDir = outDir;
    this.fetch = fetchImpl;
    this.wait = sleepImpl;
    this.request = request ?? this.fetchJson.bind(this);
    this.memo = new Map();
    this.rhQueue = Promise.resolve();
    this.risks = [];
  }
  async save(name, data) {
    if (this.outDir) await writeOwnerOnly(path.join(this.outDir, name), JSON.stringify(data, null, 2) + '\n');
  }
  risk(message) { this.risks.push(message); console.log(`RISK ${message}`); }
  async fetchJson(url, options = {}) {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const response = await this.fetch(url, { ...options, signal: AbortSignal.timeout(90000) });
        if (!response.ok) {
          const error = new Error(`${new URL(url).host} HTTP ${response.status}`);
          error.permanent = response.status < 500 && response.status !== 429;
          error.rateLimited = response.status === 429;
          error.retryAfterMs = Math.max(0, Number(response.headers?.get('retry-after') ?? 0) * 1000);
          throw error;
        }
        const data = await response.json();
        if (this.outDir) await writeOwnerOnly(path.join(this.outDir, 'responses.jsonl'), JSON.stringify({
          at: new Date().toISOString(), url, request: options.body ? JSON.parse(options.body) : undefined, data,
        }) + '\n', true); // Headers/credentials deliberately never logged.
        if (data.error) {
          const error = new Error(`${new URL(url).host}: ${JSON.stringify(data.error)}`);
          error.permanent = data.error.code === -32601 || /revert|not available|metadata is not found|missing trie node/i.test(data.error.message);
          throw error;
        }
        return data;
      } catch (error) {
        if (error.permanent || attempt === 5) throw error;
        const delay = Math.max(error.retryAfterMs || 0, error.rateLimited ? 10000 * (2 ** attempt) : 2000 * (attempt + 1));
        console.log(`RETRY ${new URL(url).host}: ${error.message}; backoff=${delay}ms`);
        await this.wait(delay);
      }
    }
  }
  async rpc(url, method, params) {
    const action = async () => {
      const result = await this.request(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      return result.result;
    };
    if (url !== RH_RPC) return action();
    // Single queue prevents concurrent requests from defeating RH's throttle.
    const pending = this.rhQueue.then(async () => { await this.wait(1500); return action(); });
    this.rhQueue = pending.catch(() => {});
    return pending;
  }
  async pages(base, { field = 'items', cursor = 'next_page_params', headers = {} } = {}) {
    let url = base;
    const items = [], seen = new Set();
    for (let page = 0; page < 1000; page++) {
      if (seen.has(url)) fail('repeated pagination cursor');
      seen.add(url);
      const data = await this.request(url, { headers });
      if (!Array.isArray(data[field])) fail(`missing ${field} array from ${new URL(base).host}`);
      items.push(...data[field]);
      const next = data[cursor];
      if (next == null || next === '') return items;
      const target = new URL(base);
      if (typeof next === 'string') target.searchParams.set('next', next);
      else for (const [key, value] of Object.entries(next)) target.searchParams.set(key, String(value));
      url = target.toString();
    }
    fail('pagination cap reached; history incomplete');
  }
  async cached(key, fn) {
    if (!this.memo.has(key)) this.memo.set(key, Promise.resolve().then(fn));
    return this.memo.get(key); // Memory only, scoped to THIS live run.
  }
  async transaction(chain, hash) {
    if (!HASH.test(hash)) fail('invalid transaction hash');
    return this.cached(`${chain.id}:${hash}`, async () => {
      let [tx, receipt] = await Promise.all([
        this.rpc(chain.rpc, 'eth_getTransactionByHash', [hash]), this.rpc(chain.rpc, 'eth_getTransactionReceipt', [hash]),
      ]);
      // PublicNode can return null for Ethereum history that is present on dRPC.
      // Accept only the correct chain and a receipt canonical on the PRIMARY RPC.
      if ((!tx || !receipt) && chain.id === 1) {
        const archive = 'https://eth.drpc.org';
        await this.cached(`archive:${archive}`, async () => {
          if (Number(BigInt(await this.rpc(archive, 'eth_chainId', []))) !== chain.id) fail('archive chain identity mismatch');
          console.log(`SOURCE supplemental Ethereum transaction history: ${archive}; chainId=${chain.id}`);
        });
        [tx, receipt] = await Promise.all([
          this.rpc(archive, 'eth_getTransactionByHash', [hash]), this.rpc(archive, 'eth_getTransactionReceipt', [hash]),
        ]);
      }
      if (!tx || !receipt || receipt.status !== '0x1' || receipt.transactionHash !== hash
        || tx.hash !== hash || tx.blockHash !== receipt.blockHash) fail(`missing/failed/reorged receipt ${hash}`);
      const block = await this.cached(`${chain.id}:block:${receipt.blockNumber}`, () => this.rpc(chain.rpc, 'eth_getBlockByNumber', [receipt.blockNumber, false]));
      if (!block || block.hash !== receipt.blockHash) fail('receipt is not canonical at collection');
      return { tx, receipt, block, acquiredAt: new Date(Number(BigInt(block.timestamp)) * 1000).toISOString() };
    });
  }
  async price(acquiredAt, assetId = 'native', chainId = 4663) {
    const chainName = { 1: 'ethereum', 8453: 'base', 42161: 'arbitrum', 4663: 'robinhood' }[chainId];
    const coin = assetId === 'native' ? LLAMA_ETH : `${chainName}:${assetId}`;
    const seconds = Math.floor(Date.parse(acquiredAt) / 1000);
    return this.cached(`price:${coin}:${seconds}`, async () => {
      const data = await this.request(`https://coins.llama.fi/prices/historical/${seconds}/${coin}`);
      const quote = data.coins?.[coin];
      if (!quote || !(quote.price > 0) || !Number.isFinite(quote.timestamp)
        || Math.abs(quote.timestamp - seconds) > 3600) fail(`missing historical quote for ${coin} at ${acquiredAt}`);
      if (assetId !== 'native') this.risk(`non-ETH consideration priced via DefiLlama ${coin}`);
      return { provider: 'defillama-historical', assetId, timestamp: new Date(quote.timestamp * 1000).toISOString(), priceUsd: quote.price };
    });
  }
  async nativeFlows(chain, proof) {
    if (chain.id !== 4663) {
      const code = await this.rpc(chain.rpc, 'eth_getCode', [WALLET, proof.receipt.blockNumber]);
      if (code !== '0x') fail('delegated wallet needs full historical trace');
      return { outflowRaw: proof.tx.from.toLowerCase() === WALLET ? BigInt(proof.tx.value).toString() : '0', inflowRaw: '0' };
    }
    // Official RH RPC is still the inventory/receipt source. Supplemental read-
    // only archive endpoints are verified against its chain ID AND block hash.
    // Discovery: docs.robinhood.com/chain/connecting + dRPC/Chainlist, 2026-09-12.
    let last;
    for (const url of ['https://robinhood.drpc.org', 'https://rpc-robinhood.blockmachine.io']) {
      try {
        await this.cached(`archive:${url}`, async () => {
          if (Number(BigInt(await this.rpc(url, 'eth_chainId', []))) !== chain.id) fail('archive chain identity mismatch');
          console.log(`SOURCE supplemental historical call traces: ${url}; chainId=${chain.id}`);
        });
        const block = await this.rpc(url, 'eth_getBlockByNumber', [proof.receipt.blockNumber, false]);
        if (block?.hash !== proof.receipt.blockHash) fail('archive block differs from official receipt');
        const trace = await this.rpc(url, 'debug_traceTransaction', [proof.tx.hash, { tracer: 'callTracer' }]);
        return traceNativeFlows(proof.tx, proof.receipt, trace);
      } catch (error) { last = error; this.risk(`historical trace ${url}: ${error.message}`); }
    }
    throw last;
  }
  async call(chain, contract, data, block = chain.head) {
    if (typeof block !== 'string' || !RPC_QUANTITY.test(block)) fail('invalid eth_call block tag');
    return this.rpc(chain.rpc, 'eth_call', [{ to: contract, data }, block]);
  }
}

async function scanRh(client, chain) {
  const logs = new Map();
  const head = Number(BigInt(chain.head));
  for (let start = 0; start <= head; start += 5000000) {
    const end = Math.min(start + 4999999, head);
    for (const topics of [[TRANSFER, null, `0x${pad(WALLET)}`], [TRANSFER, `0x${pad(WALLET)}`]]) {
      const batch = await client.rpc(chain.rpc, 'eth_getLogs', [{ fromBlock: hex(start), toBlock: hex(end), topics }]);
      if (!Array.isArray(batch)) fail('missing RPC log array');
      for (const log of batch) {
        if (log.removed || BigInt(log.blockNumber) > BigInt(chain.head)) fail('noncanonical/out-of-range log');
        logs.set(`${log.transactionHash}:${log.logIndex}`, log);
      }
    }
    await client.save('rh-transfer-history.json', { head: chain.head, scannedThrough: end, complete: end === head, logs: [...logs.values()] });
    console.log(`RH history blocks ${start}..${end}: ${logs.size} distinct transfers`);
  }
  return [...logs.values()].sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || Number(BigInt(a.logIndex) - BigInt(b.logIndex)));
}

export function proveFreeMint(tx, receipt, contract) {
  if (receipt.status !== '0x1' || receipt.transactionHash !== tx.hash) fail('mint has failed/unproven receipt');
  if (tx.from?.toLowerCase() !== WALLET || typeof tx.value !== 'string'
    || !RPC_QUANTITY.test(tx.value)) {
    fail('mint is not a wallet-initiated zero-value transaction; payment/gift ambiguous');
  }
  if (BigInt(tx.value) !== 0n) rejectAcquisition('mint has proved native payment');
  rejectUnsupportedWalletEvents(receipt);
  const flows = walletTransfers(receipt), incoming = flows.filter(t => t.to === WALLET);
  if (!incoming.length || incoming.some(t => t.contract !== contract || t.from !== ZERO)) fail('not a decoded zero-address mint');
  if (flows.some(t => t.from === WALLET)) rejectAcquisition('mint has payment/unproven receipt');
  return { operation: 'mint', nativeOutflowRaw: '0', tokenOutflows: [], allPaymentLegsObserved: true };
}
function emptyEvidence(holding) {
  return { source: holding.kind === 'nft' ? 'opensea-v2' : holding.chainId === 4663 ? 'rpc' : 'blockscout-v2',
    chainId: holding.chainId, assetId: holding.assetId, decimals: holding.decimals, complete: true, hasDisposals: false, lots: [] };
}
function groupBy(values, key) {
  const groups = new Map();
  for (const value of values) { const k = key(value); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(value); }
  return groups;
}
export async function tokenDecimalsAt(client, chain, contract, block) {
  if (typeof contract !== 'string' || !ADDRESS.test(contract) || typeof block !== 'string' || !RPC_QUANTITY.test(block)) {
    fail('invalid token decimals request');
  }
  const raw = await client.call(chain, contract, '0x313ce567', block);
  if (typeof raw !== 'string' || !RPC_QUANTITY.test(raw)) fail('missing token decimals');
  const value = BigInt(raw);
  if (value > 36n) fail('unsupported token decimals');
  return Number(value);
}

async function nftHoldings(client, rh, nfts, logs) {
  const result = [];
  const deduped = [...new Map(nfts.map(n => [`${n.contract}:${n.identifier}`, n])).values()];
  if (nfts.length !== deduped.length) client.risk('duplicate OpenSea inventory entries deduplicated');
  for (const [slug, items] of groupBy(deduped, n => n.collection)) {
    const contracts = [...new Set(items.map(n => n.contract.toLowerCase()))];
    const holding = { kind: 'nft', chainId: 4663, assetId: slug, decimals: 0, quantityRaw: String(items.length), tokenIds: items.map(n => n.identifier), contract: contracts[0], errors: [] };
    try {
      if (!slug || contracts.length !== 1 || !ADDRESS.test(holding.contract) || items.some(n => n.token_standard !== 'erc721')) fail('unsupported multi-contract/1155 collection');
      const balance = await client.call(rh, holding.contract, `0x70a08231${pad(WALLET)}`);
      holding.quantityRaw = BigInt(balance).toString();
      if (BigInt(balance) !== BigInt(items.length)) fail('OpenSea inventory does not match pinned on-chain NFT balance');
      for (const item of items) {
        const owner = await client.call(rh, holding.contract, `0x6352211e${BigInt(item.identifier).toString(16).padStart(64, '0')}`);
        if (addressOf(owner) !== WALLET) fail(`ownerOf(${item.identifier}) does not match inventory`);
      }
    } catch (error) { holding.errors.push(error.message); }
    holding.transfers = logs?.map(transfer).filter(t => t && t.contract === holding.contract) ?? [];
    if (!logs) holding.errors.push('RH full transfer history unavailable');
    result.push(holding);
  }
  console.log(`OpenSea inventory: ${deduped.length} NFTs / ${result.length} collection keys`);
  return result;
}

export async function rhTokens(client, rh, logs, nftContracts = new Set()) {
  if (!logs) return [];
  const result = [];
  for (const [contract, contractLogs] of groupBy(logs, l => l.address.toLowerCase())) {
    if (nftContracts.has(contract)) continue;
    const history = contractLogs.map(transfer).filter(t => t?.kind === 'token');
    const holding = { kind: 'token', chainId: 4663, assetId: contract, contract, decimals: null, quantityRaw: null, transfers: history, errors: [] };
    try {
      const balance = await client.call(rh, contract, `0x70a08231${pad(WALLET)}`);
      holding.quantityRaw = BigInt(balance).toString();
      if (BigInt(balance) === 0n) continue;
      holding.decimals = await tokenDecimalsAt(client, rh, contract, rh.head);
      if (history.length !== contractLogs.length) holding.errors.push('nonstandard indexed-quantity Transfer; full raw quantity history unsupported');
    } catch (error) { holding.errors.push(`balance/decimals: ${error.message}`); }
    result.push(holding);
  }
  console.log(`RH live ERC20 inventory: ${result.length} nonzero or unavailable keys (no allowlist)`);
  return result;
}

export async function recoverNfts(client, chain, candidates, logs, key) {
  const recovered = [];
  if (!key || !logs) return recovered;
  for (const candidate of candidates.filter(c => c.decimals === null && c.quantityRaw !== null)) {
    const heldIds = new Set();
    for (const flow of logs.map(transfer).filter(t => t?.kind === 'nft' && t.contract === candidate.contract)) {
      if (flow.from === WALLET) heldIds.delete(flow.tokenId);
      if (flow.to === WALLET) heldIds.add(flow.tokenId);
    }
    const items = [];
    try {
      if (BigInt(heldIds.size) !== BigInt(candidate.quantityRaw) || !heldIds.size) continue;
      for (const id of heldIds) {
        const data = await client.request(`https://api.opensea.io/api/v2/chain/robinhood/contract/${candidate.contract}/nfts/${id}`, { headers: { 'X-API-KEY': key } });
        const nft = data.nft;
        if (nft?.token_standard !== 'erc721' || nft.contract?.toLowerCase() !== candidate.contract || nft.identifier !== id || !nft.collection) fail('NFT metadata identity mismatch');
        const owner = await client.call(chain, candidate.contract, `0x6352211e${BigInt(id).toString(16).padStart(64, '0')}`);
        if (addressOf(owner) !== WALLET) fail('recovered NFT ownerOf mismatch');
        items.push(nft);
      }
      recovered.push(...items);
      client.risk(`OpenSea account inventory omitted ${candidate.contract}; recovered ${items.length} ERC721 via OpenSea item metadata + pinned ownerOf`);
    } catch (error) { client.risk(`unclassified contract ${candidate.contract}: ${error.message}`); }
  }
  return recovered;
}

export async function scoutTokens(client, chain) {
  const items = await client.pages(`${chain.scout}/addresses/${WALLET}/tokens?type=ERC-20`);
  const holdings = [];
  for (const item of items) {
    if (item.token?.type !== 'ERC-20') continue;
    const contract = item.token.address_hash?.toLowerCase();
    const holding = { kind: 'token', chainId: chain.id, assetId: contract, contract, decimals: null, quantityRaw: null, errors: [] };
    try {
      if (!ADDRESS.test(contract)) fail('invalid token contract');
      holding.quantityRaw = BigInt(await client.call(chain, contract, `0x70a08231${pad(WALLET)}`)).toString();
      if (BigInt(holding.quantityRaw) === 0n) continue;
      holding.decimals = await tokenDecimalsAt(client, chain, contract, chain.head);
      const history = await client.pages(`${chain.scout}/addresses/${WALLET}/token-transfers?type=ERC-20&token=${contract}`);
      const hashes = [...new Set(history.filter(t => t.token?.address_hash?.toLowerCase() === contract).map(t => t.transaction_hash))];
      const flows = [];
      for (const hash of hashes) {
        const { receipt } = await client.transaction(chain, hash);
        if (BigInt(receipt.blockNumber) > BigInt(chain.head)) fail('token transfer receipt above pinned head');
        const targetTransfers = receipt.logs.filter(log => log.address?.toLowerCase() === contract
          && typeof log.topics?.[0] === 'string' && log.topics[0].toLowerCase() === TRANSFER);
        if (targetTransfers.some(log => log.topics.length !== 3)) fail('four-topic/non-ERC20 target token Transfer');
        const observed = walletTransfers(receipt).filter(t => t.contract === contract);
        if (observed.some(t => t.kind !== 'token')) fail('non-ERC20 target token Transfer');
        flows.push(...observed);
      }
      holding.transfers = flows;
    } catch (error) { holding.errors.push(error.message); }
    holdings.push(holding);
  }
  return holdings;
}

export async function acquireHolding(client, chain, holding, sales) {
  const evidence = emptyEvidence(holding), reasons = [...holding.errors];
  let reauditedRejected = false;
  const flows = holding.transfers ?? [];
  if (['nft', 'token'].includes(holding.kind) && flows.some(flow => flow.kind !== holding.kind)) {
    reasons.push('target Transfer shape does not match holding kind');
  }
  const inbound = flows.filter(t => t.to === WALLET && t.from !== WALLET);
  const outgoing = flows.filter(t => t.from === WALLET && t.to !== WALLET);
  if (outgoing.length) { evidence.hasDisposals = true; reasons.push(`${outgoing.length} observed disposal/outflow(s); no FIFO or surviving-lot guess`); }
  const net = sum(inbound.map(t => t.quantityRaw)) - sum(outgoing.map(t => t.quantityRaw));
  if (holding.quantityRaw === null || net.toString() !== holding.quantityRaw) reasons.push(`transfer history net ${net} does not reconcile to balance (rebase/wrap/missing history)`);
  const acquisitionGroups = groupBy(inbound, t => t.log.transactionHash);
  for (const [hash, arrivals] of acquisitionGroups) {
    if (holding.kind === 'nft' && arrivals.length > 1) client.risk(`${holdingKey(holding)} observed batch ${hash}: ${arrivals.length} units (even if excluded)`);
  }
  if (reasons.length) return { holding, evidence: { ...evidence, complete: false, hasDisposals: true }, reasons,
    reauditedRejected: holding.errors.length === 0 && Array.isArray(holding.transfers) };
  for (const [hash, arrivals] of acquisitionGroups) {
    try {
      if (holding.kind === 'token' && arrivals.some(t => t.from !== ZERO)) fail('ERC20 non-mint inflow lacks supported decoded purchase/claim semantics');
      const proofOfTx = await client.transaction(chain, hash);
      const { tx, receipt, acquiredAt } = proofOfTx;
      const receiptFlows = walletTransfers(receipt).filter(t => t.contract === holding.contract && t.to === WALLET && t.from !== WALLET);
      if (sum(receiptFlows.map(t => t.quantityRaw)) !== sum(arrivals.map(t => t.quantityRaw))) fail('history inflow differs from receipt');
      const lot = { transactionHash: hash, acquiredAt, quantityRaw: sum(arrivals.map(t => t.quantityRaw)).toString(),
        operation: 'unknown', success: true, allPaymentLegsObserved: false,
        acquiredAssetCount: holding.kind === 'nft' ? arrivals.length : 1, nativeOutflowRaw: '0', nativePrice: null, tokenOutflows: [] };
      if (arrivals.every(t => t.from === ZERO)) {
        Object.assign(lot, proveFreeMint(tx, receipt, holding.contract));
      } else if (holding.kind === 'nft') {
        const proof = proveSeaportPurchase(tx, receipt, holding.contract, arrivals.map(t => t.tokenId));
        const events = sales.filter(s => s.transaction === hash && s.buyer?.toLowerCase() === WALLET && s.nft?.collection === holding.assetId);
        const ids = [...new Set(events.map(s => s.nft.identifier))].sort().join(',');
        if (ids !== arrivals.map(t => t.tokenId).sort().join(',')) fail('OpenSea sale provenance missing/mismatched acquired IDs');
        lot.operation = 'purchase';
        lot.allPaymentLegsObserved = true;
        lot.nativeOutflowRaw = proof.nativeOutflowRaw;
        lot.acquiredAssetCount = proof.acquiredAssetCount;
        if (BigInt(proof.nativeOutflowRaw) > 0n) lot.nativePrice = await client.price(acquiredAt);
        for (const p of proof.tokenPayments) {
          const decimals = await tokenDecimalsAt(client, chain, p.assetId, receipt.blockNumber);
          lot.tokenOutflows.push({ ...p, decimals, historicalPrice: await client.price(acquiredAt, p.assetId, chain.id) });
        }
        if (lot.acquiredAssetCount > 1) client.risk(`${holdingKey(holding)} batch ${hash}: ${lot.acquiredAssetCount} units; ONE lot/full payment`);
      } else {
        // Transfer logs + tx.value cannot distinguish swap, wrapper, reward or
        // an unrelated gift. No generic "buy" or free-airdrop heuristic.
        fail('ERC20 non-mint inflow lacks supported decoded purchase/claim semantics');
      }
      const native = await client.nativeFlows(chain, proofOfTx);
      if (!isRaw(native?.outflowRaw) || !isRaw(native?.inflowRaw)) fail('historical native flows unavailable/invalid raw units');
      if (BigInt(native.outflowRaw) !== BigInt(lot.nativeOutflowRaw) || BigInt(native.inflowRaw) !== 0n) {
        rejectAcquisition('historical trace has extra native payment/refund; all payment legs not clean');
      }
      evidence.lots.push(lot);
    } catch (error) {
      // Missing source legs cannot revoke stored evidence. A proved contradiction can.
      if (error instanceof AuditedRejection) reauditedRejected = true;
      reasons.push(`${hash}: ${error.message}`);
    }
  }
  evidence.complete = reasons.length === 0;
  if (reasons.length) evidence.hasDisposals = true;
  return { holding, evidence, reasons, reauditedRejected };
}

/** Bridge-data decoding is a provenance hint verified in the successful tx,
 * never permission to reset basis at the destination's arrival price.
 */
export function decodedInternalBridge(tx) {
  const bridge = tx.decoded_input?.parameters?.find(p => p.name === '_bridgeData')?.value;
  if (tx.from?.hash?.toLowerCase() !== WALLET || tx.to?.hash?.toLowerCase() !== '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae'
    || !Array.isArray(bridge) || bridge[3]?.toLowerCase() !== ZERO || bridge[4]?.toLowerCase() !== ZERO
    || bridge[5]?.toLowerCase() !== WALLET || ![1, 8453, 42161, 4663].includes(Number(bridge[7]))) return null;
  return { transactionHash: tx.hash, destinationChainId: Number(bridge[7]), minimumAmountRaw: bridge[6], bridge: bridge[1] };
}

function blockNumber(value, label) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) fail(`invalid ${label}`);
    return BigInt(value);
  }
  if (typeof value !== 'string' || !(/^(?:0x[\da-f]+|\d+)$/i.test(value))) fail(`invalid ${label}`);
  return BigInt(value);
}
export function proveBlockscoutFunding(indexed, proof, head) {
  const indexedFrom = indexed?.from?.hash;
  const indexedTo = indexed?.to?.hash;
  if (typeof indexed?.hash !== 'string' || !HASH.test(indexed.hash) || indexed.status !== 'ok'
    || typeof indexedFrom !== 'string' || typeof indexedTo !== 'string' || !ADDRESS.test(indexedFrom) || !ADDRESS.test(indexedTo)
    || indexedFrom.toLowerCase() === WALLET || indexedFrom.toLowerCase() === ZERO || indexedTo.toLowerCase() !== WALLET
    || !isRaw(indexed.value) || BigInt(indexed.value) <= 0n) fail('invalid Blockscout funding record');
  const { tx, receipt } = proof ?? {};
  if (!tx || !receipt || typeof tx.hash !== 'string' || typeof receipt.transactionHash !== 'string'
    || typeof tx.from !== 'string' || typeof tx.to !== 'string'
    || tx.hash.toLowerCase() !== indexed.hash.toLowerCase() || receipt.transactionHash.toLowerCase() !== indexed.hash.toLowerCase()
    || receipt.status !== '0x1' || tx.from.toLowerCase() !== indexedFrom.toLowerCase()
    || tx.to.toLowerCase() !== indexedTo.toLowerCase() || typeof tx.value !== 'string'
    || !RPC_QUANTITY.test(tx.value) || BigInt(tx.value) !== BigInt(indexed.value)) fail('Blockscout/RPC funding identity mismatch');
  if (typeof tx.blockNumber !== 'string' || !RPC_QUANTITY.test(tx.blockNumber)
    || typeof receipt.blockNumber !== 'string' || !RPC_QUANTITY.test(receipt.blockNumber)
    || typeof head !== 'string' || !RPC_QUANTITY.test(head)) fail('invalid Blockscout/RPC funding block');
  const indexedBlock = blockNumber(indexed.block_number, 'Blockscout funding block');
  const receiptBlock = blockNumber(receipt.blockNumber, 'funding receipt block');
  if (blockNumber(tx.blockNumber, 'funding transaction block') !== receiptBlock
    || indexedBlock !== receiptBlock || receiptBlock > blockNumber(head, 'pinned head')) fail('Blockscout/RPC funding block mismatch');
  return { from: indexedFrom.toLowerCase(), to: indexedTo.toLowerCase(), quantityRaw: indexed.value, blockNumber: receipt.blockNumber };
}

/** Owner-approved pooled WAC, not surviving acquisition lots or tax basis.
 * All eligible observed funding is included. One missing price fails the pool.
 * Internal bridges are separately audited and never enter this function twice.
 */
export function nativeArrivalBasis(holding, arrivals) {
  if (!Array.isArray(arrivals) || !arrivals.length) fail('no proven funding arrivals');
  const seen = new Set();
  let totalRaw = 0n, totalUsd = 0, latest;
  for (const arrival of arrivals) {
    if (!SUPPORTED_CHAINS.has(arrival.chainId) || typeof arrival.transactionHash !== 'string'
      || !HASH.test(arrival.transactionHash) || typeof arrival.acquiredAt !== 'string'
      || !Number.isFinite(Date.parse(arrival.acquiredAt)) || Date.parse(arrival.acquiredAt) > Date.now()
      || !isRaw(arrival.quantityRaw) || BigInt(arrival.quantityRaw) <= 0n) fail('invalid funding arrival');
    const key = `${arrival.chainId}:${arrival.transactionHash.toLowerCase()}:${arrival.index ?? 'direct'}`;
    if (seen.has(key)) fail('duplicate funding arrival');
    seen.add(key);
    totalRaw += BigInt(arrival.quantityRaw);
    totalUsd += pricedUsd(arrival.quantityRaw, 18, arrival.nativePrice, 'native', arrival.acquiredAt);
    if (!latest || Date.parse(arrival.acquiredAt) > Date.parse(latest.acquiredAt)) latest = arrival;
  }
  const totalEth = units(totalRaw.toString(), 18), wacUsd = totalUsd / totalEth;
  if (!Number.isFinite(totalUsd) || !Number.isFinite(totalEth) || !(wacUsd > 0) || !Number.isFinite(wacUsd)) fail('invalid arrival WAC');
  const evidence = emptyEvidence(holding);
  // complete/hasDisposals describe this convention-sized holding lot, NOT an
  // assertion that the wallet never spent ETH or that RH history is complete.
  evidence.lots = [{ operation: 'funding-arrival', quantityRaw: holding.quantityRaw,
    transactionHash: latest.transactionHash, acquiredAt: latest.acquiredAt,
    nativeOutflowRaw: '0', tokenOutflows: [], allPaymentLegsObserved: true, success: true, acquiredAssetCount: 1,
    nativePrice: { provider: 'defillama-historical', assetId: LLAMA_ETH, timestamp: latest.acquiredAt, priceUsd: wacUsd } }];
  return { evidence, arrivalCount: arrivals.length, totalRaw: totalRaw.toString(), totalEth, totalUsd, wacUsd };
}

/** Complete paginated indexer discovery; every candidate is kept in the audit.
 * Direct simple external funding is priced under the owner rule. Complex
 * internal arrivals without funding attribution stay excluded, never guessed.
 */
export async function collectNativeHistory(client, chain) {
  const arrivals = [], bridges = [], excluded = [];
  if (!chain.scout) {
    try { await client.rpc(chain.rpc, 'trace_filter', [{ fromBlock: '0x0', toBlock: chain.head, toAddress: [WALLET], count: 1 }]); }
    catch (error) { client.risk(`chain ${chain.id} native history unavailable: ${error.message}`); }
    client.risk(`chain ${chain.id}: no exhaustive native index; source-chain bridge receipts are supplementary, not full RH funding history`);
    return { arrivals, bridges, excluded };
  }
  let transactions = [], internals = [];
  for (const endpoint of ['transactions', 'internal-transactions']) {
    try {
      const items = await client.pages(`${chain.scout}/addresses/${WALLET}/${endpoint}`);
      if (endpoint === 'transactions') transactions = items; else internals = items;
      console.log(`SOURCE Blockscout ${chain.id} ${endpoint}: ${items.length}; pagination exhausted`);
    } catch (error) { client.risk(`chain ${chain.id} ${endpoint}: ${error.message}`); }
  }
  for (const indexed of transactions) {
    const from = indexed.from?.hash?.toLowerCase(), to = indexed.to?.hash?.toLowerCase();
    try {
      if (blockNumber(indexed.block_number, 'indexed block') > BigInt(chain.head)) continue;
      if (from === WALLET && indexed.status === 'ok' && isRaw(indexed.value) && BigInt(indexed.value) > 0n) {
        // Every native-valued source outflow is probed for bridge provenance,
        // not just one router or a list of manually selected transaction hashes.
        bridges.push({ sourceChainId: chain.id, transactionHash: indexed.hash, indexed });
        continue;
      }
      if (to !== WALLET || from === WALLET || indexed.status !== 'ok' || indexed.value === '0') continue;
      const proof = await client.transaction(chain, indexed.hash);
      const bound = proveBlockscoutFunding(indexed, proof, chain.head);
      if (!Number.isFinite(Date.parse(proof.acquiredAt)) || Date.parse(proof.acquiredAt) > Date.now()) fail('invalid/future arrival date');
      // The canonical transaction already proves sender, recipient and ETH value.
      // Sender code at that old block adds no arrival proof and may be pruned.
      // Known same-wallet bridge payouts are removed before pooling below.
      if (proof.tx.input !== '0x' || !Array.isArray(proof.receipt.logs) || proof.receipt.logs.length) {
        fail('contract/bridge/complex arrival not an external funding proof');
      }
      arrivals.push({ chainId: chain.id, transactionHash: indexed.hash, acquiredAt: proof.acquiredAt,
        quantityRaw: bound.quantityRaw, included: true, reason: 'external funding; owner arrival convention', nativePrice: null });
    } catch (error) { excluded.push({ chainId: chain.id, transactionHash: indexed.hash, reason: error.message }); }
  }
  for (const indexed of internals) {
    const hash = indexed.transaction_hash;
    try {
      if (indexed.to?.hash?.toLowerCase() !== WALLET || indexed.from?.hash?.toLowerCase() === WALLET
        || indexed.success !== true || indexed.value === '0') continue;
      if (!HASH.test(hash) || !isRaw(indexed.value) || BigInt(indexed.value) <= 0n) fail('invalid internal arrival identity/amount');
      if (blockNumber(indexed.block_number, 'internal block') > BigInt(chain.head)) continue;
      const proof = await client.transaction(chain, hash);
      if (BigInt(proof.receipt.blockNumber) !== blockNumber(indexed.block_number, 'internal block')) fail('internal receipt block mismatch');
      if (!Number.isFinite(Date.parse(proof.acquiredAt)) || Date.parse(proof.acquiredAt) > Date.now()) fail('invalid/future internal date');
      arrivals.push({ chainId: chain.id, transactionHash: hash, index: indexed.index, acquiredAt: proof.acquiredAt,
        quantityRaw: indexed.value, included: false, reason: 'internal arrival: funding vs return/bridge attribution unproven', nativePrice: null });
    } catch (error) { excluded.push({ chainId: chain.id, transactionHash: hash, reason: error.message }); }
  }
  for (const arrival of arrivals) {
    try { arrival.nativePrice = await client.price(arrival.acquiredAt); }
    catch (error) {
      // Do NOT silently drop an expensive/unpriced funding leg from the WAC.
      client.risk(`arrival ${arrival.transactionHash} historical price unavailable: ${error.message}`);
      arrival.reason += `; missing historical quote: ${error.message}`;
    }
  }
  await client.save(`native-${chain.id}-history.json`, { transactions, internals, arrivals, bridges, excluded });
  return { arrivals, bridges, excluded };
}

/** LI.FI is transaction discovery only; neither its spot quote nor its amount
 * is evidence without a canonical source receipt and proved native delivery.
 */
export async function collectBridgeArrivals(client, chains, bridges, indexedArrivals = []) {
  const arrivals = [], excluded = [], seen = new Set();
  for (const bridge of bridges) {
    try {
      if (!HASH.test(bridge.transactionHash)) fail('invalid source bridge hash');
      const chain = chains.find(c => c.id === bridge.sourceChainId);
      const proof = await client.transaction(chain, bridge.transactionHash);
      if (proof.tx.from?.toLowerCase() !== WALLET || proof.tx.to?.toLowerCase() !== bridge.indexed.to?.hash?.toLowerCase()
        || proof.tx.input !== bridge.indexed.raw_input || BigInt(proof.tx.value).toString() !== bridge.indexed.value
        || BigInt(proof.receipt.blockNumber) !== blockNumber(bridge.indexed.block_number, 'bridge block')
        || BigInt(proof.receipt.blockNumber) > BigInt(chain.head)) fail('source bridge RPC/indexer mismatch');
      const status = await client.request(`https://li.quest/v1/status?txHash=${bridge.transactionHash}&fromChain=${chain.id}`);
      const receiving = status.receiving;
      if (status.status !== 'DONE' || status.fromAddress?.toLowerCase() !== WALLET || status.toAddress?.toLowerCase() !== WALLET
        || status.sending?.txHash?.toLowerCase() !== bridge.transactionHash.toLowerCase()
        || status.sending?.chainId !== chain.id || !HASH.test(receiving?.txHash)) fail('bridge destination not proven by status');
      const matches = indexedArrivals.filter(a => a.chainId === receiving.chainId
        && a.transactionHash.toLowerCase() === receiving.txHash.toLowerCase());
      // Known bridge provenance disqualifies matching funding even if its native
      // delivery cannot be proved. Do this before any destination-source reads.
      for (const arrival of matches) {
        arrival.included = false;
        arrival.reason = 'same-wallet bridge provenance; native delivery unproven';
      }
      const destination = chains.find(c => c.id === receiving.chainId && SUPPORTED_CHAINS.has(c.id));
      if (!destination) fail(`bridge destination ${receiving.chainId} unavailable/untracked`);
      if (receiving.token?.address?.toLowerCase() !== ZERO || !isRaw(receiving.amount) || BigInt(receiving.amount) <= 0n) fail('bridge did not deliver native ETH');
      const delivered = await client.transaction(destination, receiving.txHash);
      if (BigInt(delivered.receipt.blockNumber) > BigInt(destination.head)
        || !Number.isFinite(Date.parse(delivered.acquiredAt)) || Date.parse(delivered.acquiredAt) > Date.now()
        || Date.parse(delivered.acquiredAt) < Date.parse(proof.acquiredAt)) fail('invalid destination arrival block/date');
      let flow;
      if (destination.id !== 4663 && delivered.tx.to?.toLowerCase() === WALLET
        && delivered.tx.from?.toLowerCase() !== WALLET && delivered.tx.input === '0x'
        && typeof delivered.tx.value === 'string' && RPC_QUANTITY.test(delivered.tx.value)
        && Array.isArray(delivered.receipt.logs) && delivered.receipt.logs.length === 0) {
        // A canonical simple transfer to a nondelegated EOA proves native delivery
        // without relying on the non-RH payment-flow helper's zero inflow default.
        const code = await client.rpc(destination.rpc, 'eth_getCode', [WALLET, delivered.receipt.blockNumber]);
        if (code !== '0x') fail('delegated bridge recipient needs full historical trace');
        flow = { inflowRaw: BigInt(delivered.tx.value).toString(), outflowRaw: '0' };
      } else flow = await client.nativeFlows(destination, delivered);
      if (!isRaw(flow?.inflowRaw) || !isRaw(flow?.outflowRaw)
        || BigInt(flow.inflowRaw) !== BigInt(receiving.amount) || BigInt(flow.outflowRaw) !== 0n) fail('native delivery differs from status or has extra outflow');
      const key = `${destination.id}:${receiving.txHash.toLowerCase()}`;
      if (seen.has(key)) fail('duplicate bridge destination');
      seen.add(key);
      const arrival = { chainId: destination.id, transactionHash: receiving.txHash, acquiredAt: delivered.acquiredAt,
        quantityRaw: receiving.amount, sourceChainId: chain.id, sourceTransactionHash: bridge.transactionHash,
        included: false, reason: 'verified same-wallet bridge: original funding counted once, not a new cash exchange', nativePrice: null };
      if (matches.length) {
        for (const match of matches) Object.assign(match, { reason: arrival.reason,
          sourceChainId: chain.id, sourceTransactionHash: bridge.transactionHash });
      } else arrivals.push(arrival);
      // Diagnostic quote only. No bridge-arrival quote enters the funding WAC.
      arrival.nativePrice = await client.price(delivered.acquiredAt);
    } catch (error) { excluded.push({ sourceChainId: bridge.sourceChainId, transactionHash: bridge.transactionHash, reason: error.message }); }
  }
  return { arrivals, excluded };
}

/** Same CoinGecko quote and < $1 rule as live-data/dust-filter, for display
 * eligibility ONLY. Basis always uses fetched historical funding prices.
 */
export async function sizeNativeRows(client, chains, funding) {
  let spot = null;
  try { spot = (await client.request('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')).ethereum?.usd; }
  catch { /* Unknown spot must not turn into dust or a zero basis. */ }
  const rows = [];
  for (const chain of chains) {
    const holding = { kind: 'native', chainId: chain.id, assetId: 'native', decimals: 18, quantityRaw: null };
    const row = { holding, evidence: { ...emptyEvidence(holding), complete: false }, reasons: [] };
    try {
      const raw = await client.rpc(chain.rpc, 'eth_getBalance', [WALLET, chain.head]);
      if (typeof raw !== 'string' || !RPC_QUANTITY.test(raw)) fail('native balance unavailable');
      holding.quantityRaw = BigInt(raw).toString();
      if (!(spot > 0) || !Number.isFinite(spot)) fail('current ETH/USD unavailable for non-dust classification');
      holding.valueUsd = units(holding.quantityRaw, 18) * spot;
      if (!Number.isFinite(holding.valueUsd)) fail('invalid native current value');
      if (holding.valueUsd < 1) fail('dust: current native value below USD 1; no evidence row');
      const basis = nativeArrivalBasis(holding, funding);
      row.evidence = basis.evidence;
      row.wac = { arrivalCount: basis.arrivalCount, totalRaw: basis.totalRaw, totalEth: basis.totalEth, totalUsd: basis.totalUsd, wacUsd: basis.wacUsd };
    } catch (error) { row.reasons.push(error.message); }
    rows.push(row);
  }
  return rows;
}

function managedBasisKey(key) {
  return typeof key === 'string' && (
    /^native:(?:1|8453|42161|4663):.*$/.test(key)
    || /^token:(?:1|8453|42161|4663):.*$/.test(key)
    || /^nft:4663:.*$/.test(key)
  );
}
export function managedInvalidationKeys(oldRows, accepted, reauditedRejected = []) {
  if (!Array.isArray(oldRows) || !Array.isArray(accepted) || !Array.isArray(reauditedRejected)) fail('invalid invalidation inventory');
  const acceptedKeys = new Set(accepted.map(row => holdingKey(row.holding)));
  const rejected = new Set(reauditedRejected);
  return [...new Set(oldRows.map(row => row?.holding_key)
    .filter(key => managedBasisKey(key) && rejected.has(key) && !acceptedKeys.has(key)))];
}

export async function writeEvidence(sql, accepted, invalidateKeys) {
  for (const row of accepted) {
    const gate = validateEvidence(row.holding, row.evidence);
    if (!gate.ok) fail(`refusing invalid evidence ${holdingKey(row.holding)}: ${gate.reasons.join('; ')}`);
  }
  const keys = accepted.map(row => holdingKey(row.holding));
  if (new Set(keys).size !== keys.length || keys.some(key => invalidateKeys.includes(key))) fail('duplicate/conflicting writer keys');
  const statements = accepted.map(row => sql.query(`
    INSERT INTO basis_evidence (holding_key,evidence,source,collected_at) VALUES ($1,$2::jsonb,$3,now())
    ON CONFLICT (holding_key) DO UPDATE SET evidence=EXCLUDED.evidence, source=EXCLUDED.source, collected_at=EXCLUDED.collected_at
    RETURNING holding_key`, [holdingKey(row.holding), JSON.stringify(row.evidence), row.evidence.source]));
  // Known-invalid cache entries must not survive a subsequent failed gate.
  if (invalidateKeys.length) statements.push(sql.query('DELETE FROM basis_evidence WHERE holding_key = ANY($1::text[]) RETURNING holding_key', [invalidateKeys]));
  const results = statements.length ? await sql.transaction(statements) : [];
  const written = results.slice(0, accepted.length).flat().map(row => row.holding_key);
  if (written.length !== accepted.length) fail('writer RETURNING count mismatch');
  return { written, invalidated: invalidateKeys.length ? results.at(-1).map(row => row.holding_key) : [] };
}

async function database() {
  const text = await fs.readFile('/home/user/.hermes/credentials/portmanager_neon.env', 'utf8');
  const line = text.split(/\r?\n/).find(line => line.startsWith('DATABASE_URL='));
  if (!line) fail('DATABASE_URL line missing');
  const url = line.slice('DATABASE_URL='.length).trim().replace(/^(["'])(.*)\1$/, '$2');
  const sql = neon(url); // Never source the env, print its contents or import app seed code.
  const source = await fs.readFile(new URL('../lib/assets-db.ts', import.meta.url), 'utf8');
  const ddl = source.match(/export const BASIS_EVIDENCE_DDL = `([^`]+)`;/)?.[1];
  if (!ddl || !/CREATE TABLE IF NOT EXISTS basis_evidence/.test(ddl)) fail('BASIS_EVIDENCE_DDL missing');
  await sql.query(ddl);
  return sql;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const evidenceChecksum = evidence => createHash('sha256').update(JSON.stringify(canonical(evidence))).digest('hex');

export async function verifyFinalCanonicality(client, chains, rows) {
  // Pin check after lengthy history reads: a reorg invalidates all affected keys.
  for (const chain of chains) {
    try {
      const block = await client.rpc(chain.rpc, 'eth_getBlockByNumber', [chain.head, false]);
      if (block.hash !== chain.headHash) fail('pinned block reorged');
    } catch (error) {
      client.risk(`chain ${chain.id} final canonicality: ${error.message}`);
      // No deletion may be authorized by a run whose final canonicality failed.
      for (const row of rows) row.reauditedRejected = false;
      for (const row of rows.filter(r => r.holding.chainId === chain.id || r.holding.kind === 'native')) { row.evidence.complete = false; row.reasons.push(error.message); }
    }
  }
}

async function collectBasisEvidence({ outDir } = {}) {
  const startedAt = new Date().toISOString();
  outDir ??= path.join('/tmp', `portmanager-basis-${startedAt.replaceAll(':', '-')}`);
  await prepareAuditDirectory(outDir);
  const client = new SourceClient({ outDir });
  console.log(`READ-ONLY chain collection ${startedAt}; wallet=${WALLET}; artifacts=${outDir}`);
  console.log(`SINGLE-HOST serialization lock=${RUN_LOCK_DIR}; this is NOT a distributed or multi-host lock`);
  let openseaKey;
  try { openseaKey = (await fs.readFile('/home/user/.opensea_api_key', 'utf8')).trim(); }
  catch (error) { client.risk(`local OpenSea key unavailable: ${error.code}`); }
  const chains = [];
  for (const config of CHAINS) {
    try {
      const chainId = Number(BigInt(await client.rpc(config.rpc, 'eth_chainId', [])));
      if (chainId !== config.id) fail('RPC chain identity mismatch');
      const head = await client.rpc(config.rpc, 'eth_blockNumber', []);
      const block = await client.rpc(config.rpc, 'eth_getBlockByNumber', [head, false]);
      chains.push({ ...config, head, headHash: block.hash });
      console.log(`SOURCE chain ${config.id} RPC reachable; pinned block=${Number(BigInt(head))} hash=${block.hash}`);
    } catch (error) { client.risk(`chain ${config.id} RPC unavailable: ${error.message}`); }
  }
  const rh = chains.find(c => c.id === 4663), rows = [], holdings = [];
  let nfts = null, sales = [], logs = null;
  if (openseaKey) {
    try {
      nfts = await client.pages(`https://api.opensea.io/api/v2/chain/robinhood/account/${WALLET}/nfts?limit=200`, { field: 'nfts', cursor: 'next', headers: { 'X-API-KEY': openseaKey } });
      await client.save('opensea-current-nfts.json', nfts);
    } catch (error) { client.risk(`OpenSea inventory unavailable: ${error.message}`); }
    try {
      sales = await client.pages(`https://api.opensea.io/api/v2/events/accounts/${WALLET}?chain=robinhood&event_type=sale&limit=50`, { field: 'asset_events', cursor: 'next', headers: { 'X-API-KEY': openseaKey } });
      await client.save('opensea-sale-history.json', sales);
      console.log(`SOURCE OpenSea: ${nfts?.length ?? 'unknown'} current NFTs; ${sales.length} sale history entries; pagination exhausted`);
    } catch (error) { client.risk(`OpenSea sales unavailable: ${error.message}`); }
  }
  if (rh) {
    try { logs = await scanRh(client, rh); }
    catch (error) { client.risk(`RH full transfer scan incomplete: ${error.message}`); }
    const tokenInventory = await rhTokens(client, rh, logs, new Set((nfts ?? []).map(n => n.contract.toLowerCase())));
    const recovered = await recoverNfts(client, rh, tokenInventory, logs, openseaKey);
    await client.save('opensea-recovered-nfts.json', recovered);
    if (nfts || recovered.length) holdings.push(...await nftHoldings(client, rh, [...(nfts ?? []), ...recovered], logs));
    holdings.push(...tokenInventory.filter(t => !recovered.some(n => n.contract.toLowerCase() === t.contract)));
  }
  const nativeHistory = [];
  for (const chain of chains) {
    nativeHistory.push(await collectNativeHistory(client, chain));
    if (chain.scout) {
      try {
        const tokens = await scoutTokens(client, chain);
        holdings.push(...tokens);
        console.log(`SOURCE Blockscout ${chain.id}: ${tokens.length} current ERC20 holdings`);
      } catch (error) { client.risk(`Blockscout ${chain.id} token inventory unavailable: ${error.message}`); }
    }
  }
  const indexedArrivals = nativeHistory.flatMap(h => h.arrivals);
  const bridgeHistory = await collectBridgeArrivals(client, chains, nativeHistory.flatMap(h => h.bridges), indexedArrivals);
  const arrivals = [...indexedArrivals, ...bridgeHistory.arrivals]
    .sort((a, b) => Date.parse(a.acquiredAt) - Date.parse(b.acquiredAt) || a.transactionHash.localeCompare(b.transactionHash));
  const excludedArrivals = [...nativeHistory.flatMap(h => h.excluded), ...bridgeHistory.excluded];
  const funding = arrivals.filter(a => a.included);
  rows.push(...await sizeNativeRows(client, chains, funding));
  console.log('ARRIVAL TABLE (only included external funding enters pooled WAC)\n' +
    ['chain | date | transactionHash | ETH | historical USD/ETH | USD value | included? | reason',
      ...arrivals.map(a => [a.chainId, a.acquiredAt, a.transactionHash, units(a.quantityRaw, 18), a.nativePrice?.priceUsd ?? 'unknown',
        a.nativePrice ? units(a.quantityRaw, 18) * a.nativePrice.priceUsd : 'unknown', a.included, a.reason].join(' | '))].join('\n'));
  const wac = rows.find(r => r.wac)?.wac ?? null;
  console.log('NATIVE WAC ARITHMETIC ' + JSON.stringify(wac));
  console.log('ARRIVAL COUNTS ' + JSON.stringify(CHAINS.map(c => ({ chainId: c.id, observed: arrivals.filter(a => a.chainId === c.id).length,
    funding: funding.filter(a => a.chainId === c.id).length }))));
  console.log('EXCLUDED ARRIVAL CANDIDATES ' + JSON.stringify(excludedArrivals, null, 2));
  await client.save('native-arrivals.json', { arrivals, excludedArrivals, wac });
  // Missing chain balances still occupy explicit audit rows, not zero balances.
  for (const config of CHAINS.filter(c => !chains.some(live => live.id === c.id))) {
    const holding = { kind: 'native', chainId: config.id, assetId: 'native', decimals: 18, quantityRaw: null };
    rows.push({ holding, evidence: { ...emptyEvidence(holding), complete: false, hasDisposals: true }, reasons: ['RPC unavailable: current native balance unknown'] });
  }
  await client.save('current-holdings.json', [...holdings, ...rows.map(r => r.holding)]);
  for (const holding of holdings) {
    console.log(`Deriving ${holdingKey(holding)}`);
    rows.push(await acquireHolding(client, chains.find(c => c.id === holding.chainId), holding, sales));
    await client.save('candidate-evidence.json', rows);
  }
  await verifyFinalCanonicality(client, chains, rows);
  for (const row of rows.filter(r => r.holding.kind === 'native' && r.evidence.complete)) {
    try {
      const chain = chains.find(c => c.id === row.holding.chainId);
      const current = await client.rpc(chain.rpc, 'eth_getBalance', [WALLET, 'latest']);
      if (typeof current !== 'string' || !RPC_QUANTITY.test(current) || BigInt(current).toString() !== row.holding.quantityRaw) fail('native balance changed during collection; rerun required');
    } catch (error) { row.evidence.complete = false; row.reasons.push(error.message); }
  }
  rows.sort((a, b) => holdingKey(a.holding).localeCompare(holdingKey(b.holding)));
  if (new Set(rows.map(r => holdingKey(r.holding))).size !== rows.length) fail('duplicate holding keys');
  for (const row of rows) {
    row.gate = validateEvidence(row.holding, row.evidence);
    row.reasons = [...new Set([...row.reasons, ...row.gate.reasons])];
  }
  const accepted = rows.filter(row => row.gate.ok && !row.reasons.length);
  const sql = await database();
  const oldRows = await sql.query('SELECT holding_key,source,collected_at,evidence FROM basis_evidence ORDER BY holding_key');
  await client.save('db-before.json', oldRows);
  // Omitted inventory or unavailable payment proofs are NOT a re-audit rejection.
  // In particular, a native-only success cannot delete earlier NFT evidence.
  const invalidateKeys = managedInvalidationKeys(oldRows, accepted,
    rows.filter(r => r.reauditedRejected).map(r => holdingKey(r.holding)));
  const write = await writeEvidence(sql, accepted, invalidateKeys);
  const readback = await sql.query('SELECT holding_key,source,collected_at,evidence FROM basis_evidence ORDER BY holding_key');
  for (const row of accepted) {
    const stored = readback.find(r => r.holding_key === holdingKey(row.holding));
    if (!stored || stored.source !== row.evidence.source || evidenceChecksum(stored.evidence) !== evidenceChecksum(row.evidence)) fail(`Neon readback mismatch ${holdingKey(row.holding)}`);
  }
  if (readback.some(r => invalidateKeys.includes(r.holding_key))) fail('invalid cache rows survived deletion');
  const table = ['holding_key | current quantityRaw | summed lot quantityRaw | lots | basis source | USD paid total | written? | reason if not',
    ...rows.map(row => [holdingKey(row.holding), row.holding.quantityRaw ?? 'unknown', sum(row.evidence.lots.map(l => l.quantityRaw)).toString(),
      row.evidence.lots.length, row.evidence.source, row.gate.basisUsd ?? 'unknown', write.written.includes(holdingKey(row.holding)) ? 'yes' : 'no', row.reasons.join('; ') || 'verified'].join(' | '))].join('\n');
  console.log('\nFULL AUDIT TABLE\n' + table);
  console.log(`\nWRITTEN_ROW_COUNT=${write.written.length}; DB_READBACK_COUNT=${readback.length}; INVALIDATED_COUNT=${write.invalidated.length}; AUDITED_HOLDING_COUNT=${rows.length}`);
  const stamps = readback.map(row => {
    const e = row.evidence, kind = row.holding_key.split(':')[0];
    const derived = validateEvidence({ kind, chainId: e.chainId, assetId: e.assetId, contract: e.assetId,
      decimals: e.decimals, quantityRaw: sum(e.lots.map(l => l.quantityRaw)).toString() }, e);
    return { holding_key: row.holding_key, source: row.source, collected_at: row.collected_at,
      lot_count: e.lots.length, derived_basis_usd: derived.basisUsd, evidence_sha256: evidenceChecksum(e) };
  });
  console.log('WRITTEN KEYS ' + JSON.stringify(write.written));
  console.log('EXCLUDED KEYS ' + JSON.stringify(rows.filter(r => !write.written.includes(holdingKey(r.holding))).map(r => holdingKey(r.holding))));
  console.log('NEON SELECT READBACK (SHA-256 of recursively key-sorted evidence JSON)\n' + JSON.stringify(stamps, null, 2));
  console.log('RAW LOTS (excluded candidates are NOT stored/current holding basis)\n' + JSON.stringify(rows.filter(r => r.evidence.lots.length).map(r => ({ holding_key: holdingKey(r.holding), written: write.written.includes(holdingKey(r.holding)), lots: r.evidence.lots })), null, 2));
  const summary = { startedAt, completedAt: new Date().toISOString(), chains, auditCount: rows.length, writtenCount: write.written.length,
    databaseCount: readback.length, invalidated: write.invalidated, risks: client.risks, arrivals, excludedArrivals, wac, rows, readback: stamps };
  await client.save('summary.json', summary);
  await client.save('db-readback.json', readback);
  await writeOwnerOnly(path.join(outDir, 'audit.txt'), table + '\n');
  const exitCode = rows.some(r => !r.gate.ok || r.reasons.length) || client.risks.length ? 2 : 0;
  console.log(`COLLECTOR_EXIT_CODE=${exitCode}; artifacts=${outDir}`);
  return { exitCode, summary };
}

export async function runCollection(options = {}) {
  return withCollectionLock(RUN_LOCK_DIR, () => collectBasisEvidence(options));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out-dir' || !path.isAbsolute(args[1]))) {
    console.error(`Usage: node ${path.basename(fileURLToPath(import.meta.url))} [--out-dir /absolute/path]`);
    process.exitCode = 1;
  } else {
    try { process.exitCode = (await runCollection({ outDir: args[1] })).exitCode; }
    catch (error) { console.error(`COLLECTOR_FATAL ${error.message}`); process.exitCode = 1; }
  }
}
