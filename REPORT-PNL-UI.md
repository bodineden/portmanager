# PortManager Run 2 — light UI and P&L center

Date: 2026-09-05. Branch: `feat/pnl-astra-ui`.

Implemented the entire `BRIEF-PNL-UI.md` scope. No deployment or main-branch push. Existing untracked briefs, reports, backups, and screenshots are outside this change.

## Design and pages

The shared design uses Outfit from `next/font/google`, Latin subset, `display: swap`, and Arial/sans-serif fallback. Page background is **#F5F7FB**; content cards are **#FFFFFF**, **10px** radius, **1px solid #DFE5F2**, with **0 14px 35px rgba(21, 35, 72, 0.07)** shadow. Headings use **#11162E**, muted text **#5B6680**, accent **#355CC9**, positive **#147D59**, negative **#B9384E**, warning **#8C5F13**, and secondary chart series **#7454B6**. Numeric typography uses Outfit with tabular figures. Semantic text colors meet WCAG AA against white. Blueprint uses its light defaults; neither the root elements nor the provider have a dark class.

- **Home `/`:** USD value hero with THB alongside; T212/NFT/native/token class values; recorded P&L, daily value change and coverage cards; Plottable value/basis history with 1M/3M/All controls; current class allocation bars; UTC P&L calendar with recorded month/day navigation; every joined holding in a provenance-aware P&L table; cash context; retained wallet balances/filter; seven-source status strip. The required hero → metrics → performance → allocation → calendar → assets → sources order is retained, with cash/wallet context before sources.
- **`/asset-list`:** light live registry, USD headline and account KPIs, securities and NFT registries, wallet inventory and source cards. Native/account units remain labelled context. USD precedes THB when both appear. Wallet filter is default-on and imports the existing dust helper; an explicit all-hidden state is added.
- **`/portfolio`:** light chart, legend, valuation-boundary note and snapshot register. Live values and tooltip show USD first and THB alongside. The historical archive only has THB; the chart retains its original THB axis and never infers historical USD. Exact explanation: **“The archive records THB only. No historical USD conversion is inferred.”** The live marker remains separate from the legacy line, and no return comparison crosses the boundary.
- **`/exchange-rate`:** light read-only FX registry and source cards. USD is the primary display currency, THB is alongside; actual original FX pairs remain explicit.
- **`/login`:** light Google gate with unchanged authentication behavior and approved-account wording.
- **Shared shell/loading:** light Outfit sidebar, labelled compact mobile navigation, existing active states, shared light loading panel and cards. `/asset-master` retains its existing redirect. Logout remains the existing POST form with `aria-label="Sign out"`; no mutation controls were added.

## Field consumption and financial honesty

Home uses only `getJoinedPortfolio()` and the new `listPortfolioSnapshots()` reader. It reads `totals.grandTotalUsd/Thb`, class value totals, `totals.costBasisUsd/Thb`, `totals.pnlUsd/Thb`, `totals.pnlPct`, `totals.pnlCoverage`, and `totals.pnlByClass`. T212 USD account display uses the joined account total/currency and the same snapshot FX; a directly known USD account value remains known when THB FX is missing. Joined arithmetic is unchanged.

Every position, NFT collection, native balance and token row consumes `valueUsd/Thb`, `costBasisUsd/Thb`, `pnlUsd/Thb`, `pnlPct`, `basisStatus`, `basisNote` and `pnlEligibility`. NFT collections remain one joined holding even when they contain multiple NFTs. No acquisition evidence, lot quantities or holdings are manufactured.

