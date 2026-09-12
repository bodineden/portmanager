# REPORT — PortManager display regrouping: "Stocks Port" + "Crypto Port"

> **Worker coordination (09:55 UTC): final QA is still in progress.** The parent/sibling's raw-only share guard exposed an overflow regression (`finite constituent sum overflows the merged class value`), now being fixed by narrow agent `proc_d875cf0fdb93`. It must validate both raw constituents AND grouped finite values. The required key type is `PnlClass | "crypto"` per the owner, not the optional narrowed type. Final test count will exceed 336. Please do not commit/push/rebuild shared `.next` before reconciling `/tmp/crypto-port-qa/WORKER-COORDINATION.md` and the final worker addendum.

Branch `feat/crypto-port` (from `main` @ `4ba809d`). Baseline tag: `pre-crypto-port-2026-09-12`.
Author of this run: parent agent (markets profile). No `main` push, no merge, no data writes.

## 1. Owner override that governs the output

Bodin, 2026-09-12, on top of `BRIEF-PM-CRYPTO-PORT.md`:

> "NFTs, Wallet native, wallet tokens should be Crypto Port. T212 and cash is Stocks Port. Both only."

So the brief's required three rows (`Stocks Port` / `Cash` / `Crypto Port`) were superseded by **two** rendered
rows: `Stocks Port` and `Crypto Port`, in that order, and the `cash` allocation key is gone from the rendered
class legend (`data-value-class` emits exactly `t212` and `crypto`). Everything else in the brief's scope
statement holds: display grouping only, the data model is untouched.

**Cash folds into Stocks Port as a display decision, not a data one.** Cash is the T212 broker's
`cashAvailable` plus the manually reported cash-pot ledger, which is money held inside the T212 account, so
"Stocks Port" is now the whole T212 account: remainder (account total − broker cash, the authoritative main
formula) **plus** broker cash **plus** manual cash. Consequences, all deliberate and regression-tested:

- cash still has **no basis, no P&L and no eligible holdings**; the Stocks Port P&L line continues to read
  straight from `pnlByClass.t212`, so cash can never manufacture recorded P&L;
- manual cash keeps its own per-asset `manual-cash` row (`value only · no P&L`, `—` basis/P&L cells) and stays
  out of the asset eligibility buckets;
- the per-holding table, source badges, NFT registry subtotal and "Total wallet (priced)" footer still count
  cash and venue facts exactly as before.

## 2. Files touched (10 tracked files, no new dependencies, no other edits)

| file | +/- | what changed |
|---|---|---|
| `lib/pnl-view.ts` | +43/−11 | `valueAllocation()` returns 2 rows; `key` narrowed to `"t212" \| "crypto"`; new `allocationPnl()`; `completeValueSum()` helper |
| `app/page.tsx` | +8/−5 | hero class legend + allocation-by-class rows now render the grouped classes and a merged crypto P&L line |
| `app/asset-list/page.tsx` | +19/−14 | subtitle, KPI 01 `Stocks Port` (grouped value), KPI 03 `Crypto Port`, KPI 04 count line |
| `app/portfolio/page.tsx` | +27/−19 | KPI 02 `Stocks Port · Current Value`, KPI 03 `Crypto Port · Current Value`, snapshot-register coverage cell |
| `app/home.css` | +2/−5 | class legend grid 5 → 2 columns; dot colours `.is-cash/.is-nfts/.is-walletNative/.is-walletTokens` → `.is-crypto` |
| `lib/pnl-view.test.ts` | +81/−10 | allocation/P&L expectations repointed; new merged-P&L, per-currency-null, negative-constituent and cash-fold cases |
| `lib/pnl-correctness-pages.test.ts` | +27/−4 | render-surface assertions for both pages + cross-page regression test |
| `lib/adjusted-day-change.test.ts` | +2/−2 | cash is no longer its own row; assertion repointed to `t212` and sum identity |
| `scripts/ui-contract-check.mjs` | +28/−17 | allocation label loop, `data-value-class` keys, grouped values, outage keys, legend cardinality |
| `scripts/capital-ui-checks.mjs` | +5/−4 | capital fixture class count/cash-folding (independent of the main harness) |

