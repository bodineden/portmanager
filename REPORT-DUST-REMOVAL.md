# Dust removal report

Completed on `feat/dust-removal`, based on `9e27211`. No push, merge, or operation on `main` was performed. Only explicit task paths were staged; pre-existing briefs, reports, screenshots and backups were left alone. The implementation and this report are committed together; the final response prints the commit SHA.

Market-valued T212 positions, NFT collections, native balances and ERC-20 tokens with unknown USD value or a value strictly below $1 are absent from joined holdings before totals, coverage, allocation and snapshot maps are calculated. Manual cash pots remain present at any value. Both wallet toggles, hidden counts, threshold explanations, retired price labels and their CSS are removed. The neutral wallet empty heading is exactly `No wallet holdings to display in this snapshot.`

The snapshot schema and its dust/unpriced coverage fields remain unchanged. New current coverage counts displayed market holdings only and leaves both fields zero; old snapshots still parse. NFT inventory truncation/missing collection metadata remains partial, and hard or whole-class pricing failures remain unavailable with null class totals. The existing nine-source recorder gate still refuses an immutable daily row if any source is unavailable.

Baseline verified before implementation: 19 files /252 tests passed; lint 0 errors and the existing `proxy.ts` unused-variable warning; clean production build; browser contract 337/337. Relevant Next 16.2.6 local pages/layouts and server/client component guides were read before component changes.

Final mandatory QA: 19 files /298 tests passed; lint 0 errors and the same single existing warning; clean production build; task-owned production server on unused port 43740, health HTTP 200; full browser contract **451/451**. The original 337 checks were retained or replaced with stronger checks, with 114 additional checks. The full command output is reproduced below.

## Per-file changes and complete assertion replacement inventories

The inventories below enumerate every removed or changed test assertion and its replacement. Each retired assertion has a replacement, and unrelated browser assertions remain intact. Existing historical mascot fixture coverage shapes remain as schema/mood compatibility tests; actual-builder current fixtures require zero dust/unpriced buckets. `REPORT-DUST-REMOVAL.md` contains this audit, full QA transcript and risk flags.

Per-file changes:
- `lib/dust-filter.ts`: replace optional wallet-only filter with pure `shouldSuppressHolding({ valueUsd })`; null, non-finite and strictly <$1 values are suppressed across all market holdings. Manual holdings do not pass through this rule.
- `lib/live-data.ts`: classify provider/wholesale price outages using original positive-quantity inventory, then suppress rows before totals, returned holdings and class/overall P&L. T212 account values now sum visible positions plus broker cash. NFT mixed missing floors and wallet mixed missing token prices no longer generate partial status/copy/counts. NFT pagination/metadata and failed/partial inventories remain incomplete. Only displayed explorer hints can affect verification status/copy. Unavailable states always keep null class subtotals even with stale priced data.
- `lib/pnl.ts`: shared predicate guards per-holding derivation and defensively suppresses aggregate inputs before coverage counting; dust/unpriced schema fields remain present and zero.
- `lib/dust-filter.test.ts`: expands 7 tests to 36 tests covering all four classes, strict adjacent numeric boundary, value authority, immutable inputs and invalid numerics.
- `lib/live-data.test.ts`: updates affected expectations and adds direct multi-class boundaries, live zero after suppression, all-unknown native/T212 outages, stale payload outages, manual cash exemption, actual NFT pagination/metadata scenarios, and suppressed-token price-verification regression.
- `lib/pnl.test.ts`: updates joined coverage expectations/absence checks, preserves all ten current-book printed decisions while asserting Base omission, and adds forged-eligibility aggregate regression.

Every replaced/removed test assertion (exact full diff saved as `/tmp/pm-dust-removal-qa/data-test-diff.patch`):
1. dust-filter original unpriced-token/on=true, token $0.99/on=true, token $1/on=true, native $0.24/on=true assertions become unconditional matrix assertions for native/token/T212/NFT; $1 remains visible.
2. dust-filter original native null/on=true expected visible is inverted to suppressed for native and all market types.
3. dust-filter original unpriced-token/on=false and sub-dollar-native/on=false expected visible are replaced by unconditional suppression assertions, reflecting deletion of optional control.
4. live-data native arithmetic original sum 0.24980279787309149 ETH / $499.60559574618298 / THB17985.80144686259 becomes displayed sum 0.24970377340424574 ETH / $499.4075468084915 / THB17978.67168510569. Exact chain list [1,42161,4663] proves Base absent; existing Arbitrum raw quantity/value assertions remain.
5. live-data visible CAT object with priced=false/valueUsd=null/valueThb=null is inverted to CAT undefined, tokens length1, walletTokens live and coverage dust/unpriced0. Combined wallet values update from $501.081064746183 / THB18038.91833086259 to $500.8830158084915 / THB18031.78856910569, and grand THB53138.22713086259 becomes THB53131.09736910569. All sum assertions remain.
6. live-data summary-authoritative T212 THB4500 assertion is replaced by cash+visible-position equality `40*45+900+72+240`, plus account total and investments-only account totals; all row-currency conversion assertions remain.
7. live-data unavailable ETH feed previously kept NFT ETH subtotal0.1831154; replaced by absent NFT rows, NFT unavailable and null NFT ETH subtotal; all original null USD/THB/grand assertions remain.
8. live-data mixed NFT scenarios (live/partial input): original six rows/seven NFTs becomes five rows/six NFTs. Original always-partial expectation becomes unchanged input status (live for price-only omission, partial for explicitly incomplete input). Original unpriced1/sourcesComplete=false coverage becomes totalHoldings5/dust0/unpriced0/sourcesComplete=(input live). Visible null-valued wasteland-art object is inverted to undefined. All exact subtotal/grand arithmetic assertions remain.
9. live-data wholly unpriced NFT inventory originally expected six rows with every eligibility unpriced; now zero rows and totalHoldings0/dust0/unpriced0/partial/incomplete coverage. Original unavailable status and all five null subtotal/grand assertions remain.
10. live-data empty partial NFT inventory originally upgraded to unavailable; replacement preserves partial unknown-inventory status with same null ETH subtotal. Positive wholly unpriced inventory still separately asserts unavailable.
11. getJoinedPortfolio OpenSea scenarios: one-stats-401 partial becomes live; row counts are 6 all-priced, 5 one-floor-failure, 0 no-floors/wallet-failure instead of6 whenever wallet succeeds; original one-null-row expectation becomes zero null rows plus absent failed collection. Actual six stats calls remain asserted for all non-wallet-failure scenarios, all original priced-sum and outage-null assertions remain.
12. getJoinedPortfolio mixed native/token fetch: walletTokens partial becomes live; native length4 becomes3 with explicit [1,42161,4663]; token length2 becomes1; visible CAT raw-balance/unpriced object becomes CAT undefined and no unpriced/excluded source-message text. Native subtotal updates as item4. Original USDG exact raw quantity, conversion, pricing, RPC counts4/13, no-store and pricing request-count assertions remain.
13. getJoinedPortfolio CoinGecko429 GME priceUsd null assertion becomes GME row undefined plus walletTokens live; all request-count/platform/prioritization assertions remain.
14. pnl joined-evidence coverage totalHoldings5/dust1/unpriced1 becomes totalHoldings3/dust0/unpriced0 with the same eligible2/notRecorded1/unreconciled0/partial assertions. Added exact remaining symbols and no dust/unpriced row eligibility. Existing exact P&L identity, class totals and broker-cash assertion remain.
15. pnl current-book table native-row iteration now checks original native inventory against joined rows and explicitly asserts Base absent, retaining the original 10-decision table length and every other acquisition-evidence/P&L assertion. The printed Base decision is N/A/not displayed. Pure legacy dust/unpriced classification probes remain tested for schema/evidence compatibility; these are never rendered UI rows.

Targeted QA:
`npx vitest run lib/dust-filter.test.ts lib/live-data.test.ts lib/pnl.test.ts`
Test Files 3 passed (3)
Tests 112 passed (112)

`npx eslint lib/dust-filter.ts lib/live-data.ts lib/pnl.ts lib/dust-filter.test.ts lib/live-data.test.ts lib/pnl.test.ts`
Exit 0, no warnings/errors.


## UI, CSS, and presentation helper changes

- `app/home-wallet-panel.tsx`: Removed client directive, React state, filter import/calls, toggle/accessible label, hidden note, threshold-specific empty row and token price-state tag. Renders supplied displayed rows, retains native-first order and wallet attributes, source badges/availability notes and `Total wallet (priced)` footer. Header counts derive from rendered arrays. Empty heading is exactly `No wallet holdings to display in this snapshot.`; removed the previous empty-wallet claim. Removed obsolete `walletSourcesUnavailable` prop.
- `app/asset-list/wallet-asset-registry.tsx`: Same state/control/note/tag removal and direct array rendering. Retains table row/attribute/total contracts and source badges. Uses the exact neutral wallet empty heading. Removed subtitle's hidden-assets/full-set-total explanation and obsolete outage prop.
- `app/home.css`: Deleted filter, checkbox, hidden-count, threshold-empty-row and unpriced-tag rules.
- `app/asset-list/asset-list.css`: Deleted registry filter, checkbox, hidden-count and unpriced-tag rules. No standalone threshold-empty-row CSS existed here.
- `app/page.tsx`: Removed dust/unpriced coverage bucket entries, removed allocation copy explaining unpriced holdings, and stopped passing obsolete outage prop. Existing hero wallet count uses displayed arrays from joined data.
- `app/asset-list/page.tsx`: Counts positions, NFT collections/NFT units and wallet rows from displayed arrays, including numeric zero for an unavailable class that renders zero rows. Badges, null values and NFT unavailable view preserve outage status. Removed stale comment directing unpriceable NFT rows to stay visible and obsolete wallet outage prop.
- `app/pnl-asset-table.tsx`: Removed value-cell dust/unpriced sublabels and their explanatory panel copy. Legacy suppressed eligibility labels have no element. Preserved basis provenance, recorded/unknown/free/unreconciled behavior, wallet attributes/order, per-holding Day and manual cash contracts.
- `lib/pnl-view.ts`: Legacy `dust`/`unpriced` eligibility values return `null`; other eligibility descriptions unchanged. Clarified allocation comments: the joined account value contains displayed positions and cash. Allocation calculations continue to use those joined totals.
- `lib/pnl-ui.test.ts`: Kept all eight tests, inverted suppressed-row checks and counts to the new contract, and tested missing native pricing through the joined boundary.
- `lib/pnl-view.test.ts`: Kept all sixteen previous tests, inverted two retired eligibility label expectations to null, and added a seventeenth test proving exact-$1 securities stay allocated and sub-$1 securities cannot leak through account totals.

## Every changed or removed UI test assertion and replacement

No test case was deleted. Unaffected assertions remain.

`lib/pnl-ui.test.ts`:

1. Mixed-floor NFT row count `6` -> `5`.
2. Visible `wasteland-art` row lookup -> assert its name absent from all markup.
3. That row's `data-pnl-eligibility="unpriced"` -> assert no dust/unpriced eligibility attribute anywhere.
4. That row's value cell `— — Unpriced` -> whole-row absence plus no rendered dust/unpriced text.
5. That row's basis cell `— — basis not recorded` -> whole-row absence; separate existing known-value/unknown-basis test keeps its exact basis-dash assertions.
6. That row's P&L cell `— — · — Excluded from P&L totals` -> whole-row absence; separate existing known-value/unknown-basis test keeps its exact P&L-dash assertions.
7. That row's prohibition on `$0`, `฿0`, or Dust -> whole-row absence and global prohibition on dust/unpriced text; genuine priced NFT value checks remain. Added `totalHoldings: 5, dust: 0, unpriced: 0` and NFT source `live` assertions.
8. Mixed fixture total row count `9` -> `6`.
9. Each of `NATIVE-DUST`, `UNPRICED`, `TOKEN-DUST` appearing exactly once -> each name absent from markup. Each of the six remaining holdings is still asserted exactly once. Added no dust/unpriced text assertion.
10. Footer `3 of 9 holdings` -> `3 of 6 holdings`; all exact P&L/basis money checks retained.
11. Wallet row count `6` -> `3`.
12. Wallet kind sequence `[native, native, token, token, token, token]` -> `[native, token, token]`.
13. Wallet price-state sequence `[true, false, true, true, true, false]` -> `[true, true, true]`, plus no `data-wallet-priced="false"` in a separate missing-native-quote fixture.
14. Native missing-value cell `— — Unpriced` -> no native row/name/attribute when the input ETH quote is unavailable, with native source still `unavailable` and its USD subtotal null. Two priced token rows remain, and recorded P&L stays 60.
15. Token unknown-value cell `— — Unpriced` -> UNPRICED symbol absent.
16. TOKEN-DUST value cell containing its two-cent value and threshold label -> TOKEN-DUST symbol absent.
17. NATIVE-DUST value cell containing its known small value -> NATIVE-DUST symbol absent; retained native row now has its exact known value checked.
18. TOKEN-DUST P&L exclusion copy -> whole TOKEN-DUST row absent. Unreconciled and not-recorded rows keep their existing exclusion-copy checks.
19. Added all displayed wallet value cells having known USD, global no dust/unpriced text, and current coverage `totalHoldings: 6, dust: 0, unpriced: 0` assertions.

Fixture changes: the mixed NFT input source is now `live(oneUnpricedNft)`, matching the changed provider contract in which missing individual floors do not set source partial. Missing floor data is retained. The old post-join mutation that forged an unknown native row was replaced with a real unavailable ETH-price input; filtering is checked at the actual joined data boundary. Presentation fixture aggregates use actual source completeness instead of hardcoded true.

`lib/pnl-view.test.ts`:

20. `eligibilityLabel("dust")` containing `excluded from P&L` -> null.
21. `eligibilityLabel("unpriced")` containing `excluded from P&L` -> null.
22. Added exact-$1 security visibility and allocation `[1, 100, 0, 0, 0]`, its THB mirror, sum matching grand total and shares summing to 100. The half-dollar security is absent. All other formatter/coverage/history/currency tests remain.

## Targeted QA

Initial targeted run had one expected migration mismatch (the synthetic NFT input explicitly supplied its old price-only `partial` state). The fixture was updated to the new provider contract; the missing floor itself and absence assertion were retained.

Command: `npx vitest run lib/pnl-ui.test.ts lib/pnl-view.test.ts`

```text
npm notice run portmanager@0.1.0 npx
npm notice run 'vitest' run lib/pnl-ui.test.ts lib/pnl-view.test.ts

 RUN  v4.1.10 /home/user/projects/portmanager


 Test Files  2 passed (2)
      Tests  25 passed (25)
   Start at  06:09:25
   Duration  239ms (transform 140ms, setup 0ms, import 230ms, tests 58ms, environment 0ms)
```

Bounded review of `lib/live-data.ts`, `lib/dust-filter.ts`, and `lib/pnl.ts`: no additional implementation defect found. Raw inventory is inspected before filtering to preserve wholesale quote failures, displayed arrays precede all totals/aggregation, the provider still marks inventory truncation/ignored metadata partial, and manual cash never goes through the market-holding predicate. The previous intentional combined-wallet known positive subtotal behavior remains when one class is unavailable; unavailable class source and subtotal plus recorder gate remain intact.

## Independent browser harness review

