import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as collector from './collect-basis-evidence.mjs';

const hash = '0x' + 'a'.repeat(64);
const at = '2026-09-01T12:00:00.000Z';
const price = { provider: 'defillama-historical', assetId: 'native', timestamp: at, priceUsd: 2500 };
const holding = { kind: 'nft', chainId: 4663, assetId: 'example', decimals: 0, quantityRaw: '2' };
const lot = { transactionHash: hash, acquiredAt: at, quantityRaw: '2', operation: 'purchase', success: true,
  allPaymentLegsObserved: true, acquiredAssetCount: 2, nativeOutflowRaw: '30000000000000000', nativePrice: price, tokenOutflows: [] };
const evidence = { source: 'opensea-v2', chainId: 4663, assetId: 'example', decimals: 0, complete: true, hasDisposals: false, lots: [lot] };

describe('funding history source fallbacks', () => {
const hash = '0x'+'a'.repeat(64), blockHash='0x'+'b'.repeat(64), from='0x'+'c'.repeat(40);
const at = '2026-09-01T12:00:00.000Z';
const indexed = {hash, status:'ok', block_number:16, value:'100', from:{hash:from}, to:{hash:collector.WALLET}};
const tx = {hash,from,to:collector.WALLET,value:'0x64',input:'0x',blockNumber:'0x10',blockHash};
const receipt = {transactionHash:hash,status:'0x1',blockNumber:'0x10',blockHash,logs:[]};
it('funding proof does not depend on unrelated pruned sender-code state',async()=>{
  const client = {pages:async url=>url.endsWith('/internal-transactions')?[]:[indexed],
    transaction:async()=>({tx,receipt,acquiredAt:at}),
    rpc:async()=>{throw new Error('historical sender code pruned')},
    price:async()=>({provider:'defillama-historical',assetId:'native',timestamp:at,priceUsd:2000}),save:async()=>{},risk:()=>{}};
  const result=await collector.collectNativeHistory(client,{id:42161,head:'0x20',scout:'https://example.test'});
  assert.equal(result.arrivals.filter(a=>a.included).length,1);
  assert.equal(result.excluded.length,0);
});
it('falls back for missing Ethereum history and binds archive receipts to primary canonical blocks',async()=>{
  const calls=[];
  const client=new collector.SourceClient({request:async(url,options)=>{
    const {method}=JSON.parse(options.body); calls.push([url,method]);
    if(method==='eth_chainId') return {result:'0x1'};
    if(method==='eth_getBlockByNumber') return {result:{hash:blockHash,timestamp:'0x'+BigInt(Date.parse(at)/1000).toString(16)}};
    if(url==='https://eth.drpc.org') return {result:method==='eth_getTransactionByHash'?tx:receipt};
    return {result:null};
  }});
  const proof=await client.transaction({id:1,rpc:'https://ethereum-rpc.publicnode.com'},hash);
  assert.equal(proof.acquiredAt,at);
  assert.ok(calls.some(([url,method])=>url==='https://eth.drpc.org'&&method==='eth_chainId'));
  assert.ok(calls.some(([url,method])=>url==='https://ethereum-rpc.publicnode.com'&&method==='eth_getBlockByNumber'));
});
});

describe('native weighted-average arrival convention', () => {
  it('prices the current raw balance at ALL funding arrivals weighted by ETH, stamped at the latest', () => {
    const arrivals = [
      { chainId: 1, transactionHash: hash, acquiredAt: at, quantityRaw: '1000000000000000000', nativePrice: price },
      { chainId: 8453, transactionHash: '0x' + 'b'.repeat(64), acquiredAt: '2026-09-02T12:00:00.000Z',
        quantityRaw: '3000000000000000000', nativePrice: { ...price, timestamp: '2026-09-02T12:00:00.000Z', priceUsd: 1500 } },
    ];
    const native = { kind: 'native', chainId: 4663, assetId: 'native', decimals: 18, quantityRaw: '123456789012345678' };
    assert.equal(typeof collector.nativeArrivalBasis, 'function');
    const result = collector.nativeArrivalBasis(native, arrivals);
    assert.equal(result.wacUsd, 1750);
    assert.equal(result.arrivalCount, 2);
    assert.equal(result.totalEth, 4);
    assert.equal(result.totalUsd, 7000);
    assert.deepEqual(result.evidence.lots, [{ operation: 'funding-arrival', quantityRaw: native.quantityRaw,
      transactionHash: arrivals[1].transactionHash, acquiredAt: arrivals[1].acquiredAt,
      nativeOutflowRaw: '0', tokenOutflows: [], allPaymentLegsObserved: true, success: true, acquiredAssetCount: 1,
      nativePrice: { provider: 'defillama-historical', assetId: `ethereum:${collector.ZERO}`,
        timestamp: arrivals[1].acquiredAt, priceUsd: 1750 } }]);
    assert.equal(collector.validateEvidence(native, result.evidence).ok, true);
  });
});

describe('native history collection', () => {
  it('audits every inbound candidate despite gas/spends, and never promotes unproved internal returns to funding', async () => {
    const indexed = { hash, status: 'ok', block_number: 16, value: '1000000000000000000',
      from: { hash: seller }, to: { hash: collector.WALLET } };
    const proof = { tx: { hash, from: seller, to: collector.WALLET, value: '0xde0b6b3a7640000', input: '0x', blockNumber: '0x10' },
      receipt: { transactionHash: hash, status: '0x1', blockNumber: '0x10', logs: [] }, acquiredAt: at };
    const internalHash = '0x' + 'f'.repeat(64);
    const client = { pages: async url => url.endsWith('/internal-transactions')
      ? [{ transaction_hash: internalHash, block_number: 16, value: '10', index: 1, success: true, from: { hash: seller }, to: { hash: collector.WALLET } }]
      : [indexed, { ...indexed, hash: '0x' + 'c'.repeat(64), from: indexed.to, to: indexed.from }],
      transaction: async (chain, txHash) => txHash === hash ? proof : { ...proof, tx: { ...proof.tx, hash: txHash }, receipt: { ...proof.receipt, transactionHash: txHash } },
      rpc: async () => '0x', price: async () => price, risk: () => {}, save: async () => {} };
    assert.equal(typeof collector.collectNativeHistory, 'function');
    const result = await collector.collectNativeHistory(client, { id: 1, head: '0x20', scout: 'https://example.test' });
    assert.equal(result.arrivals.length, 2);
    assert.equal(result.arrivals.filter(a => a.included).length, 1);
    assert.match(result.arrivals.find(a => !a.included).reason, /internal.*unproven/i);
    assert.equal(collector.nativeArrivalBasis({ kind: 'native', chainId: 1, assetId: 'native', decimals: 18, quantityRaw: '1' },
      result.arrivals.filter(a => a.included)).wacUsd, 2500);
  });
});

