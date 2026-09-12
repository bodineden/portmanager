# P&L correctness implementation report

Branch: `feat/pnl-correctness`. Base: `86a837a7d9f8b5bc744237ceb22d10877dc3160b`.
The entire signed `BRIEF-PNL-CORRECTNESS.md` is implemented as one deliverable. No push, deployment, production database write, archive change, or change to `main` was performed.

## Findings closed

| Fix | Finding | Implementation and pinned result |
|---|---|---|
| 1 | Blocking audit A3: USD direction reversal on FX moves | `dailyChangeDetails` subtracts the capital flow in THB first, then translates that single adjusted result using the current snapshot's FX. The exact audit case is unchanged ฿100,000 value / ฿120,000 contributed capital, identical holding/source signature, FX 32 → 34. Raw USD value falls **−183.82**; the old implementation showed **usd=36.76, thb=0, pct=1.18%**. The required THB-adjusted metric now returns **usd=0, thb=0, pct=0**. It is not a raw USD investment return. |
| 2 | Blocking audit A5: finite subtotal can freeze an incomplete book | A separate recorder eligibility gate checks all nine `VALUE_SOURCE_KEYS` before DB construction or consuming an attempt. Any unavailable/missing/invalid source is skipped. The exact audit reproduction retains **walletTokensUsd=null, walletUsd=200, grandTotalUsd=2916.65**, but the real recorder with an injected DB now returns **skipped** without IO. Every source's refusal → successful same-day retry is pinned; partial-but-valued inventory remains recordable. |
| 3 | Production defect: one unpriceable NFT collection blanks the book | Joined NFT value uses the priced collection subtotal and keeps the null-priced collection row. Source status and P&L coverage are normalized together: partial if some floors resolve, unavailable for wallet failure or no resolved floors, live zero for a successfully empty wallet. With **6 collections / 7 NFTs** and one fault-injected null floor, the other **5** provide the NFT subtotal and the book stays finite; the missing row renders **—**, remains unpriced, and never becomes dust or a zero basis. |
| 4 | Audit A4: ledger latency indistinguishable from failure | A private timeout error class produces `Contributed capital ledger read timed out.` or `Manual holdings ledger read timed out.` while retaining unavailable state and fail-closed data. The 2000 ms deadline rejects before aborting the driver, preserving classification in an abort race. Ordinary errors keep the generic message; neither result nor logs expose driver details. The existing UI source strip already renders the reader's message. |

### Daily percentage and FX meaning

`adjustedThb = (V_t_thb − V_previous_thb) − (C_t_thb − C_previous_thb)`; `adjustedUsd = adjustedThb / usdToThb`.
Percentage is explicitly **adjustedThb / previous totalValueThb × 100**; a zero previous denominator remains null. All existing adjacency, current-as-of, source availability, matching value-set, finite-value, and capital-present guards remain.

The snapshot schema has no standalone FX field. This implementation recovers only the current snapshot's rate from its same-observation THB/USD total mirrors, using its capital mirrors for a zero-valued book. It never uses yesterday's FX or differences translated cumulative capital. For a nonzero adjusted change, a missing/invalid ratio returns `snapshot FX unavailable`, not a guessed rate. An exact known zero adjusted change remains zero under every positive FX rate, including a full withdrawal to zero book value and zero capital. No schema migration is required.

## Per-file changes