Reviewed the `scripts/ui-contract-check.mjs` diff after UI completion. No unrelated checks were removed or weakened: existing wallet titles, exact table headings, two source badges, total label, overflow, native/token order, row attributes, P&L basis/provenance/free/unreconciled checks, history/calendar interactions, mutation restrictions and console checks are retained or strengthened. Retired toggles, hidden notes and unknown/dust cell expectations receive explicit absence/count/known-value/sum replacements. Real joined-builder fixtures add independent four-class threshold, cash exemption, class allocation/coverage, inventory partial and wholesale-outage checks. Suggested retaining an explicit before/after footer comparison in the static H3/registry checks to match the old total-stability assertion wording; the harness owner was notified.


## Integration, history and mascot assertions

| File | Previous assertion / fixture | Replacement or retained coverage |
|---|---|---|
| `lib/pnl-correctness-pages.test.ts` | Both mixed/all-missing pricing retained six NFT rows, seven tokens, every slug, and an unknown-value dash row. | Mixed pricing now requires five rows/six tokens, all five known slugs, absence of missing slug anywhere in HTML, no unknown row values, and live NFT status. All-missing pricing requires zero rows/counts, every slug absent, unavailable state/null subtotal, and Home unavailable hero. |
| `lib/pnl-correctness-pages.test.ts` | Failed NFT call registry count displayed `— COLLECTIONS · — TOKENS`. | Count is `0 COLLECTIONS · 0 TOKENS` to match rendered rows; all existing failed-source copy/absence-of-empty-inventory assertions remain, plus null subtotal and unavailable hero. |
| `lib/pnl-correctness-pages.test.ts` | Mixed-floor Home showed `Partial joined value` and inventory-omission allocation explanation. | Joined snapshot required, prior partial value and omission explanation explicitly absent, no rendered dust/unpriced/threshold trace; previous-THB denominator and prior forbidden-copy assertions retained. |
| `lib/pnl-correctness-pages.test.ts` | Mixed-floor Portfolio showed partial live label, incomplete source note and partial header class. | All three assertions inverted to absence for price-only omission; all three retained positively in a new genuinely incomplete NFT inventory case. |
| `lib/pnl-history.test.ts` | Mixed individual missing prices set NFT/token sources partial, counted two unpriced + one dust, and serialized null inventory entries. | Live price-mixed sources; zero dust/unpriced buckets; displayed-only six-row count identity; suppressed identities explicitly absent; all values >= $1; new row parses back through the unchanged snapshot reader. Basis-not-recorded partial coverage retained. |
| `lib/pnl-history.test.ts` | Audit A5 fixture supplied summary investments but no corresponding position. | Added matching Comcast position so authoritative `2916.65` total, null tokens, wallet `200`, recorder skip and no-DB assertions remain unchanged with displayed-row totals. Nine-source recorder gate parameterization untouched. |
| `lib/adjusted-day-change.test.ts` | Compact-map fixture supplied summary investments but no position; expected only manual map entry. | Added matching Comcast holding; map now explicitly includes both displayed holdings. Existing currency, cash allocation, 100% share, recorder column and map round-trip assertions retained. Legacy partial snapshot compatibility remains tested. |
| `lib/adjusted-day-change.test.ts` | No tests removed. | Added actual-builder unknown / $0.999 / $1 token map cases, small manual exemption, exact totals and unchanged-basket comparison below threshold; crossing $1 requires existing changed-holdings day-change refusal. |
| `lib/capital-ui.test.ts` | No previous test or assertion removed. | Added four builder-to-render cases for manual cash $0/$0.25/$1/unknown conversion; every market row absent, manual row/value retained, no controls and zero market coverage. |
| `lib/holding-values.ts`, `lib/pnl-history.ts` | Stale comments described storing current suppressed inventory. | Comments now describe legacy/manual null values and incomplete-inventory eligibility; no reader schema or recorder gate code changed. |
| `lib/mascot.test.ts` | Current joined airdrop fixture expected a small native row to cause dust=1/partial coverage and happy mood. | Native row explicitly absent; totalHoldings=1/dust=0/unpriced=0/complete and excited mood. The happy assertion is retained against an explicit legacy partial-coverage snapshot. Existing airdrop basis/P&L/null-percentage and empty-native excited assertions remain. No mascot production code changed. |


# Browser harness changes and assertion replacement inventory

Files: `scripts/ui-contract-check.mjs` adds shared negative DOM/value/order/footer checks on all six routes at both widths, replaces only obsolete dust-control assertions, and adds real-builder fixtures on Home/Asset List; `scripts/ui-fixture-entry.tsx` prefilters the existing direct component fixtures through the shared pure predicate and routes new scenarios to real pages; `scripts/ui-fixture-server.mjs` supplies those real pages through the actual builder with synthetic inputs; `scripts/__fixtures__/dust-book.ts` adds independent .999/$1/unknown values for all four market classes, manual .25/0 pots, complete acquisition evidence, all-small inventory, wholesale outage, failed fetches, and incomplete NFT inventory.

All other existing browser checks remain, including table columns, source badges, titles, read-only/authentication controls, responsive layouts, history/chart/calendar, and the entire mascot suite. H4 is relabelled from wallet/history toggle paths to wallet/history paths; its zero-console-errors assertion is identical. Existing legacy mascot fixture coverage shapes remain unchanged to retain old-schema/mood regression coverage; new actual-builder fixtures require live dust/unpriced buckets to be zero.

Every removed or changed original `requireCondition` statement is enumerated below by its baseline line. Grouped replacement descriptions intentionally repeat where multiple old toggle-path assertions are replaced by the same stronger permanent contract.

1. Baseline `scripts/ui-contract-check.mjs:220`: `requireCondition(["eligible", "not-recorded", "dust", "unpriced", "unreconciled"].includes(row.eligibility), ˋinvalid pnlEligibility ${row.eligibility}ˋ);`
   Replacement: Per-asset P&L now permits only eligible/not-recorded/unreconciled; current USD must be known and ≥1. Global row/text/aria/title/comment absence assertions reject both removed eligibility categories. All other basis/P&L assertions retained.

2. Baseline `scripts/ui-contract-check.mjs:240`: `requireCondition(row.value.includes("—"), "unpriced current value is not —");`
   Replacement: Per-asset P&L now permits only eligible/not-recorded/unreconciled; current USD must be known and ≥1. Global row/text/aria/title/comment absence assertions reject both removed eligibility categories. All other basis/P&L assertions retained.

3. Baseline `scripts/ui-contract-check.mjs:241`: `requireCondition(!/(?:\$|฿|USD\s*|THB\s*)[+-]?\d/.test(row.value), "unpriced row invents a current value");`
   Replacement: Per-asset P&L now permits only eligible/not-recorded/unreconciled; current USD must be known and ≥1. Global row/text/aria/title/comment absence assertions reject both removed eligibility categories. All other basis/P&L assertions retained.

4. Baseline `scripts/ui-contract-check.mjs:424`: `requireCondition(await filter.count() === 1, "expected exactly one home wallet filter");`
   Replacement: H1 + assertNoSuppressionTrace: no control, retired selector, visible trace, accessible/tooltip trace, DOM comment, or suppressed eligibility row exists on any route.

5. Baseline `scripts/ui-contract-check.mjs:425`: `requireCondition(await filter.isVisible(), "home wallet filter is not visible");`
   Replacement: H1 + assertNoSuppressionTrace: no control, retired selector, visible trace, accessible/tooltip trace, DOM comment, or suppressed eligibility row exists on any route.

6. Baseline `scripts/ui-contract-check.mjs:426`: `requireCondition(compactText((await filter.textContent()) ?? "") === "Hide under $1", "home wallet filter label changed");`
   Replacement: H1 + assertNoSuppressionTrace: no control, retired selector, visible trace, accessible/tooltip trace, DOM comment, or suppressed eligibility row exists on any route.

7. Baseline `scripts/ui-contract-check.mjs:429`: `requireCondition(await toggle.count() === 1, "accessible home wallet filter checkbox is missing or duplicated");`
   Replacement: H1 + assertNoSuppressionTrace: no control, retired selector, visible trace, accessible/tooltip trace, DOM comment, or suppressed eligibility row exists on any route.

8. Baseline `scripts/ui-contract-check.mjs:430`: `requireCondition(await toggle.isChecked(), "home wallet filter is not checked by default");`
   Replacement: H1 + assertNoSuppressionTrace: no control, retired selector, visible trace, accessible/tooltip trace, DOM comment, or suppressed eligibility row exists on any route.

9. Baseline `scripts/ui-contract-check.mjs:439`: `requireCondition(fullCount === summaryCount, ˋpanel has ${fullCount} total rows but wallet summary reports ${summaryCount}ˋ);`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

10. Baseline `scripts/ui-contract-check.mjs:442`: `requireCondition(fullCount === 0, ˋwallet table is absent despite ${fullCount} total rowsˋ);`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

11. Baseline `scripts/ui-contract-check.mjs:443`: `requireCondition(await panel.locator(".home-empty").count() === 1, "wallet table has no explicit empty/unavailable state");`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

12. Baseline `scripts/ui-contract-check.mjs:456`: `requireCondition(headerCounts.native === visibleNativeCount, ˋheader shows ${headerCounts.native} native, found ${visibleNativeCount}ˋ);`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

13. Baseline `scripts/ui-contract-check.mjs:457`: `requireCondition(headerCounts.token === visibleTokenCount, ˋheader shows ${headerCounts.token} tokens, found ${visibleTokenCount}ˋ);`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

14. Baseline `scripts/ui-contract-check.mjs:459`: `requireCondition( await panel.locator('tr[data-wallet-kind="token"][data-wallet-priced="false"]').count() === 0, "an unpriced token is visible while the filter is on", );`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

15. Baseline `scripts/ui-contract-check.mjs:465`: `requireCondition(row.kind === "native" || row.kind === "token", ˋunexpected wallet row kind ${row.kind ?? "missing"}ˋ);`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

16. Baseline `scripts/ui-contract-check.mjs:466`: `if (row.kind === "token") requireCondition(row.priced === "true", "visible token is not marked priced");`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

17. Baseline `scripts/ui-contract-check.mjs:468`: `if (valueUsd !== null) requireCondition(valueUsd >= 1, ˋvisible ${row.kind} row is worth ${row.valueUsd}ˋ);`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

18. Baseline `scripts/ui-contract-check.mjs:472`: `requireCondition(hiddenCount >= 0, ˋvisible row count ${rowContracts.length} exceeds full count ${fullCount}ˋ);`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

19. Baseline `scripts/ui-contract-check.mjs:475`: `requireCondition(await hiddenNote.count() === 1, "hidden-under-$1 note is missing");`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

20. Baseline `scripts/ui-contract-check.mjs:476`: `requireCondition( compactText((await hiddenNote.textContent()) ?? "") === ˋ(${hiddenCount} hidden under $1)ˋ, "hidden-under-$1 note count is incorrect", );`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

21. Baseline `scripts/ui-contract-check.mjs:481`: `requireCondition(await hiddenNote.count() === 0, "hidden-under-$1 note is rendered with no hidden rows");`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

22. Baseline `scripts/ui-contract-check.mjs:486`: `requireCondition(await filteredEmptyCell.count() === 1, "all-hidden wallet explanation is missing or duplicated");`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

23. Baseline `scripts/ui-contract-check.mjs:487`: `requireCondition( compactText((await filteredEmptyCell.textContent()) ?? "") === ˋAll ${fullCount} wallet assets are hidden under $1 — uncheck "Hide under $1" to show themˋ, "all-hidden wallet explanation changed", );`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

24. Baseline `scripts/ui-contract-check.mjs:493`: `requireCondition(await filteredEmptyCell.count() === 0, "all-hidden wallet explanation is rendered with visible rows");`
   Replacement: H2 + assertWalletRows: native/token data counts = visible headers = DOM rows = hero; all current USD known and ≥1; both native and token priced=true; zero rows require exact neutral empty heading and no table. H1 forbids notes/threshold-empty elements.

25. Baseline `scripts/ui-contract-check.mjs:506`: `requireCondition(fullCount === summaryCount, ˋpanel has ${fullCount} total rows but wallet summary reports ${summaryCount}ˋ);`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

26. Baseline `scripts/ui-contract-check.mjs:509`: `requireCondition(fullCount === 0, ˋwallet table is absent despite ${fullCount} total rowsˋ);`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

27. Baseline `scripts/ui-contract-check.mjs:511`: `requireCondition(!(await toggle.isChecked()), "home wallet filter stayed checked");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

28. Baseline `scripts/ui-contract-check.mjs:512`: `requireCondition(await panel.locator(".home-empty").count() === 1, "empty wallet state disappeared after toggling");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

29. Baseline `scripts/ui-contract-check.mjs:513`: `requireCondition( await panel.locator(".home-wallet-hidden-count").count() === 0, "hidden-under-$1 note appeared for an empty wallet after toggling off", );`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

30. Baseline `scripts/ui-contract-check.mjs:518`: `requireCondition(await toggle.isChecked(), "empty wallet filter did not return to its default state");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

31. Baseline `scripts/ui-contract-check.mjs:519`: `requireCondition(await panel.locator(".home-empty").count() === 1, "empty wallet state disappeared after restoring the filter");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

32. Baseline `scripts/ui-contract-check.mjs:528`: `requireCondition(/Total wallet \(priced\)/i.test(totalBefore), "priced wallet total is missing before toggling");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

33. Baseline `scripts/ui-contract-check.mjs:536`: `requireCondition(!(await toggle.isChecked()), "home wallet filter stayed checked");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

34. Baseline `scripts/ui-contract-check.mjs:543`: `requireCondition(rowContracts.length === fullCount, ˋtoggle restored ${rowContracts.length}/${fullCount} wallet rowsˋ);`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

35. Baseline `scripts/ui-contract-check.mjs:544`: `requireCondition( hiddenBefore > 0 ? rowContracts.length > defaultVisibleCount : rowContracts.length === defaultVisibleCount, hiddenBefore > 0 ? "toggle did not add the hidden rows" : "toggle changed a full default row set", );`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

36. Baseline `scripts/ui-contract-check.mjs:551`: `requireCondition(restoredNativeCount === fullCounts.native, ˋrestored ${restoredNativeCount}/${fullCounts.native} native rowsˋ);`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

37. Baseline `scripts/ui-contract-check.mjs:552`: `requireCondition(restoredTokenCount === fullCounts.token, ˋrestored ${restoredTokenCount}/${fullCounts.token} token rowsˋ);`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

38. Baseline `scripts/ui-contract-check.mjs:553`: `requireCondition( rowContracts.filter((row) => row.kind === "native" && row.priced === "false").length === defaultUnpricedNativeCount, "native holdings with unavailable prices were hidden by the default filter", );`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

39. Baseline `scripts/ui-contract-check.mjs:558`: `requireCondition(headerCounts.native === restoredNativeCount, "restored native header count is incorrect");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

40. Baseline `scripts/ui-contract-check.mjs:559`: `requireCondition(headerCounts.token === restoredTokenCount, "restored token header count is incorrect");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

41. Baseline `scripts/ui-contract-check.mjs:564`: `requireCondition(row.kind === "native" || row.kind === "token", "restored row has invalid data-wallet-kind");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

42. Baseline `scripts/ui-contract-check.mjs:565`: `requireCondition(row.priced === "true" || row.priced === "false", "restored row has invalid data-wallet-priced");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

43. Baseline `scripts/ui-contract-check.mjs:567`: `if (row.kind === "native") requireCondition(!tokenSeen, "native row appears after a token row");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

44. Baseline `scripts/ui-contract-check.mjs:570`: `requireCondition(row.cells[index] === "—", ˋunpriced native cell ${index + 1} is not —ˋ);`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

45. Baseline `scripts/ui-contract-check.mjs:575`: `requireCondition(/UNPRICED/i.test(row.cells[1] ?? ""), "unpriced token tag is missing");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