| State | Exact UI copy / behavior |
|---|---|
| No eligible recorded basis | **“No recorded cost basis yet — P&L unavailable”**; summary value, basis and percentage are `—`. |
| Partial P&L | **“Partial P&L (N of M holdings have recorded basis)”**; N is the eligible, reconciled subset from coverage. Exclusions have their own counts and labels. |
| Complete P&L | **“Complete P&L (N of M holdings have recorded basis)”**; the UI preserves the core's requirement of live sources and zero exclusions. |
| Only unreconciled recorded rows | **“Recorded P&L unavailable — unreconciled holdings are excluded”**; summary remains `—`. |
| `not-recorded` | Chip **“not-recorded”**, **“basis not recorded”**, **“Basis not recorded · excluded from P&L”**. Value remains visible; basis/P&L stay `—`, even if inconsistent stale zero fields were supplied. |
| `unreconciled` | **“Unreconciled · excluded from P&L”**, highlighted row and **“Excluded from P&L totals”**. Recorded basis and API P&L remain visible; footer sums use only core eligible totals. |
| `dust` | **“Dust · below $1”**, **“Dust under $1 · excluded from P&L”**. All per-asset rows are visible; wallet display filtering never changes totals. |
| `unpriced` | **“Unpriced”**, **“Unpriced · excluded from P&L”**. Current price/value remain `—`. |
| `airdrop-free` | Chip **“airdrop-free”**, real recorded zero basis, **“Verified free acquisition · percentage unavailable”**. Percentage remains `—`, never 0/0. |
| Other recorded provenance | **“t212-live”** / **“onchain-derived”** chips. Every chip carries the original `basisNote` as its title. |
| Cash | **“Cash contributes to value only; it has no P&L.”** It is absent from per-asset P&L sums. |
| Missing total / partial source value | **“Value unavailable”** or **“Partial joined value”**; known class values remain visible. |

`none` is a display state for zero eligible P&L holdings; underlying coverage is still the core's `partial`/`complete` contract. A known empty book does not manufacture a recorded holding or recorded P&L on Home. Recorded zero P&L for an actually eligible holding remains a valid observation.

THB uses only the supplied snapshot mirrors or same-observation FX. Null THB stays `—`; there is no fallback/stale rate. Basis is explicitly described as not a tax-cost figure.

## Snapshot reader, performance and calendar

`lib/pnl-history.ts` adds a SELECT-only reader behind `isNeonConfigured()`. It selects date, value/basis/P&L USD+THB, percentage and coverage, returning plain camelCase objects newest-first. It validates numeric driver strings, dates and coverage counts without coercing null/blank/boolean into zero. Invalid coverage/date rows are rejected. No configuration, missing table, driver errors or a bounded 2-second timeout return `[]`; no failure propagates into the page. The reader executes no DDL and does not call archive schema/seed code. The existing recorder is unchanged.

The Home server component reads history after `getJoinedPortfolio()` completes the existing recorder, so a newly recorded day can appear immediately. `lib/pnl-view.ts` contains shared formatting, FX-display, allocation, UTC calendar/period and history derivation helpers, with pure fixture tests.

- Performance reads `total_value_usd`; its cost series reads only non-null `cost_basis_usd`. Missing observations/basis break the lines; cost lines also break when coverage changes. Single observations are real dots, without a fabricated trend. A table exposes exact USD/THB observations and coverage.
- Cost belongs to the eligible subset; value includes cash and excluded holdings. Exact warning: **“Cost covers eligible holdings only; value includes cash and excluded holdings. The gap between the lines is not whole-portfolio P&L. Missing days and basis remain gaps.”**
- Empty history displays **“History starts today”**, with all period controls disabled. If a chosen period contains no rows but older records exist: **“No snapshots in this period”** and All remains available. Chart failure retains a readable observation table.
- Calendar days expose USD/THB and coverage in accessible labels; day cells use compact USD to fit mobile widths, while selecting a recorded day shows its exact value, basis, P&L, percentage and eligible count. Tiny nonzero cell P&L is labelled below one cent rather than rounded to zero. Empty months say **“No snapshots this month”**; no-history calendar says **“History starts today”**. No blank day is colored as zero profit.
- Calendar P&L is unrealized P&L at that observation, not additive daily profit: **“Each day shows that snapshot’s unrealized P&L, not a daily return.”**
- Daily change requires adjacent UTC dates, the latest on the displayed as-of date, complete source observations and unchanged coverage buckets. It compares first daily total-value observations, not market closes. It is labelled **“Value change includes cash flows. It is not investment return.”** Otherwise: **“Awaiting comparable snapshots on adjacent days.”**