`BRIEF-PM-CRYPTO-PORT.md` and the other untracked briefs/reports/backups stayed untracked; staging used explicit
paths only (`git add` per file, never `-A`).

## 3. Label map as applied

| before | after | where |
|---|---|---|
| `T212 stocks` (allocation class) | **`Stocks Port`** (now also carries cash) | `lib/pnl-view.ts`, hero legend, allocation list |
| `Cash` (allocation class) | folded into **`Stocks Port`** (owner override) | `lib/pnl-view.ts` |
| `NFTs` + `Wallet native` + `Wallet tokens` | **`Crypto Port`** (one class) | `lib/pnl-view.ts`, hero legend, allocation list |
| asset-list subtitle `Trading 212, NFTs, native coin, and ERC-20 tokens…` | `Stocks Port and Crypto Port in one live registry` | `app/asset-list/page.tsx` |
| `01 / T212 ACCOUNT` (registry KPI) | `01 / Stocks Port` (value = grouped Stocks Port) | `app/asset-list/page.tsx` |
| `03 / NFT PORT` (registry KPI) | `03 / Crypto Port` | `app/asset-list/page.tsx` |
| count line `N T212 · N NFT · N wallet assets` | `N Stocks Port · N Crypto Port assets` | `app/asset-list/page.tsx` |
| `02 / T212 LIVE` + label `Account Total` | `02 / Stocks Port` + `Current Value` | `app/portfolio/page.tsx` |
| `03 / NFT LIVE` + label `Wallet Floor Value` | `03 / Crypto Port` + `Current Value` | `app/portfolio/page.tsx` |
| coverage cell `T212 + NFT + wallet` | `Stocks Port + Crypto Port` | `app/portfolio/page.tsx` |
| portfolio subtitle `Live T212, NFT and wallet value…` | `Live Stocks Port and Crypto Port value…` | `app/portfolio/page.tsx` |

### Remaining `T212`/`NFT`/`native`/`tokens` occurrences and why each stays

Every occurrence of the greps (`T212 stocks`, `Wallet native`, `Wallet tokens`, `NFTs`, `T212 LIVE`,
`T212 ACCOUNT`, `T212`) across `app/` and `lib/` was reviewed; app code has none left that names a portfolio class.

- `app/asset-list/page.tsx:111-112` — `T212 ACCOUNT`, `T212 POSITIONS`: **source-status** card labels (data sources).
- `app/asset-list/page.tsx:250/258/266` — `T212 / —`, `T212 / !`, `T212 / 00`: empty-state codes of the
  *Live Securities Registry*, i.e. the venue.
- `app/page.tsx:54-55` — `sourceNames` map (`T212 account`, `T212 positions`, `OpenSea NFTs`, `Wallet native`,
  `Wallet tokens`, …): these are **source** names for `sources` keys, not class names. The brief explicitly
  allows this map where it names sources.
- `app/pnl-asset-table.tsx:13` — `NFT collection · floor …`: per-asset **detail** text; file untouched.
- `lib/live-data.ts`, `lib/pnl.ts` — fetcher/type/function names (`NormalizedT212Position`, `deriveT212Pnl`,
  `T212_API_KEY`, …) and honest status messages ("more than 200 NFTs"). Untouched by design (see §6).
- `lib/*.test.ts` + fixtures — `"T212 cash pot"` is the **operator's ledger label** for the manual cash row
  (it is a venue ledger entry, not a portfolio class), plus env-var stubs and assertion strings. Untouched.

## 4. Aggregation rules implemented (pinned by tests)

`valueAllocation(portfolio)` → `[{ key: "t212", label: "Stocks Port" }, { key: "crypto", label: "Crypto Port" }]`