46. Baseline `scripts/ui-contract-check.mjs:577`: `requireCondition(row.cells[index] === "—", ˋunpriced token cell ${index + 1} is not —ˋ);`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

47. Baseline `scripts/ui-contract-check.mjs:581`: `requireCondition(!unpricedSeen, "priced token appears after an unpriced token");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

48. Baseline `scripts/ui-contract-check.mjs:585`: `requireCondition(await panel.locator(".home-wallet-hidden-count").count() === 0, "hidden-under-$1 note remained after toggling off");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

49. Baseline `scripts/ui-contract-check.mjs:586`: `requireCondition(await table.locator(".home-wallet-filtered-empty").count() === 0, "all-hidden explanation remained after toggling off");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

50. Baseline `scripts/ui-contract-check.mjs:588`: `requireCondition(totalAfter === totalBefore, "priced wallet total changed after toggling");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

51. Baseline `scripts/ui-contract-check.mjs:590`: `requireCondition(overflow <= 1, ˋunfiltered wallet creates ${overflow}px of horizontal body overflowˋ);`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

52. Baseline `scripts/ui-contract-check.mjs:592`: `requireCondition(await toggle.isChecked(), "wallet filter did not return to its default state");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

53. Baseline `scripts/ui-contract-check.mjs:599`: `requireCondition(JSON.stringify(filteredAgain) === JSON.stringify(defaultVisibleRows), "restoring the filter changed its original row set");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

54. Baseline `scripts/ui-contract-check.mjs:600`: `requireCondition(compactText((await table.locator(".table-total-row").textContent()) ?? "") === totalBefore, "priced wallet total changed after restoring the filter");`
   Replacement: H3 + assertWalletTotals + assertWalletRows: native-before-token/price attributes retained, every row priced with value≥1, displayed USD/THB sum equals footer, rows/footer stable before/after audit, no trace and ≤1px overflow. Known $1 and raw .999 fixtures pin removed-toggle behavior independently.

55. Baseline `scripts/ui-contract-check.mjs:615`: `requireCondition(row.kind === "native" || row.kind === "token", "wallet row has invalid data-wallet-kind");`
   Replacement: Home ordering check retains native-before-token and now requires every native/token priced=true, known price and current value≥1; no unknown rows/chips can render.

56. Baseline `scripts/ui-contract-check.mjs:616`: `requireCondition(row.priced === "true" || row.priced === "false", "wallet row has invalid data-wallet-priced");`
   Replacement: Home ordering check retains native-before-token and now requires every native/token priced=true, known price and current value≥1; no unknown rows/chips can render.

57. Baseline `scripts/ui-contract-check.mjs:618`: `if (row.kind === "native") requireCondition(!tokenSeen, "native row appears after a token row");`
   Replacement: Home ordering check retains native-before-token and now requires every native/token priced=true, known price and current value≥1; no unknown rows/chips can render.

58. Baseline `scripts/ui-contract-check.mjs:621`: `requireCondition(/UNPRICED/i.test(row.cells[1] ?? ""), "unpriced token tag is missing");`
   Replacement: Home ordering check retains native-before-token and now requires every native/token priced=true, known price and current value≥1; no unknown rows/chips can render.

59. Baseline `scripts/ui-contract-check.mjs:623`: `requireCondition(row.cells[index] === "—", ˋunpriced token cell ${index + 1} is not —ˋ);`
   Replacement: Home ordering check retains native-before-token and now requires every native/token priced=true, known price and current value≥1; no unknown rows/chips can render.

60. Baseline `scripts/ui-contract-check.mjs:627`: `requireCondition(!unpricedSeen, "priced token appears after an unpriced token");`
   Replacement: Home ordering check retains native-before-token and now requires every native/token priced=true, known price and current value≥1; no unknown rows/chips can render.

61. Baseline `scripts/ui-contract-check.mjs:660`: `requireCondition(await toggle.count() === 1 && await toggle.isChecked(), "registry filter is missing or not checked by default");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

62. Baseline `scripts/ui-contract-check.mjs:667`: `requireCondition(!hiddenText || hiddenMatch, "registry hidden-row count is malformed");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

63. Baseline `scripts/ui-contract-check.mjs:671`: `requireCondition(parseGroupedCount(match[1], "registry wallet count") === fullCount, "registry filter counts differ from the full summary");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

64. Baseline `scripts/ui-contract-check.mjs:673`: `requireCondition(/—\s+wallet assets?\b/i.test(summary), "registry summary omits its unavailable wallet count");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

65. Baseline `scripts/ui-contract-check.mjs:674`: `requireCondition(await panel.locator(".asset-source-badge.is-unavailable").count() > 0, "registry summary is unavailable despite complete wallet sources");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

66. Baseline `scripts/ui-contract-check.mjs:676`: `requireCondition(compactText((await panel.locator(".asset-wallet-count .panel-count").textContent()) ?? "") === ˋ${defaultRows.length} ASSETSˋ, "registry visible count differs from its rows");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

67. Baseline `scripts/ui-contract-check.mjs:677`: `requireCondition(hiddenCount > 0 ? compactText((await hiddenNote.textContent()) ?? "") === ˋ(${hiddenCount} hidden under $1)ˋ : await hiddenNote.count() === 0, "registry hidden-row count is incorrect");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

68. Baseline `scripts/ui-contract-check.mjs:685`: `requireCondition(row.kind !== "token" || row.priced === "true", "default registry displays an unpriced token");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

69. Baseline `scripts/ui-contract-check.mjs:687`: `requireCondition(value === null || value >= 1, "default registry displays an under-$1 holding");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

70. Baseline `scripts/ui-contract-check.mjs:691`: `requireCondition(fullCount === 0, "registry table is absent despite joined holdings");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

71. Baseline `scripts/ui-contract-check.mjs:693`: `requireCondition(await panel.locator(".asset-empty-state").count() === 1, "empty registry state disappeared after toggling off");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

72. Baseline `scripts/ui-contract-check.mjs:695`: `requireCondition(await panel.locator(".asset-empty-state").count() === 1, "empty registry state disappeared after restoring the filter");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

73. Baseline `scripts/ui-contract-check.mjs:699`: `requireCondition(await panel.locator(".asset-wallet-filtered-empty").count() === 1, "all-hidden registry has no explicit explanation");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

74. Baseline `scripts/ui-contract-check.mjs:711`: `requireCondition(["native", "token"].includes(row.kind) && ["true", "false"].includes(row.priced), "registry wallet attributes are invalid");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

75. Baseline `scripts/ui-contract-check.mjs:713`: `if (row.kind === "native") requireCondition(!tokenSeen, "restored registry native appears after a token");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

76. Baseline `scripts/ui-contract-check.mjs:715`: `for (const index of [4, 5, 6]) requireCondition(row.cells[index] === "—", "restored unpriced registry cell is not —");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

77. Baseline `scripts/ui-contract-check.mjs:719`: `requireCondition(/UNPRICED/i.test(row.cells[2]), "restored unpriced token tag is missing");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

78. Baseline `scripts/ui-contract-check.mjs:721`: `if (row.kind === "token" && row.priced === "true") requireCondition(!unpricedTokenSeen, "restored priced token follows an unpriced token");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

79. Baseline `scripts/ui-contract-check.mjs:723`: `requireCondition(fullRows.filter((row) => row.kind === "native" && row.priced === "false").length === defaultValues.filter((row) => row.kind === "native" && row.priced === "false").length, "registry filter hid a native holding with unavailable price");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

80. Baseline `scripts/ui-contract-check.mjs:725`: `requireCondition(await hiddenNote.count() === 0 && await panel.locator(".asset-wallet-filtered-empty").count() === 0, "registry hidden-state labels remained after toggling off");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

81. Baseline `scripts/ui-contract-check.mjs:726`: `requireCondition(compactText((await table.locator("tfoot").textContent()) ?? "") === totals, "registry filter changed full-set totals");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

82. Baseline `scripts/ui-contract-check.mjs:729`: `requireCondition(JSON.stringify(await panel.locator("tr[data-wallet-kind]").allTextContents()) === JSON.stringify(defaultRows), "restoring registry filter changed the default row set");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

83. Baseline `scripts/ui-contract-check.mjs:730`: `requireCondition(compactText((await table.locator("tfoot").textContent()) ?? "") === totals, "restoring registry filter changed totals");`
   Replacement: Registry count/totals check + helpers: no controls or traces; DOM rows = visible numeric header = registry summary; known value≥1 and native-before-token; displayed sums equal footer; row and footer stability; exact neutral zero-row heading with no table.

84. Baseline `scripts/ui-contract-check.mjs:745`: `requireCondition(row.kind === "native" || row.kind === "token", "registry row has invalid data-wallet-kind");`
   Replacement: Registry ordering check retains native-before-token and strengthens priced attribute to true for every native/token; known current value≥1 and price required; unknown rows and labels forbidden.

85. Baseline `scripts/ui-contract-check.mjs:746`: `requireCondition(row.priced === "true" || row.priced === "false", "registry row has invalid data-wallet-priced");`
   Replacement: Registry ordering check retains native-before-token and strengthens priced attribute to true for every native/token; known current value≥1 and price required; unknown rows and labels forbidden.

86. Baseline `scripts/ui-contract-check.mjs:748`: `if (row.kind === "native") requireCondition(!tokenSeen, "native registry row appears after a token row");`
   Replacement: Registry ordering check retains native-before-token and strengthens priced attribute to true for every native/token; known current value≥1 and price required; unknown rows and labels forbidden.

87. Baseline `scripts/ui-contract-check.mjs:751`: `requireCondition(row.cells[index] === "—", ˋunpriced native registry cell ${index + 1} is not —ˋ);`
   Replacement: Registry ordering check retains native-before-token and strengthens priced attribute to true for every native/token; known current value≥1 and price required; unknown rows and labels forbidden.

88. Baseline `scripts/ui-contract-check.mjs:756`: `requireCondition(/UNPRICED/i.test(row.cells[2] ?? ""), "unpriced registry tag is missing");`
   Replacement: Registry ordering check retains native-before-token and strengthens priced attribute to true for every native/token; known current value≥1 and price required; unknown rows and labels forbidden.

89. Baseline `scripts/ui-contract-check.mjs:758`: `requireCondition(row.cells[index] === "—", ˋunpriced registry cell ${index + 1} is not —ˋ);`
   Replacement: Registry ordering check retains native-before-token and strengthens priced attribute to true for every native/token; known current value≥1 and price required; unknown rows and labels forbidden.

90. Baseline `scripts/ui-contract-check.mjs:762`: `requireCondition(!unpricedSeen, "priced registry token appears after an unpriced token");`
   Replacement: Registry ordering check retains native-before-token and strengthens priced attribute to true for every native/token; known current value≥1 and price required; unknown rows and labels forbidden.

91. Baseline `scripts/ui-contract-check.mjs:1619`: `requireCondition(await toggle.isChecked(), "fixture wallet filter is not default-on");`
   Replacement: Independent component fixture: only NATIVE-ONE,TOKEN-ONE remain; unknown native is absent; raw .999 absent; $1 retained; exact USD2/THB72 footer counts only displayed holdings; header/data counts1+1; no trace; ordered priced rows; rows/footer stable. Actual-builder Home+Registry fixture additionally pins all four market classes and manual exemption.

92. Baseline `scripts/ui-contract-check.mjs:1620`: `requireCondition((await symbols()).join(",") === "NATIVE-ONE,NATIVE-UNPRICED,TOKEN-ONE", "strict raw $1 filter hid $1/unknown native or exposed $0.999/unpriced token");`
   Replacement: Independent component fixture: only NATIVE-ONE,TOKEN-ONE remain; unknown native is absent; raw .999 absent; $1 retained; exact USD2/THB72 footer counts only displayed holdings; header/data counts1+1; no trace; ordered priced rows; rows/footer stable. Actual-builder Home+Registry fixture additionally pins all four market classes and manual exemption.

93. Baseline `scripts/ui-contract-check.mjs:1622`: `requireCondition(total.includes("US$3.01") && total.includes("฿108.32"), "wallet total omitted hidden priced dust");`
   Replacement: Independent component fixture: only NATIVE-ONE,TOKEN-ONE remain; unknown native is absent; raw .999 absent; $1 retained; exact USD2/THB72 footer counts only displayed holdings; header/data counts1+1; no trace; ordered priced rows; rows/footer stable. Actual-builder Home+Registry fixture additionally pins all four market classes and manual exemption.

94. Baseline `scripts/ui-contract-check.mjs:1624`: `requireCondition((await symbols()).join(",") === [...browserFixture.wallet.nativeRows, ...browserFixture.wallet.tokenRows].map((row) => row.symbol).join(","), "wallet did not restore the full ordered fixture row set");`
   Replacement: Independent component fixture: only NATIVE-ONE,TOKEN-ONE remain; unknown native is absent; raw .999 absent; $1 retained; exact USD2/THB72 footer counts only displayed holdings; header/data counts1+1; no trace; ordered priced rows; rows/footer stable. Actual-builder Home+Registry fixture additionally pins all four market classes and manual exemption.

95. Baseline `scripts/ui-contract-check.mjs:1626`: `requireCondition(compactText(await row.locator("td").nth(3).innerText()) === "—" && compactText(await row.locator("td").nth(4).innerText()) === "—", "unpriced fixture quote/value invented a number");`
   Replacement: Independent component fixture: only NATIVE-ONE,TOKEN-ONE remain; unknown native is absent; raw .999 absent; $1 retained; exact USD2/THB72 footer counts only displayed holdings; header/data counts1+1; no trace; ordered priced rows; rows/footer stable. Actual-builder Home+Registry fixture additionally pins all four market classes and manual exemption.

96. Baseline `scripts/ui-contract-check.mjs:1628`: `requireCondition(await wallet.locator("tfoot").innerText() === total, "wallet uncheck changed full totals");`
   Replacement: Independent component fixture: only NATIVE-ONE,TOKEN-ONE remain; unknown native is absent; raw .999 absent; $1 retained; exact USD2/THB72 footer counts only displayed holdings; header/data counts1+1; no trace; ordered priced rows; rows/footer stable. Actual-builder Home+Registry fixture additionally pins all four market classes and manual exemption.

97. Baseline `scripts/ui-contract-check.mjs:1630`: `requireCondition((await symbols()).join(",") === "NATIVE-ONE,NATIVE-UNPRICED,TOKEN-ONE" && await wallet.locator("tfoot").innerText() === total, "wallet recheck changed default rows or full totals");`
   Replacement: Independent component fixture: only NATIVE-ONE,TOKEN-ONE remain; unknown native is absent; raw .999 absent; $1 retained; exact USD2/THB72 footer counts only displayed holdings; header/data counts1+1; no trace; ordered priced rows; rows/footer stable. Actual-builder Home+Registry fixture additionally pins all four market classes and manual exemption.

98. Baseline `scripts/ui-contract-check.mjs:1666`: `requireCondition((await wallet.locator(".home-wallet-filtered-empty").innerText()).includes("All 3 wallet assets are hidden under $1"), "all-dust fixture empty explanation is missing");`
   Replacement: All-small/unknown component fixture: no rows/table/footer/control; exact neutral empty heading; no threshold/hiding/filter/no-balances claim; native/token data/header counts0; no DOM/accessible trace. Actual-builder empty Home+Registry fixtures require zero market arrays/coverage/totals and all9sources live.

