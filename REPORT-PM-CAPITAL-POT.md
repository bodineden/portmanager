# PortManager capital basis, manual cash pot and adjusted day change

Branch: `feat/capital-pot-pnl` from `0854faa`. No push, no deployment, no production database row writes. Opening ledger rows are deliberately **not** seeded: the operator will insert the two signed-brief rows.

## Accounting and scope

- Contributed capital is operator contributions less withdrawals through the snapshot timestamp. Missing capital remains null. The opening fixture is exactly THB 120,000.00; the cash-pot fixture is GBP 2,000.00 at USD/THB 33.003871, GBP/THB 44.6154 and ETH/USD 2578.15.
- **`totals.grandTotalUsd/Thb` and snapshot `total_value_usd` / `total_value_thb` now include the T212 manual cash pot**, alongside the API account total, NFT floors, wallet native and priced tokens. Missing manual data is not an inferred zero.
- Book P&L is computed in THB (`bookValueThb − contributedThb`), then converted to USD at the same snapshot rate. Its percentage uses contributed THB capital, including a known negative net balance; only a zero denominator has no percentage. No per-asset basis is inferred or prorated.
- Existing `HoldingPnl`, `pnlCoverage`, `cost_basis_*`, `pnl_*`, and `pnl_pct` stay the eligible asset subset. Manual cash is value-only and outside those buckets, like broker cash. The recorded-subset UI remains present but Book P&L leads the metric strip.
- GBP 477.00 at 2026-09-10T23:59:27Z is an internal account-to-pot transfer, never new capital, a withdrawal or a sale. No broker movements automatically create capital events. The earlier GBP 487.00 deposit is not separately re-added to the THB 120,000 opening total. The internal-transfer test reverses the two legs in a synthetic accounting identity; it does not fabricate historical provider records.
- Manual balances use the latest `recorded_at <= asOf` report per exact label. Ties resolve by `created_at DESC`, then `id DESC`. The snapshot/UI holding identity is the label, not the changing report UUID.
- Adjusted day change requires adjacent UTC dates, finite non-negative USD/THB values, no hard-unavailable sources, identical holding identity/priced-status/source-status signatures, and known capital on both dates. It subtracts the cumulative capital delta in each day's own USD conversion and in THB. It is labelled adjusted day change, not investment P&L. Missing history, changed baskets and missing evidence have explicit reasons.
- Snapshot maps contain every joined holding, including null values for unpriced holdings. The Day column uses the previous adjacent day's map without extra per-asset queries; it is a holding value change, not a return.
- `/asset-list`, `/portfolio`, and `/exchange-rate` already use `getJoinedPortfolio()` and remain on that shared boundary. `lib/pnl.ts` and `app/pnl-history-panels.tsx` were reviewed and deliberately left unchanged to preserve asset P&L and history/calendar meanings.
- Auth runtime, `app/api/auth/*`, `lib/auth.ts`, mascot mood/copy/motion implementation, and archive schema/seed/read/write code are unchanged. The only proxy edit is the permitted cron comment/matcher exclusion. The existing POST sign-out form remains untouched; no portfolio mutation controls were added.

## Exact new tables and columns

Exported constants in `lib/assets-db.ts`: `CAPITAL_EVENTS_DDL`, `MANUAL_HOLDINGS_DDL`, `PORTFOLIO_SNAPSHOT_EXTENSION_DDL`.

```sql
CREATE TABLE IF NOT EXISTS capital_events (
    id uuid primary key default gen_random_uuid(),
    occurred_at timestamptz not null,
    kind text not null check (kind in ('contribution','withdrawal')),
    amount_thb numeric(20,6) not null check (amount_thb > 0),
    note text,
    created_at timestamptz not null default now()
  );

CREATE TABLE IF NOT EXISTS manual_holdings (
    id uuid primary key default gen_random_uuid(),
    recorded_at timestamptz not null,
    label text not null,
    kind text not null check (kind in ('cash')),
    currency text not null,
    amount numeric(20,6) not null check (amount >= 0),
    note text,
    created_at timestamptz not null default now()
  );

ALTER TABLE portfolio_snapshot
    ADD COLUMN IF NOT EXISTS contributed_capital_thb numeric,
    ADD COLUMN IF NOT EXISTS contributed_capital_usd numeric,
    ADD COLUMN IF NOT EXISTS manual_value_usd numeric,
    ADD COLUMN IF NOT EXISTS manual_value_thb numeric,
    ADD COLUMN IF NOT EXISTS book_pnl_thb numeric,
    ADD COLUMN IF NOT EXISTS book_pnl_usd numeric,
    ADD COLUMN IF NOT EXISTS holdings jsonb;
```

All new DDL is idempotent and configuration-gated. A bounded initializer sets up only these live tables and the snapshot table/extensions, independently of archive `ensureSchema`; it can initialize the history columns even when current FX/value is not recordable. Ledger readers themselves issue only parameterized SELECTs. Snapshot recording retains the first qualifying observation per UTC date and does not overwrite earlier rows. Failed or timed-out attempts release the daily guard for retry; confirmed existing/recorded dates return already-exists. Cron returns HTTP 503 for skipped/error rather than falsely reporting success. Existing historical rows receive nullable columns, not backfilled values.

## Per-file changes