| File | Changes / tests |
|---|---|
| `lib/pnl-view.ts` | THB-first adjusted change, one current-snapshot USD conversion, explicit previous-THB percentage denominator and invalid-FX guard (A3). |
| `lib/adjusted-day-change.test.ts` | Replaces the old incorrect USD-capital-difference expectation; adds exact A3 reproduction, deposits/withdrawals with positive/flat/negative THB movement across FX, zero-book current-capital FX fallback, unknowable-FX rejection, and a full withdrawal with exact known zero adjusted change. Existing guards remain tested. |
| `lib/pnl-history.ts` | Independent all-nine-source eligibility gate before DB/attempt flags (A5); existing error/timeout retry and immutable insert semantics unchanged. |
| `lib/pnl-history.test.ts` | Nine source-specific unavailable → same-day retry cases; exact finite-but-incomplete A5 book; partial NFTs plus unpriced token and priced dust still record with null holdings evidence. Existing fixture now supplies an honestly partial empty capital ledger instead of omitting that source. |
| `lib/live-data.ts` | Partial NFT priced subtotal and normalized unavailable/partial/live state propagated to source strip and P&L coverage (production defect). No change to wallet subtotal behavior. |
| `lib/live-data.test.ts` | Five-of-six collection subtotal, null row, finite book, unknown-all-floors and known-empty/zero-floor distinctions; provider-boundary all-priced, one collection HTTP 401, all floors missing, and wallet HTTP 401 cases. The old partial-NFT-null expectation is replaced with the required subtotal plus explicit incomplete status. |
| `lib/__fixtures__/nft-floors.ts` | New public read-only OpenSea observation with all six measured floors and exact token counts; a separately labelled one-floor fault injection. Test-only, not a production fallback; no credential content. |
| `lib/pnl-ui.test.ts` | Actual `PnlAssetTable` rendered regression: all six NFT rows remain; unpriced row's value, basis and P&L are dashes, no dust/zero substitution or mutation controls; other five priced rows render. |
| `lib/capital-db.ts` | Typed bounded-read timeout, deadline-before-abort ordering and fixed reader/log messages (A4). SQL and schema statements unchanged. |
| `lib/capital-db.test.ts` | Both readers: SELECT succeeds only after default 2000 ms deadline, remains unavailable, ignores late success and retries; driver abort race; private generic error mentioning timeout stays a generic failure. |
| `app/asset-list/page.tsx` | Retains NFT rows and known collection/token counts when pricing is wholly unavailable; failed-wallet empty rows still show unavailable, never empty/zero inventory. |
| `app/page.tsx` | Explicit daily THB percentage denominator and allocation percentages labelled as known priced subtotal shares, not full inventory. |
| `app/portfolio/page.tsx` | Finite partial book now visibly says `LIVE JOINED · PARTIAL VALUE`, with a known-priced-subtotal coverage note. |
| `lib/pnl-correctness-pages.test.ts` | Five real rendered-page regressions for partial/all-unpriced/missing wallet NFT registries, Home allocation/day explanations and Portfolio partial-value status. Only unrelated auth/navigation/browser components are isolated. |
| `REPORT-PNL-CORRECTNESS.md` | This per-file/finding map, regression evidence, verbatim QA, review and risk notes. |

## Verification scope and observations

- Baseline: **18 test files / 219 tests passed**; lint had **0 errors / 1 pre-existing proxy warning**. Final: **19 test files / 252 tests passed**, including **33 added tests**. No existing UI contract assertion was changed, removed or weakened; `scripts/ui-contract-check.mjs` is byte-identical to `86a837a`.
- Each fix had an observed failing regression before its implementation. A3 failed with the exact old +36.76 / +1.18% sign reversal; the unavailable recorder matrix failed by recording; NFT subtotal tests failed with null totals; both ledger readers failed with the generic rather than timed-out message. Targeted runs then passed.
- The working OpenSea credential was used only in memory for read-only GETs. A first Python urllib request returned HTTP 403; retrying the same official API with Node fetch succeeded. At **2026-09-12T04:49:50.350Z**, the wallet returned **7 NFTs in 6 collections**, no next page, and all six floors resolved. Observed ETH floors: claystonkz `0.0089`; g00fyz `0.0004` (2 tokens); itsriggles `0.025`; piggy-banks-nfts `0.01349999`; thefirmbrokers `0.007472899999`; wasteland-art `0.0093999`. The null wasteland-art floor in tests is deliberate fault injection, not a claimed live outage.
- Browser QA uses a fresh local production server at `http://127.0.0.1:43733`, readiness **HTTP 200**, and the existing separate populated browser fixtures at desktop/mobile sizes. After rebuilding for the review fixes, readiness was again HTTP 200 and the complete unchanged harness was rerun. A temporary loopback-only Node preload rejects external requests without manufacturing provider responses; no live Neon connection is configured. This proves unavailable-provider production rendering and fixture-backed populated paths, not a live full-book production or database integration test.
- The first complete UI harness run reported **337/337 passing**; an extra shell exit-code forwarding wrapper then failed with `bash: exit: : numeric argument required`. It was rerun without that wrapper; the final command output and status are recorded below. The harness itself was never modified.