99. Baseline `scripts/ui-contract-check.mjs:1668`: `requireCondition(await wallet.locator("tr[data-wallet-kind]").count() === 3 && await wallet.locator("tfoot").innerText() === total, "all-dust uncheck dropped rows or changed totals");`
   Replacement: All-small/unknown component fixture: no rows/table/footer/control; exact neutral empty heading; no threshold/hiding/filter/no-balances claim; native/token data/header counts0; no DOM/accessible trace. Actual-builder empty Home+Registry fixtures require zero market arrays/coverage/totals and all9sources live.

100. Baseline `scripts/ui-contract-check.mjs:1670`: `requireCondition(await wallet.locator(".home-wallet-filtered-empty").count() === 1 && await wallet.locator("tfoot").innerText() === total, "all-dust recheck lost the filtered state or changed totals");`
   Replacement: All-small/unknown component fixture: no rows/table/footer/control; exact neutral empty heading; no threshold/hiding/filter/no-balances claim; native/token data/header counts0; no DOM/accessible trace. Actual-builder empty Home+Registry fixtures require zero market arrays/coverage/totals and all9sources live.

Inventory total: 100 original assertion statements replaced/strengthened. Conditional dust/unpriced visual distinctions were also inverted to absence while the unreconciled distinction remains unchanged.

Validation during implementation: `node --check scripts/ui-contract-check.mjs`, `node --check scripts/ui-fixture-server.mjs`, scoped ESLint all passed. Isolated fixture browser smoke navigated all ten new scenario/surface combinations without page errors and independently checked the resulting totals, coverage and source states. Root runs/prints the final full mandatory QA.


## Resolved validation findings

The first full post-change test run was 297/298: one actual-builder mascot fixture still expected a suppressed native row to count as dust/partial. Its current-row assertions now require absence and complete coverage; its original happy-mood assertion remains tested against explicit legacy coverage. All 56 mascot tests pass without changing mascot production code. A targeted manual-cash HTML check initially matched the HTML `<small>` tag when checking the synthetic `SMALL` symbol; the symbol check now examines rendered text and separately rejects both suppressed contract identities in all markup.

Fixture smoke checks caught a harness-only bare `$1` pattern matching legitimate retained historical `$1,100` values on an empty Home page. The page assertion now matches threshold phrases, while the wallet empty-state assertion still rejects any `$1`, hidden/filter wording or no-balances claim. A custom smoke launch without the harness's existing SwiftShader arguments produced a GPU warning; the mandatory full run uses the unchanged proper launch arguments and requires a clean console. Final scoped syntax checks and lint passed after these harness changes.

## Mandatory self-QA — verbatim command output

Command banners are separate from captured output. Text below retains the captured stdout/stderr, including the build's carriage-return progress output. The health command prints `200` without a trailing newline. The diff was captured after implementation and before this new report was written, so it lists the 27 implementation/test files; the commit additionally includes this report.

`npm test`

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
| Base ETH 0.000099 | N/A (not displayed) | no-op | Absent from joined holdings and coverage |
| Robinhood Chain ETH 0.000526 | not-recorded | not-recorded | Native balance only; no clean purchase provenance (bridge/deposit is not a basis) |
| USDG 1.475 | not-recorded | not-recorded | Token balance only; no clean acquisition/payment history recorded |
| STACK token (sub-cent) | not-recorded | dust | Operator reports sub-cent value; no basis derivation; exact quantity not supplied |
| GME token (sub-cent) | not-recorded | dust | Operator reports sub-cent value; no basis derivation; exact quantity not supplied |
| 2× Stackers NFT | not-recorded | not-recorded | OpenSea inventory/floor only; acquisition and payment history not recorded |
| 2× G00fyz NFT | not-recorded | not-recorded | OpenSea inventory/floor only; acquisition and payment history not recorded |
Current-book P&L: costBasisUsd=null; pnlUsd=null; pnlPct=null; eligible=0.
CURRENT_BOOK_TABLE_END

 Test Files  19 passed (19)
      Tests  298 passed (298)
   Start at  06:13:00
   Duration  2.58s (transform 1.95s, setup 0ms, import 4.44s, tests 2.56s, environment 9ms)

```

`npm run lint`

```text
npm notice run portmanager@0.1.0 lint
npm notice run eslint

/home/user/projects/portmanager/proxy.ts
  19:10  warning  'b64urlEncode' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)

```

`npm run build`

```text
npm notice run portmanager@0.1.0 build
npm notice run next build
▲ Next.js 16.2.6 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 4.9s
  Running TypeScript ...
  Finished TypeScript in 4.9s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/5) ...
  Generating static pages using 7 workers (1/5) 
  Generating static pages using 7 workers (2/5) 
  Generating static pages using 7 workers (3/5) 
✓ Generating static pages using 7 workers (5/5) in 113ms
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

`npm run start -- --hostname 127.0.0.1 --port 43740`

```text
npm notice run portmanager@0.1.0 start
npm notice run next start --hostname 127.0.0.1 --port 43740
▲ Next.js 16.2.6
- Local:         http://127.0.0.1:43740
- Network:       http://127.0.0.1:43740
✓ Ready in 95ms
```

`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:43740/`

```text
200
```