- Stocks Port `valueUsd` = `stocksRemainder + cash`, `valueThb` likewise; **null if any of the four inputs is
  unknown** (account total, broker cash, manual cash USD, manual cash THB). The account remainder keeps main's
  authoritative formula (account total − broker cash, only when `account >= brokerCash`).
- Crypto Port = NFTs + wallet native + wallet tokens **summed**, and **null if ANY of the three is null** —
  never a partial crypto total presented as the whole class.
- Shares keep the main rule and stayed fail-closed: `complete` requires **every underlying constituent**
  (remainder, cash, nfts, native, tokens) finite and ≥ 0, so a negative subtotal can never be masked by a
  positive sibling (this was caught by independent review — see §7).
- Recorded P&L: Stocks Port reads `pnlByClass.t212`; Crypto Port sums the three classes' `pnlUsd` /
  `costBasisUsd` over the classes whose value is finite (null only when all three are null), eligible count and
  every coverage bucket (`notRecorded`, `unreconciled`, `dust`, `unpriced`, `sourcesComplete`) summed; unknown
  still renders `—`, never `0`. Cash contributes no eligible holdings.
- Unchanged by construction: `lib/pnl.ts` math, `lib/live-data.ts` fetchers, `lib/dust-filter.ts`,
  `lib/pnl-history.ts`, snapshot recording, `proxy.ts`, `app/api/**`, `public/**`, mascot copy, per-holding rows.

## 5. Harness / test assertions changed and why

- `scripts/ui-contract-check.mjs`
  - `for (const label of ["T212","NFT","native","tokens"])` → `["Stocks Port","Crypto Port"]` (hero/registry
    class identity). The old loop asserted four class strings that no longer exist.
  - new assertions: the allocation list must contain **exactly** `["Stocks Port","Crypto Port"]` in order, and
    `[data-value-class]` must be exactly `["t212","crypto"]`; the check now returns the observed keys + allocation
    rows so the reviewer can diff them.
  - registry count line regex `N wallet assets` → `N Crypto Port assets`, and the expected count is compared
    against **displayed wallet rows + displayed NFT rows** (was wallet rows only).
  - outage checks: `["nfts","walletNative"]` → `["crypto"]`, `["t212","nfts","walletNative","walletTokens"]` →
    `["t212","crypto"]` (the DOM keys that exist now); the negative controls inside those blocks
    (null totals, unavailable badges, "no zero valuation") are unchanged.
  - fixture full-set class values: `["t212" 1.999, "cash" 0.25, "nfts", "walletNative", "walletTokens" 1.999 each]`
    → `["t212" 2.249, "crypto" 5.997]` (same underlying full-set numbers, regrouped).
  - legend cardinality 5 → 2 with both keys present (this is the mascot-occlusion legend check).
- `scripts/capital-ui-checks.mjs` — independently pinned `count === 5` ("cash allocation class missing").
  Repointed to `=== 2` plus explicit assertions that `[data-value-class="t212"]` equals the full book value
  (i.e. the GBP 2,000 pot is in Stocks Port, not dropped or double-counted) and `[data-value-class="cash"]`
  is absent. Its manual-cash honesty checks (`—` basis/P&L, excluded from buckets) are untouched.
- `lib/pnl-view.test.ts` — the five-row key/value arrays became two-row arrays; `allocation[1].valueThb`
  (cash) became `allocation[0].valueThb` (Stocks Port) with the recomputed total; added: merged crypto P&L +
  every coverage bucket sums and the book object is not mutated; per-currency null for each of the three crypto
  subtotals; all-unknown ≠ known zero; **negative constituent cannot be masked** (new, see §7); Stocks Port is
  null when any of its four inputs is unknown while cash still cannot add eligible holdings.
- `lib/pnl-correctness-pages.test.ts` — the three per-class regexes (`nfts` 1.50, `walletNative` 1.50,
  `walletTokens` 6.50) became one `crypto` US$9.50 regex plus an exact `["t212","crypto"]` key-order assertion;
  registry count line `1 T212 · 1 NFT · 3 wallet assets` → `1 Stocks Port · 4 Crypto Port assets`; added a
  cross-page test asserting the grouped Stocks Port value (US$101.75 / ฿3,663.00 incl. the manual pot) and
  Crypto Port value on the asset-list and portfolio pages, the merged P&L line, and that no page renders the
  retired class strings.