| File | Change |
|---|---|
| `app/api/cron/snapshot/route.ts` | Only new API route: force-dynamic Node GET, constant-time secret comparison, actual joined-recorder result; 200 only for recorded/already-exists, 503 for skipped/error; no cookies/sessions. |
| `app/book-pnl-metric.tsx` | Separate leading Book P&L metric against contributed THB capital; snapshot USD display, partial valuation disclosure and honest missing-capital copy. |
| `app/home.css` | Five class values including cash; separate cash colour and responsive metric layout; light theme tokens unchanged. |
| `app/page.tsx` | Full-book hero, Book P&L, signed/arrow adjusted day change and reasons, nine source states, cash allocation, previous-day holdings passed to asset table. |
| `app/pnl-asset-table.tsx` | Manual-cash value-only rows with report timestamp and em-dash basis/P&L; signed up/down Day column from the one previous holdings map; eligible totals unchanged. |
| `lib/__fixtures__/capital-book.ts` | Exact signed-brief opening facts and reference FX as an explicitly offline fixture, never a production data fallback. |
| `lib/adjusted-day-change.test.ts` | Flow-adjusted contribution/withdrawal/FX cases, GBP 477 internal-transfer accounting identity, adjacency, changed baskets, invalid evidence, allocation and snapshot-map tests. |
| `lib/assets-db.ts` | Exported idempotent capital_events/manual_holdings DDL and seven additive snapshot columns. Existing archive schema/seed/read/write code remains byte-for-byte unchanged. |
| `lib/capital-db.test.ts` | Configuration gates, bounded SELECT-only readers, driver Date/numeric parsing, empty versus unavailable semantics, new-table schema initialization/retry and missing-manual null tests. |
| `lib/capital-db.ts` | As-of SELECT-only readers, fail-soft source states, whitespace-padded labels rejected rather than normalized/double counted, and bounded configuration-gated live-table setup separate from archive ensureSchema. |
| `lib/capital-ui.test.ts` | Rendered real-component fixtures for manual-cash value-only cells, recorded/absent capital and up/down/absent Day values. |
| `lib/capital.test.ts` | Capital contribution-minus-withdrawal/cutoff/null tests, latest manual report/tie selection, THB book P&L/USD/% tests. |
| `lib/capital.ts` | Pure capital sum, deterministic latest report per label and THB-first book P&L with null unknowns. |
| `lib/cron-snapshot.test.ts` | Cron header rejection, successful result propagation, constant-time comparison source guard, exact schedule and auth-independent route guard. |
| `lib/holding-values.ts` | Shared stable holding IDs and compact nullable USD map; identity/priced-state/source-status value-set signature. |
| `lib/live-data.test.ts` | Existing fixtures explicitly declare known-empty manual holdings; unavailable output expectation includes new nullable totals. |
| `lib/live-data.ts` | Single joined capital/manual input boundary, current report conversion, full-book totals and THB book P&L, honest new sources, recorder outcome returned for cron. |
| `lib/mascot.test.ts` | Fixture-only additions for the expanded source shape and known-empty manual ledger; all mood expectations and runtime emotion contract unchanged. |
| `lib/pnl-history-reader.test.ts` | Legacy row normalization expectation explicitly checks all new fields remain null without evidence. |
| `lib/pnl-history.test.ts` | Explicit manual inventory and additive ALTER tests; constructor/query/timeout failures allow same-day retry, concurrent calls coalesce, completed records are not overwritten. |
| `lib/pnl-history.ts` | Seven snapshot fields persisted/read, compact holdings/source/value-set evidence; eligible cost/P&L columns preserved. Failed attempts clear the in-flight date for same-day retry; completed dates return already-exists. |
| `lib/pnl-view.test.ts` | Cash allocation expectations and adjacent-day fixtures updated to the new capital/value-set/THB requirements; existing formatting/chart/calendar cases retained. |
| `lib/pnl-view.ts` | Cash class splits broker cash from account remainder without double counting; adjusted day comparison with explicit reasons, previous-day map and holding Day helper. |
| `proxy.ts` | Only the permitted comment and matcher edit to exclude /api/cron; route secret is its protection. |
| `scripts/capital-ui-checks.mjs` | Ten added actual-page checks across desktop/mobile for capital, value-only cash pot, up/down/flat Day direction, nulls, read-only controls, overflow and console behavior. |
| `scripts/ui-contract-check.mjs` | All existing checks retained; source/class cardinalities corrected 7→9 and 4→5 and strengthened with exact original-plus-new keys; invokes ten new fixture checks. |
| `scripts/ui-fixture-entry.tsx` | Actual Home page added for capital fixture scenarios. |
| `scripts/ui-fixture-server.mjs` | Offline capital scenarios use the real builder and Home; only data/auth/IO boundaries substituted. Existing mascot fixture behavior retained. |
| `vercel.json` | Exact daily /api/cron/snapshot schedule: 0 1 * * *. |
| `app/asset-list/page.tsx` | Shows manual/capital source badges from the same joined model so the existing overall registry status has visible supporting source evidence. |
| `REPORT-PM-CAPITAL-POT.md` | This per-file/schema/accounting report, full QA transcript and operational risks. |

## QA result and limits

- Baseline: 13 test files / 186 tests. Final: **18 files / 219 tests passed**, including **5 new files / 33 new tests**.
- Lint: **0 errors, 1 pre-existing `proxy.ts` unused-function warning**. Next.js production build: passed.
- Browser UI contract: **337/337 passed**, comprising **327 retained existing checks and 10 added capital fixture checks**. Every existing contract check still passes. No check was dropped or weakened. Exact source/class cardinalities were corrected from 7 to 9 and 4 to 5 for the new required sources/cash class, with additional checks for every original and new key.
- Mascot: 126/126 contract checks, 50/50 DOM checks, 65/65 3D/video checks and 10/10 resting/occlusion checks passed. Runtime mood/emotion contract unchanged.
- Production-build browser tests used a private localhost server on port 8126 because 8125 already belonged to another process. External fetches were rejected by a loopback-only temporary preload; database/OAuth configuration was absent. This exercises real unavailable-source rendering, not live-provider balances. The independent fixture server builds actual Home/portfolio/history/wallet components and supplies explicit offline test data. Both 1440×1000 and 390×844 were exercised.
- Real local HTTP readiness returned 200; `/api/cron/snapshot` without its secret returned 401. An authorized call with an explicit offline QA secret returned HTTP 503 with {"recorded":"skipped"}, correctly exposing that no database record could be written. Recorded/already-exists success and result propagation were exercised by unit tests, not a production cron invocation.
- Frozen archive code was compared byte-for-byte after removing only the new DDL constants; equality passed. Auth and mascot runtime diffs are empty. `git diff --check` passed for implementation files. The verbatim report retains three trailing spaces from Next.js progress output, which Git’s whitespace checker flags; these are transcript bytes, not source-code whitespace defects.
- Independent read-only review passed after corrections: same-day retry, non-success cron status, bounded `/api/cron` matcher, rejection (not normalization) of padded labels, neutral zero direction, visible Asset List ledger feeds, and source-neutral partial copy. Static review returned `passed: true`, with empty security/logic finding lists. One optional suggestion remains: a dedicated Asset List new-source-card render regression; the complete page is covered by the existing browser suite. The review did not execute tests in its read-only filesystem; the actual tests above were run separately.
- New partial/unavailable ledger states remain genuine inputs to the unchanged mascot source-health rule. No production source status is forced live to preserve a previous mood. Book P&L does not replace the mascot's existing eligible-subset emotion logic.

### Per-file test counts (Vitest JSON output)

| Test file | Tests | Result |
|---|---:|---|
| `lib/adjusted-day-change.test.ts` | 10 | passed |
| `lib/auth-flow.test.ts` | 3 | passed |
| `lib/capital-db.test.ts` | 11 | passed |
| `lib/capital-ui.test.ts` | 5 | passed |
| `lib/capital.test.ts` | 4 | passed |
| `lib/cron-snapshot.test.ts` | 3 | passed |
| `lib/dust-filter.test.ts` | 7 | passed |
| `lib/live-data.test.ts` | 20 | passed |
| `lib/mascot-history.test.ts` | 5 | passed |
| `lib/mascot-motion.test.ts` | 13 | passed |
| `lib/mascot.test.ts` | 56 | passed |
| `lib/pnl-chart-retry.test.ts` | 1 | passed |
| `lib/pnl-history-reader.test.ts` | 9 | passed |
| `lib/pnl-history.test.ts` | 8 | passed |
| `lib/pnl-ui.test.ts` | 7 | passed |
| `lib/pnl-view.test.ts` | 16 | passed |
| `lib/pnl.test.ts` | 38 | passed |
| `lib/portfolio-helpers.test.ts` | 3 | passed |