describe('native bridge collection', () => {
  for (const destinationChainId of [1, 8453, 42161, 4663]) {
    it(`counts original funding once after a verified same-wallet bridge to ${destinationChainId}`, async () => {
      const f = bridgeFundingFixture(destinationChainId);
      const result = await collector.collectBridgeArrivals(f.client, f.chains, f.bridges, f.arrivals);
      assert.deepEqual(result.excluded, []);
      const all = [...f.arrivals, ...result.arrivals];
      assert.equal(all.filter(a => a.chainId === destinationChainId && a.transactionHash === f.destinationHash).length, 1);
      const destination = all.find(a => a.transactionHash === f.destinationHash);
      assert.equal(destination.included, false);
      assert.match(destination.reason, /verified same-wallet bridge/);
      const basis = collector.nativeArrivalBasis(f.holding, all.filter(a => a.included));
      assert.equal(basis.arrivalCount, 1);
      assert.equal(basis.wacUsd, 1000);
    });
  }
  it('quarantines a known bridge destination when its native delivery cannot be proved', async () => {
    for (const failure of ['receipt unavailable', 'trace unavailable', 'wrong amount', 'non-native token', 'delegated recipient']) {
      const f = bridgeFundingFixture();
      if (failure === 'receipt unavailable') {
        const transaction = f.client.transaction;
        f.client.transaction = async (chain, txHash) => {
          if (txHash.toLowerCase() === f.destinationHash) throw new Error(failure);
          return transaction(chain, txHash);
        };
      } else if (failure === 'trace unavailable') {
        f.delivered.tx.to = seller;
        f.delivered.tx.input = '0x1234';
        f.client.nativeFlows = async () => { throw new Error(failure); };
      } else if (failure === 'wrong amount') f.status.receiving.amount = '999999999999999999';
      else if (failure === 'non-native token') f.status.receiving.token.address = paymentToken;
      else f.client.rpc = async () => '0xef0100';
      const result = await collector.collectBridgeArrivals(f.client, f.chains, f.bridges, f.arrivals);
      assert.equal(result.arrivals.length, 0, failure);
      assert.equal(result.excluded.length, 1, failure);
      assert.equal(f.arrivals[1].included, false, failure);
      assert.match(f.arrivals[1].reason, /bridge.*unproven/i);
      assert.equal(collector.nativeArrivalBasis(f.holding, f.arrivals.filter(a => a.included)).wacUsd, 1000);
    }
  });
  it('requires same-wallet provenance before excluding a direct funding candidate', async () => {
    const f = bridgeFundingFixture();
    f.status.toAddress = seller;
    const result = await collector.collectBridgeArrivals(f.client, f.chains, f.bridges, f.arrivals);
    assert.equal(result.excluded.length, 1);
    assert.equal(f.arrivals[1].included, true);
  });
  it('binds both live receipts and native delivery, excluding same-wallet bridges from pooled funding', async () => {
    const destHash = '0x' + 'd'.repeat(64);
    const source = { id: 1, head: '0x20' }, rh = { id: 4663, head: '0x30' };
    const indexed = { value: '100', raw_input: '0x1234', to: { hash: seller }, block_number: 16 };
    const status = { status: 'DONE', fromAddress: collector.WALLET, toAddress: collector.WALLET,
      sending: { txHash: hash, chainId: 1 }, receiving: { txHash: destHash, chainId: 4663, amount: '90', token: { address: collector.ZERO } } };
    const client = { request: async () => status,
      transaction: async chain => ({ tx: { from: collector.WALLET, to: seller, value: '0x64', input: '0x1234' },
        receipt: { blockNumber: chain.id === 1 ? '0x10' : '0x21' }, acquiredAt: at }),
      nativeFlows: async () => ({ outflowRaw: '0', inflowRaw: '90' }), price: async () => price };
    assert.equal(typeof collector.collectBridgeArrivals, 'function');
    const result = await collector.collectBridgeArrivals(client, [source, rh], [{ sourceChainId: 1, transactionHash: hash, indexed }]);
    assert.equal(result.arrivals.length, 1);
    assert.equal(result.arrivals[0].included, false);
    assert.equal(result.arrivals[0].transactionHash, destHash);
    assert.equal(result.arrivals[0].quantityRaw, '90');
    client.nativeFlows = async () => ({ outflowRaw: '0', inflowRaw: '89' });
    const rejected = await collector.collectBridgeArrivals(client, [source, rh], [{ sourceChainId: 1, transactionHash: hash, indexed }]);
    assert.equal(rejected.arrivals.length, 0);
    assert.match(rejected.excluded[0].reason, /delivery/);
  });
});

describe('native current-balance sizing', () => {
  it('uses exact live raw balances and the unchanged USD-one dust boundary, not WAC for dust', async () => {
    assert.equal(typeof collector.sizeNativeRows, 'function');
    const amounts = ['500000000000000', '499999999999999', '123456789012345678'];
    let count = 0;
    const client = { request: async () => ({ ethereum: { usd: 2000 } }), rpc: async () => '0x' + BigInt(amounts[count++]).toString(16) };
    const funding = [{ chainId: 1, transactionHash: hash, acquiredAt: at, quantityRaw: '1000000000000000000', nativePrice: price }];
    const rows = await collector.sizeNativeRows(client, [{ id: 1 }, { id: 8453 }, { id: 4663 }], funding);
    assert.equal(rows[0].evidence.lots[0].quantityRaw, amounts[0]);
    assert.equal(rows[1].evidence.lots.length, 0);
    assert.match(rows[1].reasons[0], /dust/);
    assert.equal(rows[2].evidence.lots[0].quantityRaw, amounts[2]);
    assert.equal(rows[2].evidence.lots[0].nativePrice.priceUsd, 2500);
  });
});