- `lib/adjusted-day-change.test.ts` — the cash-row THB assertion pointed at a row that no longer exists;
  repointed to `t212` and expressed as the sum identity (`t212Thb + manualThb`) instead of a literal.
- **No honesty/safety assertion was deleted.** Every negative control (unknown never `0`, hidden data cannot be
  waived by copy, totals stay full-set truth, unavailable sources keep their badges, no mutation controls) is
  still present and still green.

## 6. Invariants — evidence

Deterministic evidence captured from the real page components + real `buildJoinedPortfolio` over the five
committed dust fixtures (`mixed`, `empty`, `failed`, `eth-outage`, `fiat-outage`), **before** the production edit
and **after** it: joined book JSON, snapshot-recorder return value *and* the exact `INSERT` parameter payload,
and static SSR of `/`, `/asset-list`, `/portfolio`. After normalising only the grouped allocation/KPI/subtitle
blocks, everything else is byte-identical:

```
PASS mixed      book SHA256 f1477d2f…  recording SHA256 94f9937f…  recorded SHA256 6ebb7f08…
PASS mixed      home/registry/portfolio non-grouping HTML SHA256 97cbe99d… / 32af6a3d… / 41b62d1f…
PASS empty      … same three comparisons, 0 failures
PASS failed     … same three comparisons, 0 failures
PASS eth-outage … same three comparisons, 0 failures
PASS fiat-outage… same three comparisons, 0 failures
PASS mixed      valueUsd exact old/new sum 8.246 = 8.246   old [1.999,0.25,1.999,1.999,1.999] → new [2.249,5.997]
PASS empty      valueUsd exact old/new sum 3.996 = 3.996
PASS failed     unknown preserved: [1.999,0.25,null,null,null] → [2.249,null]
PASS eth-outage unknown preserved: [1.999,0,null,null,1.999] → [1.999,null]
PASS fiat-outage unknown preserved: [0.999,0,null,null,null] → [0.999,null]
PASS 45 protected sources byte-identical to 4ba809d (lib/pnl.ts, lib/live-data.ts, lib/dust-filter.ts,
     lib/pnl-history.ts, lib/holding-values.ts, lib/capital*.ts, proxy.ts, app/api/**, app/pnl-asset-table.tsx,
     app/mascot*, lib/mascot*, public/** incl. every GLB/webp/mp4/webm)
```

(86 individual PASS lines; re-run after the review fix above — same result.)

So: hero/grand-total, `totals.*`, snapshot recording and every per-holding row are unchanged; the grouped
classes sum to exactly the previous five-class sum whenever all inputs are known; unknown stays unknown (never
`0`); excluded rows still say so.

**Cash fold, verified numerically (fixture `capital-book`, the real GBP 2,000 pot):**
`Stocks Port = US$2,716.65 / ฿89,660.00`, which is exactly `t212 remainder + broker cash + ฿89,230.80 manual pot`
— the same ฿89,660.00 that the old `t212` + `cash` rows produced together.

## 7. Independent review and the one fix it forced

An independent read-only reviewer (separate agent context, diff only, fail-closed) returned `passed: false` with
one logic error and no security concerns: grouping validity was being checked **after** summation, so a negative
child subtotal offset by a positive sibling could yield valid-looking share percentages where `main` withheld
them. That was a real weakening of main's fail-closed behaviour and was fixed test-first:

1. RED — `lib/pnl-view.test.ts` "withholds shares when one grouped crypto constituent is negative even if a
   sibling offsets it" failed against the grouped implementation (`expected false to be true`).