`UI_BASE_URL=http://127.0.0.1:43740 node scripts/ui-contract-check.mjs`

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
PASS | desktop home has no suppressed market rows or disclosure traces
PASS | desktop home renders no owner/investor names or language
PASS | desktop / uses a POST-only sidebar logout control — POST form · no logout link
PASS | home follows the P&L-center section order
PASS | home P&L summary distinguishes none, partial and complete honestly — P&L state: none
PASS | home per-asset P&L keeps unknown basis null and exclusions explicit — 3 joined rows · 3 basis not recorded
PASS | home performance uses snapshot history or the honest empty state — history starts today · empty period controls disabled
PASS | home allocation remains value-based even when P&L is unavailable
PASS | home calendar displays recorded coverage or an honest empty month — no recorded days; no historical P&L invented
PASS | home retains all seven source statuses and unavailable-source honesty — seven original plus two ledger source statuses retained
PASS | home permits value allocation while banning retired ownership copy
PASS | home renders the USD-primary value hero and P&L metric strip
PASS | home wallet panel exposes both sources and the wallet table contract
PASS | H1 home wallet has no retired filter controls or suppression traces
PASS | H2 home wallet headers and hero count exactly the displayable rows — 2 native + 1 tokens = header and hero counts
PASS | H3 home wallet totals sum displayed rows and remain stable — 3 rows; USD/THB totals match their displayed values
PASS | home wallet rows keep native/token order and exclude unknown current values — 3 priced wallet rows in native/token order
PASS | H4 desktop home wallet/history paths keep the browser console clean
PASS | desktop /asset-list responds successfully — HTTP 200 · /asset-list
PASS | desktop /asset-list mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | desktop /asset-list mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop /asset-list mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | desktop /asset-list uses the light Outfit design
PASS | desktop /asset-list uses the reference card tokens — 16 white cards · 10px radius · reference border/shadow
PASS | desktop /asset-list has no horizontal body overflow — 1440px / 1440px
PASS | desktop /asset-list renders no undefined/null/NaN
PASS | desktop asset-list exposes no mutation forms or controls
PASS | desktop asset-list has no suppressed market rows or disclosure traces
PASS | desktop asset-list renders no owner/investor names or language
PASS | desktop /asset-list uses a POST-only sidebar logout control — POST form · no logout link
PASS | desktop asset-list is labelled live and read-only
PASS | asset-list renders the read-only wallet registry
PASS | asset-list wallet registry has no filter and counts only displayed holdings — 3 displayed rows = registry header and summary; displayed USD/THB totals agree
PASS | asset-list wallet rows keep native/token order and exclude unknown current values — 3 priced wallet rows in native/token order
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
PASS | desktop portfolio has no suppressed market rows or disclosure traces
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
PASS | desktop exchange-rate has no suppressed market rows or disclosure traces
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
PASS | desktop asset-master has no suppressed market rows or disclosure traces
PASS | desktop asset-master renders no owner/investor names or language
PASS | desktop /asset-master uses a POST-only sidebar logout control — POST form · no logout link
PASS | desktop asset-master is labelled live and read-only
PASS | asset-list renders the read-only wallet registry
PASS | asset-list wallet registry has no filter and counts only displayed holdings — 3 displayed rows = registry header and summary; displayed USD/THB totals agree
PASS | asset-list wallet rows keep native/token order and exclude unknown current values — 3 priced wallet rows in native/token order
PASS | desktop /asset-master keeps the browser console clean
PASS | desktop /login responds successfully — HTTP 200 · /login
PASS | desktop /login mascot server HTML defaults visible only after login — absent from login HTML
PASS | desktop /login mascot remains absent after hydration
PASS | desktop /login uses the light Outfit design
PASS | desktop /login uses the reference card tokens — 1 white cards · 10px radius · reference border/shadow
PASS | desktop /login has no horizontal body overflow — 1440px / 1440px
PASS | desktop /login renders no undefined/null/NaN
PASS | desktop login exposes no mutation forms or controls
PASS | desktop login has no suppressed market rows or disclosure traces
PASS | desktop login renders no owner/investor names or language
PASS | desktop login preserves the Google sign-in gate
PASS | desktop /login keeps the browser console clean
PASS | desktop production mascot interaction route loads
PASS | desktop production mascot DOM transient bubble is opaque white without alpha — computed background rgb(255, 255, 255) · opacity 1 through every ancestor · #DFE5F2 border · 10px radius · app body font Outfit, Arial, sans-serif, Arial, sans-serif
PASS | desktop production mascot DOM resting chip has no visible bubble or controls after six seconds — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · settled in 4931ms after initial DOM checks · opaque through fade · no repeat
PASS | desktop production mascot DOM resting occlusion leaves home hero as-of/status metadata visible and hittable — hero as-of/status metadata: 3/3 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | desktop production mascot DOM resting occlusion leaves home class legend visible and hittable — five-class legend labels and USD/THB values: 15/15 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | desktop production mascot DOM WebGL 3D click expands the live viewer; panel stays expanded — 128px panel · aria-expanded=true · visible safe controls · current bubble visible · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video · exact gltf.animations log · bubble/controls/live loop remain beyond the transient deadline
PASS | desktop production mascot DOM second click collapses back to the resting chip — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop production mascot DOM keyboard expands cached 3D viewer; Escape collapses and restores chip focus — Enter and Space expand cached 3D bytes without another GLB request; Escape from Mute guide and Hide guide collapses, aria-expanded=false, focus returns to chip
PASS | desktop production mascot DOM mute hides the bubble, retains the a11y sprite underlay and persists on reload — mute checkbox/aria-pressed/localStorage agree · accessible sprite DOM underlay retained beneath motion surface · reload rests silently · Space/Enter unmute restore current bubble
PASS | desktop production mascot DOM hide removes the companion, survives client navigation and resets on reload — companion absent across all four pages in one document; collapsed chip restored after reload; independent mute preference retained
PASS | desktop production mascot DOM interaction and hydration console stays clean — zero page errors, hydration errors or console errors
PASS | desktop production mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.76s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.34s/7.00s advancing · no canvas · static sprite hidden · 205/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.79s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
PASS | mobile / responds successfully — HTTP 200 · /
PASS | mobile / mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | mobile / mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile / mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile / uses the light Outfit design
PASS | mobile / uses the reference card tokens — 12 white cards · 10px radius · reference border/shadow
PASS | mobile / has no horizontal body overflow — 390px / 390px
PASS | mobile / renders no undefined/null/NaN
PASS | mobile home exposes no mutation forms or controls
PASS | mobile home has no suppressed market rows or disclosure traces
PASS | mobile home renders no owner/investor names or language
PASS | mobile / uses a POST-only sidebar logout control — POST form · no logout link
PASS | home follows the P&L-center section order
PASS | home P&L summary distinguishes none, partial and complete honestly — P&L state: none
PASS | home per-asset P&L keeps unknown basis null and exclusions explicit — 3 joined rows · 3 basis not recorded
PASS | home performance uses snapshot history or the honest empty state — history starts today · empty period controls disabled
PASS | home allocation remains value-based even when P&L is unavailable
PASS | home calendar displays recorded coverage or an honest empty month — no recorded days; no historical P&L invented
PASS | home retains all seven source statuses and unavailable-source honesty — seven original plus two ledger source statuses retained
PASS | home permits value allocation while banning retired ownership copy
PASS | home renders the USD-primary value hero and P&L metric strip
PASS | home wallet panel exposes both sources and the wallet table contract
PASS | H1 home wallet has no retired filter controls or suppression traces
PASS | H2 home wallet headers and hero count exactly the displayable rows — 2 native + 1 tokens = header and hero counts
PASS | H3 home wallet totals sum displayed rows and remain stable — 3 rows; USD/THB totals match their displayed values
PASS | home wallet rows keep native/token order and exclude unknown current values — 3 priced wallet rows in native/token order
PASS | H4 mobile home wallet/history paths keep the browser console clean
PASS | mobile /asset-list responds successfully — HTTP 200 · /asset-list
PASS | mobile /asset-list mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | mobile /asset-list mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile /asset-list mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile /asset-list uses the light Outfit design
PASS | mobile /asset-list uses the reference card tokens — 16 white cards · 10px radius · reference border/shadow
PASS | mobile /asset-list has no horizontal body overflow — 390px / 390px
PASS | mobile /asset-list renders no undefined/null/NaN
PASS | mobile asset-list exposes no mutation forms or controls
PASS | mobile asset-list has no suppressed market rows or disclosure traces
PASS | mobile asset-list renders no owner/investor names or language
PASS | mobile /asset-list uses a POST-only sidebar logout control — POST form · no logout link
PASS | mobile asset-list is labelled live and read-only
PASS | asset-list renders the read-only wallet registry
PASS | asset-list wallet registry has no filter and counts only displayed holdings — 3 displayed rows = registry header and summary; displayed USD/THB totals agree
PASS | asset-list wallet rows keep native/token order and exclude unknown current values — 3 priced wallet rows in native/token order
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
PASS | mobile portfolio has no suppressed market rows or disclosure traces
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
PASS | mobile exchange-rate has no suppressed market rows or disclosure traces
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
PASS | mobile asset-master has no suppressed market rows or disclosure traces
PASS | mobile asset-master renders no owner/investor names or language
PASS | mobile /asset-master uses a POST-only sidebar logout control — POST form · no logout link
PASS | mobile asset-master is labelled live and read-only
PASS | asset-list renders the read-only wallet registry
PASS | asset-list wallet registry has no filter and counts only displayed holdings — 3 displayed rows = registry header and summary; displayed USD/THB totals agree
PASS | asset-list wallet rows keep native/token order and exclude unknown current values — 3 priced wallet rows in native/token order
PASS | mobile /asset-master keeps the browser console clean
PASS | mobile /login responds successfully — HTTP 200 · /login
PASS | mobile /login mascot server HTML defaults visible only after login — absent from login HTML
PASS | mobile /login mascot remains absent after hydration
PASS | mobile /login uses the light Outfit design
PASS | mobile /login uses the reference card tokens — 1 white cards · 10px radius · reference border/shadow
PASS | mobile /login has no horizontal body overflow — 390px / 390px
PASS | mobile /login renders no undefined/null/NaN
PASS | mobile login exposes no mutation forms or controls
PASS | mobile login has no suppressed market rows or disclosure traces
PASS | mobile login renders no owner/investor names or language
PASS | mobile login preserves the Google sign-in gate
PASS | mobile /login keeps the browser console clean
PASS | mobile production mascot interaction route loads
PASS | mobile production mascot DOM transient bubble is opaque white without alpha — computed background rgb(255, 255, 255) · opacity 1 through every ancestor · #DFE5F2 border · 10px radius · app body font Outfit, Arial, sans-serif, Arial, sans-serif
PASS | mobile production mascot DOM resting chip has no visible bubble or controls after six seconds — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · settled in 5069ms after initial DOM checks · opaque through fade · no repeat
PASS | mobile production mascot DOM resting occlusion leaves home hero as-of/status metadata visible and hittable — hero as-of/status metadata: 3/3 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | mobile production mascot DOM resting occlusion leaves home class legend visible and hittable — five-class legend labels and USD/THB values: 15/15 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | mobile production mascot DOM WebGL 3D click expands the live viewer; panel stays expanded — 128px panel · aria-expanded=true · visible safe controls · current bubble visible · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video · exact gltf.animations log · bubble/controls/live loop remain beyond the transient deadline
PASS | mobile production mascot DOM second click collapses back to the resting chip — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile production mascot DOM keyboard expands cached 3D viewer; Escape collapses and restores chip focus — Enter and Space expand cached 3D bytes without another GLB request; Escape from Mute guide and Hide guide collapses, aria-expanded=false, focus returns to chip
PASS | mobile production mascot DOM mute hides the bubble, retains the a11y sprite underlay and persists on reload — mute checkbox/aria-pressed/localStorage agree · accessible sprite DOM underlay retained beneath motion surface · reload rests silently · Space/Enter unmute restore current bubble
PASS | mobile production mascot DOM hide removes the companion, survives client navigation and resets on reload — companion absent across all four pages in one document; collapsed chip restored after reload; independent mute preference retained
PASS | mobile production mascot DOM interaction and hydration console stays clean — zero page errors, hydration errors or console errors
PASS | mobile production mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.72s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.23s/7.00s advancing · no canvas · static sprite hidden · 202/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.73s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
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
PASS | desktop fixture wallet keeps exact $1 rows and totals only displayed values
PASS | desktop fixture populated page fits viewport and keeps numbers honest — 0px horizontal overflow
PASS | desktop fixture older renders real app components
PASS | desktop fixture older history keeps enabled empty-period controls and restores All
PASS | desktop fixture empty renders real app components
PASS | desktop fixture empty history disables periods/days and states history starts today
PASS | desktop fixture filtered-empty renders real app components
PASS | desktop fixture all-small/unknown wallet has zero rows and only neutral empty copy
PASS | desktop fixture populated/empty/live/legacy interactions keep browser console clean
PASS | desktop joined-boundary fixture mixed home renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture mixed home has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture mixed home counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture mixed home pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture mixed home exposes no mutation forms or controls
PASS | desktop joined-boundary fixture mixed registry renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture mixed registry has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture mixed registry counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture mixed registry pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture mixed registry exposes no mutation forms or controls
PASS | desktop joined-boundary fixture empty home renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture empty home has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture empty home counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture empty home pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture empty home exposes no mutation forms or controls
PASS | desktop joined-boundary fixture empty registry renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture empty registry has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture empty registry counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture empty registry pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture empty registry exposes no mutation forms or controls
PASS | desktop joined-boundary fixture wholesale home renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture wholesale home has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture wholesale home counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture wholesale home pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture wholesale home exposes no mutation forms or controls
PASS | desktop joined-boundary fixture wholesale registry renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture wholesale registry has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture wholesale registry counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture wholesale registry pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture wholesale registry exposes no mutation forms or controls
PASS | desktop joined-boundary fixture failed home renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture failed home has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture failed home counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture failed home pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture failed home exposes no mutation forms or controls
PASS | desktop joined-boundary fixture failed registry renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture failed registry has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture failed registry counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture failed registry pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture failed registry exposes no mutation forms or controls
PASS | desktop joined-boundary fixture inventory home renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture inventory home has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture inventory home counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture inventory home pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture inventory home exposes no mutation forms or controls
PASS | desktop joined-boundary fixture inventory registry renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture inventory registry has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture inventory registry counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture inventory registry pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture inventory registry exposes no mutation forms or controls
PASS | desktop joined-boundary fixture all scenarios keep browser console clean
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
PASS | desktop mascot fixture DOM WebGL 3D switches all nine mapped mood motions without re-downloading — data-mascot-3d=on · calm→idle, happy→happy_clap, excited→excited_bounce, thinking→idle, worried→idle, sad→idle, sleepy→idle, proud→happy_clap, alert→idle · on→video→on (data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.47s/7.00s advancing · no canvas · static sprite hidden; data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video) · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s) · one GLB request
PASS | desktop mascot fixture DOM new server props refresh mood and preserve expanded mute — thinking → worried while muted: expanded controls retained, checkbox/aria-pressed/localStorage stay true, no bubble; unmute shows latest message
PASS | desktop mascot fixture DOM new mood restarts a finite transient bubble without expanding — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop mascot fixture DOM changed message with the same mood restarts the bubble — alert source message expired; alert unreconciled message is newly visible while controls remain hidden
PASS | desktop mascot fixture DOM reduced motion keeps fallback video moving while CSS animation/fade is disabled — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 2.08s/7.00s advancing · no canvas · static sprite hidden · 13 expanded companion elements: CSS animation-name=none, transition durations=0; native video continues; collapse leaves compact chip · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | desktop mascot fixture console remains clean across every mood and prop transition
PASS | desktop fixture mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.75s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.28s/7.00s advancing · no canvas · static sprite hidden · 205/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.77s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
PASS | desktop mascot fixture DOM WebGL loading plays video then hands off to the live canvas — video → on · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.29s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · stopped/removed video · 64×95px unchanged card · one GLB · WebM-only request · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s)
PASS | desktop mascot fixture DOM WebGL resting chip plays idle without a click — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · no click · one GLB request
PASS | desktop mascot fixture WebGL resting idle changes rendered frames continuously — 3/3 distinct rendered frames · idle still live after announcement · same canvas
PASS | desktop mascot fixture DOM WebGL expand/collapse preserves canvas and switches idle to excited_bounce — idle → excited_bounce → idle twice (click + Escape) · same canvas/WebGL context · 126×189px expanded box / 128×262px card · 1 total GLB request
PASS | desktop mascot fixture DOM WebGL collapsed mood updates retain idle and the mounted canvas — excited → happy server props · still collapsed/idle · same canvas · one GLB request
PASS | desktop mascot fixture DOM WebGL resting reduced-motion toggle hands idle to video and restores live — on → video → on while collapsed · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.13s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · cached GLB
PASS | desktop mascot fixture DOM WebGL context loss switches the live idle canvas to playing video — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 2 · 720×720 · 0.22s/7.00s advancing · no canvas · static sprite hidden · one cached GLB request · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | desktop mascot fixture WebGL resting idle and transition console stays clean — zero page/console errors or Three/WebGL warnings
PASS | desktop mascot fixture DOM WebGL disabled plays video and restarts clips on expand/collapse — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.69s/7.00s advancing · no canvas · static sprite hidden · idle→happy_clap→idle with near-zero restarts · data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.17s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.16s/7.00s advancing · no canvas · static sprite hidden · zero GLB requests · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s)
PASS | desktop mascot fixture WebGL-disabled mascot fallback console is clean — zero page errors or Three/WebGL warnings
PASS | desktop mascot fixture DOM WebGL malformed GLB keeps playing video at rest and after expansion — data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.17s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.16s/7.00s advancing · no canvas · static sprite hidden · one request · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · zero page/video errors or Three/WebGL warnings
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
PASS | mobile fixture wallet keeps exact $1 rows and totals only displayed values
PASS | mobile fixture populated page fits viewport and keeps numbers honest — 0px horizontal overflow
PASS | mobile fixture older renders real app components
PASS | mobile fixture older history keeps enabled empty-period controls and restores All
PASS | mobile fixture empty renders real app components
PASS | mobile fixture empty history disables periods/days and states history starts today
PASS | mobile fixture filtered-empty renders real app components
PASS | mobile fixture all-small/unknown wallet has zero rows and only neutral empty copy
PASS | mobile fixture populated/empty/live/legacy interactions keep browser console clean
PASS | mobile joined-boundary fixture mixed home renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture mixed home has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture mixed home counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture mixed home pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture mixed home exposes no mutation forms or controls
PASS | mobile joined-boundary fixture mixed registry renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture mixed registry has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture mixed registry counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture mixed registry pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture mixed registry exposes no mutation forms or controls
PASS | mobile joined-boundary fixture empty home renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture empty home has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture empty home counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture empty home pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture empty home exposes no mutation forms or controls
PASS | mobile joined-boundary fixture empty registry renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture empty registry has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture empty registry counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture empty registry pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture empty registry exposes no mutation forms or controls
PASS | mobile joined-boundary fixture wholesale home renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture wholesale home has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture wholesale home counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture wholesale home pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture wholesale home exposes no mutation forms or controls
PASS | mobile joined-boundary fixture wholesale registry renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture wholesale registry has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture wholesale registry counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture wholesale registry pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture wholesale registry exposes no mutation forms or controls
PASS | mobile joined-boundary fixture failed home renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture failed home has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture failed home counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture failed home pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture failed home exposes no mutation forms or controls
PASS | mobile joined-boundary fixture failed registry renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture failed registry has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture failed registry counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture failed registry pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture failed registry exposes no mutation forms or controls
PASS | mobile joined-boundary fixture inventory home renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture inventory home has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture inventory home counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture inventory home pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture inventory home exposes no mutation forms or controls
PASS | mobile joined-boundary fixture inventory registry renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture inventory registry has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture inventory registry counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture inventory registry pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture inventory registry exposes no mutation forms or controls
PASS | mobile joined-boundary fixture all scenarios keep browser console clean
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
PASS | mobile mascot fixture DOM WebGL 3D switches all nine mapped mood motions without re-downloading — data-mascot-3d=on · calm→idle, happy→happy_clap, excited→excited_bounce, thinking→idle, worried→idle, sad→idle, sleepy→idle, proud→happy_clap, alert→idle · on→video→on (data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.84s/7.00s advancing · no canvas · static sprite hidden; data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video) · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s) · one GLB request
PASS | mobile mascot fixture DOM new server props refresh mood and preserve expanded mute — thinking → worried while muted: expanded controls retained, checkbox/aria-pressed/localStorage stay true, no bubble; unmute shows latest message
PASS | mobile mascot fixture DOM new mood restarts a finite transient bubble without expanding — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile mascot fixture DOM changed message with the same mood restarts the bubble — alert source message expired; alert unreconciled message is newly visible while controls remain hidden
PASS | mobile mascot fixture DOM reduced motion keeps fallback video moving while CSS animation/fade is disabled — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 4.72s/7.00s advancing · no canvas · static sprite hidden · 13 expanded companion elements: CSS animation-name=none, transition durations=0; native video continues; collapse leaves compact chip · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | mobile mascot fixture console remains clean across every mood and prop transition
PASS | mobile fixture mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.72s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.23s/7.00s advancing · no canvas · static sprite hidden · 202/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.73s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
PASS | mobile mascot fixture DOM WebGL loading plays video then hands off to the live canvas — video → on · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.22s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · stopped/removed video · 64×95px unchanged card · one GLB · WebM-only request · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s)
PASS | mobile mascot fixture DOM WebGL resting chip plays idle without a click — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · no click · one GLB request
PASS | mobile mascot fixture WebGL resting idle changes rendered frames continuously — 3/3 distinct rendered frames · idle still live after announcement · same canvas
PASS | mobile mascot fixture DOM WebGL expand/collapse preserves canvas and switches idle to excited_bounce — idle → excited_bounce → idle twice (click + Escape) · same canvas/WebGL context · 126×189px expanded box / 128×262px card · 1 total GLB request
PASS | mobile mascot fixture DOM WebGL collapsed mood updates retain idle and the mounted canvas — excited → happy server props · still collapsed/idle · same canvas · one GLB request
PASS | mobile mascot fixture DOM WebGL resting reduced-motion toggle hands idle to video and restores live — on → video → on while collapsed · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · cached GLB
PASS | mobile mascot fixture DOM WebGL context loss switches the live idle canvas to playing video — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.27s/7.00s advancing · no canvas · static sprite hidden · one cached GLB request · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | mobile mascot fixture WebGL resting idle and transition console stays clean — zero page/console errors or Three/WebGL warnings
PASS | mobile mascot fixture DOM WebGL disabled plays video and restarts clips on expand/collapse — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.71s/7.00s advancing · no canvas · static sprite hidden · idle→happy_clap→idle with near-zero restarts · data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.17s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · zero GLB requests · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s)
PASS | mobile mascot fixture WebGL-disabled mascot fallback console is clean — zero page errors or Three/WebGL warnings
PASS | mobile mascot fixture DOM WebGL malformed GLB keeps playing video at rest and after expansion — data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.16s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.15s/7.00s advancing · no canvas · static sprite hidden · one request · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · zero page/video errors or Three/WebGL warnings
PASS | Mascot motion surfaces never settle on the static fallback in codec-capable Chromium — post-hydration states observed: on/video
PASS | Mascot video fallback selects every contracted VP9 WebM clip — selected sources observed: /mascot/motion-excited-bounce.webm, /mascot/motion-happy-clap.webm, /mascot/motion-idle.webm

PASS | Mascot resting/occlusion summary — 10/10 checks passed at 1440×1000 and 390×844
PASS | Mascot DOM assertion summary — 50/50 checks passed (individual assertions printed above)
PASS | Mascot 3D/video fallback summary — 65/65 checks passed · data-mascot-3d states observed: on/video · selected video sources: /mascot/motion-excited-bounce.webm, /mascot/motion-happy-clap.webm, /mascot/motion-idle.webm

PASS | Mascot contract summary — 126/126 checks passed

PASS | UI contract summary — 451/451 checks passed
```

`git diff --stat 9e27211`

```text
 app/asset-list/asset-list.css            |   4 -
 app/asset-list/page.tsx                  |  24 +-
 app/asset-list/wallet-asset-registry.tsx |  58 +--
 app/home-wallet-panel.tsx                |  56 +--
 app/home.css                             |   5 -
 app/page.tsx                             |   5 +-
 app/pnl-asset-table.tsx                  |   7 +-
 lib/adjusted-day-change.test.ts          |  34 +-
 lib/capital-ui.test.ts                   |  30 +-
 lib/dust-filter.test.ts                  |  46 +--
 lib/dust-filter.ts                       |  11 +-
 lib/holding-values.ts                    |   2 +-
 lib/live-data.test.ts                    | 224 ++++++++++--
 lib/live-data.ts                         | 120 ++++---
 lib/mascot.test.ts                       |  11 +-
 lib/pnl-correctness-pages.test.ts        |  54 ++-
 lib/pnl-history.test.ts                  |  25 +-
 lib/pnl-history.ts                       |   2 +-
 lib/pnl-ui.test.ts                       |  74 ++--
 lib/pnl-view.test.ts                     |  23 +-
 lib/pnl-view.ts                          |  10 +-
 lib/pnl.test.ts                          |  29 +-
 lib/pnl.ts                               |  14 +-
 scripts/__fixtures__/dust-book.ts        |  77 ++++
 scripts/ui-contract-check.mjs            | 588 ++++++++++++++-----------------
 scripts/ui-fixture-entry.tsx             |  16 +-
 scripts/ui-fixture-server.mjs            |   6 +
 27 files changed, 871 insertions(+), 684 deletions(-)