## Risk flags / operator follow-through

1. **Not deployed or seeded.** The operator must insert the exact two opening rows in the signed brief and configure `CRON_SECRET` when deploying the feature. Seed before the first production render if that UTC day’s immutable snapshot should contain the opening rows. No live Neon migration/row-write or Vercel cron delivery was exercised by this implementation run.
2. **Manual balance freshness.** The GBP cash pot stays at the latest operator report until another report is appended. Internal deployments/returns must be re-reported so the API-visible account and manual pot are not double counted; the app intentionally does not infer capital or change the manual pot from broker movements.
3. **Observation limits.** Legacy rows lack new capital/map evidence, missing UTC days are not backfilled, changed value sets block comparisons, and cron still depends on provider/FX/database availability. Adjacent qualifying recorded days are required before adjusted day change appears. First observations are not market-close marks or investment returns.

## Deviations

No functional deviation from the signed brief. No push or main-branch commit. The permitted UI contract count corrections and preservation of the pre-existing auth sign-out form are documented above. Opening data and production deployment remain operator work, as requested.


## Independent corrective review — verbatim JSON

```json
{
  "passed": true,
  "security_concerns": [],
  "logic_errors": [],
  "suggestions": [
    "Add an Asset List render regression asserting the MANUAL HOLDINGS and CONTRIBUTED CAPITAL cards and their real status badges; the reviewed tests do not directly cover this UI change."
  ],
  "summary": "Read-only static review passed. Failed snapshot writes and timeouts clear the daily attempt guard; skipped/error cron outcomes return HTTP 503; the matcher excludes /api/cron and descendants while /api/crony remains gated; edge-whitespace manual labels make the source unavailable instead of double-counting; zero daily change renders flat and neutral; and Asset List includes both new source feeds. Capital/manual statuses remain evidence-based, lib/mascot.ts is unchanged, and tests were not run as requested."
}
```

## Self-QA output — verbatim

The transcript below is captured output from the actual commands. The diff-stat snapshot is for implementation files before adding this report, avoiding a self-referential report line count. The final post-commit diff stat is also printed to the task output.

### `npm test`

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

 Test Files  18 passed (18)
      Tests  219 passed (219)
   Start at  18:16:19
   Duration  1.75s (transform 987ms, setup 0ms, import 2.44s, tests 1.78s, environment 2ms)
```

### `npm run lint`

```text
npm notice run portmanager@0.1.0 lint
npm notice run eslint

/home/user/projects/portmanager/proxy.ts
  19:10  warning  'b64urlEncode' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)
```

### `npm run build`

```text
npm notice run portmanager@0.1.0 build
npm notice run next build
▲ Next.js 16.2.6 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 3.9s
  Running TypeScript ...
  Finished TypeScript in 3.0s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/5) ...
  Generating static pages using 7 workers (1/5) 
  Generating static pages using 7 workers (2/5) 
  Generating static pages using 7 workers (3/5) 
✓ Generating static pages using 7 workers (5/5) in 95ms
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


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

### `npm test -- lib/capital.test.ts lib/capital-db.test.ts lib/adjusted-day-change.test.ts lib/capital-ui.test.ts lib/cron-snapshot.test.ts`

```text
npm notice run portmanager@0.1.0 test
npm notice run vitest run lib/capital.test.ts lib/capital-db.test.ts lib/adjusted-day-change.test.ts lib/capital-ui.test.ts lib/cron-snapshot.test.ts

 RUN  v4.1.10 /home/user/projects/portmanager


 Test Files  5 passed (5)
      Tests  33 passed (33)
   Start at  18:16:24
   Duration  246ms (transform 305ms, setup 0ms, import 518ms, tests 69ms, environment 0ms)
```

### `UI_BASE_URL=http://127.0.0.1:8126 node scripts/ui-contract-check.mjs`