2. GREEN — `valueAllocation()` now tests `[stocksRemainder, cash, nftsUsd, walletNativeUsd, walletTokensUsd]`
   individually (`finite && >= 0`) **and** the two grouped rows (`finite && >= 0`) before deriving any share: the
   constituent set is exactly what `main` checked, and the extra row check additionally fails closed when a
   merged total overflows to a non-finite value.
3. Also applied from that review: explicit Stocks Port incl. manual-cash assertions on both `asset-list` and
   `portfolio`, plus guard tests for a negative crypto sibling, a negative cash-group sibling and a merged-class
   overflow (these last cases were committed by an overlapping agent session editing the same two test files
   during this run; the final files are the merged result and the whole suite is green).
4. Not applied: narrowing `ValueAllocation.key`. The type is still `PnlClass | "crypto"`, so the wider union is
   allowed at compile time even though `valueAllocation()` only ever returns `t212` and `crypto`. Both the unit
   tests and the browser harness assert the exact two-key set, so the contract is pinned by tests rather than by
   the type.

## 8. Mandatory self-QA — raw output

**1. `npm test`** (final state, committed tests only — the temporary before/after capture test lives in `/tmp`):

```
 Test Files  19 passed (19)
      Tests  339 passed (339)
```

(baseline before this change: 328 passed / 19 files; +11 from this run)

**2. `npm run lint`** — `✖ 1 problem (0 errors, 1 warning)`; the warning is the pre-existing
`proxy.ts:19 'b64urlEncode' is defined but never used`, expected per the brief.

**3. `npm run build`** — clean (exit 0). Routes unchanged: `/`, `/asset-list`, `/portfolio`, `/exchange-rate`,
`/login`, `/asset-master`, `/api/auth/*`, `/api/cron/snapshot`.

**4. Local production server + `node scripts/ui-contract-check.mjs`**
Server: `npm run start -- --hostname 127.0.0.1 --port 38151` with `T212_API_KEY`/`T212_API_SECRET` from
`/home/user/.hermes/profiles/markets/secrets/t212_api.json`, `NFT_WALLET=0xC1bd8020d08B2A1F98da54f1573A54412d99c609`,
`DATABASE_URL` blank (DB-free run, so the manual-holdings and contributed-capital ledgers are honestly
`unavailable`) and no `OPENSEA_API_KEY` (NFT source `unavailable`, expected).

```
PASS | UI contract summary — 503/503 checks passed     (exit 0, frozen commit d31e308, uncontended run)

including
PASS | desktop/mobile home allocation remains value-based even when P&L is unavailable — {"keys":["t212","crypto"],"allocation":["Stocks Port—Share unavailable · —P&L (recorded): — · 0 eligible","Crypto Port—Share unavailable · —P&L (recorded): — · 0 eligible"]}
PASS | Mascot resting/occlusion summary — 10/10 checks passed at 1440×1000 and 390×844
PASS | Mascot DOM assertion summary — 50/50
PASS | Mascot 3D/video fallback summary — 65/65
PASS | Mascot contract summary — 126/126
```

Baseline context: no assertion was dropped — the loop/label/cardinality checks above were repointed in place,
and the same five blocks (home, asset-list, portfolio, capital fixtures, dust fixtures) still run at both
viewports. Run history for the one flaky assertion is in §9 flag 2.

**Harness checks that needed updating:** the 9 listed in §5 (all label/key/cardinality assertions keyed to the
old five-row model). Note the one-off failure in the first run is a documented timing flake, see §9.

**5. Rendered allocation block + `data-value-class` attributes (live server, final build)**

```
data-value-class -> [('t212', 'Stocks Port', '—', '—'), ('crypto', 'Crypto Port', '—', '—')]

CURRENT VALUE MIX
Allocation by class
Stocks Port
—
Share unavailable · —
P&L (recorded): — · 0 eligible
Crypto Port
—
Share unavailable · —
P&L (recorded): — · 0 eligible

Shares describe current class values; shares are unavailable when a class has no known subtotal.
```