## Internal review

Reviewed the full staged production and test diff: THB signs and denominators; current-only FX fallback; nine-source gate timing and retry state; known-zero versus unknown NFT pricing; null basis/row rendering; and deadline/abort ordering. Static added-line scans found no hardcoded-secret, shell-injection, eval/exec, unsafe-deserialization or SQL-injection matches. Source/test whitespace checks passed. The full report diff intentionally retains the three trailing spaces emitted by Next's static-page build progress lines, so an all-files `git diff --check` flags only those verbatim transcript lines; the transcript is not edited to manufacture a clean whitespace result. Archive/schema code, all auth/proxy paths and the mascot emotion contract remain unchanged. No controls were added or renamed. The three page changes only retain known unpriced rows/counts and explain the adjusted-change denominator / priced-subtotal coverage. A first independent read-only Codex/Sol ultra review found a full-withdrawal zero-FX edge case and downstream partial-value presentation issues. Those were reproduced in failing tests and corrected, then the internal diff review and full QA were repeated. Its broader objection to recording partial-but-valued sources conflicts with the signed brief; that required behavior is retained and explicitly flagged as a limitation below. Both review verdicts are preserved below, with a final brief-aware independent gpt-6-astra ultra review.

## Risk flags / limitations

1. **Partial observation immutability is intentional.** A priced-but-partial day can still be the first qualifying observation and occupy the day's immutable row; a later more-complete book does not replace it. Unavailable-source failures can retry. Existing already-written incomplete rows are not repaired or overwritten. Upstream `partial` may also describe incomplete pages/items/chains; a stricter inventory taxonomy is a follow-up, not an unrequested change to this brief's partial-but-valued rule.
2. **Production credentials and Neon remain operational checks.** Local authenticated OpenSea reads succeeded, but no Vercel secret was changed and no deployment or real database write was attempted. The failing production key and any ledger latency must be checked by the operator when deploying; the timeout remains fail-closed.
3. **Historical FX is recovered from stored mirrors.** Decimal storage rounding can slightly affect the reconstructed rate. A zero book with zero capital has no recoverable FX; a nonzero adjusted change therefore remains unavailable. An exact known zero adjusted change still returns zero without guessing a rate. Legacy missing evidence continues to block comparisons.

## Deviations

No functional or scope deviation from the signed brief. The implementation uses the existing snapshot THB/USD mirrors rather than adding an unrequested FX column. All application controls, auth behavior, archive tables and mascot contracts are unchanged. Review-driven zero-withdrawal and three-page presentation hardening stay within fixes 1 and 3; no broad inventory redesign was introduced. All code/test/report changes are committed only on `feat/pnl-correctness`; nothing is pushed.

## Verbatim self-QA output

Full command stdout/stderr follows. The stat capture is the staged code/test diff before adding this report itself; the final all-files stat is also printed after report creation.

### `npm test` — exit 0

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

 Test Files  19 passed (19)
      Tests  252 passed (252)
   Start at  05:19:33
   Duration  1.96s (transform 1.78s, setup 0ms, import 3.59s, tests 1.92s, environment 3ms)


```

### `npm run lint` — exit 0

```text
npm notice run portmanager@0.1.0 lint
npm notice run eslint

/home/user/projects/portmanager/proxy.ts
  19:10  warning  'b64urlEncode' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)


```

### `npm run build` — exit 0

```text
npm notice run portmanager@0.1.0 build
npm notice run next build
▲ Next.js 16.2.6 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 4.2s
  Running TypeScript ...
  Finished TypeScript in 2.9s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/5) ...
  Generating static pages using 7 workers (1/5) 
  Generating static pages using 7 workers (2/5) 
  Generating static pages using 7 workers (3/5) 
✓ Generating static pages using 7 workers (5/5) in 97ms
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

### `git diff --stat 86a837a` — exit 0

