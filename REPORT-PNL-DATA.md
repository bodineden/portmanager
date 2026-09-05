# REPORT-PNL-DATA.md — Run 1: P&L data core (cost basis + P&L aggregation + daily snapshot history)

- Date: 2026-09-05
- Branch: `feat/pnl-astra-data` (no push, main untouched)
- Env: no DATABASE_URL, no API keys — everything implemented/tested/built without live providers or Neon.

## What changed

### Files created
| File | Purpose |
|---|---|
| `lib/pnl.ts` | Pure cost-basis vocabulary, conservative acquisition-evidence engine, and P&L aggregation. No fetchers, no DB. |
| `lib/pnl.test.ts` | 38 unit tests (T212 derivation, on-chain evidence ladder, joined aggregation, arithmetic identity, required current-book fixture table). |
| `lib/pnl-history.ts` | UTC-daily snapshot recorder (injectable clock, module-level attempt guard, write timeout, error swallow) + `recordPortfolioSnapshot` production singleton. |
| `lib/pnl-history.test.ts` | 8 unit tests: hook wiring, error swallow (connect/DDL/insert/hang), no-IO guards, ON-CONFLICT semantics, UTC rollover, ineligibility not consuming the attempt. |

### Files modified (additive only)
- `lib/live-data.ts` — imports engine; extends holding types + `totals` additively; assembles basis in `buildJoinedPortfolio`; hooks recorder behind the existing `isNeonConfigured()` gate in `getJoinedPortfolio`; carries exact RPC base units (`amountRaw`) on native balances. Existing fields, null semantics, totals arithmetic and archive types unchanged.
- `lib/assets-db.ts` — one exported snapshot DDL constant, executed idempotently at the top of `createSchema`; **nothing else touched** (archive tables, seed, ALTERs, UPDATEs all intact and untouched).
- `lib/live-data.test.ts` — one existing exact-shape expectation extended with the additive unavailable P&L fields; no existing expectation rewritten.

Untouched as required: `app/**`, `scripts/**`, `proxy.ts`, `lib/auth.ts`, `lib/dust-filter.ts`, `package.json`, configs. UI contract harness unchanged and run clean (see QA).

## New field names + types (Run 2 consumes these — pin them)

Per-holding block (`HoldingPnl`, spread onto `JoinedT212Position`, `JoinedNftHolding`, `WalletNativeHolding`, `WalletTokenHolding`):

```ts
type BasisStatus = "t212-live" | "onchain-derived" | "airdrop-free" | "not-recorded";
type PnlEligibility = "eligible" | "not-recorded" | "dust" | "unpriced" | "unreconciled";
costBasisUsd: number | null   // null unless recorded/derived/free
costBasisThb: number | null   // snapshot FX conversion of USD basis (NOT acquisition FX)
basisStatus: BasisStatus
basisNote: string             // human-readable provenance
pnlUsd: number | null         // computed only when status allows
pnlThb: number | null
pnlPct: number | null         // null for zero basis INCLUDING verified free (no % of $0)
pnlEligibility: PnlEligibility
```

Also on `JoinedT212Position`: `valueUsd: number | null` (required for the portfolio-wide arithmetic identity; USD conversion via the same FX table used elsewhere).

`JoinedPortfolio.totals` additions (all additive to the existing 12 fields):

```ts
costBasisUsd / costBasisThb: number | null          // Σ basis over eligible set
pnlUsd / pnlThb: number | null                      // Σ P&L over the same set
pnlPct: number | null                               // pnlUsd / costBasisUsd × 100 when basis > 0 else null
pnlCoverage: {
  totalHoldings, eligible, notRecorded, dust, unpriced, unreconciled: number
  sourcesComplete: boolean
  status: "complete" | "partial"
}
pnlByClass: { t212; nfts; walletNative; walletTokens }  // each a full PnlSummary for per-class cards
```

`PnlSummary = { costBasisUsd, costBasisThb, pnlUsd, pnlThb, pnlPct, pnlCoverage }`.

Consistency rule enforced + unit-tested: `pnlUsd === Σ(valueUsd − basisUsd)` over the eligible set.

`JoinedPortfolioInputs` gains optional `basisEvidence?: Readonly<Record<string, AcquisitionEvidence>>` — audited histories keyed `nft:4663:<collection>`, `native:<chainId>:native`, `token:<chainId>:<lowercase contract>`. No live fetcher produces this yet; nothing synthesizes it.

## Classification ladder as implemented

