# REPORT-PNL-DATA.md — Run 1: P&L data core (cost basis + P&L aggregation + daily snapshot history)

- Date: 2026-09-05
- Branch: `feat/pnl-astra-data` (no push, main untouched)
- Env: no DATABASE_URL, no API keys — everything implemented/tested/built without live providers or Neon.

## What changed

### Files created
| File | Purpose |
|---|---|
| `lib/pnl.ts` | Pure cost-basis vocabulary, conservative acquisition-evidence engine, and P&L aggregation. No fetchers, no DB. |
| `lib/pnl.test.ts` | 33 unit tests (T212 derivation, on-chain evidence ladder, joined aggregation, arithmetic identity, required current-book fixture table). |
| `lib/pnl-history.ts` | UTC-daily snapshot recorder (injectable clock, module-level attempt guard, write timeout, error swallow) + `recordPortfolioSnapshot` production singleton. |
| `lib/pnl-history.test.ts` | 6 unit tests: hook wiring, error swallow (connect/DDL/insert/hang), no-IO guards, ON-CONFLICT semantics, UTC rollover, ineligibility not consuming the attempt. |

### Files modified (additive only)
- `lib/live-data.ts` — imports engine; extends holding types + `totals` additively; assembles basis in `buildJoinedPortfolio`; hooks recorder behind `hasDb` in `getJoinedPortfolio`; carries exact RPC base units (`amountRaw`) on native balances. Existing fields, null semantics, totals arithmetic and archive types unchanged.
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

`JoinedPortfolioInputs` gains optional `basisEvidence?: Record<string, AcquisitionEvidence>` — audited histories keyed `nft:4663:<collection>`, `native:<chainId>:native`, `token:<chainId>:<lowercase contract>`. No live fetcher produces this yet; nothing synthesizes it.

## Classification ladder as implemented

1. **T212 positions → `t212-live`.** Basis = `averagePrice × quantity`; P&L = API `ppl` where present, `(current − average) × quantity` fallback only when `ppl` is null. USD conversion: API P&L uses its own `pplCurrency`; basis uses instrument currency → USD via `usdToThb`, `gbpToThb`, `eurToThb`. **Reconciliation guard:** the API P&L quote is often an FX-account figure that does not reconcile with spot-converted `valueUsd − basisUsd`; such rows stay `t212-live` with their API P&L shown but are marked `unreconciled` and excluded from the P&L sums (never silently mixed). Exact unit tests cover the null-ppl fallback, preserved explicit zero, missing average cost, and an unsupported FX cross → `not-recorded` (no zero invented).
2. **Airdrops / claims / mints → `airdrop-free` ONLY with verified evidence.** A balance alone is never "free". The engine requires a normalized `AcquisitionEvidence` bundle proving: complete history, no disposals, no multi-asset acquisitions, successful tx, acquired quantity matches the entire current holding exactly (raw units), operation ∈ mint/claim/airdrop, AND all payment legs observed with zero native outflow and zero ERC-20 outflow. Native holdings can never be airdrop-free because native is the payment asset by definition. Every defect in the evidence (incomplete history, disposal, partial quantity, wrong chain/asset, duplicate tx, multi-asset, failed, bad units, stale/missing/mismatched historical price, multi-payment) fails to `not-recorded` — never a guessed basis.
3. **Clean on-chain purchase → `onchain-derived`.** Evidence must show operation=purchase, exactly ONE payment leg (native or ERC-20), complete history, no disposals, acquisitions summing exactly to the current raw-unit balance. The payment leg is valued ONLY with a keyless documented historical USD quote pinned near acquisition: DefiLlama historical ≤ 1 hour from tx time, or CoinGecko date-history quote on the same UTC acquisition date (daily granularity, documented as not execution-price precise). No clean historical price → `not-recorded`. Never approximated with today's price. Payment assets are WETH/USDC-style separate legs; gas is excluded by portfolio convention (basis note says this is not a tax-cost ledger). Transfers, bridges, exchange deposits, wrappers, EOA-with-no-value and multi-leg that cannot be valued confidently → `not-recorded` (unit-tested per operation).
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

- **RH Chain explorer is Cloudflare-walled from serverless hosts** (existing fact in live-data.ts). RH token/NFT acquisition history cannot be enumerated via Blockscout HTTP; RH data is RPC balances + OpenSea inventory only. Basis for every RH holding therefore cannot be derived until an alternative history source exists.
- **Balance/floor endpoints prove no basis.** Native balances (4 RPCs) and OpenSea floors tell you what is held now, not how it was acquired. Arbitrum ETH provenance is a bridge/deposit per the brief — the engine's classification is exactly the expected `not-recorded` outcome.
- **No historical USD prices were fetched** (no live APIs, per brief). The engine is price-provider-ready (DefiLlama/CoinGecko, keyless, documented) but nothing is approximated.
- **Unpriced meme dust and sub-cent RH tokens** carry no exact quantity/price in code, only a value bucket — so even the dust classification in the table is an operator assertion, not a live fetch. Live output after deployment will bucket them automatically from real balances.

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

NO seed rows. Recorder: `INSERT … ON CONFLICT (snapshot_date) DO NOTHING RETURNING snapshot_date` — one row per UTC day, first qualifying observation wins; a later same-day observation returns `already-exists` and cannot overwrite. Guards: only when `hasDb()` (Neon configured), only when grand totals are finite non-negative and fiat FX is live, only when the portfolio `asOf` is on the same UTC date as the injected clock and not in the future. Attempts are coalesced per module instance (attempt flag set BEFORE the first await) so page renders do not hammer Neon; ineligibility does not consume the day's attempt; a fresh UTC date rolls the flag. DB construction, DDL, INSERT and hangs are swallowed (fixed "snapshot write failed" log, no secrets) with a bounded default 2s write timeout; the page never fails. Hook lives in `getJoinedPortfolio` behind `hasDb()` — a local/test no-DATABASE_URL environment is a clean no-op (unit-tested).