```text
 app/asset-list/page.tsx           |  8 ++--
 app/page.tsx                      |  6 +--
 app/portfolio/page.tsx            |  6 ++-
 lib/__fixtures__/nft-floors.ts    | 20 ++++++++++
 lib/adjusted-day-change.test.ts   | 43 +++++++++++++++++++-
 lib/capital-db.test.ts            | 47 ++++++++++++++++++++++
 lib/capital-db.ts                 | 18 +++++++--
 lib/live-data.test.ts             | 83 +++++++++++++++++++++++++++++++++++++--
 lib/live-data.ts                  | 21 ++++++++--
 lib/pnl-correctness-pages.test.ts | 75 +++++++++++++++++++++++++++++++++++
 lib/pnl-history.test.ts           | 63 ++++++++++++++++++++++++++++-
 lib/pnl-history.ts                |  4 ++
 lib/pnl-ui.test.ts                | 23 +++++++++++
 lib/pnl-view.ts                   | 16 ++++++--
 14 files changed, 405 insertions(+), 28 deletions(-)

```

### `UI_BASE_URL=http://127.0.0.1:43733 node scripts/ui-contract-check.mjs` — exit 0

All **337 existing checks pass**, including **126/126 mascot contract** checks. The unchanged harness printed **337 individual PASS results**, programmatically counted against its declared total (some labels repeat across viewports/routes). This is the final rerun after the review fixes and rebuild.

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
PASS | desktop production mascot DOM resting chip has no visible bubble or controls after six seconds — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · settled in 5050ms after initial DOM checks · opaque through fade · no repeat
PASS | desktop production mascot DOM resting occlusion leaves home hero as-of/status metadata visible and hittable — hero as-of/status metadata: 3/3 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | desktop production mascot DOM resting occlusion leaves home class legend visible and hittable — five-class legend labels and USD/THB values: 15/15 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | desktop production mascot DOM WebGL 3D click expands the live viewer; panel stays expanded — 128px panel · aria-expanded=true · visible safe controls · current bubble visible · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video · exact gltf.animations log · bubble/controls/live loop remain beyond the transient deadline
PASS | desktop production mascot DOM second click collapses back to the resting chip — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop production mascot DOM keyboard expands cached 3D viewer; Escape collapses and restores chip focus — Enter and Space expand cached 3D bytes without another GLB request; Escape from Mute guide and Hide guide collapses, aria-expanded=false, focus returns to chip
PASS | desktop production mascot DOM mute hides the bubble, retains the a11y sprite underlay and persists on reload — mute checkbox/aria-pressed/localStorage agree · accessible sprite DOM underlay retained beneath motion surface · reload rests silently · Space/Enter unmute restore current bubble
PASS | desktop production mascot DOM hide removes the companion, survives client navigation and resets on reload — companion absent across all four pages in one document; collapsed chip restored after reload; independent mute preference retained
PASS | desktop production mascot DOM interaction and hydration console stays clean — zero page errors, hydration errors or console errors
PASS | desktop production mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.78s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.37s/7.00s advancing · no canvas · static sprite hidden · 218/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.87s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
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
PASS | mobile production mascot DOM resting chip has no visible bubble or controls after six seconds — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · settled in 5083ms after initial DOM checks · opaque through fade · no repeat
PASS | mobile production mascot DOM resting occlusion leaves home hero as-of/status metadata visible and hittable — hero as-of/status metadata: 3/3 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | mobile production mascot DOM resting occlusion leaves home class legend visible and hittable — five-class legend labels and USD/THB values: 15/15 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | mobile production mascot DOM WebGL 3D click expands the live viewer; panel stays expanded — 128px panel · aria-expanded=true · visible safe controls · current bubble visible · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video · exact gltf.animations log · bubble/controls/live loop remain beyond the transient deadline
PASS | mobile production mascot DOM second click collapses back to the resting chip — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile production mascot DOM keyboard expands cached 3D viewer; Escape collapses and restores chip focus — Enter and Space expand cached 3D bytes without another GLB request; Escape from Mute guide and Hide guide collapses, aria-expanded=false, focus returns to chip
PASS | mobile production mascot DOM mute hides the bubble, retains the a11y sprite underlay and persists on reload — mute checkbox/aria-pressed/localStorage agree · accessible sprite DOM underlay retained beneath motion surface · reload rests silently · Space/Enter unmute restore current bubble
PASS | mobile production mascot DOM hide removes the companion, survives client navigation and resets on reload — companion absent across all four pages in one document; collapsed chip restored after reload; independent mute preference retained
PASS | mobile production mascot DOM interaction and hydration console stays clean — zero page errors, hydration errors or console errors
PASS | mobile production mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.71s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.23s/7.00s advancing · no canvas · static sprite hidden · 233/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.73s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
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
PASS | desktop mascot fixture DOM WebGL 3D switches all nine mapped mood motions without re-downloading — data-mascot-3d=on · calm→idle, happy→happy_clap, excited→excited_bounce, thinking→idle, worried→idle, sad→idle, sleepy→idle, proud→happy_clap, alert→idle · on→video→on (data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.23s/7.00s advancing · no canvas · static sprite hidden; data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video) · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s) · one GLB request
PASS | desktop mascot fixture DOM new server props refresh mood and preserve expanded mute — thinking → worried while muted: expanded controls retained, checkbox/aria-pressed/localStorage stay true, no bubble; unmute shows latest message
PASS | desktop mascot fixture DOM new mood restarts a finite transient bubble without expanding — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop mascot fixture DOM changed message with the same mood restarts the bubble — alert source message expired; alert unreconciled message is newly visible while controls remain hidden
PASS | desktop mascot fixture DOM reduced motion keeps fallback video moving while CSS animation/fade is disabled — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 2.86s/7.00s advancing · no canvas · static sprite hidden · 13 expanded companion elements: CSS animation-name=none, transition durations=0; native video continues; collapse leaves compact chip · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | desktop mascot fixture console remains clean across every mood and prop transition
PASS | desktop fixture mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.83s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.35s/7.00s advancing · no canvas · static sprite hidden · 210/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.83s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
PASS | desktop mascot fixture DOM WebGL loading plays video then hands off to the live canvas — video → on · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.35s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · stopped/removed video · 64×95px unchanged card · one GLB · WebM-only request · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s)
PASS | desktop mascot fixture DOM WebGL resting chip plays idle without a click — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · no click · one GLB request
PASS | desktop mascot fixture WebGL resting idle changes rendered frames continuously — 3/3 distinct rendered frames · idle still live after announcement · same canvas
PASS | desktop mascot fixture DOM WebGL expand/collapse preserves canvas and switches idle to excited_bounce — idle → excited_bounce → idle twice (click + Escape) · same canvas/WebGL context · 126×189px expanded box / 128×262px card · 1 total GLB request
PASS | desktop mascot fixture DOM WebGL collapsed mood updates retain idle and the mounted canvas — excited → happy server props · still collapsed/idle · same canvas · one GLB request
PASS | desktop mascot fixture DOM WebGL resting reduced-motion toggle hands idle to video and restores live — on → video → on while collapsed · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.18s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · cached GLB
PASS | desktop mascot fixture DOM WebGL context loss switches the live idle canvas to playing video — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.15s/7.00s advancing · no canvas · static sprite hidden · one cached GLB request · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | desktop mascot fixture WebGL resting idle and transition console stays clean — zero page/console errors or Three/WebGL warnings
PASS | desktop mascot fixture DOM WebGL disabled plays video and restarts clips on expand/collapse — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.77s/7.00s advancing · no canvas · static sprite hidden · idle→happy_clap→idle with near-zero restarts · data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.16s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.15s/7.00s advancing · no canvas · static sprite hidden · zero GLB requests · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s)
PASS | desktop mascot fixture WebGL-disabled mascot fallback console is clean — zero page errors or Three/WebGL warnings
PASS | desktop mascot fixture DOM WebGL malformed GLB keeps playing video at rest and after expansion — data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.17s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · one request · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · zero page/video errors or Three/WebGL warnings
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
PASS | mobile mascot fixture DOM WebGL 3D switches all nine mapped mood motions without re-downloading — data-mascot-3d=on · calm→idle, happy→happy_clap, excited→excited_bounce, thinking→idle, worried→idle, sad→idle, sleepy→idle, proud→happy_clap, alert→idle · on→video→on (data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.63s/7.00s advancing · no canvas · static sprite hidden; data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video) · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s) · one GLB request
PASS | mobile mascot fixture DOM new server props refresh mood and preserve expanded mute — thinking → worried while muted: expanded controls retained, checkbox/aria-pressed/localStorage stay true, no bubble; unmute shows latest message
PASS | mobile mascot fixture DOM new mood restarts a finite transient bubble without expanding — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile mascot fixture DOM changed message with the same mood restarts the bubble — alert source message expired; alert unreconciled message is newly visible while controls remain hidden
PASS | mobile mascot fixture DOM reduced motion keeps fallback video moving while CSS animation/fade is disabled — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 2.95s/7.00s advancing · no canvas · static sprite hidden · 13 expanded companion elements: CSS animation-name=none, transition durations=0; native video continues; collapse leaves compact chip · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | mobile mascot fixture console remains clean across every mood and prop transition
PASS | mobile fixture mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.72s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.25s/7.00s advancing · no canvas · static sprite hidden · 233/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.73s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
PASS | mobile mascot fixture DOM WebGL loading plays video then hands off to the live canvas — video → on · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.30s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · stopped/removed video · 64×95px unchanged card · one GLB · WebM-only request · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s)
PASS | mobile mascot fixture DOM WebGL resting chip plays idle without a click — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · no click · one GLB request
PASS | mobile mascot fixture WebGL resting idle changes rendered frames continuously — 3/3 distinct rendered frames · idle still live after announcement · same canvas
PASS | mobile mascot fixture DOM WebGL expand/collapse preserves canvas and switches idle to excited_bounce — idle → excited_bounce → idle twice (click + Escape) · same canvas/WebGL context · 126×189px expanded box / 128×262px card · 1 total GLB request
PASS | mobile mascot fixture DOM WebGL collapsed mood updates retain idle and the mounted canvas — excited → happy server props · still collapsed/idle · same canvas · one GLB request
PASS | mobile mascot fixture DOM WebGL resting reduced-motion toggle hands idle to video and restores live — on → video → on while collapsed · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.22s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · cached GLB
PASS | mobile mascot fixture DOM WebGL context loss switches the live idle canvas to playing video — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.22s/7.00s advancing · no canvas · static sprite hidden · one cached GLB request · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | mobile mascot fixture WebGL resting idle and transition console stays clean — zero page/console errors or Three/WebGL warnings
PASS | mobile mascot fixture DOM WebGL disabled plays video and restarts clips on expand/collapse — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.66s/7.00s advancing · no canvas · static sprite hidden · idle→happy_clap→idle with near-zero restarts · data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.16s/7.00s advancing · no canvas · static sprite hidden · zero GLB requests · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s)
PASS | mobile mascot fixture WebGL-disabled mascot fallback console is clean — zero page errors or Three/WebGL warnings
PASS | mobile mascot fixture DOM WebGL malformed GLB keeps playing video at rest and after expansion — data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · one request · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · zero page/video errors or Three/WebGL warnings
PASS | Mascot motion surfaces never settle on the static fallback in codec-capable Chromium — post-hydration states observed: on/video
PASS | Mascot video fallback selects every contracted VP9 WebM clip — selected sources observed: /mascot/motion-excited-bounce.webm, /mascot/motion-happy-clap.webm, /mascot/motion-idle.webm