The operator's current book has no recorded non-T212 acquisition evidence and zero T212 positions; eligible=0 and unknown basis/P&L are correct. This environment has neither provider credentials nor Neon. The production QA intentionally denies external fetches, so history, performance, calendar and unavailable live values are honestly empty. No current-book fixture values are shipped in the app. Future visits only create history under Run 1's existing eligibility guards; there is no backfill promise.

## Harness changes

The original harness was updated, not replaced with weaker visual checks. The old dark-theme and four-old-KPI anchors were replaced with exact light/Outfit/card tokens and the complete P&L section topology. The misleading “no allocation language” label now enforces the actual retired ownership/investor wording ban while permitting allocation by asset class.

Preserved: successful routes and `/asset-master` redirect; ≤1px body overflow; no rendered `undefined`/`NaN`/`null`; no mutation forms/fields/contenteditable/accessibly named controls; POST-only logout; retired names/ownership/migration/demo bans; native-before-token and priced-before-unpriced ordering; priced attributes and unpriced dashes; full-set counts and totals across filter toggles; strict default dust visibility; explicit empty/unavailable states; browser console cleanliness; and the separate live/legacy Plottable chart boundary.

Expanded: all these route-level contracts now also cover `/login` and both viewport sizes; both directions of Home and registry dust toggles are checked, with exact raw USD threshold at $1 additionally verified by pure and populated browser fixtures; native unknown-price visibility and full totals are checked; seven source keys and badges are checked; P&L none/partial/complete, unknown basis, free acquisitions and every exclusion reason are checked; history empty controls and populated period/calendar interactions are checked. Legacy-only charts no longer falsely require a nonexistent live point.

Initial production harness: **158/158 checks passed**. Independent review subsequently found that live-marker availability was gated by the UI's own legend and could miss a hidden known live value. The review fix pass below records the restored independent-data contract. No pre-existing unit test was modified; new suites add pure mapping/view and rendered financial-state coverage.

## Risks and post-merge live verification

1. Verify `DATABASE_URL` exists in the intended Vercel environment and the snapshot SELECT can read the Run 1 table. A read failure intentionally looks like empty history, with a fixed server-side log and no secrets.
2. Check the live broker cash, NFT quantities/floors, four-chain native balances, priced USDG and actual dust against their source badges after merge. Local QA proves unavailable and synthetic fixture behavior, not today's provider quotes.
3. The current book should continue to show no recorded cost basis; Run 3 must not treat that as an error to fill with current prices or zero. Any future provenance collector still needs complete acquisition/payment evidence, exact units, historical payment quotes and the existing reconciliation rules.
4. First daily observations are not closing prices. There is no cash-flow ledger or time-weighted return. Changed coverage breaks cost lines; unchanged coverage counts cannot prove identical constituents, and comparisons are labelled value change accordingly.
5. Class allocation uses value, including broker cash and priced wallet dust; unpriced assets have no invented weight. Share percentages wait for all class USD values. P&L subset basis is not the cost of the entire value line.
6. `/portfolio` retains honest original THB archive units. Future historical USD must come from recorded historical FX, not the current FX snapshot.
7. The read query currently lists all daily records. Daily cadence is small; consider pagination only if history grows materially. Reader and recorder each have their own bounded timeout.
8. No mascot, new providers, dependencies, API routes, deployment, auth changes, archive writes, data-core arithmetic changes, config changes or package-script changes were introduced.

## Printed self-QA

### 1. `npm test`

```text
npm notice run portmanager@0.1.0 test
npm notice run vitest run
RUN v4.1.10 /home/user/projects/portmanager
Current-book P&L: costBasisUsd=null; pnlUsd=null; pnlPct=null; eligible=0.
Test Files  9 passed (9)
     Tests  111 passed (111)
```