**Design note surfaced (no silent deviation):** the recorder awaits the bounded write (2s max) rather than fire-and-forget because serverless runtimes can drop detached promises before they flush; the whole path is race-bounded and error-swallowed, so worst-case page cost is ~2s only when Neon is configured AND the write is failing/hanging.

## Risk flags for Run 2

1. **Pin these field names/types** (above) before UI work; Run 2's P&L cards will read `totals.pnlByClass.<class>` and `totals.pnlCoverage`, and holding rows expose `costBasisUsd/pnlUsd/basisStatus/basisNote/pnlEligibility`. `JoinedT212Position` also gained `valueUsd`.
2. **`complete` vs `partial` semantics matter:** `pnlCoverage.status: "complete"` requires every source live AND zero exclusions. Until a verified historical collector exists, every real render will be `partial` with eligible=0 and null P&L — Run 2 must render this state honestly ("no recorded cost basis yet"), not as an error or as $0.
3. **`unreconciled` T212 rows** are a real possibility when positions exist: API FX P&L may not equal spot-converted value − basis. UI should distinguish them (value and basis shown; P&L sums exclude them) and never average them into pnlPct.
4. **Gas is excluded** from cost basis by portfolio convention (documented in basisNote wording) — do not present basis as a tax-cost figure.
5. **NFT collection vs token granularity:** P&L is per joined row (an NFT collection row = one holding across `tokenCount` items). The evidence model supports collection-level quantity; Run 2's per-item UI (if any) must not re-derive per-item basis without evidence.
6. **Airdrop-free has basis $0 and pnlPct null** — a separate UI state from onchain-derived/t212-live. Never render 0/0.
7. **Snapshot coverage JSONB** is the single source of truth for history completeness; Run 2's calendar/chart should read it per day rather than assuming rows are whole-book.

## Self-QA (exact commands, printed results)

### 1. `npm test`
```
Test Files  6 passed (6)
     Tests  72 passed (72)
```
(33 pre-existing + 39 new: pnl.test.ts 33 incl. current-book fixture table; pnl-history.test.ts 6. Previous suite: 4 files/33 tests — all unmodified expectations pass.)

### 2. `npm run lint`
```
/home/user/projects/portmanager/proxy.ts
  19:10  warning  'b64urlEncode' is defined but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (0 errors, 1 warning)
```
0 errors; only the pre-existing proxy.ts warning.

### 3. `npm run build`
Next.js 16.2.6 production build: compiled successfully, TypeScript passed, 10 routes generated, static generation 5/5 — clean.

### 4. Grep anchors
- New exported symbols in `lib/`: `deriveT212Pnl` (pnl.ts), `deriveOnchainPnl` (pnl.ts), `aggregatePnl` (pnl.ts), `recordPortfolioSnapshot` + `createSnapshotRecorder` (pnl-history.ts) — grep counts: `basisStatus` 26, `portfolio_snapshot` 3 (both DDL + INSERT), all under `lib/`.
- `app/` references to P&L symbols/table: **0** (grep across `app/**` returns no matches — no UI changed).

### 5. Fixture classification ladder for the current real book
Printed inline above; also printed by `npm test` ("CURRENT_BOOK_TABLE_BEGIN…END"). All ten requested items answered; `not-recorded` is the correct answer wherever provenance is deposit/bridge/balance-only. No `airdrop-free` anywhere — correctly, because no evidence exists for it.

### 6. UI contracts
`scripts/ui-contract-check.mjs` untouched. Ran against a local production build (`npm run build && npm run start -- --hostname 127.0.0.1 --port 8125`) with external providers denied: **PASS | UI contract summary — 77/77 checks passed**. Playwright chromium is installed locally, so no report limitation.

## Deviations from the brief (all disclosed, none silent)

1. **Live on-chain history collector omitted** (still `not-recorded`): rule 6+10 permit clean keyless history, but safe implementation would require live-fetch fixtures this run forbids hitting, and the brief itself stresses fail-independent derivation. The engine, vocabulary, evidence contract and full rejection matrix are implemented and unit-tested; the collector is a clean follow-up run. This is the "OpenSea order endpoints / history" risk item — parent should verify live after merge if a collector is wanted.
2. **`JoinedT212Position.valueUsd` added** — required for the portfolio-wide `pnlUsd = Σ(valueUsd − basisUsd)` identity; additive.
3. **`NormalizedWalletNativeBalance.amountRaw` added** (optional) — exact raw units are required before any native purchase evidence can be matched; float reconstruction is refused.
4. **T212 aggregate arithmetic treats value in account currency** (`valueAccount`) while `valueNative` (instrument currency) also feeds row `valueUsd`. `valueUsd` picks account value first, matching the API P&L basis used for reconciliation.
5. **Snapshot hook placement** is `getJoinedPortfolio` (the single server fetch boundary) rather than each page — a page-visit-per-UTC-day still records one row, and pure-builder tests never touch the DB.
6. **Write timeout + awaited bounded write** added to satisfy "never fail/hammer the page" under serverless semantics (design note above).

No rendered UI, no API routes, no paid/scraped providers, no DB mutation beyond the new snapshot table, and no archive seed/ALTER/UPDATE executed by the recorder.