1. **T212 positions → `t212-live`.** Basis = `averagePrice × quantity`; P&L = API `ppl` where present, `(current − average) × quantity` fallback only when `ppl` is null. USD conversion: API P&L uses its own `pplCurrency`; basis uses instrument currency → USD via `usdToThb`, `gbpToThb`, `eurToThb`. **Reconciliation guard:** the API P&L quote is often an FX-account figure that does not reconcile with spot-converted `valueUsd − basisUsd`; such rows stay `t212-live` with their API P&L shown but are marked `unreconciled` and excluded from the P&L sums (never silently mixed). Exact unit tests cover the null-ppl fallback, preserved explicit zero, missing average cost, and an unsupported FX cross → `not-recorded` (no zero invented).
2. **Airdrops / claims / mints → `airdrop-free` ONLY with verified evidence.** A balance alone is never "free". The engine requires a normalized `AcquisitionEvidence` bundle proving: complete history, no disposals, no multi-asset acquisitions, successful tx, acquired quantity matches the entire current holding exactly (raw units), operation ∈ mint/claim/airdrop, AND all payment legs observed with zero native outflow and zero ERC-20 outflow. The free-acquisition rung is limited to wallet tokens and NFTs, as specified; this implementation does not classify native receipts as free. Every defect in the evidence (incomplete history, disposal, partial quantity, wrong chain/asset, duplicate tx, multi-asset, failed, bad units, stale/missing/mismatched historical price, multi-payment) fails to `not-recorded` — never a guessed basis.
3. **Clean on-chain purchase → `onchain-derived`.** Evidence must show operation=purchase, exactly ONE payment leg (native or ERC-20), complete history, no disposals, acquisitions summing exactly to the current raw-unit balance. The payment leg is valued ONLY with a keyless documented historical USD quote pinned near acquisition: DefiLlama historical ≤ 1 hour from tx time, or CoinGecko date-history quote on the same UTC acquisition date (daily granularity, documented as not execution-price precise). No clean historical price → `not-recorded`. Never approximated with today's price. The payment asset must be distinct from the acquired asset. Gas is excluded by portfolio convention (documented in module comments, not per-row basisNote); this is not a tax-cost ledger. Transfers, bridges, exchange deposits, wrappers, EOA-with-no-value and multi-leg that cannot be valued confidently → `not-recorded` (unit-tested per operation).
4. **Dust / unpriced → excluded from all P&L sums and denominators.** Same strict `< 1.00` semantics as the shipped dust-filter (`shouldHideWalletDust`) for value; unpriced rows (`valueUsd === null`) are also excluded from P&L. Values stay visible in existing tables; totals of value are unchanged. No basis derivation is attempted for dust/unpriced (not even with supplied evidence).
5. **Everything else → `not-recorded`.** Basis stays null, shown in value, never counted as $0.

## Payment-leg / airdrop detection rules printed from the data actually used

We deliberately did NOT hook the classification engine to live RPC/Blockscout/OpenSea history in this run (see "Not derivable today"). The pure engine's rules for a future collector are documented above and in code comments, and every rung is unit-tested with synthetic evidence. The key honesty rule: acquisition provenance must be normalized, complete, exact-quantity-matched, payment-leg-complete evidence — and the collector must come with its own fail-soft treatment before it ever feeds `basisEvidence`.

## Current real book — fixture decisions (step 5 output)

Fixture USD/THB=36, GBP/THB=45, ETH/USD=$2,400 (not live quotes; exact output is printed by `lib/pnl.test.ts` — "required current-book fixture QA").

| Holding | basisStatus | P&L bucket | Reason |
|---|---|---|---|
| T212 positions: 0 | N/A (no holding) | no-op | GBP 487 cash is value only; no P&L |
| Arbitrum One ETH 0.248396 (~$596) | not-recorded | not-recorded | Native balance only; no clean purchase provenance (bridge/deposit is not a basis) |
| Ethereum ETH 0.000781 | not-recorded | not-recorded | Native balance only; no clean purchase provenance (bridge/deposit is not a basis) |
| Base ETH 0.000099 | not-recorded | dust | Dust: current value below $1; basis derivation skipped |
| Robinhood Chain ETH 0.000526 | not-recorded | not-recorded | Native balance only; no clean purchase provenance (bridge/deposit is not a basis) |
| USDG 1.475 (~$1.48) | not-recorded | not-recorded | Token balance only; no clean acquisition/payment history recorded |
| STACK token (sub-cent) | not-recorded | dust | Operator reports sub-cent value; no basis derivation; exact quantity not supplied |
| GME token (sub-cent) | not-recorded | dust | Operator reports sub-cent value; no basis derivation; exact quantity not supplied |
| 2× Stackers NFT (~0.1831 ETH combined with G00fyz) | not-recorded | not-recorded | OpenSea inventory/floor only; acquisition and payment history not recorded |
| 2× G00fyz NFT | not-recorded | not-recorded | OpenSea inventory/floor only; acquisition and payment history not recorded |