describe('collector honesty boundary', () => {
  it('rejects aggregate USD overflow even when each payment leg is finite', () => {
    const item = { ...lot, quantityRaw: '1', acquiredAssetCount: 1,
      nativeOutflowRaw: '1000000000000000000', nativePrice: { ...price, priceUsd: 1e308 } };
    const input = { ...evidence, lots: [item, { ...item, transactionHash: '0x' + 'f'.repeat(64) }] };
    assert.equal(collector.validateEvidence(holding, input).ok, false);
  });
  it('keeps a batch as one full-payment lot and checks exact raw units', () => {
    assert.deepEqual(collector.validateEvidence(holding, evidence), { ok: true, quantityRaw: '2', basisUsd: 75, reasons: [] });
    const mismatch = collector.validateEvidence({ ...holding, quantityRaw: '3' }, evidence);
    assert.equal(mismatch.ok, false);
    assert.match(mismatch.reasons.join(' '), /quantity/);
  });
  it('requires primitive digit strings for every raw quantity and payment', () => {
    assert.equal(collector.validateEvidence({ ...holding, quantityRaw: 2 }, evidence).ok, false);
    assert.equal(collector.validateEvidence(holding, { ...evidence, lots: [{ ...lot, quantityRaw: 2 }] }).ok, false);
    const mint = { ...lot, quantityRaw: '2', operation: 'mint', nativeOutflowRaw: 0, nativePrice: null, tokenOutflows: [] };
    assert.equal(collector.validateEvidence(holding, { ...evidence, lots: [mint] }).ok, false);
    const tokenPaid = { ...lot, nativeOutflowRaw: '0', nativePrice: null, tokenOutflows: [{ assetId: paymentToken,
      amountRaw: new String('3000000'), decimals: 6,
      historicalPrice: { ...price, assetId: paymentToken } }] };
    assert.equal(collector.validateEvidence(holding, { ...evidence, lots: [tokenPaid] }).ok, false);
    const boxedPaymentAsset = { ...lot, nativeOutflowRaw: '0', nativePrice: null,
      tokenOutflows: [{ assetId: new String(paymentToken), amountRaw: '3000000', decimals: 6,
        historicalPrice: { ...price, assetId: paymentToken } }] };
    assert.equal(collector.validateEvidence(holding, { ...evidence, lots: [boxedPaymentAsset] }).ok, false);
    const unsafe = Number.MAX_SAFE_INTEGER + 1;
    const unsafeHolding = { kind: 'token', chainId: 4663, assetId: paymentToken, contract: paymentToken,
      decimals: 0, quantityRaw: unsafe };
    const unsafeEvidence = { source: 'rpc', chainId: 4663, assetId: paymentToken, decimals: 0,
      complete: true, hasDisposals: false, lots: [{ ...mint, quantityRaw: BigInt(unsafe).toString(),
        nativeOutflowRaw: '0', acquiredAssetCount: 1 }] };
    assert.equal(collector.validateEvidence(unsafeHolding, unsafeEvidence).ok, false);
  });
  it('enforces holding identities and the supported chain/source matrix', () => {
    const native = { kind: 'native', chainId: 1, assetId: 'native', decimals: 18, quantityRaw: '1' };
    const funding = { ...lot, quantityRaw: '1', operation: 'funding-arrival', nativeOutflowRaw: '0', acquiredAssetCount: 1 };
    const nativeEvidence = { source: 'blockscout-v2', chainId: 1, assetId: 'native', decimals: 18,
      complete: true, hasDisposals: false, lots: [funding] };
    assert.equal(collector.validateEvidence({ ...native, assetId: 'NATIVE' }, { ...nativeEvidence, assetId: 'NATIVE' }).ok, false);
    assert.equal(collector.validateEvidence({ ...native, decimals: 0 }, { ...nativeEvidence, decimals: 0 }).ok, false);
    assert.equal(collector.validateEvidence({ ...holding, decimals: 18 }, { ...evidence, decimals: 18 }).ok, false);
    assert.equal(collector.validateEvidence({ ...holding, assetId: '' }, { ...evidence, assetId: '' }).ok, false);

    const tokenMint = { ...funding, operation: 'mint', nativePrice: null };
    const badToken = { kind: 'token', chainId: 1, assetId: 'not-an-address', contract: 'not-an-address', decimals: 18, quantityRaw: '1' };
    const badTokenEvidence = { source: 'blockscout-v2', chainId: 1, assetId: badToken.assetId, decimals: 18,
      complete: true, hasDisposals: false, lots: [tokenMint] };
    assert.equal(collector.validateEvidence(badToken, badTokenEvidence).ok, false);
    const validToken = { ...badToken, assetId: paymentToken, contract: paymentToken };
    const validTokenEvidence = { ...badTokenEvidence, assetId: paymentToken };
    assert.equal(collector.validateEvidence(validToken, validTokenEvidence).ok, true);
    assert.equal(collector.validateEvidence({ ...validToken, contract: nftContract }, validTokenEvidence).ok, false);
    assert.equal(collector.validateEvidence({ ...validToken, contract: new String(paymentToken) }, validTokenEvidence).ok, false);
    const zeroToken = { ...validToken, assetId: collector.ZERO, contract: collector.ZERO };
    assert.equal(collector.validateEvidence(zeroToken, { ...validTokenEvidence, assetId: collector.ZERO }).ok, false);
    const checksumToken = { ...validToken, assetId: paymentToken.toUpperCase() };
    assert.equal(collector.validateEvidence(checksumToken, validTokenEvidence).ok, true);
    assert.equal(collector.validateEvidence(validToken, { ...validTokenEvidence, source: 'rpc' }).ok, true);
    const rhToken = { ...validToken, chainId: 4663 };
    const rhTokenEvidence = { ...validTokenEvidence, chainId: 4663, source: 'rpc' };
    assert.equal(collector.validateEvidence(rhToken, rhTokenEvidence).ok, true);
    // The brief explicitly permits native:4663:native with original funding lots.
    const rhNative = { ...native, chainId: 4663 };
    assert.equal(collector.validateEvidence(rhNative,
      { ...nativeEvidence, chainId: 4663, source: 'rpc' }).ok, true);
    assert.equal(collector.validateEvidence({ ...holding, chainId: 1 }, { ...evidence, chainId: 1 }).ok, false);
    assert.equal(collector.validateEvidence({ ...native, chainId: 999 }, { ...nativeEvidence, chainId: 999, source: 'rpc' }).ok, false);
  });
});