PASS | Mascot resting/occlusion summary — 10/10 checks passed at 1440×1000 and 390×844
PASS | Mascot DOM assertion summary — 50/50 checks passed (individual assertions printed above)
PASS | Mascot 3D/video fallback summary — 65/65 checks passed · data-mascot-3d states observed: on/video · selected video sources: /mascot/motion-excited-bounce.webm, /mascot/motion-happy-clap.webm, /mascot/motion-idle.webm

PASS | Mascot contract summary — 126/126 checks passed

PASS | UI contract summary — 337/337 checks passed

```

## Independent review evidence and disposition

The first independent Sol/ultra review returned `passed:false`. The three applicable findings were reproduced and fixed (known NFT registry rows hidden by unavailable pricing; misleading priced-subtotal presentation; known zero full-withdrawal change unnecessarily requiring FX). The request to disallow partial-but-valued recording conflicts with the signed acceptance rule and is retained only as a documented taxonomy/immutability risk, not silently implemented. The fixture now explicitly labels test-clock replay.

### Initial review — superseded by corrections and final review

```json
{
  "passed": false,
  "security_concerns": [],
  "logic_errors": [
    "lib/pnl-history.ts:46 accepts every partial source, but partial also represents missing NFT pages/items and failed wallet-chain inventories. The immutable ON CONFLICT snapshot can therefore record an incomplete subtotal and prevent a later complete same-day retry. The same coarse status can also make incomplete snapshots appear comparable.",
    "lib/live-data.ts:1219-1229 marks nonempty, wholly unpriced NFT inventory unavailable. app/asset-list/page.tsx:98-99 and 337-345 interpret unavailable as unknown inventory, hiding the known rows and counts. Collection-pricing failure is therefore presented like wallet-inventory failure.",
    "lib/live-data.ts:1227-1253 makes partially priced NFT subtotals finite, but lib/pnl-view.ts:134-136 still produces allocation percentages totaling 100%, and app/portfolio/page.tsx:83-105 labels any finite total LIVE JOINED. Existing consumers consequently present a lower-bound subtotal as complete.",
    "lib/pnl-view.ts:174-181 requires recoverable FX before handling an adjusted THB change of zero. A full withdrawal reducing both book value and contributed capital from 100000 to 0 has a known zero adjusted change, but 0/0 current mirrors return snapshot FX unavailable."
  ],
  "suggestions": [
    "Separate inventory completeness from pricing completeness and add recorder/history/UI tests for NFT pagination, ignored rows, failed wallet chains, and wholly unpriced collections.",
    "Validate consistency between total-value and capital FX mirrors, and validate that INSERT RETURNING contains the requested snapshot date before consuming the same-day attempt.",
    "Align the September 12 observed fixture with its September 1/5 test timestamps or label its values synthetic. Focused Vitest could not run because the read-only environment blocked Vite temporary directories; diff parsing, TypeScript, and ESLint passed."
  ],
  "summary": "No security defect was identified, and the ledger timeout race fix appears sound. The patch fails review because incomplete inventory can poison immutable history, partial values are presented inconsistently, and zero adjusted changes incorrectly require FX."
}
```

### Final gpt-6-astra / ultra, read-only, no delegation — exit 0

```json
{
  "passed": true,
  "security_concerns": [],
  "logic_errors": [],
  "suggestions": [
    "Complete the pending browser rerun with protected UI contract assertions unchanged.",
    "Track partial-status ambiguity around missing pages/chains as a nonblocking risk; preserve required partial-but-valued recording."
  ],
  "summary": "Focused read-only review found all four signed fixes satisfied. THB-first adjustment preserves comparison guards: the ฿100,000 value/฿120,000 capital, FX 32 → 34 reproduction retains raw USD change −183.82 and replaces erroneous usd=36.76, thb=0, pct=1.18% with adjusted zeros. Exact zero requires no inferred FX; nonzero change fails closed without FX. The nine-source gate skips the walletTokensUsd=null, walletUsd=200, grandTotalUsd=2916.65 reproduction without consuming retry eligibility. Partial NFT subtotals remain valued; wholly unpriced NFTs remain unavailable with known registry rows visible. Allocation and Portfolio labels disclose partial coverage. Ledger timeouts remain fail-closed with distinct messages. Regression tests and fixture provenance support these behaviors. Staged whitespace checks passed. Reported QA—19 files/252 tests, lint 0 errors/1 pre-existing proxy warning, build passed—was not independently rerun."
}
```

The final reviewer returned **passed:true**, no security concerns and no logic errors. Its pending-browser suggestion is now completed by the **337/337** final run above. The partial-status ambiguity is retained in the three risk flags, as requested. The reviewer did not independently rerun the test/lint/build commands; their real executed output is provided above.