Current-book P&L result: `costBasisUsd = null`, `pnlUsd = null`, `pnlPct = null`, `eligible = 0` — the correct honest output for a book with zero recorded cost basis. This is not a defect; it is Bodin's rule working.

## What is honestly NOT derivable today (and why)

- **RH Chain explorer is Cloudflare-walled from serverless hosts** (existing fact in live-data.ts). RH token/NFT acquisition history cannot be enumerated via Blockscout HTTP; RH data is RPC balances + OpenSea inventory only. No current RH source supplies a complete audited acquisition/payment history to this engine. RPC receipts/logs or reachable authenticated OpenSea order data could support a future collector; the explorer wall alone does not prove derivation is impossible.
- **Balance/floor endpoints prove no basis.** Native balances (4 RPCs) and OpenSea floors tell you what is held now, not how it was acquired. The brief warns to expect bridge/deposit provenance for Arbitrum ETH, but does not supply a verified acquisition transaction. We assert only that no clean purchase provenance is recorded; we do not claim a particular bridge or deposit transaction was found.
- **No historical USD prices were fetched** (no live APIs, per brief). The engine is price-provider-ready (DefiLlama/CoinGecko, keyless, documented) but nothing is approximated.
- **The brief supplies no exact units/prices for meme dust or sub-cent RH tokens.** The live fetcher still obtains real raw balances and available prices; this report does not invent them. STACK/GME table decisions use the operator's sub-cent bucket, tested against representative sub-cent values, not claimed observations. Live output after deployment will bucket them automatically from real balances.

## Snapshot table (DDL)

Added idempotently to `createSchema` (and exported as `PORTFOLIO_SNAPSHOT_DDL` so the recorder can create JUST this table without running archive schema/seed code):

```sql
CREATE TABLE IF NOT EXISTS portfolio_snapshot (
  snapshot_date DATE PRIMARY KEY,        -- UTC date
  total_value_usd NUMERIC NOT NULL,
  total_value_thb NUMERIC NOT NULL,
  cost_basis_usd NUMERIC NULL,           -- P&L-eligible subset only
  cost_basis_thb NUMERIC NULL,
  pnl_usd NUMERIC NULL,
  pnl_thb NUMERIC NULL,
  pnl_pct NUMERIC NULL,
  coverage JSONB NOT NULL,               -- totals.pnlCoverage + source statuses + per-class coverage
  as_of TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

NO seed rows. Recorder: `INSERT … ON CONFLICT (snapshot_date) DO NOTHING RETURNING snapshot_date` — one row per UTC day, first qualifying observation wins; a later same-day observation returns `already-exists` and cannot overwrite. Guards: only when the existing `isNeonConfigured()` gate is true, only when grand totals are finite non-negative and fiat FX is live, only when the portfolio `asOf` is on the same UTC date as the injected clock and not in the future. Attempts are coalesced per module instance (attempt flag set BEFORE the first await) so page renders do not hammer Neon; ineligibility does not consume the day's attempt; a fresh UTC date rolls the flag. DB construction, DDL, INSERT and hangs are swallowed (fixed "snapshot write failed" log, no secrets) with a bounded default 2s write timeout; the page never fails. Hook lives in `getJoinedPortfolio` behind `isNeonConfigured()` — a local/test no-DATABASE_URL environment is a clean no-op (unit-tested).

**Design note surfaced (no silent deviation):** the recorder awaits the bounded write (2s max) rather than fire-and-forget because serverless runtimes can drop detached promises before they flush; the whole path is race-bounded and error-swallowed, so worst-case page cost is ~2s only when Neon is configured AND the write is failing/hanging.

## Risk flags for Run 2

1. **Pin these field names/types** (above) before UI work; Run 2's P&L cards will read `totals.pnlByClass.<class>` and `totals.pnlCoverage`, and holding rows expose `costBasisUsd/pnlUsd/basisStatus/basisNote/pnlEligibility`. `JoinedT212Position` also gained `valueUsd`.
2. **`complete` vs `partial` semantics matter:** `pnlCoverage.status: "complete"` requires every source live AND zero exclusions. For the supplied current book with zero T212 positions and no acquisition evidence, coverage is `partial` with eligible=0 and null P&L — Run 2 must render this state honestly ("no recorded cost basis yet"), not as an error or as $0.
3. **`unreconciled` T212 rows** are a real possibility when positions exist: API FX P&L may not equal spot-converted value − basis. UI should distinguish them (value and basis shown; P&L sums exclude them) and never average them into pnlPct.
4. **Gas is excluded** from cost basis by portfolio convention (documented in module comments) — do not present basis as a tax-cost figure.
5. **NFT collection vs token granularity:** P&L is per joined row (an NFT collection row = one holding across `tokenCount` items). The evidence model supports collection-level quantity; Run 2's per-item UI (if any) must not re-derive per-item basis without evidence.
6. **Airdrop-free has basis $0 and pnlPct null** — a separate UI state from onchain-derived/t212-live. Never render 0/0.
7. **Snapshot coverage JSONB** is the single source of truth for history completeness; Run 2's calendar/chart should read it per day rather than assuming rows are whole-book.

## Self-QA (exact commands, printed results)

### 1. `npm test`
```
Test Files  6 passed (6)
     Tests  79 passed (79)