const word = value => BigInt(value).toString(16).padStart(64, '0');
const addrWord = address => address.slice(2).padStart(64, '0');
const nftContract = '0x' + 'b'.repeat(40);
const seller = '0x' + 'c'.repeat(40);
const paymentToken = '0x' + 'd'.repeat(40);
const seaport = '0x0000000000000068f116a894984e2db1123eb395';
const orderTopic = '0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31';
const unknownTopic = '0x' + 'e'.repeat(64);
function orderData(amount = 30000000000000000n) {
  // Synthetic ABI fixture only: two ERC721 offers, one native payment.
  const offers = word(2) + [1, 2].map(id => word(2) + addrWord(nftContract) + word(id) + word(1)).join('');
  const consideration = word(1) + word(0) + addrWord(collector.ZERO) + word(0) + word(amount) + addrWord(seller);
  return '0x' + word(123) + addrWord(collector.WALLET) + word(128) + word(128 + offers.length / 2) + offers + consideration;
}
function purchaseFixture() {
  const logs = [1, 2].map(id => ({ address: nftContract, topics: [collector.TRANSFER, '0x' + addrWord(seller), '0x' + addrWord(collector.WALLET), '0x' + word(id)], data: '0x' }));
  logs.push({ address: seaport, topics: [orderTopic, '0x' + addrWord(seller), '0x' + word(0)], data: orderData() });
  return { tx: { hash, from: collector.WALLET, to: seaport, value: '0x' + word(30000000000000000n) }, receipt: { status: '0x1', transactionHash: hash, logs } };
}
function tokenOrderData(amount = 3000000n) {
  const offers = word(2) + [1, 2].map(id => word(2) + addrWord(nftContract) + word(id) + word(1)).join('');
  const consideration = word(1) + word(1) + addrWord(paymentToken) + word(0) + word(amount) + addrWord(seller);
  return '0x' + word(123) + addrWord(collector.WALLET) + word(128) + word(128 + offers.length / 2) + offers + consideration;
}
function tokenPurchaseFixture() {
  const fixture = purchaseFixture();
  fixture.tx.value = '0x0';
  fixture.receipt.blockNumber = '0x10';
  fixture.receipt.logs.splice(2, 0, { address: paymentToken,
    topics: [collector.TRANSFER, '0x' + addrWord(collector.WALLET), '0x' + addrWord(seller)], data: '0x' + word(3000000) });
  fixture.receipt.logs.at(-1).data = tokenOrderData();
  return fixture;
}

function bridgeFundingFixture(destinationChainId = 8453) {
  const sourceChainId = destinationChainId === 1 ? 8453 : 1;
  const destinationHash = '0x' + 'd'.repeat(64), sourceHash = '0x' + 'b'.repeat(64);
  const arrivedAt = '2026-09-02T12:00:00.000Z', amount = '1000000000000000000';
  const chains = [{ id: sourceChainId, head: '0x20' }, { id: destinationChainId, head: '0x30' }];
  const indexed = { value: amount, raw_input: '0x1234', to: { hash: seller }, block_number: 16 };
  const source = { tx: { hash: sourceHash, from: collector.WALLET, to: seller, value: '0xde0b6b3a7640000', input: '0x1234' },
    receipt: { transactionHash: sourceHash, status: '0x1', blockNumber: '0x10', logs: [] }, acquiredAt: at };
  const delivered = { tx: { hash: destinationHash, from: seller, to: collector.WALLET, value: '0xde0b6b3a7640000', input: '0x' },
    receipt: { transactionHash: destinationHash, status: '0x1', blockNumber: '0x21', logs: [] }, acquiredAt: arrivedAt };
  const status = { status: 'DONE', fromAddress: collector.WALLET, toAddress: collector.WALLET,
    sending: { txHash: sourceHash, chainId: sourceChainId },
    receiving: { txHash: destinationHash.toUpperCase(), chainId: destinationChainId, amount, token: { address: collector.ZERO } } };
  const client = new collector.SourceClient({ request: async () => status });
  client.transaction = async (chain, txHash) => txHash.toLowerCase() === sourceHash ? source : delivered;
  client.rpc = async () => '0x';
  client.price = async acquiredAt => ({ ...price, timestamp: acquiredAt, priceUsd: 3000 });
  if (destinationChainId === 4663) client.nativeFlows = async () => ({ outflowRaw: '0', inflowRaw: amount });
  const arrivals = [
    { chainId: sourceChainId, transactionHash: hash, acquiredAt: at, quantityRaw: amount,
      included: true, nativePrice: { ...price, priceUsd: 1000 } },
    { chainId: destinationChainId, transactionHash: destinationHash, acquiredAt: arrivedAt, quantityRaw: amount,
      included: true, nativePrice: { ...price, timestamp: arrivedAt, priceUsd: 3000 } },
  ];
  return { client, chains, status, delivered, arrivals, destinationHash,
    bridges: [{ sourceChainId, transactionHash: sourceHash, indexed }],
    holding: { kind: 'native', chainId: destinationChainId, assetId: 'native', decimals: 18, quantityRaw: '123456789012345678' } };
}

function acquisitionFixture() {
  const proof = { ...tokenPurchaseFixture(), acquiredAt: at };
  const acquired = { ...holding, contract: nftContract, errors: [],
    transfers: [1, 2].map(id => ({ contract: nftContract, from: seller, to: collector.WALLET,
      kind: 'nft', tokenId: String(id), quantityRaw: '1', log: { transactionHash: hash } })) };
  const sales = [1, 2].map(id => ({ transaction: hash, buyer: collector.WALLET,
    nft: { collection: 'example', identifier: String(id) } }));
  const client = { transaction: async () => proof, call: async () => '0x' + word(6),
    price: async (timestamp, assetId) => ({ ...price, assetId, timestamp }),
    nativeFlows: async () => ({ outflowRaw: '0', inflowRaw: '0' }), risk: () => {} };
  return { proof, acquired, sales, client, chain: { id: 4663, head: '0x99', headHash: hash } };
}