```text
PASS | desktop / responds successfully — HTTP 200 · /
PASS | desktop / mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | desktop / mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop / mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | desktop / uses the light Outfit design
PASS | desktop / uses the reference card tokens — 12 white cards · 10px radius · reference border/shadow
PASS | desktop / has no horizontal body overflow — 1440px / 1440px
PASS | desktop / renders no undefined/null/NaN
PASS | desktop home exposes no mutation forms or controls
PASS | desktop home renders no owner/investor names or language
PASS | desktop / uses a POST-only sidebar logout control — POST form · no logout link
PASS | home follows the P&L-center section order
PASS | home P&L summary distinguishes none, partial and complete honestly — P&L state: none
PASS | home per-asset P&L keeps unknown basis null and exclusions explicit — no joined rows; unavailable/empty state remains explicit
PASS | home performance uses snapshot history or the honest empty state — history starts today · empty period controls disabled
PASS | home allocation remains value-based even when P&L is unavailable
PASS | home calendar displays recorded coverage or an honest empty month — no recorded days; no historical P&L invented
PASS | home retains all seven source statuses and unavailable-source honesty — all nine sources unavailable · P&L remains honest
PASS | home permits value allocation while banning retired ownership copy
PASS | home renders the USD-primary value hero and P&L metric strip
PASS | home wallet panel exposes both sources and the wallet table contract — wallet sources returned no display rows
PASS | H1 home wallet hide-under-$1 toggle is present and checked by default
PASS | H2 home wallet default view hides unpriced and under-$1 rows — wallet sources returned no display rows
PASS | H3 home wallet toggle restores the full ordered row set and preserves totals — wallet sources returned no display rows; empty state remained stable in both toggle directions
PASS | home wallet rows keep native/token order and unpriced nulls — 0 wallet rows
PASS | H4 desktop home wallet/history toggle paths keep the browser console clean
PASS | desktop /asset-list responds successfully — HTTP 200 · /asset-list
PASS | desktop /asset-list mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | desktop /asset-list mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop /asset-list mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | desktop /asset-list uses the light Outfit design
PASS | desktop /asset-list uses the reference card tokens — 16 white cards · 10px radius · reference border/shadow
PASS | desktop /asset-list has no horizontal body overflow — 1440px / 1440px
PASS | desktop /asset-list renders no undefined/null/NaN
PASS | desktop asset-list exposes no mutation forms or controls
PASS | desktop asset-list renders no owner/investor names or language
PASS | desktop /asset-list uses a POST-only sidebar logout control — POST form · no logout link
PASS | desktop asset-list is labelled live and read-only
PASS | asset-list renders the read-only wallet registry — wallet sources returned no registry rows
PASS | asset-list wallet filter defaults on and preserves the full registry totals — empty registry is stable in both toggle directions
PASS | asset-list wallet rows keep native/token order and unpriced nulls — 0 wallet registry rows
PASS | desktop /asset-list keeps the browser console clean
PASS | desktop /portfolio responds successfully — HTTP 200 · /portfolio
PASS | desktop /portfolio mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | desktop /portfolio mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop /portfolio mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | desktop /portfolio uses the light Outfit design
PASS | desktop /portfolio uses the reference card tokens — 6 white cards · 10px radius · reference border/shadow
PASS | desktop /portfolio has no horizontal body overflow — 1440px / 1440px
PASS | desktop /portfolio renders no undefined/null/NaN
PASS | desktop portfolio exposes no mutation forms or controls
PASS | desktop portfolio renders no owner/investor names or language
PASS | desktop /portfolio uses a POST-only sidebar logout control — POST form · no logout link
PASS | portfolio separates live value from legacy context
PASS | portfolio Plottable chart contract — no chart host · explicit unavailable valuation state
PASS | desktop /portfolio keeps the browser console clean
PASS | desktop /exchange-rate responds successfully — HTTP 200 · /exchange-rate
PASS | desktop /exchange-rate mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | desktop /exchange-rate mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop /exchange-rate mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | desktop /exchange-rate uses the light Outfit design
PASS | desktop /exchange-rate uses the reference card tokens — 7 white cards · 10px radius · reference border/shadow
PASS | desktop /exchange-rate has no horizontal body overflow — 1440px / 1440px
PASS | desktop /exchange-rate renders no undefined/null/NaN
PASS | desktop exchange-rate exposes no mutation forms or controls
PASS | desktop exchange-rate renders no owner/investor names or language
PASS | desktop /exchange-rate uses a POST-only sidebar logout control — POST form · no logout link
PASS | desktop exchange-rate is labelled live and read-only
PASS | desktop /exchange-rate keeps the browser console clean
PASS | desktop /asset-master responds successfully — HTTP 200 · /asset-list
PASS | desktop /asset-master mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | desktop /asset-master mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop /asset-master mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | desktop /asset-master uses the light Outfit design
PASS | desktop /asset-master uses the reference card tokens — 16 white cards · 10px radius · reference border/shadow
PASS | desktop /asset-master has no horizontal body overflow — 1440px / 1440px
PASS | desktop /asset-master renders no undefined/null/NaN
PASS | desktop asset-master exposes no mutation forms or controls
PASS | desktop asset-master renders no owner/investor names or language
PASS | desktop /asset-master uses a POST-only sidebar logout control — POST form · no logout link
PASS | desktop asset-master is labelled live and read-only
PASS | asset-list renders the read-only wallet registry — wallet sources returned no registry rows
PASS | asset-list wallet filter defaults on and preserves the full registry totals — empty registry is stable in both toggle directions
PASS | asset-list wallet rows keep native/token order and unpriced nulls — 0 wallet registry rows
PASS | desktop /asset-master keeps the browser console clean
PASS | desktop /login responds successfully — HTTP 200 · /login
PASS | desktop /login mascot server HTML defaults visible only after login — absent from login HTML
PASS | desktop /login mascot remains absent after hydration
PASS | desktop /login uses the light Outfit design
PASS | desktop /login uses the reference card tokens — 1 white cards · 10px radius · reference border/shadow
PASS | desktop /login has no horizontal body overflow — 1440px / 1440px
PASS | desktop /login renders no undefined/null/NaN
PASS | desktop login exposes no mutation forms or controls
PASS | desktop login renders no owner/investor names or language
PASS | desktop login preserves the Google sign-in gate
PASS | desktop /login keeps the browser console clean
PASS | desktop production mascot interaction route loads
PASS | desktop production mascot DOM transient bubble is opaque white without alpha — computed background rgb(255, 255, 255) · opacity 1 through every ancestor · #DFE5F2 border · 10px radius · app body font Outfit, Arial, sans-serif, Arial, sans-serif
PASS | desktop production mascot DOM resting chip has no visible bubble or controls after six seconds — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · settled in 4982ms after initial DOM checks · opaque through fade · no repeat
PASS | desktop production mascot DOM resting occlusion leaves home hero as-of/status metadata visible and hittable — hero as-of/status metadata: 3/3 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | desktop production mascot DOM resting occlusion leaves home class legend visible and hittable — five-class legend labels and USD/THB values: 15/15 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | desktop production mascot DOM WebGL 3D click expands the live viewer; panel stays expanded — 128px panel · aria-expanded=true · visible safe controls · current bubble visible · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video · exact gltf.animations log · bubble/controls/live loop remain beyond the transient deadline
PASS | desktop production mascot DOM second click collapses back to the resting chip — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop production mascot DOM keyboard expands cached 3D viewer; Escape collapses and restores chip focus — Enter and Space expand cached 3D bytes without another GLB request; Escape from Mute guide and Hide guide collapses, aria-expanded=false, focus returns to chip
PASS | desktop production mascot DOM mute hides the bubble, retains the a11y sprite underlay and persists on reload — mute checkbox/aria-pressed/localStorage agree · accessible sprite DOM underlay retained beneath motion surface · reload rests silently · Space/Enter unmute restore current bubble
PASS | desktop production mascot DOM hide removes the companion, survives client navigation and resets on reload — companion absent across all four pages in one document; collapsed chip restored after reload; independent mute preference retained
PASS | desktop production mascot DOM interaction and hydration console stays clean — zero page errors, hydration errors or console errors
PASS | desktop production mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.71s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.29s/7.00s advancing · no canvas · static sprite hidden · 233/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.74s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
PASS | mobile / responds successfully — HTTP 200 · /
PASS | mobile / mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | mobile / mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile / mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile / uses the light Outfit design
PASS | mobile / uses the reference card tokens — 12 white cards · 10px radius · reference border/shadow
PASS | mobile / has no horizontal body overflow — 390px / 390px
PASS | mobile / renders no undefined/null/NaN
PASS | mobile home exposes no mutation forms or controls
PASS | mobile home renders no owner/investor names or language
PASS | mobile / uses a POST-only sidebar logout control — POST form · no logout link
PASS | home follows the P&L-center section order
PASS | home P&L summary distinguishes none, partial and complete honestly — P&L state: none
PASS | home per-asset P&L keeps unknown basis null and exclusions explicit — no joined rows; unavailable/empty state remains explicit
PASS | home performance uses snapshot history or the honest empty state — history starts today · empty period controls disabled
PASS | home allocation remains value-based even when P&L is unavailable
PASS | home calendar displays recorded coverage or an honest empty month — no recorded days; no historical P&L invented
PASS | home retains all seven source statuses and unavailable-source honesty — all nine sources unavailable · P&L remains honest
PASS | home permits value allocation while banning retired ownership copy
PASS | home renders the USD-primary value hero and P&L metric strip
PASS | home wallet panel exposes both sources and the wallet table contract — wallet sources returned no display rows
PASS | H1 home wallet hide-under-$1 toggle is present and checked by default
PASS | H2 home wallet default view hides unpriced and under-$1 rows — wallet sources returned no display rows
PASS | H3 home wallet toggle restores the full ordered row set and preserves totals — wallet sources returned no display rows; empty state remained stable in both toggle directions
PASS | home wallet rows keep native/token order and unpriced nulls — 0 wallet rows
PASS | H4 mobile home wallet/history toggle paths keep the browser console clean
PASS | mobile /asset-list responds successfully — HTTP 200 · /asset-list
PASS | mobile /asset-list mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | mobile /asset-list mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile /asset-list mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile /asset-list uses the light Outfit design
PASS | mobile /asset-list uses the reference card tokens — 16 white cards · 10px radius · reference border/shadow
PASS | mobile /asset-list has no horizontal body overflow — 390px / 390px
PASS | mobile /asset-list renders no undefined/null/NaN
PASS | mobile asset-list exposes no mutation forms or controls
PASS | mobile asset-list renders no owner/investor names or language
PASS | mobile /asset-list uses a POST-only sidebar logout control — POST form · no logout link
PASS | mobile asset-list is labelled live and read-only
PASS | asset-list renders the read-only wallet registry — wallet sources returned no registry rows
PASS | asset-list wallet filter defaults on and preserves the full registry totals — empty registry is stable in both toggle directions
PASS | asset-list wallet rows keep native/token order and unpriced nulls — 0 wallet registry rows
PASS | mobile /asset-list keeps the browser console clean
PASS | mobile /portfolio responds successfully — HTTP 200 · /portfolio
PASS | mobile /portfolio mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | mobile /portfolio mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile /portfolio mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile /portfolio uses the light Outfit design
PASS | mobile /portfolio uses the reference card tokens — 6 white cards · 10px radius · reference border/shadow
PASS | mobile /portfolio has no horizontal body overflow — 390px / 390px
PASS | mobile /portfolio renders no undefined/null/NaN
PASS | mobile portfolio exposes no mutation forms or controls
PASS | mobile portfolio renders no owner/investor names or language
PASS | mobile /portfolio uses a POST-only sidebar logout control — POST form · no logout link
PASS | portfolio separates live value from legacy context
PASS | portfolio Plottable chart contract — no chart host · explicit unavailable valuation state
PASS | mobile /portfolio keeps the browser console clean
PASS | mobile /exchange-rate responds successfully — HTTP 200 · /exchange-rate
PASS | mobile /exchange-rate mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | mobile /exchange-rate mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile /exchange-rate mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile /exchange-rate uses the light Outfit design
PASS | mobile /exchange-rate uses the reference card tokens — 7 white cards · 10px radius · reference border/shadow
PASS | mobile /exchange-rate has no horizontal body overflow — 390px / 390px
PASS | mobile /exchange-rate renders no undefined/null/NaN
PASS | mobile exchange-rate exposes no mutation forms or controls
PASS | mobile exchange-rate renders no owner/investor names or language
PASS | mobile /exchange-rate uses a POST-only sidebar logout control — POST form · no logout link
PASS | mobile exchange-rate is labelled live and read-only
PASS | mobile /exchange-rate keeps the browser console clean
PASS | mobile /asset-master responds successfully — HTTP 200 · /asset-list
PASS | mobile /asset-master mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | mobile /asset-master mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile /asset-master mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile /asset-master uses the light Outfit design
PASS | mobile /asset-master uses the reference card tokens — 16 white cards · 10px radius · reference border/shadow
PASS | mobile /asset-master has no horizontal body overflow — 390px / 390px
PASS | mobile /asset-master renders no undefined/null/NaN
PASS | mobile asset-master exposes no mutation forms or controls
PASS | mobile asset-master renders no owner/investor names or language
PASS | mobile /asset-master uses a POST-only sidebar logout control — POST form · no logout link
PASS | mobile asset-master is labelled live and read-only
PASS | asset-list renders the read-only wallet registry — wallet sources returned no registry rows
PASS | asset-list wallet filter defaults on and preserves the full registry totals — empty registry is stable in both toggle directions
PASS | asset-list wallet rows keep native/token order and unpriced nulls — 0 wallet registry rows
PASS | mobile /asset-master keeps the browser console clean
PASS | mobile /login responds successfully — HTTP 200 · /login
PASS | mobile /login mascot server HTML defaults visible only after login — absent from login HTML
PASS | mobile /login mascot remains absent after hydration
PASS | mobile /login uses the light Outfit design
PASS | mobile /login uses the reference card tokens — 1 white cards · 10px radius · reference border/shadow
PASS | mobile /login has no horizontal body overflow — 390px / 390px
PASS | mobile /login renders no undefined/null/NaN
PASS | mobile login exposes no mutation forms or controls
PASS | mobile login renders no owner/investor names or language
PASS | mobile login preserves the Google sign-in gate
PASS | mobile /login keeps the browser console clean
PASS | mobile production mascot interaction route loads
PASS | mobile production mascot DOM transient bubble is opaque white without alpha — computed background rgb(255, 255, 255) · opacity 1 through every ancestor · #DFE5F2 border · 10px radius · app body font Outfit, Arial, sans-serif, Arial, sans-serif
PASS | mobile production mascot DOM resting chip has no visible bubble or controls after six seconds — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · settled in 5126ms after initial DOM checks · opaque through fade · no repeat
PASS | mobile production mascot DOM resting occlusion leaves home hero as-of/status metadata visible and hittable — hero as-of/status metadata: 3/3 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | mobile production mascot DOM resting occlusion leaves home class legend visible and hittable — five-class legend labels and USD/THB values: 15/15 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | mobile production mascot DOM WebGL 3D click expands the live viewer; panel stays expanded — 128px panel · aria-expanded=true · visible safe controls · current bubble visible · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video · exact gltf.animations log · bubble/controls/live loop remain beyond the transient deadline
PASS | mobile production mascot DOM second click collapses back to the resting chip — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile production mascot DOM keyboard expands cached 3D viewer; Escape collapses and restores chip focus — Enter and Space expand cached 3D bytes without another GLB request; Escape from Mute guide and Hide guide collapses, aria-expanded=false, focus returns to chip
PASS | mobile production mascot DOM mute hides the bubble, retains the a11y sprite underlay and persists on reload — mute checkbox/aria-pressed/localStorage agree · accessible sprite DOM underlay retained beneath motion surface · reload rests silently · Space/Enter unmute restore current bubble
PASS | mobile production mascot DOM hide removes the companion, survives client navigation and resets on reload — companion absent across all four pages in one document; collapsed chip restored after reload; independent mute preference retained
PASS | mobile production mascot DOM interaction and hydration console stays clean — zero page errors, hydration errors or console errors
PASS | mobile production mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.73s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.28s/7.00s advancing · no canvas · static sprite hidden · 233/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.75s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
PASS | committed independent browser fixtures build and start locally — scripts/__fixtures__/pnl-browser.json + real app components; temporary assets and ephemeral localhost port
PASS | desktop capital fixture full book capital metric renders exact opening THB basis — THB 120000 opening basis · full GBP 2000 pot included · book USD/THB/%
PASS | desktop capital fixture manual cash is value-only with no fabricated basis or P&L — one manual-cash row · value USD/THB · basis/P&L — · excluded from asset buckets
PASS | desktop capital fixture Day column and adjusted day change use signs plus direction — up +USD/+% and down -USD/-% · adjusted book day +USD9
PASS | desktop capital fixture exactly zero adjusted change is neutral rather than a gain — zero adjusted change · neutral is-flat class and → arrow
PASS | desktop capital fixture empty capital stays unavailable and read-only at both viewports — capital — not zero · no mutation controls · no overflow or browser errors
PASS | desktop fixture portfolio-live renders real app components
PASS | desktop fixture finding #2 known live source requires exact live marker and USD/THB value — independent source=live · USD 1250.50 · THB 45018.00 · exact live marker/KPI/register
PASS | desktop fixture finding #2 rejects hidden live marker plus a false unavailable legend — negative control rejected; UI unavailable copy cannot waive known fixture data
PASS | desktop fixture finding #2 rejects a missing host for independently known live data — negative control rejected before empty-state return
PASS | desktop fixture portfolio-unavailable renders real app components
PASS | desktop fixture independently unavailable live data retains honest legacy-only chart — 2 axes · 0 live markers
PASS | desktop fixture recent renders real app components
PASS | desktop fixture finding #4 populated periods are enabled and filter exact recorded rows — 1M/3M/All enabled · 6/7/8 exact observations · repeated period changes draw charts
PASS | desktop fixture finding #4 clicking 2026-09-01 shows exact recorded USD/THB and coverage — 2026-09-01 · value US$1,100.00 / ฿39,600.00 · P&L US$200.00 / ฿7,200.00 · partial 2/3
PASS | desktop fixture finding #4 clicking 2026-09-02 shows exact recorded USD/THB and coverage — 2026-09-02 · value US$1,200.00 / ฿43,200.00 · P&L — / — · partial 0/3
PASS | desktop fixture finding #4 clicking 2026-09-03 shows exact recorded USD/THB and coverage — 2026-09-03 · value US$40.00 / ฿1,440.00 · P&L US$40.00 / ฿1,440.00 · complete 1/1
PASS | desktop fixture finding #4 previous/next month changes grid and exact selected observation — September → August (2026-08-31) → September (2026-09-05); exact grid/value/basis/P&L/coverage
PASS | desktop fixture wallet preserves raw $1 threshold, unknown native rows and full totals
PASS | desktop fixture populated page fits viewport and keeps numbers honest — 0px horizontal overflow
PASS | desktop fixture older renders real app components
PASS | desktop fixture older history keeps enabled empty-period controls and restores All
PASS | desktop fixture empty renders real app components
PASS | desktop fixture empty history disables periods/days and states history starts today
PASS | desktop fixture filtered-empty renders real app components
PASS | desktop fixture all-dust wallet explains filtered empty state through both toggles
PASS | desktop fixture populated/empty/live/legacy interactions keep browser console clean
PASS | desktop mascot fixture portfolio-live derives calm and maps fallback video — Healthy empty joined holding set, no recorded gain or loss.
PASS | desktop mascot fixture portfolio-unavailable derives sad and maps fallback video — Every source offline and joined total unknown.
PASS | desktop mascot fixture portfolio-mascot-thinking derives thinking and maps fallback video — Sources all live; one holding has no acquisition basis.
PASS | desktop mascot fixture portfolio-mascot-worried derives worried and maps fallback video — Eligible recorded loss beats otherwise complete coverage.
PASS | desktop mascot fixture portfolio-mascot-happy derives happy and maps fallback video — Recorded gain below threshold; dust excluded, no missing basis.
PASS | desktop mascot fixture portfolio-mascot-excited derives excited and maps fallback video — Recorded gain with full basis coverage, even below threshold.
PASS | desktop mascot fixture portfolio-mascot-proud derives proud and maps fallback video — Flat recorded P&L and every holding eligible.
PASS | desktop mascot fixture portfolio-mascot-sleepy derives sleepy and maps fallback video — Healthy flat eligible subset with dust; no higher priority state.
PASS | desktop mascot fixture portfolio-mascot-alert derives alert and maps fallback video — One partial source outranks a recorded gain.
PASS | desktop mascot fixture portfolio-mascot-history-unavailable derives alert and maps fallback video — All sources live but snapshot history unavailable.
PASS | desktop mascot fixture portfolio-mascot-unreconciled derives alert and maps fallback video — An unreconciled holding outranks missing acquisition basis.
PASS | desktop mascot fixture portfolio-mascot-excited-partial derives excited and maps fallback video — Threshold reached with excluded dust, without claiming full coverage.
PASS | desktop mascot fixture portfolio-mascot-airdrop derives happy and maps fallback video — Verified free acquisition has positive recorded P&L and no percentage; dust keeps coverage partial.
PASS | desktop mascot fixture portfolio-mascot-null-pnl derives calm and maps fallback video — Only excluded dust; unknown P&L never implies a gain or loss.
PASS | desktop mascot fixture covers all nine distinct moods and video mappings — 9 mood sprites retain intrinsic dimensions/alt text; all mapped videos play across reload and in-document mood changes; proud→idle collapse restarts; zero GLB requests · hydration boundary retained only visible motion surfaces; 10 advancing-video proof(s)
PASS | desktop mascot fixture DOM WebGL 3D switches all nine mapped mood motions without re-downloading — data-mascot-3d=on · calm→idle, happy→happy_clap, excited→excited_bounce, thinking→idle, worried→idle, sad→idle, sleepy→idle, proud→happy_clap, alert→idle · on→video→on (data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.30s/7.00s advancing · no canvas · static sprite hidden; data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video) · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s) · one GLB request
PASS | desktop mascot fixture DOM new server props refresh mood and preserve expanded mute — thinking → worried while muted: expanded controls retained, checkbox/aria-pressed/localStorage stay true, no bubble; unmute shows latest message
PASS | desktop mascot fixture DOM new mood restarts a finite transient bubble without expanding — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop mascot fixture DOM changed message with the same mood restarts the bubble — alert source message expired; alert unreconciled message is newly visible while controls remain hidden
PASS | desktop mascot fixture DOM reduced motion keeps fallback video moving while CSS animation/fade is disabled — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 4.99s/7.00s advancing · no canvas · static sprite hidden · 13 expanded companion elements: CSS animation-name=none, transition durations=0; native video continues; collapse leaves compact chip · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | desktop mascot fixture console remains clean across every mood and prop transition
PASS | desktop fixture mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.74s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.27s/7.00s advancing · no canvas · static sprite hidden · 202/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.76s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
PASS | desktop mascot fixture DOM WebGL loading plays video then hands off to the live canvas — video → on · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.31s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · stopped/removed video · 64×95px unchanged card · one GLB · WebM-only request · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s)
PASS | desktop mascot fixture DOM WebGL resting chip plays idle without a click — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · no click · one GLB request
PASS | desktop mascot fixture WebGL resting idle changes rendered frames continuously — 3/3 distinct rendered frames · idle still live after announcement · same canvas
PASS | desktop mascot fixture DOM WebGL expand/collapse preserves canvas and switches idle to excited_bounce — idle → excited_bounce → idle twice (click + Escape) · same canvas/WebGL context · 126×189px expanded box / 128×262px card · 1 total GLB request
PASS | desktop mascot fixture DOM WebGL collapsed mood updates retain idle and the mounted canvas — excited → happy server props · still collapsed/idle · same canvas · one GLB request
PASS | desktop mascot fixture DOM WebGL resting reduced-motion toggle hands idle to video and restores live — on → video → on while collapsed · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.18s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · cached GLB
PASS | desktop mascot fixture DOM WebGL context loss switches the live idle canvas to playing video — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 2 · 720×720 · 0.23s/7.00s advancing · no canvas · static sprite hidden · one cached GLB request · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | desktop mascot fixture WebGL resting idle and transition console stays clean — zero page/console errors or Three/WebGL warnings
PASS | desktop mascot fixture DOM WebGL disabled plays video and restarts clips on expand/collapse — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.71s/7.00s advancing · no canvas · static sprite hidden · idle→happy_clap→idle with near-zero restarts · data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · zero GLB requests · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s)
PASS | desktop mascot fixture WebGL-disabled mascot fallback console is clean — zero page errors or Three/WebGL warnings
PASS | desktop mascot fixture DOM WebGL malformed GLB keeps playing video at rest and after expansion — data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · one request · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · zero page/video errors or Three/WebGL warnings
PASS | mobile capital fixture full book capital metric renders exact opening THB basis — THB 120000 opening basis · full GBP 2000 pot included · book USD/THB/%
PASS | mobile capital fixture manual cash is value-only with no fabricated basis or P&L — one manual-cash row · value USD/THB · basis/P&L — · excluded from asset buckets
PASS | mobile capital fixture Day column and adjusted day change use signs plus direction — up +USD/+% and down -USD/-% · adjusted book day +USD9
PASS | mobile capital fixture exactly zero adjusted change is neutral rather than a gain — zero adjusted change · neutral is-flat class and → arrow
PASS | mobile capital fixture empty capital stays unavailable and read-only at both viewports — capital — not zero · no mutation controls · no overflow or browser errors
PASS | mobile fixture portfolio-live renders real app components
PASS | mobile fixture finding #2 known live source requires exact live marker and USD/THB value — independent source=live · USD 1250.50 · THB 45018.00 · exact live marker/KPI/register
PASS | mobile fixture finding #2 rejects hidden live marker plus a false unavailable legend — negative control rejected; UI unavailable copy cannot waive known fixture data
PASS | mobile fixture finding #2 rejects a missing host for independently known live data — negative control rejected before empty-state return
PASS | mobile fixture portfolio-unavailable renders real app components
PASS | mobile fixture independently unavailable live data retains honest legacy-only chart — 2 axes · 0 live markers
PASS | mobile fixture recent renders real app components
PASS | mobile fixture finding #4 populated periods are enabled and filter exact recorded rows — 1M/3M/All enabled · 6/7/8 exact observations · repeated period changes draw charts
PASS | mobile fixture finding #4 clicking 2026-09-01 shows exact recorded USD/THB and coverage — 2026-09-01 · value US$1,100.00 / ฿39,600.00 · P&L US$200.00 / ฿7,200.00 · partial 2/3
PASS | mobile fixture finding #4 clicking 2026-09-02 shows exact recorded USD/THB and coverage — 2026-09-02 · value US$1,200.00 / ฿43,200.00 · P&L — / — · partial 0/3
PASS | mobile fixture finding #4 clicking 2026-09-03 shows exact recorded USD/THB and coverage — 2026-09-03 · value US$40.00 / ฿1,440.00 · P&L US$40.00 / ฿1,440.00 · complete 1/1
PASS | mobile fixture finding #4 previous/next month changes grid and exact selected observation — September → August (2026-08-31) → September (2026-09-05); exact grid/value/basis/P&L/coverage
PASS | mobile fixture wallet preserves raw $1 threshold, unknown native rows and full totals
PASS | mobile fixture populated page fits viewport and keeps numbers honest — 0px horizontal overflow
PASS | mobile fixture older renders real app components
PASS | mobile fixture older history keeps enabled empty-period controls and restores All
PASS | mobile fixture empty renders real app components
PASS | mobile fixture empty history disables periods/days and states history starts today
PASS | mobile fixture filtered-empty renders real app components
PASS | mobile fixture all-dust wallet explains filtered empty state through both toggles
PASS | mobile fixture populated/empty/live/legacy interactions keep browser console clean
PASS | mobile mascot fixture portfolio-live derives calm and maps fallback video — Healthy empty joined holding set, no recorded gain or loss.
PASS | mobile mascot fixture portfolio-unavailable derives sad and maps fallback video — Every source offline and joined total unknown.
PASS | mobile mascot fixture portfolio-mascot-thinking derives thinking and maps fallback video — Sources all live; one holding has no acquisition basis.
PASS | mobile mascot fixture portfolio-mascot-worried derives worried and maps fallback video — Eligible recorded loss beats otherwise complete coverage.
PASS | mobile mascot fixture portfolio-mascot-happy derives happy and maps fallback video — Recorded gain below threshold; dust excluded, no missing basis.
PASS | mobile mascot fixture portfolio-mascot-excited derives excited and maps fallback video — Recorded gain with full basis coverage, even below threshold.
PASS | mobile mascot fixture portfolio-mascot-proud derives proud and maps fallback video — Flat recorded P&L and every holding eligible.
PASS | mobile mascot fixture portfolio-mascot-sleepy derives sleepy and maps fallback video — Healthy flat eligible subset with dust; no higher priority state.
PASS | mobile mascot fixture portfolio-mascot-alert derives alert and maps fallback video — One partial source outranks a recorded gain.
PASS | mobile mascot fixture portfolio-mascot-history-unavailable derives alert and maps fallback video — All sources live but snapshot history unavailable.
PASS | mobile mascot fixture portfolio-mascot-unreconciled derives alert and maps fallback video — An unreconciled holding outranks missing acquisition basis.
PASS | mobile mascot fixture portfolio-mascot-excited-partial derives excited and maps fallback video — Threshold reached with excluded dust, without claiming full coverage.
PASS | mobile mascot fixture portfolio-mascot-airdrop derives happy and maps fallback video — Verified free acquisition has positive recorded P&L and no percentage; dust keeps coverage partial.
PASS | mobile mascot fixture portfolio-mascot-null-pnl derives calm and maps fallback video — Only excluded dust; unknown P&L never implies a gain or loss.
PASS | mobile mascot fixture covers all nine distinct moods and video mappings — 9 mood sprites retain intrinsic dimensions/alt text; all mapped videos play across reload and in-document mood changes; proud→idle collapse restarts; zero GLB requests · hydration boundary retained only visible motion surfaces; 10 advancing-video proof(s)
PASS | mobile mascot fixture DOM WebGL 3D switches all nine mapped mood motions without re-downloading — data-mascot-3d=on · calm→idle, happy→happy_clap, excited→excited_bounce, thinking→idle, worried→idle, sad→idle, sleepy→idle, proud→happy_clap, alert→idle · on→video→on (data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.40s/7.00s advancing · no canvas · static sprite hidden; data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video) · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s) · one GLB request
PASS | mobile mascot fixture DOM new server props refresh mood and preserve expanded mute — thinking → worried while muted: expanded controls retained, checkbox/aria-pressed/localStorage stay true, no bubble; unmute shows latest message
PASS | mobile mascot fixture DOM new mood restarts a finite transient bubble without expanding — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile mascot fixture DOM changed message with the same mood restarts the bubble — alert source message expired; alert unreconciled message is newly visible while controls remain hidden
PASS | mobile mascot fixture DOM reduced motion keeps fallback video moving while CSS animation/fade is disabled — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 2.11s/7.00s advancing · no canvas · static sprite hidden · 13 expanded companion elements: CSS animation-name=none, transition durations=0; native video continues; collapse leaves compact chip · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | mobile mascot fixture console remains clean across every mood and prop transition
PASS | mobile fixture mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.75s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.26s/7.00s advancing · no canvas · static sprite hidden · 205/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.76s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
PASS | mobile mascot fixture DOM WebGL loading plays video then hands off to the live canvas — video → on · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.29s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · stopped/removed video · 64×95px unchanged card · one GLB · WebM-only request · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s)
PASS | mobile mascot fixture DOM WebGL resting chip plays idle without a click — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · no click · one GLB request
PASS | mobile mascot fixture WebGL resting idle changes rendered frames continuously — 3/3 distinct rendered frames · idle still live after announcement · same canvas
PASS | mobile mascot fixture DOM WebGL expand/collapse preserves canvas and switches idle to excited_bounce — idle → excited_bounce → idle twice (click + Escape) · same canvas/WebGL context · 126×189px expanded box / 128×262px card · 1 total GLB request
PASS | mobile mascot fixture DOM WebGL collapsed mood updates retain idle and the mounted canvas — excited → happy server props · still collapsed/idle · same canvas · one GLB request
PASS | mobile mascot fixture DOM WebGL resting reduced-motion toggle hands idle to video and restores live — on → video → on while collapsed · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.12s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · cached GLB
PASS | mobile mascot fixture DOM WebGL context loss switches the live idle canvas to playing video — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.12s/7.00s advancing · no canvas · static sprite hidden · one cached GLB request · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | mobile mascot fixture WebGL resting idle and transition console stays clean — zero page/console errors or Three/WebGL warnings
PASS | mobile mascot fixture DOM WebGL disabled plays video and restarts clips on expand/collapse — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.71s/7.00s advancing · no canvas · static sprite hidden · idle→happy_clap→idle with near-zero restarts · data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.18s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.15s/7.00s advancing · no canvas · static sprite hidden · zero GLB requests · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s)
PASS | mobile mascot fixture WebGL-disabled mascot fallback console is clean — zero page errors or Three/WebGL warnings
PASS | mobile mascot fixture DOM WebGL malformed GLB keeps playing video at rest and after expansion — data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.15s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · one request · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · zero page/video errors or Three/WebGL warnings
PASS | Mascot motion surfaces never settle on the static fallback in codec-capable Chromium — post-hydration states observed: on/video
PASS | Mascot video fallback selects every contracted VP9 WebM clip — selected sources observed: /mascot/motion-excited-bounce.webm, /mascot/motion-happy-clap.webm, /mascot/motion-idle.webm

PASS | Mascot resting/occlusion summary — 10/10 checks passed at 1440×1000 and 390×844
PASS | Mascot DOM assertion summary — 50/50 checks passed (individual assertions printed above)
PASS | Mascot 3D/video fallback summary — 65/65 checks passed · data-mascot-3d states observed: on/video · selected video sources: /mascot/motion-excited-bounce.webm, /mascot/motion-happy-clap.webm, /mascot/motion-idle.webm

PASS | Mascot contract summary — 126/126 checks passed

PASS | UI contract summary — 337/337 checks passed
```