```

`python3 /tmp/pm-dust-removal-qa/stale-string-counts.py`

```text
retired predicate shouldHideWalletDust: 0 matches (0 harness negative-assertion lines excluded)
retired toggle labels: 0 matches (0 harness negative-assertion lines excluded)
retired hidden-count and all-hidden copy: 0 matches (0 harness negative-assertion lines excluded)
retired wallet CSS selectors: 0 matches (1 harness negative-assertion lines excluded)
retired value/eligibility labels: 0 matches (0 harness negative-assertion lines excluded)
Legacy dust/unpriced schema identifiers and historical fixtures intentionally remain; these are not retired UI strings.
```

The stale-string scan uses `rg --files app lib scripts` and counts case-insensitive matches for the retired predicate, toggle labels, hidden-count/empty copy, selectors and eligibility/value labels. Only the negative helper `assertNoSuppressionTrace` in the harness is excluded. Binary assets are skipped; no application/library/test text file is excluded. The unchanged historical schema terms are intentionally retained. The exact scan used is included for reproducibility:

```python
import re
import subprocess
from pathlib import Path

paths = subprocess.run(['rg', '--files', 'app', 'lib', 'scripts'], check=True, capture_output=True, text=True).stdout.splitlines()
patterns = {
    'retired predicate shouldHideWalletDust': r'shouldHideWalletDust',
    'retired toggle labels': r'Hide (?:assets )?under \$1',
    'retired hidden-count and all-hidden copy': r'hidden under \$1|All wallet assets are hidden|Full-set totals include hidden assets|Full-set priced totals remain below',
    'retired wallet CSS selectors': r'\.(?:home|asset)-wallet-(?:filter\b|hidden-count\b|filtered-empty\b)',
    'retired value/eligibility labels': r'Dust · below \$1|Dust under \$1 · excluded|Unpriced · excluded',
}
failures = []
for name, pattern in patterns.items():
    matched = []
    excluded = 0
    for path in paths:
        try:
            content = Path(path).read_text()
        except UnicodeDecodeError:
            continue
        for line_number, line in enumerate(content.splitlines(), 1):
            if not re.search(pattern, line, re.I):
                continue
            # The helper is entirely negative assertions, including its selector constants.
            before = content.splitlines()[:line_number]
            in_negative_helper = path == 'scripts/ui-contract-check.mjs' and '\n'.join(before).rfind('async function assertNoSuppressionTrace(') > '\n'.join(before).rfind('async function assertMarketRowValues(')
            if in_negative_helper:
                excluded += 1
            else:
                matched.append(f'{path}:{line_number}:{line}')
    print(f'{name}: {len(matched)} matches ({excluded} harness negative-assertion lines excluded)')
    failures.extend(matched)
print('Legacy dust/unpriced schema identifiers and historical fixtures intentionally remain; these are not retired UI strings.')
if failures:
    print('\n'.join(failures))
    raise SystemExit(1)
```

## Server cleanup and branch verification

```text
Stopped only task-owned production session on 127.0.0.1:43740.
Port 43740 is unused after shutdown.
Pre-existing server on 127.0.0.1:8125 remains listening.
Branch: feat/dust-removal
```

## Risk flags

1. **Accepted silent omission:** a displayed total can omit holdings with unknown value, with no count, warning, tooltip or other interface trace. T212 totals now reflect displayed positions plus broker cash; provider summary totals can therefore differ deliberately.
2. **Strict $1.00 boundary:** exactly $1 remains; raw values below $1 are omitted even if currency formatting would round them to $1.00. Crossing the boundary changes the displayed snapshot basket, so the existing holdings-identity guard can make adjacent-day comparison unavailable.
3. **Whole-class pricing outage:** positive inventory with no resolvable USD values remains `unavailable`, with null class subtotals, and the nine-source recorder gate still rejects recording. A known positive wallet subtotal may remain visible when its other wallet class is unavailable, as before; that does not bypass the recorder gate. NFT pagination or missing metadata still causes partial inventory status.

Revert an existing path using the preserved tag (snapshot also remains at `backups/site-pre-dust-removal-2026-09-12/`):

`git checkout pre-dust-removal-2026-09-12 -- <path>`

## Fix pass

Completed on `feat/dust-removal` against reviewed commit `3414f97` on 2026-09-12. This section supersedes the original report's statements that T212 account totals are rebuilt from displayed positions and its original risk flags. The existing report above is retained as the earlier pass's audit trail. No push, merge, checkout of `main`, or `git add -A` was performed. Only the seven fix/report paths are included in this commit; pre-existing untracked files remain untouched.

### Findings and changes

**Blocking 1 — authoritative Trading 212 account value and broker cash.** `lib/live-data.ts` now returns `t212.totalValue` and `t212.investmentsCurrentValue` directly from the broker summary. `totals.t212Thb` converts that authoritative account total using the available account FX rate; it never sums positions or depends on the positions source state. The displayed investments array remains suppressed at the joined boundary. Reserved-order cash and cash in pies therefore remain in the broker total, including when available-to-trade cash alone is smaller. The unchanged mixed-currency fixture again asserts exactly **4500 THB**, with account total GBP 100 and broker investments GBP 60; its original row conversions remain 900, 72 and 240 THB.

`lib/pnl-view.ts` retains the original account-remainder calculation, `T212 stocks = account total − broker cash`, and restores both original comments verbatim, including `// Account remainder, not a second sum of positions: account total is authoritative.` The cash operand remains the existing available-to-trade field. Other broker cash therefore remains within the account remainder, as before. A suppressed T212 position's value also remains inside the account remainder. For suppressed positions with known sub-dollar values, the difference attributable to that suppression is bounded by the sum of those suppressed rows, each **< $1**; suppressing them does not change the account total, its THB equivalent, or another broker-derived figure.

**Blocking 2 — failed conversion feeds becoming zero after suppression.** `holdingSourceState` now checks required pricing dependencies before examining original inventory: NFT and native-wallet classes require ETH/USD and USD/THB; token and positions classes require USD/THB for their converted values. Unavailable feed payloads are treated as unavailable even when stale numeric data is present, and absent/non-positive required quotes cannot pass the dependency check. Missing dependencies set class status to `unavailable`, so the existing first guard in `pricedSubtotal` returns null even for empty arrays or zero-valued rows. Account THB conversion also requires an actual account rate, preventing zero broker balances from bypassing missing FX. The book's dependent totals remain null and its home hero reads `Value unavailable` with dashes, rather than rendering zero.

The pre-existing every-positive-row-unpriceable rule remains. With available feeds, known values below $1 still suppress silently to a finite zero displayed class subtotal, without unavailable/partial status caused by those rows. Partial inventory remains partial. Independently priced tokens may still supply a known partial wallet aggregate during an ETH outage; NFT/native dependent subtotals and the joined book total remain null.

**Dropped contract.** Restoring the untouched fixture's 4500 THB assertion and adding direct reserved/in-pies broker-cash regressions restores its original protection. No form, button, input, select, mutation control, toggle, count note, threshold explanation or price-omission label was added to product UI. No application component or CSS file changed.

### Regression coverage and assertion replacements

The suite increases from 298 to **311 tests** across the same 19 files. All earlier test cases remain. Twelve new `lib/live-data.test.ts` cases cover:

1. A visible $100 T212 position plus a suppressed $0.50 position preserves authoritative total $160.50 and investments $100.50; comparing with the same broker summary without the suppressed row proves all joined totals and broker fields are identical.
2. ETH outage with NFT floors 0 and 0.1 ETH and matching native amounts, tested with missing and stale feed payloads; zero-only and empty inventories separately prove dependency status does not depend on a positive surviving row. All affected class/book totals are null, while an independently empty token class stays live at zero.
3. Fiat outage with every one of the four market classes worth $0.999, tested with missing data, stale data marked unavailable, and a partial FX payload missing its USD/THB cross. Displayed arrays are empty, all required class states unavailable, dependent subtotals/book totals null and coverage incomplete without counting suppressed rows.
4. The exact single-$0.999-NFT / zero-broker-cash fiat-outage reproduction, with null account THB, NFT THB and book USD/THB totals.
5. Three actual `getJoinedPortfolio` provider-schema cash variants: reserved/in-pies = 50/0, 0/50 and 20/30. Each preserves $160 total, $100 investments and 5760 THB with a visible $100 position and $10 available to trade.

One new `lib/pnl-view.test.ts` case verifies that $160 account total / $10 available cash / $100 investments allocates $150 to the account remainder and $10 to cash, with conserved USD/THB sums and 100% shares.

Every changed pre-existing unit assertion is listed here; unrelated assertions remain:

- Four-class strict-boundary fixture: T212 total/investments `7.01/2.01` become authoritative `100/95`; T212 THB `7.01 * 36` becomes `100 * 36`; book USD `5 + 4 * 2.01` becomes `100 + 3 * 2.01`. All four displayed-row boundaries, other class subtotals and coverage identities remain.
- All-known-small fixture: T212 total `5` becomes `5.25`, with new broker investments `0.25` and THB `5.25 * 36` assertions; book USD `5` becomes `5.25`. Every market array remains empty, other displayed class subtotals remain zero and all market sources remain live/coverage complete.
- Unknown-native/T212-position outage fixture: null T212 account/THB assertions become authoritative total `487`, investments `0`, THB `487 * 45`. Position/native unavailable state, absent rows and every wallet/book null assertion remain.
- Stale unavailable holdings fixture: null T212 THB becomes `487 * 45`, with authoritative total `487` and investments `0` assertions added. Every NFT/wallet/book null and holdings-source unavailable assertion remains.
- Mixed-currency fixture: THB `40 * 45 + 900 + 72 + 240` (3012) is replaced by the restored `4500`; synthesized account/investment values become exact broker `100/60`. Row-currency conversions remain unchanged.
- Suppressed-security allocation fixture: stock USD `1` becomes `1.5` and THB `36` becomes `54`; new assertions pin broker total `101.5`, investments `1.5`, and account THB `3654`. Exact-$1 row visibility, cash allocation, conserved book sum and 100% shares remain.

### Every touched browser check and its replacement

`scripts/ui-contract-check.mjs` retains all existing checks. The joined fixture matrix expands from five to seven scenarios, and from 102 to **150 checks**, adding 48 checks to the full harness. `scripts/__fixtures__/dust-book.ts` adds `eth-outage` (0 and 0.1 ETH floors) and `fiat-outage` (all four market inputs $0.999). Both render the real home and registry pages through `buildJoinedPortfolio` at 1440×1000 and 390×844.

1. **Scenario matrix:** all five old scenarios remain, with both new outage scenarios added to the existing real-page navigation, suppression, row/count/source truth, independent totals, mutation-control and console audits. No original scenario or check was removed.
2. **“has no suppressed rows, labels, attributes or comments”:** every old assertion remains; `COLLECTION-ZERO` and `COLLECTION-POSITIVE` are added to the forbidden rendered names for the ETH outage.
3. **“pins independent totals, boundary, cash exemption and outage behavior”:** mixed/inventory grand USD `4.25` becomes authoritative raw `5.249`, rendered `$5.25`; empty grand `0` becomes authoritative raw `0.999`, rendered `$1.00`; T212 class/allocation `1` becomes account remainder raw `1.999`, rendered `$2.00`. Raw totals use a 1e-9 arithmetic tolerance; rendered text now matches the existing independent currency formatter exactly. Added direct broker total/investment and account-THB assertions. Count, unavailable and cash expectations extend to the new fixtures; all previous boundary, cash, eligibility, source and wholesale/failed outage assertions remain.
4. **New “keeps unavailable conversion dependencies null and renders no zero valuation”:** checks independent failed feed status, unavailable classes, null dependent class/book totals, literal USD/THB hero dashes, exact home `Value unavailable`, source badges, class/registry subtotal dashes and unavailable NFT registry state. ETH outage additionally preserves independent live token and partial wallet aggregate USD 1 / THB 36.

The bounded fixture audit passed 150/150 before full QA. The complete required production/browser QA below is the acceptance run.

### Updated risk flags

1. **Authoritative broker remainder:** account values can exceed displayed security-row sums because the broker owns the account total. Known suppressed sub-dollar securities remain within its remainder, with the suppression-related difference bounded by those rows, each < $1. Reserved-order/in-pies cash also remains there under the restored existing allocation semantics. Suppressed securities whose value is unknown have no locally quantifiable bound; their unknown local value cannot rewrite a known broker total.
2. **Accepted silent omission and strict boundary:** unknown and raw sub-$1 market rows remain absent without labels/counts/explanations; exactly $1 remains and manual cash remains exempt. Threshold crossings still change the displayed snapshot basket and can affect the existing adjacent-snapshot holdings-identity guard.
3. **Dependency outages stay unavailable:** missing ETH or required FX now cannot become zero through a zero-valued row, an all-suppressed class or stale feed payload. This can turn formerly misleading live/zero classes unavailable. Dependent book totals remain null, and the unchanged nine-source recorder gate rejects incomplete sources. Existing partial-wallet aggregation and partial-inventory behavior remain.
4. **Validation scope:** deterministic fixtures cover both reproduced outages and broker-cash schema fields; production route checks additionally depend on provider availability at execution time. This implementation changes no schema, historical snapshot parser, mutation UI, deployment or remote branch.

### Verbatim required self-QA

Command labels below are separate from captured stdout/stderr. Each finite QA command exited 0; the persistent production server was stopped with SIGTERM after the browser run (expected server-session exit 143). The production server used the newly built artifacts and a port verified unused before startup. Logs are retained under `/tmp/pm-dust-removal-fix-qa/`.

The implementation-only `git diff --check` passes. The full report-inclusive check flags exactly three captured Next build progress lines for trailing space/carriage return; those bytes are retained to satisfy the required verbatim transcript. No implementation whitespace error is waived.

Acceptance results: **311/311 tests**, **0 lint errors** (one pre-existing warning), successful production build, **readiness HTTP 200** on unused port **59283**, and **499/499 full browser checks** (451 retained/replaced plus 48 additional checks).

`npm test`

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
| Base ETH 0.000099 | N/A (not displayed) | no-op | Absent from joined holdings and coverage |
| Robinhood Chain ETH 0.000526 | not-recorded | not-recorded | Native balance only; no clean purchase provenance (bridge/deposit is not a basis) |
| USDG 1.475 | not-recorded | not-recorded | Token balance only; no clean acquisition/payment history recorded |
| STACK token (sub-cent) | not-recorded | dust | Operator reports sub-cent value; no basis derivation; exact quantity not supplied |
| GME token (sub-cent) | not-recorded | dust | Operator reports sub-cent value; no basis derivation; exact quantity not supplied |
| 2× Stackers NFT | not-recorded | not-recorded | OpenSea inventory/floor only; acquisition and payment history not recorded |
| 2× G00fyz NFT | not-recorded | not-recorded | OpenSea inventory/floor only; acquisition and payment history not recorded |
Current-book P&L: costBasisUsd=null; pnlUsd=null; pnlPct=null; eligible=0.
CURRENT_BOOK_TABLE_END

 Test Files  19 passed (19)
      Tests  311 passed (311)
   Start at  06:36:21
   Duration  2.95s (transform 2.17s, setup 0ms, import 4.83s, tests 3.01s, environment 2ms)

```

`npm run lint`

```text
npm notice run portmanager@0.1.0 lint
npm notice run eslint

/home/user/projects/portmanager/proxy.ts
  19:10  warning  'b64urlEncode' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)