describe('audited rejection authorization', () => {
  for (const [label, native] of [
    ['extra payment', { outflowRaw: '1', inflowRaw: '0' }],
    ['refund', { outflowRaw: '0', inflowRaw: '1' }],
  ]) {
    it(`invalidates previously accepted NFT evidence after a proved native ${label}`, async () => {
      const f = acquisitionFixture();
      const accepted = await collector.acquireHolding(f.client, f.chain, f.acquired, f.sales);
      assert.equal(collector.validateEvidence(f.acquired, accepted.evidence).ok, true);
      f.client.nativeFlows = async () => native;
      const rejected = await collector.acquireHolding(f.client, f.chain, f.acquired, f.sales);
      assert.equal(rejected.evidence.complete, false);
      assert.match(rejected.reasons.join(' '), /extra native payment\/refund/);
      assert.equal(rejected.reauditedRejected, true);
      const key = collector.holdingKey(f.acquired);
      assert.deepEqual(collector.managedInvalidationKeys([{ holding_key: key }], [],
        rejected.reauditedRejected ? [key] : []), [key]);
    });
  }
  it('invalidates a purchase whose canonical settlement proves an extra token payment', async () => {
    const f = acquisitionFixture();
    f.proof.receipt.logs[2].data = '0x' + word(3000001);
    const rejected = await collector.acquireHolding(f.client, f.chain, f.acquired, f.sales);
    assert.match(rejected.reasons.join(' '), /ERC20 consideration differs/);
    assert.equal(rejected.reauditedRejected, true);
  });
  it('invalidates a previously free mint when the canonical transaction proves native payment', async () => {
    const f = acquisitionFixture();
    f.acquired.transfers.forEach(t => { t.from = collector.ZERO; });
    f.proof.receipt.logs = f.proof.receipt.logs.slice(0, 2).map(log => ({ ...log,
      topics: [log.topics[0], '0x' + addrWord(collector.ZERO), ...log.topics.slice(2)] }));
    const accepted = await collector.acquireHolding(f.client, f.chain, f.acquired, []);
    assert.equal(collector.validateEvidence(f.acquired, accepted.evidence).ok, true);
    f.proof.tx.value = '0x1';
    const rejected = await collector.acquireHolding(f.client, f.chain, f.acquired, []);
    assert.equal(rejected.evidence.complete, false);
    assert.equal(rejected.reauditedRejected, true);
  });
  it('preserves unauditable NFT keys when a source leg or provenance is unavailable', async () => {
    for (const missing of ['transaction', 'nativeFlows', 'price', 'decimals', 'sales', 'history', 'unknown wallet event', 'malformed native flows']) {
      const f = acquisitionFixture();
      if (['transaction', 'nativeFlows', 'price'].includes(missing)) f.client[missing] = async () => { throw new Error('source unavailable'); };
      else if (missing === 'decimals') f.client.call = async () => null;
      else if (missing === 'sales') f.sales = [];
      else if (missing === 'history') { f.acquired.errors = ['history unavailable']; delete f.acquired.transfers; }
      else if (missing === 'unknown wallet event') f.proof.receipt.logs.push({ address: nftContract,
        topics: [unknownTopic, '0x' + addrWord(collector.WALLET)], data: '0x' });
      else f.client.nativeFlows = async () => ({ outflowRaw: 1, inflowRaw: '0' });
      const result = await collector.acquireHolding(f.client, f.chain, f.acquired, f.sales);
      assert.equal(result.evidence.complete, false, missing);
      assert.notEqual(result.reauditedRejected, true, missing);
      const key = collector.holdingKey(f.acquired);
      assert.deepEqual(collector.managedInvalidationKeys([{ holding_key: key }], [],
        result.reauditedRejected ? [key] : []), [], missing);
    }
  });
  for (const failure of ['replacement branch', 'head unavailable']) {
    it(`revokes all invalidation authorization after final canonicality fails: ${failure}`, async () => {
      const f = acquisitionFixture();
      f.acquired.transfers.push({ ...f.acquired.transfers[0], from: collector.WALLET, to: seller },
        { ...f.acquired.transfers[0], log: { transactionHash: '0x' + 'e'.repeat(64) } });
      const rejected = await collector.acquireHolding(f.client, f.chain, f.acquired, f.sales);
      assert.equal(rejected.reauditedRejected, true);
      const other = { holding: { kind: 'token', chainId: 1, assetId: paymentToken },
        evidence: { complete: false }, reasons: ['audited rejection'], reauditedRejected: true };
      const native = { holding: { kind: 'native', chainId: 8453, assetId: 'native' },
        evidence: { complete: true }, reasons: [], reauditedRejected: true };
      const rows = [rejected, other, native];
      f.client.rpc = async () => {
        if (failure === 'head unavailable') throw new Error(failure);
        return { hash: '0x' + 'f'.repeat(64) };
      };
      await collector.verifyFinalCanonicality(f.client, [f.chain], rows);
      assert.ok(rows.every(row => row.reauditedRejected === false));
      assert.equal(native.evidence.complete, false);
      assert.match(rejected.reasons.join(' '), /reorged|head unavailable/);
      assert.deepEqual(collector.managedInvalidationKeys(rows.map(row => ({ holding_key: collector.holdingKey(row.holding) })), [],
        rows.filter(row => row.reauditedRejected).map(row => collector.holdingKey(row.holding))), []);
    });
  }
  it('keeps genuine rejection authorization when the final pinned head remains canonical', async () => {
    const f = acquisitionFixture();
    const row = { holding: f.acquired, evidence: { complete: false }, reasons: [], reauditedRejected: true };
    f.client.rpc = async () => ({ hash: f.chain.headHash });
    await collector.verifyFinalCanonicality(f.client, [f.chain], [row]);
    assert.equal(row.reauditedRejected, true);
  });
});