79 original tests passed unchanged, plus 9 snapshot-reader tests, 16 pure-view tests and 7 rendered per-asset P&L tests. All run offline; no database/provider access is required.

### 2. `npm run lint`

```text
npm notice run portmanager@0.1.0 lint
npm notice run eslint
/home/user/projects/portmanager/proxy.ts
  19:10  warning  'b64urlEncode' is defined but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (0 errors, 1 warning)
```

Only the brief's allowed pre-existing warning remains.

### 3–4. Production build and UI contract

The production builds required by steps 3 and 4 exited 0. After final shared-formatter cleanup, the final source was rebuilt and the full production harness rerun:

```text
npm run build
▲ Next.js 16.2.6 (Turbopack)
Creating an optimized production build ...
✓ Compiled successfully in 3.5s
Running TypeScript ...
Finished TypeScript in 2.4s ...
✓ Generating static pages using 7 workers (5/5) in 97ms
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

npm run start -- --hostname 127.0.0.1 --port 8125
▲ Next.js 16.2.6
- Local: http://127.0.0.1:8125
- Network: http://127.0.0.1:8125
✓ Ready in 59ms

node scripts/ui-contract-check.mjs
PASS | desktop / responds successfully — HTTP 200 · /
PASS | desktop / uses the light Outfit design
PASS | home P&L summary distinguishes none, partial and complete honestly — P&L state: none
PASS | home retains all seven source statuses and unavailable-source honesty — all seven sources unavailable · P&L remains honest
PASS | H4 desktop home wallet/history toggle paths keep the browser console clean
PASS | H4 mobile home wallet/history toggle paths keep the browser console clean
PASS | mobile /login keeps the browser console clean
PASS | UI contract summary — 158/158 checks passed
```

The start process used `NODE_OPTIONS=--import=/tmp/portmanager-pnl-offline.mjs` for deterministic provider-unavailable QA. The temporary preload only rejects external fetches; it supplies no fixture responses and is not committed. All 158 individual checks were printed during execution; the excerpt above retains the required summary and representative financial-state assertions.

### 5. Grep / occurrence anchors

```text
app/: No recorded cost basis: 1 occurrences
app/: data-pnl-summary: 1 occurrences
app/: P&amp;L (recorded): 3 occurrences
app/: data-basis-status: 1 occurrences
app/: data-pnl-eligibility: 2 occurrences
app/: History starts today: 2 occurrences
app/: data-source-key: 1 occurrences
app/ + pure view labels: t212-live: 2 occurrences
app/ + pure view labels: onchain-derived: 3 occurrences
app/ + pure view labels: airdrop-free: 5 occurrences
app/ + pure view labels: not-recorded: 6 occurrences
app/: bp6-dark: 0 occurrences
app/: Classes.DARK: 0 occurrences
```

The main no-basis summary and exact basis chip metadata live in the tested pure view module. `rg -n 'bp6-dark|Classes\.DARK|Geist|geist' app` returned no matches. `git diff --check` passed. Protected data/auth/dust/package/config files have no diff.

### 6. Unavailable-source Home fixture state

```text
HTTP 200
Browser errors: []
P&L summary: No recorded cost basis yet — P&L unavailable
P&L value / percentage / THB / basis: —
Desktop body overflow: 0px
Mobile body overflow: 0px
```

The rendered UI contract independently checks absence of `undefined|NaN|null` and all required honest unavailable states.

### Additional independent verification

```text
PASS | Secondary production browser summary — 12/12 route/viewport audits passed
PASS | Wallet registry static fixture — 7/7 checks passed
PASS | Populated asset registry — 0px overflow at 1440/390/320px
PASS | Toolbar final CSS inspection — 6/6 narrow-route checks passed
PASS | Populated component browser QA — 64/64 checks passed
```

During the initial run, screenshots and standalone fixture bundles were created only under `/tmp`; no screenshot artifacts or fixture routes were added to the repository. Reusable data from those fixtures is addressed in the review fix pass below.

## Run 2 review fix pass — `BRIEF-PNL-UI-FIX.md`