```

`npm run build`

```text
npm notice run portmanager@0.1.0 build
npm notice run next build
▲ Next.js 16.2.6 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 3.8s
  Running TypeScript ...
  Finished TypeScript in 2.9s ...
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

`Unused-port bind probe`

```text
Unused port verified by bind: 59283
```

`npm run start -- --hostname 127.0.0.1 --port 59283`

```text
npm notice run portmanager@0.1.0 start
npm notice run next start --hostname 127.0.0.1 --port 59283
▲ Next.js 16.2.6
- Local:         http://127.0.0.1:59283
- Network:       http://127.0.0.1:59283
✓ Ready in 76ms
```

`curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 --max-time 45 -o /dev/null -w 'Readiness HTTP %{http_code}\n' http://127.0.0.1:59283/`

```text
Readiness HTTP 200
```

`UI_BASE_URL=http://127.0.0.1:59283 node scripts/ui-contract-check.mjs`

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
PASS | desktop home has no suppressed market rows or disclosure traces
PASS | desktop home renders no owner/investor names or language
PASS | desktop / uses a POST-only sidebar logout control — POST form · no logout link
PASS | home follows the P&L-center section order
PASS | home P&L summary distinguishes none, partial and complete honestly — P&L state: none
PASS | home per-asset P&L keeps unknown basis null and exclusions explicit — 3 joined rows · 3 basis not recorded
PASS | home performance uses snapshot history or the honest empty state — history starts today · empty period controls disabled
PASS | home allocation remains value-based even when P&L is unavailable
PASS | home calendar displays recorded coverage or an honest empty month — no recorded days; no historical P&L invented
PASS | home retains all seven source statuses and unavailable-source honesty — seven original plus two ledger source statuses retained
PASS | home permits value allocation while banning retired ownership copy
PASS | home renders the USD-primary value hero and P&L metric strip
PASS | home wallet panel exposes both sources and the wallet table contract
PASS | H1 home wallet has no retired filter controls or suppression traces
PASS | H2 home wallet headers and hero count exactly the displayable rows — 2 native + 1 tokens = header and hero counts
PASS | H3 home wallet totals sum displayed rows and remain stable — 3 rows; USD/THB totals match their displayed values
PASS | home wallet rows keep native/token order and exclude unknown current values — 3 priced wallet rows in native/token order
PASS | H4 desktop home wallet/history paths keep the browser console clean
PASS | desktop /asset-list responds successfully — HTTP 200 · /asset-list
PASS | desktop /asset-list mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | desktop /asset-list mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop /asset-list mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | desktop /asset-list uses the light Outfit design
PASS | desktop /asset-list uses the reference card tokens — 16 white cards · 10px radius · reference border/shadow
PASS | desktop /asset-list has no horizontal body overflow — 1440px / 1440px
PASS | desktop /asset-list renders no undefined/null/NaN
PASS | desktop asset-list exposes no mutation forms or controls
PASS | desktop asset-list has no suppressed market rows or disclosure traces
PASS | desktop asset-list renders no owner/investor names or language
PASS | desktop /asset-list uses a POST-only sidebar logout control — POST form · no logout link
PASS | desktop asset-list is labelled live and read-only
PASS | asset-list renders the read-only wallet registry
PASS | asset-list wallet registry has no filter and counts only displayed holdings — 3 displayed rows = registry header and summary; displayed USD/THB totals agree
PASS | asset-list wallet rows keep native/token order and exclude unknown current values — 3 priced wallet rows in native/token order
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
PASS | desktop portfolio has no suppressed market rows or disclosure traces
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
PASS | desktop exchange-rate has no suppressed market rows or disclosure traces
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
PASS | desktop asset-master has no suppressed market rows or disclosure traces
PASS | desktop asset-master renders no owner/investor names or language
PASS | desktop /asset-master uses a POST-only sidebar logout control — POST form · no logout link
PASS | desktop asset-master is labelled live and read-only
PASS | asset-list renders the read-only wallet registry
PASS | asset-list wallet registry has no filter and counts only displayed holdings — 3 displayed rows = registry header and summary; displayed USD/THB totals agree
PASS | asset-list wallet rows keep native/token order and exclude unknown current values — 3 priced wallet rows in native/token order
PASS | desktop /asset-master keeps the browser console clean
PASS | desktop /login responds successfully — HTTP 200 · /login
PASS | desktop /login mascot server HTML defaults visible only after login — absent from login HTML
PASS | desktop /login mascot remains absent after hydration
PASS | desktop /login uses the light Outfit design
PASS | desktop /login uses the reference card tokens — 1 white cards · 10px radius · reference border/shadow
PASS | desktop /login has no horizontal body overflow — 1440px / 1440px
PASS | desktop /login renders no undefined/null/NaN
PASS | desktop login exposes no mutation forms or controls
PASS | desktop login has no suppressed market rows or disclosure traces
PASS | desktop login renders no owner/investor names or language
PASS | desktop login preserves the Google sign-in gate
PASS | desktop /login keeps the browser console clean
PASS | desktop production mascot interaction route loads
PASS | desktop production mascot DOM transient bubble is opaque white without alpha — computed background rgb(255, 255, 255) · opacity 1 through every ancestor · #DFE5F2 border · 10px radius · app body font Outfit, Arial, sans-serif, Arial, sans-serif
PASS | desktop production mascot DOM resting chip has no visible bubble or controls after six seconds — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · settled in 5023ms after initial DOM checks · opaque through fade · no repeat
PASS | desktop production mascot DOM resting occlusion leaves home hero as-of/status metadata visible and hittable — hero as-of/status metadata: 3/3 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | desktop production mascot DOM resting occlusion leaves home class legend visible and hittable — five-class legend labels and USD/THB values: 15/15 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | desktop production mascot DOM WebGL 3D click expands the live viewer; panel stays expanded — 128px panel · aria-expanded=true · visible safe controls · current bubble visible · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video · exact gltf.animations log · bubble/controls/live loop remain beyond the transient deadline
PASS | desktop production mascot DOM second click collapses back to the resting chip — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop production mascot DOM keyboard expands cached 3D viewer; Escape collapses and restores chip focus — Enter and Space expand cached 3D bytes without another GLB request; Escape from Mute guide and Hide guide collapses, aria-expanded=false, focus returns to chip
PASS | desktop production mascot DOM mute hides the bubble, retains the a11y sprite underlay and persists on reload — mute checkbox/aria-pressed/localStorage agree · accessible sprite DOM underlay retained beneath motion surface · reload rests silently · Space/Enter unmute restore current bubble
PASS | desktop production mascot DOM hide removes the companion, survives client navigation and resets on reload — companion absent across all four pages in one document; collapsed chip restored after reload; independent mute preference retained
PASS | desktop production mascot DOM interaction and hydration console stays clean — zero page errors, hydration errors or console errors
PASS | desktop production mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.69s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.28s/7.00s advancing · no canvas · static sprite hidden · 233/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.73s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
PASS | mobile / responds successfully — HTTP 200 · /
PASS | mobile / mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | mobile / mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile / mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile / uses the light Outfit design
PASS | mobile / uses the reference card tokens — 12 white cards · 10px radius · reference border/shadow
PASS | mobile / has no horizontal body overflow — 390px / 390px
PASS | mobile / renders no undefined/null/NaN
PASS | mobile home exposes no mutation forms or controls
PASS | mobile home has no suppressed market rows or disclosure traces
PASS | mobile home renders no owner/investor names or language
PASS | mobile / uses a POST-only sidebar logout control — POST form · no logout link
PASS | home follows the P&L-center section order
PASS | home P&L summary distinguishes none, partial and complete honestly — P&L state: none
PASS | home per-asset P&L keeps unknown basis null and exclusions explicit — 3 joined rows · 3 basis not recorded
PASS | home performance uses snapshot history or the honest empty state — history starts today · empty period controls disabled
PASS | home allocation remains value-based even when P&L is unavailable
PASS | home calendar displays recorded coverage or an honest empty month — no recorded days; no historical P&L invented
PASS | home retains all seven source statuses and unavailable-source honesty — seven original plus two ledger source statuses retained
PASS | home permits value allocation while banning retired ownership copy
PASS | home renders the USD-primary value hero and P&L metric strip
PASS | home wallet panel exposes both sources and the wallet table contract
PASS | H1 home wallet has no retired filter controls or suppression traces
PASS | H2 home wallet headers and hero count exactly the displayable rows — 2 native + 1 tokens = header and hero counts
PASS | H3 home wallet totals sum displayed rows and remain stable — 3 rows; USD/THB totals match their displayed values
PASS | home wallet rows keep native/token order and exclude unknown current values — 3 priced wallet rows in native/token order
PASS | H4 mobile home wallet/history paths keep the browser console clean
PASS | mobile /asset-list responds successfully — HTTP 200 · /asset-list
PASS | mobile /asset-list mascot server HTML defaults visible only after login — collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row
PASS | mobile /asset-list mascot renders an accessible chip and expanded read-only controls — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile /asset-list mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile /asset-list uses the light Outfit design
PASS | mobile /asset-list uses the reference card tokens — 16 white cards · 10px radius · reference border/shadow
PASS | mobile /asset-list has no horizontal body overflow — 390px / 390px
PASS | mobile /asset-list renders no undefined/null/NaN
PASS | mobile asset-list exposes no mutation forms or controls
PASS | mobile asset-list has no suppressed market rows or disclosure traces
PASS | mobile asset-list renders no owner/investor names or language
PASS | mobile /asset-list uses a POST-only sidebar logout control — POST form · no logout link
PASS | mobile asset-list is labelled live and read-only
PASS | asset-list renders the read-only wallet registry
PASS | asset-list wallet registry has no filter and counts only displayed holdings — 1 displayed rows = registry header and summary; displayed USD/THB totals agree
PASS | asset-list wallet rows keep native/token order and exclude unknown current values — 1 priced wallet rows in native/token order
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
PASS | mobile portfolio has no suppressed market rows or disclosure traces
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
PASS | mobile exchange-rate has no suppressed market rows or disclosure traces
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
PASS | mobile asset-master has no suppressed market rows or disclosure traces
PASS | mobile asset-master renders no owner/investor names or language
PASS | mobile /asset-master uses a POST-only sidebar logout control — POST form · no logout link
PASS | mobile asset-master is labelled live and read-only
PASS | asset-list renders the read-only wallet registry
PASS | asset-list wallet registry has no filter and counts only displayed holdings — 1 displayed rows = registry header and summary; displayed USD/THB totals agree
PASS | asset-list wallet rows keep native/token order and exclude unknown current values — 1 priced wallet rows in native/token order
PASS | mobile /asset-master keeps the browser console clean
PASS | mobile /login responds successfully — HTTP 200 · /login
PASS | mobile /login mascot server HTML defaults visible only after login — absent from login HTML
PASS | mobile /login mascot remains absent after hydration
PASS | mobile /login uses the light Outfit design
PASS | mobile /login uses the reference card tokens — 1 white cards · 10px radius · reference border/shadow
PASS | mobile /login has no horizontal body overflow — 390px / 390px
PASS | mobile /login renders no undefined/null/NaN
PASS | mobile login exposes no mutation forms or controls
PASS | mobile login has no suppressed market rows or disclosure traces
PASS | mobile login renders no owner/investor names or language
PASS | mobile login preserves the Google sign-in gate
PASS | mobile /login keeps the browser console clean
PASS | mobile production mascot interaction route loads
PASS | mobile production mascot DOM transient bubble is opaque white without alpha — computed background rgb(255, 255, 255) · opacity 1 through every ancestor · #DFE5F2 border · 10px radius · app body font Outfit, Arial, sans-serif, Arial, sans-serif
PASS | mobile production mascot DOM resting chip has no visible bubble or controls after six seconds — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · settled in 5114ms after initial DOM checks · opaque through fade · no repeat
PASS | mobile production mascot DOM resting occlusion leaves home hero as-of/status metadata visible and hittable — hero as-of/status metadata: 3/3 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | mobile production mascot DOM resting occlusion leaves home class legend visible and hittable — five-class legend labels and USD/THB values: 15/15 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | mobile production mascot DOM WebGL 3D click expands the live viewer; panel stays expanded — 128px panel · aria-expanded=true · visible safe controls · current bubble visible · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video · exact gltf.animations log · bubble/controls/live loop remain beyond the transient deadline
PASS | mobile production mascot DOM second click collapses back to the resting chip — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile production mascot DOM keyboard expands cached 3D viewer; Escape collapses and restores chip focus — Enter and Space expand cached 3D bytes without another GLB request; Escape from Mute guide and Hide guide collapses, aria-expanded=false, focus returns to chip
PASS | mobile production mascot DOM mute hides the bubble, retains the a11y sprite underlay and persists on reload — mute checkbox/aria-pressed/localStorage agree · accessible sprite DOM underlay retained beneath motion surface · reload rests silently · Space/Enter unmute restore current bubble
PASS | mobile production mascot DOM hide removes the companion, survives client navigation and resets on reload — companion absent across all four pages in one document; collapsed chip restored after reload; independent mute preference retained
PASS | mobile production mascot DOM interaction and hydration console stays clean — zero page errors, hydration errors or console errors
PASS | mobile production mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.73s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.29s/7.00s advancing · no canvas · static sprite hidden · 202/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.75s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
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
PASS | desktop fixture wallet keeps exact $1 rows and totals only displayed values
PASS | desktop fixture populated page fits viewport and keeps numbers honest — 0px horizontal overflow
PASS | desktop fixture older renders real app components
PASS | desktop fixture older history keeps enabled empty-period controls and restores All
PASS | desktop fixture empty renders real app components
PASS | desktop fixture empty history disables periods/days and states history starts today
PASS | desktop fixture filtered-empty renders real app components
PASS | desktop fixture all-small/unknown wallet has zero rows and only neutral empty copy
PASS | desktop fixture populated/empty/live/legacy interactions keep browser console clean
PASS | desktop joined-boundary fixture mixed home renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture mixed home has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture mixed home counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture mixed home pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture mixed home exposes no mutation forms or controls
PASS | desktop joined-boundary fixture mixed registry renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture mixed registry has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture mixed registry counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture mixed registry pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture mixed registry exposes no mutation forms or controls
PASS | desktop joined-boundary fixture empty home renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture empty home has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture empty home counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture empty home pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture empty home exposes no mutation forms or controls
PASS | desktop joined-boundary fixture empty registry renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture empty registry has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture empty registry counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture empty registry pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture empty registry exposes no mutation forms or controls
PASS | desktop joined-boundary fixture wholesale home renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture wholesale home has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture wholesale home counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture wholesale home pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture wholesale home exposes no mutation forms or controls
PASS | desktop joined-boundary fixture wholesale registry renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture wholesale registry has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture wholesale registry counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture wholesale registry pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture wholesale registry exposes no mutation forms or controls
PASS | desktop joined-boundary fixture failed home renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture failed home has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture failed home counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture failed home pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture failed home exposes no mutation forms or controls
PASS | desktop joined-boundary fixture failed registry renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture failed registry has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture failed registry counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture failed registry pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture failed registry exposes no mutation forms or controls
PASS | desktop joined-boundary fixture inventory home renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture inventory home has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture inventory home counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture inventory home pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture inventory home exposes no mutation forms or controls
PASS | desktop joined-boundary fixture inventory registry renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture inventory registry has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture inventory registry counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture inventory registry pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture inventory registry exposes no mutation forms or controls
PASS | desktop joined-boundary fixture eth-outage home renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture eth-outage home has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture eth-outage home counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture eth-outage home pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture eth-outage home keeps unavailable conversion dependencies null and renders no zero valuation — 0 and 0.1 ETH floors cannot mask failed NFT/native pricing; dependent totals stay null/—
PASS | desktop joined-boundary fixture eth-outage home exposes no mutation forms or controls
PASS | desktop joined-boundary fixture eth-outage registry renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture eth-outage registry has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture eth-outage registry counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture eth-outage registry pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture eth-outage registry keeps unavailable conversion dependencies null and renders no zero valuation — 0 and 0.1 ETH floors cannot mask failed NFT/native pricing; dependent totals stay null/—
PASS | desktop joined-boundary fixture eth-outage registry exposes no mutation forms or controls
PASS | desktop joined-boundary fixture fiat-outage home renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture fiat-outage home has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture fiat-outage home counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture fiat-outage home pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture fiat-outage home keeps unavailable conversion dependencies null and renders no zero valuation — all four market inputs are $0.999; failed fiat conversion keeps dependent totals null/—
PASS | desktop joined-boundary fixture fiat-outage home exposes no mutation forms or controls
PASS | desktop joined-boundary fixture fiat-outage registry renders the real page through buildJoinedPortfolio
PASS | desktop joined-boundary fixture fiat-outage registry has no suppressed rows, labels, attributes or comments
PASS | desktop joined-boundary fixture fiat-outage registry counts exactly its DOM rows and preserves source truth
PASS | desktop joined-boundary fixture fiat-outage registry pins independent totals, boundary, cash exemption and outage behavior
PASS | desktop joined-boundary fixture fiat-outage registry keeps unavailable conversion dependencies null and renders no zero valuation — all four market inputs are $0.999; failed fiat conversion keeps dependent totals null/—
PASS | desktop joined-boundary fixture fiat-outage registry exposes no mutation forms or controls
PASS | desktop joined-boundary fixture all scenarios keep browser console clean
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
PASS | desktop mascot fixture DOM WebGL 3D switches all nine mapped mood motions without re-downloading — data-mascot-3d=on · calm→idle, happy→happy_clap, excited→excited_bounce, thinking→idle, worried→idle, sad→idle, sleepy→idle, proud→happy_clap, alert→idle · on→video→on (data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.48s/7.00s advancing · no canvas · static sprite hidden; data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video) · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s) · one GLB request
PASS | desktop mascot fixture DOM new server props refresh mood and preserve expanded mute — thinking → worried while muted: expanded controls retained, checkbox/aria-pressed/localStorage stay true, no bubble; unmute shows latest message
PASS | desktop mascot fixture DOM new mood restarts a finite transient bubble without expanding — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | desktop mascot fixture DOM changed message with the same mood restarts the bubble — alert source message expired; alert unreconciled message is newly visible while controls remain hidden
PASS | desktop mascot fixture DOM reduced motion keeps fallback video moving while CSS animation/fade is disabled — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 4.99s/7.00s advancing · no canvas · static sprite hidden · 13 expanded companion elements: CSS animation-name=none, transition durations=0; native video continues; collapse leaves compact chip · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | desktop mascot fixture console remains clean across every mood and prop transition
PASS | desktop fixture mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.75s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.29s/7.00s advancing · no canvas · static sprite hidden · 202/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.75s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
PASS | desktop mascot fixture DOM WebGL loading plays video then hands off to the live canvas — video → on · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.33s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · stopped/removed video · 64×95px unchanged card · one GLB · WebM-only request · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s)
PASS | desktop mascot fixture DOM WebGL resting chip plays idle without a click — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · no click · one GLB request
PASS | desktop mascot fixture WebGL resting idle changes rendered frames continuously — 3/3 distinct rendered frames · idle still live after announcement · same canvas
PASS | desktop mascot fixture DOM WebGL expand/collapse preserves canvas and switches idle to excited_bounce — idle → excited_bounce → idle twice (click + Escape) · same canvas/WebGL context · 126×189px expanded box / 128×262px card · 1 total GLB request
PASS | desktop mascot fixture DOM WebGL collapsed mood updates retain idle and the mounted canvas — excited → happy server props · still collapsed/idle · same canvas · one GLB request
PASS | desktop mascot fixture DOM WebGL resting reduced-motion toggle hands idle to video and restores live — on → video → on while collapsed · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.13s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · cached GLB
PASS | desktop mascot fixture DOM WebGL context loss switches the live idle canvas to playing video — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.15s/7.00s advancing · no canvas · static sprite hidden · one cached GLB request · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | desktop mascot fixture WebGL resting idle and transition console stays clean — zero page/console errors or Three/WebGL warnings
PASS | desktop mascot fixture DOM WebGL disabled plays video and restarts clips on expand/collapse — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.74s/7.00s advancing · no canvas · static sprite hidden · idle→happy_clap→idle with near-zero restarts · data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.16s/7.00s advancing · no canvas · static sprite hidden · zero GLB requests · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s)
PASS | desktop mascot fixture WebGL-disabled mascot fallback console is clean — zero page errors or Three/WebGL warnings
PASS | desktop mascot fixture DOM WebGL malformed GLB keeps playing video at rest and after expansion — data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.16s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.13s/7.00s advancing · no canvas · static sprite hidden · one request · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · zero page/video errors or Three/WebGL warnings
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
PASS | mobile fixture wallet keeps exact $1 rows and totals only displayed values
PASS | mobile fixture populated page fits viewport and keeps numbers honest — 0px horizontal overflow
PASS | mobile fixture older renders real app components
PASS | mobile fixture older history keeps enabled empty-period controls and restores All
PASS | mobile fixture empty renders real app components
PASS | mobile fixture empty history disables periods/days and states history starts today
PASS | mobile fixture filtered-empty renders real app components
PASS | mobile fixture all-small/unknown wallet has zero rows and only neutral empty copy
PASS | mobile fixture populated/empty/live/legacy interactions keep browser console clean
PASS | mobile joined-boundary fixture mixed home renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture mixed home has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture mixed home counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture mixed home pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture mixed home exposes no mutation forms or controls
PASS | mobile joined-boundary fixture mixed registry renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture mixed registry has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture mixed registry counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture mixed registry pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture mixed registry exposes no mutation forms or controls
PASS | mobile joined-boundary fixture empty home renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture empty home has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture empty home counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture empty home pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture empty home exposes no mutation forms or controls
PASS | mobile joined-boundary fixture empty registry renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture empty registry has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture empty registry counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture empty registry pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture empty registry exposes no mutation forms or controls
PASS | mobile joined-boundary fixture wholesale home renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture wholesale home has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture wholesale home counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture wholesale home pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture wholesale home exposes no mutation forms or controls
PASS | mobile joined-boundary fixture wholesale registry renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture wholesale registry has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture wholesale registry counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture wholesale registry pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture wholesale registry exposes no mutation forms or controls
PASS | mobile joined-boundary fixture failed home renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture failed home has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture failed home counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture failed home pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture failed home exposes no mutation forms or controls
PASS | mobile joined-boundary fixture failed registry renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture failed registry has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture failed registry counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture failed registry pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture failed registry exposes no mutation forms or controls
PASS | mobile joined-boundary fixture inventory home renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture inventory home has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture inventory home counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture inventory home pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture inventory home exposes no mutation forms or controls
PASS | mobile joined-boundary fixture inventory registry renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture inventory registry has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture inventory registry counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture inventory registry pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture inventory registry exposes no mutation forms or controls
PASS | mobile joined-boundary fixture eth-outage home renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture eth-outage home has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture eth-outage home counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture eth-outage home pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture eth-outage home keeps unavailable conversion dependencies null and renders no zero valuation — 0 and 0.1 ETH floors cannot mask failed NFT/native pricing; dependent totals stay null/—
PASS | mobile joined-boundary fixture eth-outage home exposes no mutation forms or controls
PASS | mobile joined-boundary fixture eth-outage registry renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture eth-outage registry has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture eth-outage registry counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture eth-outage registry pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture eth-outage registry keeps unavailable conversion dependencies null and renders no zero valuation — 0 and 0.1 ETH floors cannot mask failed NFT/native pricing; dependent totals stay null/—
PASS | mobile joined-boundary fixture eth-outage registry exposes no mutation forms or controls
PASS | mobile joined-boundary fixture fiat-outage home renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture fiat-outage home has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture fiat-outage home counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture fiat-outage home pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture fiat-outage home keeps unavailable conversion dependencies null and renders no zero valuation — all four market inputs are $0.999; failed fiat conversion keeps dependent totals null/—
PASS | mobile joined-boundary fixture fiat-outage home exposes no mutation forms or controls
PASS | mobile joined-boundary fixture fiat-outage registry renders the real page through buildJoinedPortfolio
PASS | mobile joined-boundary fixture fiat-outage registry has no suppressed rows, labels, attributes or comments
PASS | mobile joined-boundary fixture fiat-outage registry counts exactly its DOM rows and preserves source truth
PASS | mobile joined-boundary fixture fiat-outage registry pins independent totals, boundary, cash exemption and outage behavior
PASS | mobile joined-boundary fixture fiat-outage registry keeps unavailable conversion dependencies null and renders no zero valuation — all four market inputs are $0.999; failed fiat conversion keeps dependent totals null/—
PASS | mobile joined-boundary fixture fiat-outage registry exposes no mutation forms or controls
PASS | mobile joined-boundary fixture all scenarios keep browser console clean
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
PASS | mobile mascot fixture DOM WebGL 3D switches all nine mapped mood motions without re-downloading — data-mascot-3d=on · calm→idle, happy→happy_clap, excited→excited_bounce, thinking→idle, worried→idle, sad→idle, sleepy→idle, proud→happy_clap, alert→idle · on→video→on (data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.51s/7.00s advancing · no canvas · static sprite hidden; data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 126×189px unchanged box · DPR 1 · no video) · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s) · one GLB request
PASS | mobile mascot fixture DOM new server props refresh mood and preserve expanded mute — thinking → worried while muted: expanded controls retained, checkbox/aria-pressed/localStorage stay true, no bubble; unmute shows latest message
PASS | mobile mascot fixture DOM new mood restarts a finite transient bubble without expanding — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video
PASS | mobile mascot fixture DOM changed message with the same mood restarts the bubble — alert source message expired; alert unreconciled message is newly visible while controls remain hidden
PASS | mobile mascot fixture DOM reduced motion keeps fallback video moving while CSS animation/fade is disabled — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 4.75s/7.00s advancing · no canvas · static sprite hidden · 13 expanded companion elements: CSS animation-name=none, transition durations=0; native video continues; collapse leaves compact chip · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | mobile mascot fixture console remains clean across every mood and prop transition
PASS | mobile fixture mascot DOM reduced motion plays video without mounting WebGL — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.77s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 6.30s/7.00s advancing · no canvas · static sprite hidden · 218/5766 pixels changed across 700ms (62x93) · hidden pauses/visible resumes (/mascot/motion-idle.webm · readyState 4 · 720×720 · 1.79s/7.00s advancing) · zero WebGL probes/GLB requests · CSS animation/fade disabled · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · clean console
PASS | mobile mascot fixture DOM WebGL loading plays video then hands off to the live canvas — video → on · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.32s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · stopped/removed video · 64×95px unchanged card · one GLB · WebM-only request · hydration boundary retained only visible motion surfaces; 1 advancing-video proof(s)
PASS | mobile mascot fixture DOM WebGL resting chip plays idle without a click — 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · no click · one GLB request
PASS | mobile mascot fixture WebGL resting idle changes rendered frames continuously — 3/3 distinct rendered frames · idle still live after announcement · same canvas
PASS | mobile mascot fixture DOM WebGL expand/collapse preserves canvas and switches idle to excited_bounce — idle → excited_bounce → idle twice (click + Escape) · same canvas/WebGL context · 126×189px expanded box / 128×262px card · 1 total GLB request
PASS | mobile mascot fixture DOM WebGL collapsed mood updates retain idle and the mounted canvas — excited → happy server props · still collapsed/idle · same canvas · one GLB request
PASS | mobile mascot fixture DOM WebGL resting reduced-motion toggle hands idle to video and restores live — on → video → on while collapsed · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.21s/7.00s advancing · no canvas · static sprite hidden · data-mascot-3d=on · idle · clips idle,happy_clap,excited_bounce · 62×93px unchanged box · DPR 1 · no video · cached GLB
PASS | mobile mascot fixture DOM WebGL context loss switches the live idle canvas to playing video — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · one cached GLB request · hydration boundary retained only visible motion surfaces; 2 advancing-video proof(s)
PASS | mobile mascot fixture WebGL resting idle and transition console stays clean — zero page/console errors or Three/WebGL warnings
PASS | mobile mascot fixture DOM WebGL disabled plays video and restarts clips on expand/collapse — data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.72s/7.00s advancing · no canvas · static sprite hidden · idle→happy_clap→idle with near-zero restarts · data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.18s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.16s/7.00s advancing · no canvas · static sprite hidden · zero GLB requests · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s)
PASS | mobile mascot fixture WebGL-disabled mascot fallback console is clean — zero page errors or Three/WebGL warnings
PASS | mobile mascot fixture DOM WebGL malformed GLB keeps playing video at rest and after expansion — data-mascot-3d=video · happy_clap · /mascot/motion-happy-clap.webm · readyState 4 · 720×720 · 0.18s/7.00s advancing · no canvas · static sprite hidden · 64×95px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · data-mascot-3d=video · idle · /mascot/motion-idle.webm · readyState 4 · 720×720 · 0.14s/7.00s advancing · no canvas · static sprite hidden · one request · hydration boundary retained only visible motion surfaces; 3 advancing-video proof(s) · zero page/video errors or Three/WebGL warnings
PASS | Mascot motion surfaces never settle on the static fallback in codec-capable Chromium — post-hydration states observed: on/video
PASS | Mascot video fallback selects every contracted VP9 WebM clip — selected sources observed: /mascot/motion-excited-bounce.webm, /mascot/motion-happy-clap.webm, /mascot/motion-idle.webm