describe('decoded settlement proof', () => {
  it('checks full call traces for delegated wallet extra payments and refunds', () => {
    const f = purchaseFixture(); f.tx.input = '0x1234'; f.receipt.gasUsed = '0x10';
    const trace = { type: 'CALL', from: f.tx.from, to: f.tx.to, input: f.tx.input, value: f.tx.value, gasUsed: '0x10', calls: [] };
    assert.deepEqual(collector.traceNativeFlows(f.tx, f.receipt, trace), { outflowRaw: '30000000000000000', inflowRaw: '0' });
    trace.calls.push({ type: 'CALL', from: collector.WALLET, to: seller, value: '0x1' });
    assert.equal(collector.traceNativeFlows(f.tx, f.receipt, trace).outflowRaw, '30000000000000001');
    trace.calls[0].error = 'execution reverted';
    assert.equal(collector.traceNativeFlows(f.tx, f.receipt, trace).outflowRaw, '30000000000000000');
    trace.calls.push({ type: 'DELEGATECALL', from: collector.WALLET, to: seller, value: '0x100' });
    assert.equal(collector.traceNativeFlows(f.tx, f.receipt, trace).outflowRaw, '30000000000000000');
    trace.calls.push({ type: 'CALL', from: seller, to: collector.WALLET, value: '0x2' });
    assert.equal(collector.traceNativeFlows(f.tx, f.receipt, trace).inflowRaw, '2');
    trace.value = '0x0';
    assert.throws(() => collector.traceNativeFlows(f.tx, f.receipt, trace), /mismatch/);
  });
  it('proves native Seaport settlement and preserves full batch payment', () => {
    const f = purchaseFixture();
    const result = collector.proveSeaportPurchase(f.tx, f.receipt, nftContract, ['1', '2']);
    assert.deepEqual(result, { nativeOutflowRaw: '30000000000000000', tokenPayments: [], acquiredAssetCount: 2 });
  });
  it('rejects unsupported wallet-affecting events in purchase receipts', () => {
    for (const event of [
      { address: nftContract, topics: [unknownTopic, '0x' + addrWord(collector.WALLET)], data: '0x' },
      { address: nftContract, topics: [unknownTopic], data: '0x' + addrWord(collector.WALLET) },
    ]) {
      const f = purchaseFixture();
      f.receipt.logs.push(event);
      assert.throws(() => collector.proveSeaportPurchase(f.tx, f.receipt, nftContract, ['1', '2']), /unsupported wallet-affecting/);
    }
  });
  it('requires primitive RPC value fields in purchase proof', () => {
    const f = tokenPurchaseFixture();
    f.tx.value = 0;
    assert.throws(() => collector.proveSeaportPurchase(f.tx, f.receipt, nftContract, ['1', '2']), /purchase|value/i);
  });
});

describe('live source client', () => {
  it('backs off on HTTP 429 and retries without dropping a history range', async () => {
    const waits = []; let calls = 0;
    const client = new collector.SourceClient({ fetchImpl: async () => {
      calls++;
      return calls === 1 ? { ok: false, status: 429, headers: new Headers({ 'Retry-After': '12' }) }
        : { ok: true, json: async () => ({ items: [1] }) };
    }, sleepImpl: async ms => { waits.push(ms); } });
    assert.deepEqual(await client.fetchJson('https://example.test'), { items: [1] });
    assert.equal(calls, 2);
    assert.ok(waits[0] >= 12000);
  });
  it('exhausts pagination and refuses repeated cursors instead of stamping partial complete', async () => {
    const seen = [];
    const client = new collector.SourceClient({ request: async url => {
      seen.push(url);
      return seen.length === 1 ? { items: [1], next_page_params: { cursor: 'next' } } : { items: [2], next_page_params: null };
    } });
    assert.deepEqual(await client.pages('https://example.test/items'), [1, 2]);
    assert.match(seen[1], /cursor=next/);
    const loop = new collector.SourceClient({ request: async () => ({ items: [1], next_page_params: { cursor: 'same' } }) });
    await assert.rejects(() => loop.pages('https://example.test/items'), /pagination/);
  });
});

describe('pinned source proofs', () => {
  it('binds every Blockscout funding field to a successful RPC proof below the pinned head', () => {
    const indexed = { hash, status: 'ok', block_number: 16, value: '100',
      from: { hash: seller }, to: { hash: collector.WALLET } };
    const proof = { tx: { hash, from: seller, to: collector.WALLET, value: '0x64', input: '0x', blockNumber: '0x10' },
      receipt: { transactionHash: hash, status: '0x1', blockNumber: '0x10', logs: [] } };
    assert.doesNotThrow(() => collector.proveBlockscoutFunding(indexed, proof, '0x10'));
    for (const mutate of [
      candidate => { candidate.proof.tx.from = nftContract; },
      candidate => { candidate.proof.tx.to = nftContract; },
      candidate => { candidate.proof.tx.value = '0x65'; },
      candidate => { candidate.proof.receipt.status = '0x0'; },
      candidate => { candidate.proof.receipt.blockNumber = '0xf'; candidate.proof.tx.blockNumber = '0xf'; },
      candidate => { candidate.head = '0xf'; },
    ]) {
      const candidate = { indexed: structuredClone(indexed), proof: structuredClone(proof), head: '0x10' };
      mutate(candidate);
      assert.throws(() => collector.proveBlockscoutFunding(candidate.indexed, candidate.proof, candidate.head));
    }
  });
  it('fetches purchase-token decimals at the acquisition block and skips unknown decimals', async () => {
    const f = tokenPurchaseFixture();
    const transfers = [1, 2].map(id => ({ contract: nftContract, from: seller, to: collector.WALLET,
      kind: 'nft', tokenId: String(id), quantityRaw: '1', log: { transactionHash: hash } }));
    const acquired = { kind: 'nft', chainId: 4663, assetId: 'example', contract: nftContract,
      decimals: 0, quantityRaw: '2', errors: [], transfers };
    const sales = [1, 2].map(id => ({ transaction: hash, buyer: collector.WALLET,
      nft: { collection: 'example', identifier: String(id) } }));
    const calls = [];
    const client = { transaction: async () => ({ ...f, acquiredAt: at }),
      call: async (...args) => { calls.push(args); return '0x' + word(6); },
      price: async (time, assetId = 'native') => ({ ...price, assetId, timestamp: time }),
      nativeFlows: async () => ({ outflowRaw: '0', inflowRaw: '0' }), risk: () => {} };
    const chain = { id: 4663, head: '0x99' };
    const result = await collector.acquireHolding(client, chain, acquired, sales);
    assert.equal(result.evidence.lots[0].tokenOutflows[0].decimals, 6);
    assert.equal(calls.find(call => call[2] === '0x313ce567')[3], f.receipt.blockNumber);

    client.call = async () => null;
    const missing = await collector.acquireHolding(client, chain, acquired, sales);
    assert.equal(missing.evidence.complete, false);
    assert.equal(missing.evidence.lots.length, 0);
    assert.match(missing.reasons.join(' '), /decimals/);
  });
  it('reads Blockscout holding decimals on-chain at the head and rejects four-topic target transfers', async () => {
    const chain = { id: 1, head: '0x20', scout: 'https://example.test/api/v2' };
    const item = { token: { type: 'ERC-20', address_hash: paymentToken, decimals: null }, value: '1' };
    const calls = [];
    const client = { pages: async url => url.includes('/tokens?') ? [item] : [],
      call: async (...args) => { calls.push(args); return args[2] === '0x313ce567' ? '0x' + word(18) : '0x' + word(1); } };
    const holdings = await collector.scoutTokens(client, chain);
    assert.equal(holdings[0].decimals, 18);
    assert.equal(calls.find(call => call[2] === '0x313ce567')[3], chain.head);

    client.call = async (...args) => args[2] === '0x313ce567' ? null : '0x' + word(1);
    const unknown = await collector.scoutTokens(client, chain);
    assert.equal(unknown[0].decimals, null);
    assert.match(unknown[0].errors.join(' '), /decimals/);

    const fourTopic = { address: paymentToken, topics: [collector.TRANSFER, '0x' + addrWord(collector.ZERO),
      '0x' + addrWord(collector.WALLET), '0x' + word(7)], data: '0x', blockNumber: '0x10' };
    const indexedTransfer = { token: { address_hash: paymentToken }, transaction_hash: hash };
    const guarded = { pages: async url => url.includes('/tokens?') ? [item] : [indexedTransfer],
      call: async (...args) => args[2] === '0x313ce567' ? '0x' + word(18) : '0x' + word(1),
      transaction: async () => ({ receipt: { blockNumber: '0x10', logs: [fourTopic] } }) };
    const rejected = await collector.scoutTokens(guarded, chain);
    assert.match(rejected[0].errors.join(' '), /four-topic|non-ERC20/i);
    fourTopic.topics[0] = collector.TRANSFER.toUpperCase();
    const mixedCaseRejected = await collector.scoutTokens(guarded, chain);
    assert.match(mixedCaseRejected[0].errors.join(' '), /four-topic|non-ERC20/i);
  });
  it('rejects a target Transfer shape that does not match the holding kind', async () => {
    const malformed = { contract: nftContract, from: collector.ZERO, to: collector.WALLET,
      kind: 'token', tokenId: null, quantityRaw: '1', log: { transactionHash: hash } };
    const target = { kind: 'nft', chainId: 4663, assetId: 'example', contract: nftContract,
      decimals: 0, quantityRaw: '1', errors: [], transfers: [malformed] };
    let transactions = 0;
    const result = await collector.acquireHolding({ risk: () => {}, transaction: async () => { transactions++; } },
      { id: 4663, head: '0x20' }, target, []);
    assert.equal(result.evidence.complete, false);
    assert.equal(transactions, 0);
    assert.match(result.reasons.join(' '), /Transfer shape|holding kind/);
  });
});