```
(33 pre-existing + 46 new: pnl.test.ts 38 incl. current-book fixture table; pnl-history.test.ts 8. Previous suite: 4 files/33 tests. One exact-shape fixture gained only the new expected fields; every original assertion/value is retained.)

### 2. `npm run lint`
```
/home/user/projects/portmanager/proxy.ts
  19:10  warning  'b64urlEncode' is defined but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (0 errors, 1 warning)
```
0 errors; only the pre-existing proxy.ts warning.

### 3. `npm run build`
Next.js 16.2.6 production build: compiled successfully, TypeScript passed, unchanged route list, static generation 5/5 — clean.

### 4. Grep anchors
- New exported symbols in `lib/`: `deriveT212Pnl` (pnl.ts), `deriveOnchainPnl` (pnl.ts), `aggregatePnl` (pnl.ts), `recordPortfolioSnapshot` + `createSnapshotRecorder` (pnl-history.ts) — grep counts: `basisStatus` 31 matching lines, `portfolio_snapshot` 3 (both DDL + INSERT), all under `lib/`.
- `app/` references to P&L symbols/table: **0** (grep across `app/**` returns no matches — no UI changed).

### 5. Fixture classification ladder for the current real book
Printed inline above; also printed by `npm test` ("CURRENT_BOOK_TABLE_BEGIN…END"). All ten requested items answered; `not-recorded` is the correct answer wherever provenance is deposit/bridge/balance-only. No `airdrop-free` anywhere — correctly, because no evidence exists for it.

### 6. UI contracts
`scripts/ui-contract-check.mjs` untouched. Ran against a local production build (`npm run build && npm run start -- --hostname 127.0.0.1 --port 8125`) with external providers denied: **PASS | UI contract summary — 77/77 checks passed**. Playwright Chromium is installed. Limitation: this validates the offline/unavailable-source UI, not live holdings or a populated chart. The temporary Node preload denied all external fetches rather than supplying fabricated API responses; no app/script/config files changed.

## Deviations from the brief (all disclosed, none silent)

1. **Live on-chain history collector omitted** (still `not-recorded`): this run ships a normalized-evidence consumer, not Blockscout/OpenSea raw-response history adapters or historical-price fetchers. Pure adapters could be implemented later against audited provider fixtures; no assertion is made that they are impossible without live access. The engine, vocabulary, evidence contract and full rejection matrix are implemented and unit-tested; the collector is a clean follow-up run. This is the "OpenSea order endpoints / history" risk item — parent should verify live after merge if a collector is wanted.
2. **`JoinedT212Position.valueUsd` added** — required for the portfolio-wide `pnlUsd = Σ(valueUsd − basisUsd)` identity; additive.
3. **`NormalizedWalletNativeBalance.amountRaw` added** (optional) — exact raw units are required before any native purchase evidence can be matched; float reconstruction is refused.
4. **T212 value precedence is unchanged:** new `valueUsd` uses `valueAccount` converted in its account/P&L currency when present, otherwise `valueNative` in instrument currency. Basis uses average price in instrument currency; API P&L uses `pplCurrency`. The reconciliation guard handles disagreement rather than changing any of those observations.
5. **Snapshot hook placement** is `getJoinedPortfolio` (the single server fetch boundary) rather than each page — a page-visit-per-UTC-day still records one row, and pure-builder tests never touch the DB.
6. **Write timeout + awaited bounded write** added to satisfy "never fail/hammer the page" under serverless semantics (design note above).

No rendered UI, no API routes, no paid/scraped providers, no DB mutation beyond the new snapshot table, and no archive seed/ALTER/UPDATE executed by the recorder.

## Final verification supplement

The live workspace was committed concurrently as `b5526ea8034ba61d93494124004defcd73171e3f` while this execution was still finishing QA. That commit and its initial report were preserved, not amended or reset. A subsequent scoped commit includes seven additional regression tests and these final report corrections/logs. The latest suite is 79/79 (33 original + 46 new), not the interim 72/72 in that checkpoint's commit message.

An independent, read-only Codex review returned `passed: true`, zero security concerns and zero logic errors. It did not change source. The only later code changes were additional tests; production code is the reviewed code.

### API signatures and remaining semantic details

```ts
deriveT212Pnl(position: NormalizedT212Position, fx: FiatRates | null,
  accountCurrency: string | null): HoldingPnl & { valueUsd: number | null }
deriveOnchainPnl(holding: OnchainHolding, usdToThb: number | null,
  evidence?: AcquisitionEvidence | null): HoldingPnl
aggregatePnl(classes: Record<PnlClass, PnlClassInput>, usdToThb: number | null,
  sourcesComplete?: boolean): PortfolioPnlTotals
createSnapshotRecorder(options?: SnapshotRecorderOptions):
  (portfolio: JoinedPortfolio, clock?: { now?: () => number }) => Promise<SnapshotRecordResult>
recordPortfolioSnapshot: ReturnType<typeof createSnapshotRecorder>
PORTFOLIO_SNAPSHOT_DDL: string

// Additive to normalized and joined native holdings:
amountRaw?: string

// Pure evidence boundary, not a raw provider payload parser:
type OnchainHolding = {
  asOf?: string; kind: "native" | "token" | "nft"; chainId: number;
  assetId: string; quantityRaw: string; decimals: number; valueUsd: number | null;
};
type AcquisitionEvidence = {
  source: "blockscout-v2" | "opensea-v2" | "rpc";
  chainId: number; assetId: string; decimals: number;
  complete: boolean; hasDisposals: boolean; lots: AcquisitionLot[];
};
type AcquisitionLot = {
  transactionHash: string; acquiredAt: string; quantityRaw: string;
  operation: "purchase" | "mint" | "claim" | "airdrop" | "transfer" |
    "bridge" | "exchange-deposit" | "wrapper" | "unknown";
  success: boolean; allPaymentLegsObserved: boolean; acquiredAssetCount: number;
  nativeOutflowRaw: string; nativePrice: HistoricalUsdPrice | null;
  tokenOutflows: { assetId: string; amountRaw: string; decimals: number;
    historicalPrice: HistoricalUsdPrice | null }[];
};
type HistoricalUsdPrice = {
  provider: "defillama-historical" | "coingecko-history";
  assetId: string; timestamp: string; priceUsd: number;
};
type PnlClass = "t212" | "nfts" | "walletNative" | "walletTokens";
type PnlClassInput = {
  holdings: readonly (HoldingPnl & { valueUsd: number | null })[];
  sourceComplete: boolean;
};
type SnapshotDb = {
  query: (text: string, params?: unknown[], signal?: AbortSignal) => Promise<unknown>;
};
type SnapshotRecorderOptions = {
  hasDb?: () => boolean; getDb?: () => SnapshotDb; now?: () => number;
  timeoutMs?: number; log?: (message: string) => void;
};
type SnapshotRecordResult = "recorded" | "already-exists" | "skipped" | "error";
```

- Coverage buckets are mutually exclusive: eligible / notRecorded / dust / unpriced / unreconciled. Their sum equals `totalHoldings`. Counts describe returned joined rows, not unseen failed-source holdings, NFT units, or T212 cash. `sourcesComplete` prevents an unavailable empty source being mistaken for a known-empty book.
- With some eligible rows, totals are the **eligible-subset** sums and can be partial even when portfolio market value is known. With holdings but zero eligible rows, basis and P&L totals are null. A genuinely empty, live inventory alone can produce known zero basis/P&L. All-free eligible holdings have zero basis, current-value P&L, and null percentage. Missing THB FX never deletes known USD; THB mirrors stay null.
- T212 reconciliation tolerates floating-point noise only: `16 * Number.EPSILON * max(1, abs(value), abs(basis), abs(pnl))`. The tested identity is exact for the simple fixture numbers and numerically consistent within that tolerance in general. The engine does not rewrite an API P&L quote or reverse-engineer a fake basis to force equality.
- The evidence consumer rejects incomplete history, any disposal, unsupported operations, multiple acquired assets/payments, duplicate or failed transactions, future acquisitions relative to joined `asOf`, wrong chain/asset/decimals, invalid or mismatched exact raw quantities, and stale/missing/invalid payment quotes. BigInt validates raw units before decimal conversion to the app's existing `number` currency representation. Blockscout evidence for RH Chain is expressly unsupported. No end-user override API was added.
- A decoded operation and `allPaymentLegsObserved` are **trusted normalized evidence assertions** that a future collector must establish from successful receipts/orders, native/internal transfers and ERC-20 transfers; method names, ownership, a zero transaction value, or a token symbol alone are not sufficient evidence. No current balance/floor source establishes these assertions. OpenSea acquisition/order reachability and authentication are unverified here; parent must verify with the legitimate key before enabling a collector.
- Snapshots are first qualifying visits, not midnight closes, not daily-return calculations and not backfilled history. Failed eligible writes are suppressed for the rest of the UTC date in that module instance; another instance or a later date may retry. ON CONFLICT protects against cross-instance duplicates. A timeout can have an uncertain remote outcome, but can never overwrite that date. The next page stays available. No real Neon DDL/INSERT was executed or claimed verified; fake-client tests cover the logic/parameters, while production database permissions and insertion remain a post-merge check.
- Scope and archive verification compare against the immutable `pre-pnl-astra-2026-09-05` tag, not movable HEAD. The scratch verifier was corrected to ignore binary favicon decoding and use that tag after the concurrent commit. These were QA-helper fixes outside the repository, not product defects.

### Final per-file test counts (parsed from Vitest JSON)

```json
{
  "total": 79,
  "passed": 79,
  "files": {
    "auth-flow.test.ts": 3,
    "dust-filter.test.ts": 7,
    "live-data.test.ts": 20,
    "pnl-history.test.ts": 8,
    "pnl.test.ts": 38,
    "portfolio-helpers.test.ts": 3
  }
}
```

### Captured final command output

The exact required commands ran with exit code 0. The anchor check uses a temporary read-only Python equivalent of `grep -c` to count matching lines and additionally verifies protected paths and archive byte identity; no checked-in script was changed. Local UI verification used a fresh `npm run start -- --hostname 127.0.0.1 --port 8125` with an external-fetch-denying preload, health-checked HTTP 200 before running the untouched harness.

#### `npm test` — exit 0

```text
npm notice run portmanager@0.1.0 test
npm notice run vitest run

 RUN  v4.1.10 /home/user/projects/portmanager


CURRENT_BOOK_TABLE_BEGIN
Fixture ETH/USD=2400; USD/THB=36, GBP/THB=45; not live quotes.
| Holding | basisStatus | P&L bucket | Reason |
|---|---|---|---|
| T212 positions: 0 | N/A (no holding) | no-op | GBP 487 cash is value only; no P&L |
| Arbitrum One ETH 0.248396 | not-recorded | not-recorded | Native balance only; no clean purchase provenance (bridge/deposit is not a basis) |
| Ethereum ETH 0.000781 | not-recorded | not-recorded | Native balance only; no clean purchase provenance (bridge/deposit is not a basis) |
| Base ETH 0.000099 | not-recorded | dust | Dust: current value below $1; basis derivation skipped |
| Robinhood Chain ETH 0.000526 | not-recorded | not-recorded | Native balance only; no clean purchase provenance (bridge/deposit is not a basis) |
| USDG 1.475 | not-recorded | not-recorded | Token balance only; no clean acquisition/payment history recorded |
| STACK token (sub-cent) | not-recorded | dust | Operator reports sub-cent value; no basis derivation; exact quantity not supplied |
| GME token (sub-cent) | not-recorded | dust | Operator reports sub-cent value; no basis derivation; exact quantity not supplied |
| 2× Stackers NFT | not-recorded | not-recorded | OpenSea inventory/floor only; acquisition and payment history not recorded |
| 2× G00fyz NFT | not-recorded | not-recorded | OpenSea inventory/floor only; acquisition and payment history not recorded |
Current-book P&L: costBasisUsd=null; pnlUsd=null; pnlPct=null; eligible=0.
CURRENT_BOOK_TABLE_END

 Test Files  6 passed (6)
      Tests  79 passed (79)
   Start at  05:50:05
   Duration  256ms (transform 438ms, setup 0ms, import 574ms, tests 98ms, environment 0ms)
```

#### `npm run lint` — exit 0

```text
npm notice run portmanager@0.1.0 lint
npm notice run eslint

/home/user/projects/portmanager/proxy.ts
  19:10  warning  'b64urlEncode' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)
```

#### `npm run build` — exit 0

```text
npm notice run portmanager@0.1.0 build
npm notice run next build
▲ Next.js 16.2.6 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 3.5s
  Running TypeScript ...
  Finished TypeScript in 2.1s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/5) ...
  Generating static pages using 7 workers (1/5)
  Generating static pages using 7 workers (2/5)
  Generating static pages using 7 workers (3/5)
✓ Generating static pages using 7 workers (5/5) in 99ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/auth/callback
├ ƒ /api/auth/login
├ ƒ /api/auth/logout
├ ƒ /asset-list
├ ○ /asset-master
├ ƒ /exchange-rate
├ ○ /icon.svg
├ ƒ /login
└ ƒ /portfolio


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

#### `python /tmp/portmanager-pnl-anchors.py` — exit 0

```text
lib/pnl.ts: BasisStatus: 3 matching lines; 1 exported declaration
lib/pnl.ts: PnlEligibility: 3 matching lines; 1 exported declaration
lib/pnl.ts: HoldingPnl: 7 matching lines; 1 exported declaration
lib/pnl.ts: deriveT212Pnl: 1 matching lines; 1 exported declaration
lib/pnl.ts: OnchainHolding: 3 matching lines; 1 exported declaration
lib/pnl.ts: AcquisitionEvidence: 3 matching lines; 1 exported declaration
lib/pnl.ts: AcquisitionLot: 3 matching lines; 1 exported declaration
lib/pnl.ts: HistoricalUsdPrice: 3 matching lines; 1 exported declaration
lib/pnl.ts: deriveOnchainPnl: 1 matching lines; 1 exported declaration
lib/pnl.ts: PnlClass: 8 matching lines; 1 exported declaration
lib/pnl.ts: PnlCoverage: 3 matching lines; 1 exported declaration
lib/pnl.ts: PnlSummary: 4 matching lines; 1 exported declaration
lib/pnl.ts: PortfolioPnlTotals: 2 matching lines; 1 exported declaration
lib/pnl.ts: PnlClassInput: 4 matching lines; 1 exported declaration
lib/pnl.ts: aggregatePnl: 1 matching lines; 1 exported declaration
lib/pnl-history.ts: SnapshotDb: 3 matching lines; 1 exported declaration
lib/pnl-history.ts: SnapshotRecorderOptions: 2 matching lines; 1 exported declaration
lib/pnl-history.ts: SnapshotRecordResult: 3 matching lines; 1 exported declaration
lib/pnl-history.ts: createSnapshotRecorder: 2 matching lines; 1 exported declaration
lib/pnl-history.ts: recordPortfolioSnapshot: 1 matching lines; 1 exported declaration
lib/assets-db.ts: PORTFOLIO_SNAPSHOT_DDL: 1 exported declaration
lib/pnl.test.ts: basisStatus: 27 matching lines
lib/pnl.ts: basisStatus: 4 matching lines
lib/: basisStatus: TOTAL 31 matching lines
lib/assets-db.ts: portfolio_snapshot: 1 matching lines
lib/pnl-history.ts: portfolio_snapshot: 2 matching lines
lib/: portfolio_snapshot: TOTAL 3 matching lines
app/: new P&L symbol/field references: 0
Protected app/scripts/auth/dust/package paths: unchanged; git diff --check: PASS
Archive schema/seed/code: byte-identical after removing ONLY snapshot DDL addition
UI contract script: byte-identical; 12/12 named UI anchors present
Static security scan hardcoded secrets: 0
Static security scan shell injection: 0
Static security scan eval/exec: 0
Static security scan unsafe deserialization: 0
Static security scan SQL interpolation: 0
Independent read-only Codex review: PASS; 0 security concerns; 0 logic errors
```

#### `curl --fail --silent --show-error --output /dev/null --write-out 'Local production health: HTTP %{http_code}\n' http://127.0.0.1:8125/ && node scripts/ui-contract-check.mjs` — exit 0

```text
Local production health: HTTP 200
PASS | desktop / responds successfully — HTTP 200 · /
PASS | desktop / uses the dark theme
PASS | desktop / has no horizontal body overflow — 1440px / 1440px
PASS | desktop / renders no undefined/null/NaN
PASS | desktop / uses a POST-only sidebar logout control — POST form · no logout link
PASS | home renders no investor names
PASS | home renders no allocation language
PASS | home preserves three KPIs and adds the non-NFT wallet KPI
PASS | home wallet panel exposes both sources and the wallet table contract — wallet sources returned no display rows
PASS | H1 home wallet hide-under-$1 toggle is present and checked by default
PASS | H2 home wallet default view hides unpriced and under-$1 rows — wallet sources returned no display rows
PASS | H3 home wallet toggle restores the full ordered row set and preserves totals — wallet sources returned no display rows; empty state remained stable
PASS | home wallet rows keep native/token order and unpriced nulls — 0 wallet rows
PASS | H4 home wallet toggle path keeps the browser console clean
PASS | desktop /asset-list responds successfully — HTTP 200 · /asset-list
PASS | desktop /asset-list uses the dark theme
PASS | desktop /asset-list has no horizontal body overflow — 1440px / 1440px
PASS | desktop /asset-list renders no undefined/null/NaN
PASS | desktop /asset-list uses a POST-only sidebar logout control — POST form · no logout link
PASS | asset-list is labelled live and read-only
PASS | asset-list exposes no mutation forms or controls
PASS | asset-list renders no investor names
PASS | asset-list renders the read-only wallet registry — wallet sources returned no registry rows
PASS | asset-list wallet rows keep native/token order and unpriced nulls — 0 wallet registry rows
PASS | desktop /asset-list keeps the browser console clean
PASS | desktop /portfolio responds successfully — HTTP 200 · /portfolio
PASS | desktop /portfolio uses the dark theme
PASS | desktop /portfolio has no horizontal body overflow — 1440px / 1440px
PASS | desktop /portfolio renders no undefined/null/NaN
PASS | desktop /portfolio uses a POST-only sidebar logout control — POST form · no logout link
PASS | portfolio separates live value from legacy context
PASS | portfolio Plottable chart contract — no chart host (live sources and Neon history may be unavailable)
PASS | desktop /portfolio keeps the browser console clean
PASS | desktop /exchange-rate responds successfully — HTTP 200 · /exchange-rate
PASS | desktop /exchange-rate uses the dark theme
PASS | desktop /exchange-rate has no horizontal body overflow — 1440px / 1440px
PASS | desktop /exchange-rate renders no undefined/null/NaN
PASS | desktop /exchange-rate uses a POST-only sidebar logout control — POST form · no logout link
PASS | exchange-rate is labelled live and read-only
PASS | exchange-rate exposes no mutation forms or controls
PASS | desktop /exchange-rate keeps the browser console clean
PASS | desktop /asset-master responds successfully — HTTP 200 · /asset-list
PASS | desktop /asset-master uses the dark theme
PASS | desktop /asset-master has no horizontal body overflow — 1440px / 1440px
PASS | desktop /asset-master renders no undefined/null/NaN
PASS | desktop /asset-master uses a POST-only sidebar logout control — POST form · no logout link
PASS | desktop /asset-master keeps the browser console clean
PASS | mobile / responds successfully — HTTP 200 · /
PASS | mobile / uses the dark theme
PASS | mobile / has no horizontal body overflow — 390px / 390px
PASS | mobile / renders no undefined/null/NaN
PASS | mobile / uses a POST-only sidebar logout control — POST form · no logout link
PASS | mobile / keeps the browser console clean
PASS | mobile /asset-list responds successfully — HTTP 200 · /asset-list
PASS | mobile /asset-list uses the dark theme
PASS | mobile /asset-list has no horizontal body overflow — 390px / 390px
PASS | mobile /asset-list renders no undefined/null/NaN
PASS | mobile /asset-list uses a POST-only sidebar logout control — POST form · no logout link
PASS | mobile /asset-list keeps the browser console clean
PASS | mobile /portfolio responds successfully — HTTP 200 · /portfolio
PASS | mobile /portfolio uses the dark theme
PASS | mobile /portfolio has no horizontal body overflow — 390px / 390px
PASS | mobile /portfolio renders no undefined/null/NaN
PASS | mobile /portfolio uses a POST-only sidebar logout control — POST form · no logout link
PASS | mobile /portfolio keeps the browser console clean
PASS | mobile /exchange-rate responds successfully — HTTP 200 · /exchange-rate
PASS | mobile /exchange-rate uses the dark theme
PASS | mobile /exchange-rate has no horizontal body overflow — 390px / 390px
PASS | mobile /exchange-rate renders no undefined/null/NaN
PASS | mobile /exchange-rate uses a POST-only sidebar logout control — POST form · no logout link
PASS | mobile /exchange-rate keeps the browser console clean
PASS | mobile /asset-master responds successfully — HTTP 200 · /asset-list
PASS | mobile /asset-master uses the dark theme
PASS | mobile /asset-master has no horizontal body overflow — 390px / 390px
PASS | mobile /asset-master renders no undefined/null/NaN
PASS | mobile /asset-master uses a POST-only sidebar logout control — POST form · no logout link
PASS | mobile /asset-master keeps the browser console clean

PASS | UI contract summary — 77/77 checks passed
```