Review round: the independent Run 2 review returned `passed:false` for chart recovery and the live-marker contract. This pass is limited to those findings, their regression/interaction coverage, and reusable synthetic browser fixture data. The revert path remains tag `pre-pnl-ui-2026-09-05` plus `backups/site-pre-pnl-ui-2026-09-05/`.

### Finding dispositions

1. **FIXED — same-period chart recovery:** `app/pnl-history-panels.tsx` includes `chartError` in the drawing effect dependencies and guards the error state. Clearing the error now initializes the chart host even when period and memoized observations are unchanged. `lib/pnl-chart-retry.test.ts` exercises real React and Plottable in Chromium: inject one draw failure, observe the unavailable state, click the already-selected **All**, and verify a second draw with a ready SVG, two axes and 15 data points while the same eight observations, table and selection remain unchanged. The regression failed on the original code at the recovered-SVG wait and passed with the two-line fix. React may reuse the underlying div; the test verifies initialization and drawing rather than DOM node identity.
2. **FIXED — independent live-marker availability:** `assertPortfolioChart` and `auditPopulatedFixtures` in `scripts/ui-contract-check.mjs` require a known positive USD/THB total with live source states from committed JSON. The real `PortfolioPage` and `PortfolioChart` render with fixture data boundaries; the harness checks the visible marker's exact date/as-of/USD/THB datum and exact KPI/register values. A missing host fails before the empty-state return. Negative controls deliberately hide the marker and mark its legend unavailable, then remove the host: both must be rejected. Independently unavailable data still passes with its real legacy points and no live marker.
3. **DOCUMENTED — native/token filter semantics:** a one-line comment at the Home default-filter assertion in `scripts/ui-contract-check.mjs` explains: **“Unknown-price native balances stay visible; unpriced tokens are hidden by the existing dust filter.”** Application filtering is unchanged.
4. **FIXED — populated calendar/period interaction coverage:** the generic populated-history check now fails on disabled period buttons instead of skipping them. Mandatory desktop and mobile fixtures exercise enabled **1M/3M/All** controls with **6/7/8** observations and repeated chart redraws; select recorded partial, unknown-basis and free-basis days; compare exact value, basis, P&L, percentage and coverage against JSON; and navigate September → August → September, checking the grid and selected observation. Unknown amounts remain dashes and known free basis remains zero without a percentage.
5. **FIXED — reusable populated browser fixtures:** added `scripts/__fixtures__/pnl-browser.json` and `pnl-browser.html`. The JSON extracts synthetic history/wallet cases from `/tmp/portmanager-pnl-populated-qa/fixture.tsx` and adds known-live/legacy input. The free-basis observation is internally consistent at USD value 40, basis 0 and P&L 40. `scripts/ui-fixture-entry.tsx` mounts real app components; `scripts/ui-fixture-server.mjs` builds them in a temporary directory and serves an ephemeral localhost port. The existing UI harness runs the fixtures automatically; the retry test shares the same helper. Fixtures contain no credentials, real provider records, generated JavaScript bundles or screenshot binaries. No app fixture route or API route was added.

### Printed review self-QA

```text
npm test
RUN v4.1.10 /home/user/projects/portmanager
Current-book P&L: costBasisUsd=null; pnlUsd=null; pnlPct=null; eligible=0.
Test Files  10 passed (10)
     Tests  112 passed (112)

npm run lint
/home/user/projects/portmanager/proxy.ts
  19:10  warning  'b64urlEncode' is defined but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (0 errors, 1 warning)

npm run build
▲ Next.js 16.2.6 (Turbopack)
✓ Compiled successfully in 4.8s
Running TypeScript ...
Finished TypeScript in 2.8s ...
✓ Generating static pages using 7 workers (5/5) in 89ms
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

npm run start -- --hostname 127.0.0.1 --port 8125
▲ Next.js 16.2.6
- Local: http://127.0.0.1:8125
- Network: http://127.0.0.1:8125
✓ Ready in 62ms

node scripts/ui-contract-check.mjs
PASS | home retains all seven source statuses and unavailable-source honesty — all seven sources unavailable · P&L remains honest
PASS | committed independent browser fixtures build and start locally — scripts/__fixtures__/pnl-browser.json + real app components; temporary assets and ephemeral localhost port
PASS | desktop fixture populated/empty/live/legacy interactions keep browser console clean
PASS | mobile fixture populated/empty/live/legacy interactions keep browser console clean
PASS | UI contract summary — 201/201 checks passed
```

