# REPORT — Arc (5042) + Robinhood-Chain PAR token inventory

Branch: `feat/arc-inventory-2026-09-22` (verified with `git branch --show-current`, no new branch created, nothing pushed, `main` untouched).

## Files changed
- `lib/live-data.ts` — added the Arc chain reader (native USDC + ERC-20 registry), PAR to `RH_ERC20_REGISTRY`, and the DexScreener pricing fallback for Arc.
- `lib/live-data.test.ts` — added/updated unit tests (Arc registry shape, joined-portfolio Arc/PAR cash classification, and updated the two RPC-call-count assertions and the RH-registry-length assertion that Arc/PAR onboarding changed).
- `STATUS.md` was already modified in the working tree before this run started (unrelated prior edit, not authored by this task) — left untouched and unstaged per the brief's "stage only the files you actually changed" rule.
- No `app/**`, no `lib/pnl.ts`/`lib/pnl-view.ts`/`lib/pnl-history.ts`, no DB writes.

## Route chosen for the Arc inventory (brief step 3)
**Option (b): static `ARC_ERC20_REGISTRY` + `eth_call balanceOf`**, mirroring `fetchRhTokenInventory`. Option (a) was tried first and rejected on evidence:

```
$ curl -s -m 12 -o /tmp/arcscan.json -w "HTTP:%{http_code}\n" \
  "https://api.arc-scan.org/api/v2/addresses/0xC1bd8020d08B2A1F98da54f1573A54412d99c609/tokens?type=ERC-20"
HTTP:404
$ cat /tmp/arcscan.json
{"detail":"Not Found"}
```

`fetchBlockscoutTokenInventory()` cannot be reused for Arc since the endpoint doesn't answer the expected shape. `fetchArcTokenInventory()` reads Arc's native USDC via `eth_getBalance` and the four registry ERC-20s via `eth_call balanceOf`, exactly like the RH reader.

## Reachability evidence

**ArcScan (rejected):** HTTP 404 (`{"detail":"Not Found"}`) — see above.

**DefiLlama (used first, partial coverage):**
```
TOLLY:      {"coins":{"arc:0xBc43CE...":{"decimals":18,"symbol":"TOLLY","price":0.004114962899252271,...}}}
Architects: {"coins":{"arc:0x8bcb94...":{"decimals":18,"symbol":"Architects","price":0.000306838739257061,...}}}
ARCAT:      {"coins":{}}                              <- NOT covered by DefiLlama
ARCBAT:     {"coins":{"arc:0xbE0CaD...":{"decimals":18,"symbol":"ARCBAT","price":0.00014761259769879585,...}}}
PAR (robinhood:...): {"coins":{}}                      <- not on DefiLlama either; CoinGecko fallback used
```

**DexScreener (fallback, used for ARCAT):**
```
$ curl -s "https://api.dexscreener.com/latest/dex/search?q=0x07704B06981eA962b87296362a1281484d160000"
{"schemaVersion":"1.0.0","pairs":[
  {"chainId":"arc","dexId":"dyorswap","baseToken":{"address":"0x07704B06981eA962b87296362a1281484d160000","symbol":"ARCAT"},
   "priceUsd":"0.0002817","liquidity":{"usd":73287.62}, ...},
  {"chainId":"arc","dexId":"uniswap","baseToken":{"address":"0x07704B0...","symbol":"ARCAT"},
   "priceUsd":"0.0002826","liquidity":{"usd":?}, ...}, ...
]}
```
Confirms: the search endpoint returns an object `{"pairs":[...]}` (not a bare list); implementation filters `chainId === "arc"` AND `baseToken.address` match (case-insensitive), then picks the highest-liquidity pair (the `dyorswap` pair, $73,287.62 liquidity, in this sample).