describe('no unknown-to-zero coercion', () => {
  it('requires zero-address mint semantics, not merely a zero-value transaction', () => {
    const f = purchaseFixture();
    f.tx.value = '0x0';
    f.receipt.logs = f.receipt.logs.slice(0, 2);
    assert.throws(() => collector.proveFreeMint(f.tx, f.receipt, nftContract), /mint/);
    f.receipt.logs = f.receipt.logs.map(l => ({ ...l, topics: [l.topics[0], '0x' + addrWord(collector.ZERO), ...l.topics.slice(2)] }));
    assert.equal(collector.proveFreeMint(f.tx, f.receipt, nftContract).operation, 'mint');
    f.tx.from = seller;
    assert.throws(() => collector.proveFreeMint(f.tx, f.receipt, nftContract), /wallet-initiated|payment/);
    f.tx.from = collector.WALLET;
    f.tx.value = new String('0x0');
    assert.throws(() => collector.proveFreeMint(f.tx, f.receipt, nftContract), /wallet-initiated|payment/);
    f.tx.value = '0x1';
    assert.throws(() => collector.proveFreeMint(f.tx, f.receipt, nftContract), /payment/);
  });
  it('rejects unsupported wallet-affecting events in free-mint receipts', () => {
    for (const event of [
      { address: nftContract, topics: [unknownTopic, '0x' + addrWord(collector.WALLET)], data: '0x' },
      { address: nftContract, topics: [unknownTopic], data: '0x' + addrWord(collector.WALLET) },
    ]) {
      const f = purchaseFixture();
      f.tx.value = '0x0';
      f.receipt.logs = f.receipt.logs.slice(0, 2).map(l => ({ ...l,
        topics: [l.topics[0], '0x' + addrWord(collector.ZERO), ...l.topics.slice(2)] }));
      f.receipt.logs.push(event);
      assert.throws(() => collector.proveFreeMint(f.tx, f.receipt, nftContract), /unsupported wallet-affecting/);
    }
  });
  it('only accepts funding arrival for native ETH with a historical quote', () => {
    const native = { kind: 'native', chainId: 1, assetId: 'native', decimals: 18, quantityRaw: '1000000000000000000' };
    const candidate = { ...evidence, source: 'blockscout-v2', chainId: 1, assetId: 'native', decimals: 18,
      lots: [{ ...lot, quantityRaw: native.quantityRaw, operation: 'funding-arrival', nativeOutflowRaw: '0', acquiredAssetCount: 1 }] };
    assert.equal(collector.validateEvidence(native, candidate).basisUsd, 2500);
    assert.equal(collector.validateEvidence(native, { ...candidate, hasDisposals: true }).ok, false);
    assert.equal(collector.validateEvidence(native, { ...candidate, lots: [{ ...candidate.lots[0], nativePrice: null }] }).ok, false);
    assert.equal(collector.validateEvidence({ ...native, kind: 'token' }, candidate).ok, false);
  });
});