### `git diff --stat 0854faa (implementation, before this report)`

```text
app/api/cron/snapshot/route.ts   |  17 ++++++
 app/asset-list/page.tsx          |   2 +
 app/book-pnl-metric.tsx          |  18 ++++++
 app/home.css                     |   5 +-
 app/page.tsx                     |  28 +++++----
 app/pnl-asset-table.tsx          |  28 ++++++---
 lib/__fixtures__/capital-book.ts |  15 +++++
 lib/adjusted-day-change.test.ts  | 114 ++++++++++++++++++++++++++++++++++
 lib/assets-db.ts                 |  34 +++++++++++
 lib/capital-db.test.ts           | 129 +++++++++++++++++++++++++++++++++++++++
 lib/capital-db.ts                | 101 ++++++++++++++++++++++++++++++
 lib/capital-ui.test.ts           |  65 ++++++++++++++++++++
 lib/capital.test.ts              |  43 +++++++++++++
 lib/capital.ts                   |  38 ++++++++++++
 lib/cron-snapshot.test.ts        |  40 ++++++++++++
 lib/holding-values.ts            |  31 ++++++++++
 lib/live-data.test.ts            |   2 +
 lib/live-data.ts                 |  55 +++++++++++++++--
 lib/mascot.test.ts               |   3 +-
 lib/pnl-history-reader.test.ts   |   2 +
 lib/pnl-history.test.ts          |  35 ++++++-----
 lib/pnl-history.ts               |  69 ++++++++++++++++++---
 lib/pnl-view.test.ts             |  25 +++++---
 lib/pnl-view.ts                  |  75 +++++++++++++++++------
 proxy.ts                         |   4 +-
 scripts/capital-ui-checks.mjs    |  73 ++++++++++++++++++++++
 scripts/ui-contract-check.mjs    |  14 +++--
 scripts/ui-fixture-entry.tsx     |   2 +
 scripts/ui-fixture-server.mjs    |  35 ++++++++++-
 vercel.json                      |   1 +
 30 files changed, 1012 insertions(+), 91 deletions(-)
```