PASS | Mascot resting/occlusion summary — 10/10 checks passed at 1440×1000 and 390×844
PASS | Mascot DOM assertion summary — 50/50 checks passed (individual assertions printed above)
PASS | Mascot 3D/video fallback summary — 65/65 checks passed · data-mascot-3d states observed: on/video · selected video sources: /mascot/motion-excited-bounce.webm, /mascot/motion-happy-clap.webm, /mascot/motion-idle.webm

PASS | Mascot contract summary — 126/126 checks passed

PASS | UI contract summary — 499/499 checks passed
```

`Task-owned production server cleanup and branch verification`

```text
Stopped only task-owned production server PID 540592 on 127.0.0.1:59283.
Port 59283 is unused after shutdown (bind verified).
Branch: feat/dust-removal
```

`git diff --stat 3414f97`

```text
 REPORT-DUST-REMOVAL.md            | 706 ++++++++++++++++++++++++++++++++++++++
 lib/live-data.test.ts             | 139 +++++++-
 lib/live-data.ts                  |  33 +-
 lib/pnl-view.test.ts              |  27 +-
 lib/pnl-view.ts                   |   4 +-
 scripts/__fixtures__/dust-book.ts |  15 +
 scripts/ui-contract-check.mjs     |  68 +++-
 7 files changed, 947 insertions(+), 45 deletions(-)
```