Live per-holding rows unchanged (`t212:CMCSA_US_EQ`, `native:1`, `native:4663`,
`token:4663:0x5fc5…`), sources: `t212Summary/t212Positions/fiatFx/ethPrice/walletNative/walletTokens` = `live`,
`nfts` = `unavailable` (no OpenSea key locally), `manualHoldings`/`capital` = `unavailable` (no DB in this run).

Fixture render (real components, `dust-mixed-home`) with all inputs known:

```
Stocks Port  US$2.25 · 27.3% of priced value · ฿80.96 · P&L (recorded): US$0.50 · 1 eligible
Crypto Port  US$6.00 · 72.7% of priced value · ฿215.89 · P&L (recorded): US$2.50 · 3 eligible
```

and with the ETH price out (`dust-eth-outage-home`): `Stocks Port US$2.00`, `Crypto Port —` with
`Share unavailable`, while Crypto Port's *recorded* P&L still shows `US$1.00 · 1 eligible` — an unknown class
value never becomes `0` and never hides the recorded subset.

## 9. Risk flags for the reviewer

1. **The cash fold is an owner-instructed scope change, and the brief still says `Cash` unchanged.** The brief's
   table lists `Cash → Cash`, but Bodin's message explicitly overrides it ("T212 and cash is Stocks Port. Both
   only."). If the reviewer disagrees, the revert is `valueAllocation()` in `lib/pnl-view.ts` only: restore the
   `cash` row (its inputs `cashUsd`/`cashThb` are still computed), then re-point the two harness class checks.
   Second-order: with cash inside Stocks Port, "Stocks Port" is the whole T212 account rather than only
   securities; the asset-list KPI 02 `CASH AVAILABLE` still breaks the cash out separately, so the number is
   recoverable on that page.
2. **One mascot assertion is flaky on this host: `DOM new mood restarts a finite transient bubble without
   expanding` (`page.waitForFunction: Timeout 20000ms exceeded`).** Five harness runs were attempted, four valid:

   | run | tree | host load | result |
   |---|---|---|---|
   | A | pre-review-fix | concurrent builds | `502/503` — desktop viewport failed this assertion |
   | B | — | concurrent `npm run build` under the live server | invalid (server-rendered routes 500'd); discarded |
   | C | post-fix, pre-freeze | moderate | `503/503` |
   | D | frozen `d31e308` | concurrent build + push | `502/503` — **mobile** viewport failed the same assertion |
   | E | frozen `d31e308` | quiet | `503/503` exit 0 |

   The failure moves between viewports and disappears on a quiet re-run, which is the signature of a timing flake
   in a bubble that self-expires while the assertion polls. It cannot be caused by this change: `app/mascot-*`,
   `lib/mascot*.ts`, every mascot asset and every mascot assertion body are byte-identical to `main` (SHA-proved,
   §6); the only harness line I touched inside the mascot section is the class-legend cardinality 5 → 2, and that
   check (`DOM resting occlusion leaves home class legend visible and hittable`) passed 10/10 in every run,
   including both failing runs. `STATUS.md` also records this assertion family flaking before today. I did not
   raise the 20 s timeout or weaken the assertion: the honest state is a known flake at roughly 1-in-2 loaded
   runs, and a reviewer may want it hardened separately.
3. **The ฿ figures in the class legend now depend on the manual-cash ledger being readable.** With the pot
   inside Stocks Port, a DB outage makes the whole Stocks Port row `—` (previously only the `cash` row went
   `—`). That is the honest outcome chosen over showing a partial account value, but it is a wider blast radius
   for the manually reported pot: if Bodin does not re-report the pot after a pot↔account move, the class row
   will read low or `—` rather than visibly wrong. Unverified locally: the real Neon-backed rendering (this
   machine has no `DATABASE_URL`), so the live DB path was exercised only through fixtures.

## 10. Revert

`git tag pre-crypto-port-2026-09-12` (+ `backups/site-pre-crypto-port-2026-09-12/`). Nothing was merged or
pushed to `main`; this branch is the only artifact.