describe('writer and bridge boundaries', () => {
  it('recovers NFT slugs omitted by account inventory using metadata plus ownerOf', async () => {
    const log = { address: nftContract, topics: [collector.TRANSFER, '0x' + addrWord(seller), '0x' + addrWord(collector.WALLET), '0x' + word(25)], data: '0x' };
    const unknown = [{ contract: nftContract, decimals: null, quantityRaw: '1' }];
    const client = { call: async () => '0x' + addrWord(collector.WALLET), request: async () => ({ nft: { contract: nftContract, identifier: '25', collection: 'recovered-slug', token_standard: 'erc721' } }), risk: () => {} };
    const result = await collector.recoverNfts(client, {}, unknown, [log], 'test-only-not-a-real-key');
    assert.equal(result[0].collection, 'recovered-slug');
    client.call = async () => '0x' + addrWord(seller);
    assert.deepEqual(await collector.recoverNfts(client, {}, unknown, [log], 'test-only-not-a-real-key'), []);
  });
  it('enumerates every Transfer contract, including nonstandard indexed quantities', async () => {
    const unusual = { address: nftContract, topics: [collector.TRANSFER, '0x' + addrWord(seller), '0x' + addrWord(collector.WALLET), '0x' + word(25)], data: '0x' };
    const client = { call: async (chain, contract, data) => data.startsWith('0x70a08231') ? '0x19' : '0x12' };
    const result = await collector.rhTokens(client, { head: '0x20' }, [unusual]);
    assert.equal(result.length, 1);
    assert.equal(result[0].quantityRaw, '25');
    assert.match(result[0].errors.join(' '), /nonstandard/);
  });
  it('rejects invalid evidence before issuing any SQL', async () => {
    let queries = 0;
    const sql = { query: () => { queries++; }, transaction: () => { queries++; } };
    await assert.rejects(() => collector.writeEvidence(sql, [{ holding, evidence: { ...evidence, complete: false } }], []), /refusing/);
    assert.equal(queries, 0);
  });
  it('invalidates only explicitly re-audited rejected keys and preserves failed/omitted scopes', () => {
    const stale = `token:1:${paymentToken}`;
    const oldRows = [collector.holdingKey(holding), stale, 'nft:4663:g00fyz', 'nft:4663:relic-machines',
      'native:42161:native', 'manual:4663:preserve'].map(holding_key => ({ holding_key }));
    assert.deepEqual(collector.managedInvalidationKeys(oldRows, [{ holding, evidence }], [stale]), [stale]);
    assert.deepEqual(collector.managedInvalidationKeys(oldRows, [{ holding, evidence }], []), []);
  });
  it('keeps upserts and all invalidations in one SQL transaction, including delete-only runs', async () => {
    const stale = `token:1:${paymentToken}`;
    let transactions = 0, captured;
    const sql = { query: (text, params) => ({ text, params }), transaction: async statements => {
      transactions++; captured = statements;
      return statements.map(statement => statement.text.includes('INSERT')
        ? [{ holding_key: collector.holdingKey(holding) }] : [{ holding_key: stale }]);
    } };
    const result = await collector.writeEvidence(sql, [{ holding, evidence }], [stale]);
    assert.equal(transactions, 1);
    assert.equal(captured.length, 2);
    assert.match(captured[0].text, /INSERT INTO basis_evidence/);
    assert.match(captured[1].text, /DELETE FROM basis_evidence/);
    assert.deepEqual(captured[1].params, [[stale]]);
    assert.deepEqual(result.invalidated, [stale]);

    transactions = 0;
    const deleted = await collector.writeEvidence(sql, [], [stale]);
    assert.equal(transactions, 1);
    assert.equal(captured.length, 1);
    assert.match(captured[0].text, /DELETE FROM basis_evidence/);
    assert.deepEqual(captured[0].params, [[stale]]);
    assert.deepEqual(deleted.invalidated, [stale]);
  });
  it('requires decoded same-wallet destination, not just a bridge method name', () => {
    const tx = { hash, from: { hash: collector.WALLET }, to: { hash: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae' },
      decoded_input: { parameters: [{ name: '_bridgeData', value: [hash, 'across', 'hermes', collector.ZERO, collector.ZERO, collector.WALLET, '1', '4663', 'false', 'false'] }] } };
    assert.equal(collector.decodedInternalBridge(tx).destinationChainId, 4663);
    tx.decoded_input.parameters[0].value[5] = seller;
    assert.equal(collector.decodedInternalBridge(tx), null);
  });
});

describe('single-host serialization and audit permissions', () => {
  it('uses a fixed wallet lock, fails closed on overlap, and releases in finally', async t => {
    assert.equal(collector.RUN_LOCK_DIR, `/tmp/portmanager-basis-collector-${collector.WALLET}.lock`);
    assert.equal(path.isAbsolute(collector.RUN_LOCK_DIR), true);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'basis-lock-test-'));
    t.after(() => fs.rm(root, { recursive: true }));
    const lockDir = path.join(root, 'collector.lock');
    await collector.withCollectionLock(lockDir, async () => {
      assert.equal((await fs.stat(lockDir)).mode & 0o777, 0o700);
      await assert.rejects(() => collector.withCollectionLock(lockDir, async () => {}), /lock exists|already running/i);
    });
    await assert.rejects(() => fs.stat(lockDir), { code: 'ENOENT' });
    await assert.rejects(() => collector.withCollectionLock(lockDir, async () => { throw new Error('test failure'); }), /test failure/);
    await collector.withCollectionLock(lockDir, async () => {});
  });
  it('forces existing audit directories and files to owner-only modes', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'basis-audit-test-'));
    t.after(() => fs.rm(root, { recursive: true }));
    const outDir = path.join(root, 'audit');
    await fs.mkdir(outDir, { mode: 0o777 });
    await fs.chmod(outDir, 0o777);
    await collector.prepareAuditDirectory(outDir);
    assert.equal((await fs.stat(outDir)).mode & 0o777, 0o700);

    const saved = path.join(outDir, 'saved.json');
    await fs.writeFile(saved, 'old\n', { mode: 0o666 });
    await fs.chmod(saved, 0o666);
    const responses = path.join(outDir, 'responses.jsonl');
    await fs.writeFile(responses, '', { mode: 0o666 });
    await fs.chmod(responses, 0o666);
    const client = new collector.SourceClient({ outDir, fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }) });
    await client.save('saved.json', { safe: true });
    await client.fetchJson('https://example.test/audit');
    assert.equal((await fs.stat(saved)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(responses)).mode & 0o777, 0o600);

    const target = path.join(root, 'outside.txt');
    const link = path.join(outDir, 'linked.json');
    await fs.writeFile(target, 'unchanged\n', { mode: 0o600 });
    await fs.symlink(target, link);
    await assert.rejects(() => client.save('linked.json', { unsafe: true }));
    assert.equal(await fs.readFile(target, 'utf8'), 'unchanged\n');
  });
});