**PAR pricing (Robinhood chain):** DefiLlama `robinhood:0x507b6f...` returned `{"coins":{}}` (no coverage); the existing CoinGecko fallback answered:
```
$ curl -s "https://api.coingecko.com/api/v3/simple/token_price/robinhood?contract_addresses=0x507B6F349a80114097A67B8b4677367acC15b220&vs_currencies=usd"
{"0x507b6f349a80114097a67b8b4677367acc15b220":{"usd":0.00209039}}
```
So PAR is priced via **CoinGecko fallback**, not DefiLlama (confirmed live in this run; the exact figure moves with the market, as flagged in the brief).

## Token values observed (live, probed at implementation time)
- Arc `eth_chainId` = `0x13b2` = 5042 ✓ (matches brief).
- Arc native USDC (`eth_getBalance`): `0x1cf73f3501788f84` = **2.0872064492000093 USDC** ✓ matches brief.
- Arc `0x3600...` ERC-20 USDC wrapper `balanceOf`: raw `0x1fd926` = 2085158 base units at 6dp = **2.085158 USDC** (brief said 0; live balance differs slightly from the brief's stated 0, but this doesn't change the design decision — the wrapper is excluded from the token inventory regardless of its exact balance, per decision #2).
- TOLLY `balanceOf`: raw `0x...111b6d4653ec3c0bd13` → **5049.13539825292** ✓ matches brief exactly.
- Architects `balanceOf`: raw `0x...4de40352d96038533de` → **22989.26977015662** ✓ matches brief.
- ARCAT `balanceOf`: raw `0x...2c241c1e9c5c655b3d9` → **13028.139641357559** ✓ matches brief.
- ARCBAT `balanceOf`: raw `0x...5e6bc1e917a0ce465fb` → **27868.138983183242** ✓ matches brief.
- PAR `balanceOf` on Robinhood Chain: raw `0x...52aeea6b9c465e5b76d` → **24403.79230192436** ✓ matches brief.
- Live prices observed during this run (move with market, per brief): TOLLY $0.004115, Architects $0.0003068, ARCAT $0.0002817 (DexScreener, dyorswap pair), ARCBAT $0.0001476, PAR $0.00209039 (CoinGecko).

## Design decisions applied
1. **Arc native USDC → Cash.** Emitted as a synthetic wallet-token row: `chainId: 5042, symbol: "USDC", contract: ARC_NATIVE_USDC_KEY ("arc-native-usdc-gas-token"), priceHintUsd: 1` (par, never `ethToUsd`). `isCashToken()` already recognizes symbol `"USDC"` (in `USD_STABLECOINS`), so no `cash-class.ts` change was needed — verified live (`isCashToken: true, valueClass: "cash"` in the probe output). It is emitted from `fetchArcTokenInventory`, never joined into `combineNativeEth`/`native:eth` (that array only ever receives `inputs.walletNative`, which `WALLET_CHAINS` still restricts to Ethereum/Base/Arbitrum One/Robinhood Chain).
2. **No double counting.** `ARC_ERC20_REGISTRY` deliberately excludes the `0x3600...` wrapper (verified: `ARC_USDC_ERC20_WRAPPER` is asserted absent from the registry in a unit test). The wrapper's live balance (2.085158) is a different quantity than the native balance (2.0872064492) — same underlying USDC value stream through two interfaces, so only the native read counts.
3. **Arc ERC-20 inventory source = route (b)**, per the ArcScan 404 evidence above.
4. **Arc pricing = DefiLlama first, DexScreener fallback** — implemented as `fetchArcDexScreenerFallbackPrices()`, invoked only for Arc tokens still unpriced after the DefiLlama pass (this run: ARCAT).
5. **PAR added to `RH_ERC20_REGISTRY`**: `{ symbol: "par", name: "PAR", contract: "0x507B6F349a80114097A67B8b4677367acC15b220", decimals: 18, priceCandidate: true }`, priced through the existing RH pricing path (DefiLlama attempted first, CoinGecko answered — see evidence above).

## Before/after probe output (read-only, no snapshot write)

Command: `node /home/user/.hermes/profiles/markets/skills/finance/portmanager-data-ops/scripts/portfolio-probe.mjs`

The probe's schema-stub + no-op snapshot writer confirmed nothing was persisted:
```
{"asOf":"2026-09-22T04:03:14.654Z","snapshotWrite":"skipped"}
...
{"readOnly":{"schemaInitializerStubbed":true,"snapshotWrite":"skipped","selectRequests":4,"blockedSqlRequests":0}}
```

**`walletToken` rows with `chainId: 5042` (Arc) and the PAR row:**
```
{"walletToken":{"chainId":5042,"symbol":"USDC","contract":"arc-native-usdc-gas-token","valueUsd":2.0872064492000093,"priced":true,"isCashToken":true,"valueClass":"cash"}}
{"walletToken":{"chainId":5042,"symbol":"TOLLY","contract":"0xBc43CE8DEc648EA298C4275559b81D6261c90b67","valueUsd":20.782306170120314,"priced":true,"isCashToken":false,"valueClass":"crypto"}}
{"walletToken":{"chainId":5042,"symbol":"Architects","contract":"0x8bcb94279FC2c984EC34e0C1f2192df8c69EA4F0","valueUsd":7.0539985527153215,"priced":true,"isCashToken":false,"valueClass":"crypto"}}
{"walletToken":{"chainId":5042,"symbol":"ARCAT","contract":"0x07704B06981eA962b87296362a1281484d160000","valueUsd":3.617914378404994,"priced":true,"isCashToken":false,"valueClass":"crypto"}}
{"walletToken":{"chainId":5042,"symbol":"ARCBAT","contract":"0xbE0CaD585Ea2D13DE2f4E36376be755C0AfD8B97","valueUsd":4.113688388338757,"priced":true,"isCashToken":false,"valueClass":"crypto"}}
{"key":"token:4663:0x507b6f349a80114097a67b8b4677367acc15b220","chain":"Robinhood Chain","amount":24403.79230192436,"valueUsd":51.18207359482596,...}
{"walletToken":{"chainId":4663,"symbol":"par","contract":"0x507B6F349a80114097A67B8b4677367acC15b220","valueUsd":51.18207359482596,"priced":true,"isCashToken":false,"valueClass":"crypto"}}
```
Arc subtotal at probe time: 2.0872 + 20.7823 + 7.0540 + 3.6179 + 4.1137 = **$37.66** (magnitude matches the brief's ~$41.13 band; live prices had moved since the brief was written, e.g. ARCAT $0.0002817 vs brief's $0.0003034 stated band). PAR live value: **$51.18** (vs brief's $69.40 example figure — PAR's live CoinGecko price at probe time was $0.00209039 vs the brief's $0.002844 example, i.e. price moved down ~26% between the brief's write time and this run, consistent with the brief's own instruction to "treat as magnitude bands, not fixed values").

**`totals` and `valueAllocation` lines from the probe:**
```
{"totals":{"grandTotalUsd":null,"costBasisUsd":32.40392163680593,"pnlUsd":-2.594453486397173,"coverage":{"totalHoldings":12,"eligible":3,"notRecorded":9,"dust":0,"unpriced":0,"unreconciled":0,"status":"partial","sourcesComplete":false}}}
{"valueAllocation":[{"key":"t212","label":"Stocks Port","valueUsd":54.59051098697556,"valueThb":1815.5544005274492,"sharePct":null},{"key":"crypto","label":"Crypto Port","valueUsd":167.26620490687628,"valueThb":5562.88792480178,"sharePct":null},{"key":"cash","label":"Cash","valueUsd":null,"valueThb":null,"sharePct":null}]}
```
`grandTotalUsd` is null in this run because `manualHoldings`/`capital` sources are `unavailable` in the read-only probe (its schema stub deliberately blocks non-allowlisted SQL, including the manual-holdings/capital reads) — this is a pre-existing probe limitation unrelated to the Arc/PAR fix; `Crypto Port` and `Stocks Port` subtotals compute fine and both include the new Arc/PAR value.

A true before/after delta against a live production snapshot was not captured (would require a DB write, which is prohibited); the "before" state is documented by the code diff itself — Arc was entirely absent from `WALLET_CHAINS`/`fetchWalletTokenSource` and PAR was absent from `RH_ERC20_REGISTRY` before this change, so their prior contribution to every total was exactly $0.

## grep proof — Arc chain and PAR registry entry present

```
$ grep -n "chainId: 5042" lib/live-data.ts
258:  chainId: 5042,

$ grep -n 'symbol: "par"' lib/live-data.ts
332:  { symbol: "par", name: "PAR", contract: "0x507B6F349a80114097A67B8b4677367acC15b220", decimals: 18, priceCandidate: true },
```

## `native:eth` merge scope — unchanged

`WALLET_CHAINS` (the array `combineNativeEth` is fed from via `inputs.walletNative`) still contains **exactly** Ethereum (1), Base (8453), Arbitrum One (42161), Robinhood Chain (4663) — Arc was NOT added to `WALLET_CHAINS`, and `combineNativeEth` is never called with Arc data. Arc's native USDC balance is read by the new, separate `fetchArcTokenInventory()` and joined into `wallet.tokens`, not `wallet.native`. Verified live: the probe's `native:eth` row lists `"chain":"Ethereum · Base · Arbitrum One · Robinhood Chain"` with no Arc contribution, and `ui-contract-check.mjs` line ~2034 (which asserts those four chain names in the visible detail) was not touched and is unaffected because that contract only reads `wallet.native`'s combined-ETH breakdown.

## Self-QA

**1. `npm test 2>&1 | tail -25`**
```
Test Files  31 passed (31)
     Tests  670 passed (670)
  Start at  04:02:52
  Duration  2.89s
```

**2. `npm run build 2>&1 | tail -12`**
```
Running TypeScript ...
  Finished TypeScript in 3.1s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (5/5) in 99ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/auth/callback
├ ƒ /api/auth/login
├ ƒ /api/auth/logout
├ ƒ /api/cron/snapshot
├ ƒ /asset-list
├ ○ /asset-master
├ ƒ /exchange-rate
├ ○ /icon.svg
├ ƒ /login
└ ƒ /portfolio
```
Build succeeded, no TypeScript errors.

**3. Live probe** — see "Before/after probe output" above (full raw lines pasted).

**4. grep proof** — see above.

**5. `native:eth` scope statement** — see above; confirmed unchanged (four chains only, Arc not merged in).

## Risk flags for the reviewer

1. **Arc's own ERC-20 USDC wrapper live balance (2.085158) is nonzero**, not the `0` the brief stated. This doesn't change the shipped design (decision #2 excludes the wrapper from the registry regardless of its balance, to avoid double counting the same underlying USDC), but a reviewer should confirm Arc's wrapper and native USDC are genuinely the same economic asset and not two independently-held balances — I could not find Arc's own documentation distinguishing/reconciling the two interfaces from this host, so the exclusion rests on the brief's stated design decision rather than independently verified protocol docs.
2. **ArcScan's 404 was observed once, from one host, at implementation time.** If `api.arc-scan.org` starts answering the Blockscout-compatible shape later, the static `ARC_ERC20_REGISTRY` will silently miss any new Arc holding the wallet acquires after this run (same "list vs. chain-scan" risk class the skill notes for the RH registry) — worth a periodic recheck or a follow-up brief to reuse `fetchBlockscoutTokenInventory` if ArcScan comes online.
3. **DexScreener fallback pricing has no independent verification step** (unlike the Blockscout price-hint path, which cross-checks against DefiLlama). A `dexscreener.com` outage or a manipulated low-liquidity pair could feed a bad ARCAT-class price straight into the book; the highest-liquidity-pair selection mitigates but doesn't eliminate this, and there's no `priceVerified` flag wired for the DexScreener-fallback path.