The prior 111 tests pass unchanged, plus the new same-period chart recovery regression. Both the regression and browser fixtures use already-installed Playwright/Chromium and Vite (provided by the existing Vitest installation); no dependency, package script or configuration changed.

The full production UI run printed all **201/201** passing checks: the original 158 route checks plus fixture setup and 42 desktop/mobile fixture checks. External providers are unavailable in this environment; credentials and Neon configuration are absent. As in the initial run, the background start command used `NODE_OPTIONS=--import=/tmp/portmanager-pnl-offline.mjs`, which rejects external fetches without supplying provider responses. The separate committed synthetic fixtures prove populated behavior without changing production responses. Lint retains only the pre-existing warning in protected `proxy.ts`.

### Printed assertions for findings #1, #2 and #4

```text
npm test -- lib/pnl-chart-retry.test.ts --reporter=verbose
✓ lib/pnl-chart-retry.test.ts > redraws after a chart draw failure when retrying the SAME selected period with unchanged observations
Test Files  1 passed (1)
     Tests  1 passed (1)

PASS | desktop fixture finding #2 known live source requires exact live marker and USD/THB value — independent source=live · USD 1250.50 · THB 45018.00 · exact live marker/KPI/register
PASS | desktop fixture finding #2 rejects hidden live marker plus a false unavailable legend — negative control rejected; UI unavailable copy cannot waive known fixture data
PASS | desktop fixture finding #2 rejects a missing host for independently known live data — negative control rejected before empty-state return
PASS | desktop fixture finding #4 populated periods are enabled and filter exact recorded rows — 1M/3M/All enabled · 6/7/8 exact observations · repeated period changes draw charts
PASS | desktop fixture finding #4 clicking 2026-09-01 shows exact recorded USD/THB and coverage — 2026-09-01 · value US$1,100.00 / ฿39,600.00 · P&L US$200.00 / ฿7,200.00 · partial 2/3
PASS | desktop fixture finding #4 clicking 2026-09-02 shows exact recorded USD/THB and coverage — 2026-09-02 · value US$1,200.00 / ฿43,200.00 · P&L — / — · partial 0/3
PASS | desktop fixture finding #4 clicking 2026-09-03 shows exact recorded USD/THB and coverage — 2026-09-03 · value US$40.00 / ฿1,440.00 · P&L US$40.00 / ฿1,440.00 · complete 1/1
PASS | desktop fixture finding #4 previous/next month changes grid and exact selected observation — September → August (2026-08-31) → September (2026-09-05); exact grid/value/basis/P&L/coverage
PASS | mobile fixture finding #2 known live source requires exact live marker and USD/THB value — independent source=live · USD 1250.50 · THB 45018.00 · exact live marker/KPI/register
PASS | mobile fixture finding #4 populated periods are enabled and filter exact recorded rows — 1M/3M/All enabled · 6/7/8 exact observations · repeated period changes draw charts
PASS | mobile fixture finding #4 previous/next month changes grid and exact selected observation — September → August (2026-08-31) → September (2026-09-05); exact grid/value/basis/P&L/coverage
```

Independent read-only review of this fix pass returned **PASS**, with no blocking findings. `git diff --check` passed. Protected auth, archive/data-core/dust files, package manifests/lockfile and all configs have no diff against the initial Run 2 commit. Delivery is confined to `feat/pnl-astra-ui`; no deployment or main-branch push. Existing unrelated untracked briefs, reports, backups and screenshots remain outside the commit.
