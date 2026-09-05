# PortManager Run 3 — mascot companion

Date: 2026-09-05. Branch: `feat/pnl-mascot`, starting at `04a1784` with the nine supplied sprites already committed. The change adds the guide, pure emotion derivation, tests, four server mounts, snapshot availability evidence, and browser fixtures/checks. No deployment is part of this run.

**Emotion derivation and copy**

`lib/mascot.ts` exports pure `deriveMascotState(portfolio, now?)`, returning only `{ mood, message }`. It consumes joined source statuses, grand total, eligible P&L/percentage and coverage counts, plus explicit snapshot availability. An optional `basisHistoryComplete` fact supports audited incomplete history; current mounts use the existing `notRecorded` count. It does no I/O, holdings arithmetic, mutation, storage access or ambient clock read. Its default clock is the observation's `asOf`; pages explicitly inject `new Date()` for current UTC.

The following first-match rules are implemented. Total outage specializes the alert family into `sad`; all remaining alert conditions precede basis and P&L moods.

| Order | Mood | Trigger |
|---|---|---|
| 1 | sad | All seven sources unavailable, or null grand total with all five account/inventory sources unavailable. Live FX/price quotes alone do not make holdings visible. |
| 2 | alert | Unreconciled holdings, then any partial/unavailable source, then explicitly unavailable snapshot history. |
| 3 | thinking | `notRecorded > 0` or explicit incomplete acquisition history. This precedes recorded subset outcomes. |
| 4 | worried | Eligible count positive and finite recorded `pnlUsd < 0`. |
| 5 | excited | Eligible finite positive P&L and complete coverage, or finite percentage at least five percentage points. |
| 6 | happy | Eligible finite positive P&L below the excited condition; a missing percentage does not invent one. |
| 7 | proud | Finite recorded flat P&L, complete/source-complete coverage, positive eligible count equal to all holdings, and every exclusion count zero. |
| 8 | calm | Explicit healthy empty/cash-only exception, including nighttime. |
| 9 | sleepy | UTC hour in `[0, 6)` with no higher state. |
| 10 | calm | Remaining normal/flat/unknown-recorded-outcome state. |

Null/nonfinite P&L and zero eligible holdings cannot trigger signed outcome moods or recorded-coverage pride. An unknown grand total alone does not prove that all providers are down. Verified `airdrop-free` acquisitions remain eligible with real zero basis; their positive recorded P&L can select happy/excited while percentage stays unknown.

| Mood / reason | Exact bubble copy |
|---|---|
| alert / source | Heads up — some sources are partial or offline. I'll only cheer what I can verify. |
| alert / unreconciled | Heads up — some holdings are unreconciled. I'll only cheer what I can verify. |
| alert / snapshot history | Heads up — snapshot history is unavailable. I'll only cheer what I can verify. |
| sad | I can't see the full book right now — sources are offline. Value stays honest: unknown, not zero. |
| thinking | Still mapping cost basis. Where I have no clean acquisition record I won't guess a number. |
| worried | Recorded P&L is down on the eligible set. It's data, not a verdict. |
| happy | Recorded gains on the eligible set. Basis-verified, not vibes. |
| excited / complete | Now that's a picture — recorded gains with full basis coverage. |
| excited / partial | Now that's a picture — recorded gains on the eligible set. Basis coverage is partial. |
| proud | Full picture: every holding has a recorded basis. That's the ideal state. |
| sleepy | It's late UTC — I'll keep the night watch. The book renders as-is. |
| calm | All quiet. I'm tracking value now; P&L lands when basis does. |

The brief has overlapping instructions, so these resolutions are explicit rather than claims of literal compliance with incompatible rules: applying “any unavailable” first would make sad unreachable; happy expressly excludes the excited threshold despite appearing earlier in the numbered list; partial-threshold excitement cannot honestly claim full coverage; history-only/unreconciled-only alerts cannot honestly claim source outages. The nine original messages are preserved verbatim where their statements are supported, with the three factual variants shown above. The explicit healthy-empty calm note takes precedence over sleepy. Each message is at most 100 characters. Tests enforce exact copy, the length bound, and absence of currency values, percentages, advice or predictions.

**Server mounts and history evidence**

| Route | Mount |
|---|---|
| `/` | `app/page.tsx` |
| `/asset-list` | `app/asset-list/page.tsx` |
| `/portfolio` | `app/portfolio/page.tsx` |
| `/exchange-rate` | `app/exchange-rate/page.tsx` |
| `/login` | None |

Each page derives mood/message after its existing `getJoinedPortfolio()` call. `MascotCompanion` receives only that small serializable result. Its import of `MascotState` is type-only; no live-data import enters the companion's client bundle. There is no layout-level mount. The compatibility `/asset-master` redirect inherits the destination registry's single companion.

`lib/pnl-history.ts` adds `createSnapshotHistoryReader` and `readPortfolioSnapshotHistory`, returning `{ snapshots, available }`. A successful empty result is available; absent configuration, malformed/rejected records, query/construction failure or timeout report unavailable. Valid rows remain usable even if other records are rejected. Existing `createSnapshotReader`/`listPortfolioSnapshots` callers retain their array return values and fail-soft behavior. Home reuses its existing history read; the other three pages add one bounded SELECT. The recorder, SQL selection, normalization and two-second timeout behavior are preserved. This introduces no provider, API or database mutation.

**Polish round — occlusion fix**

This round starts from `d21b7db` on `feat/pnl-mascot` and implements `BRIEF-PNL-MASCOT-FIX.md`. The parent's production visual QA identified that the always-expanded card and controls obscured the home value hero's metadata and class legend. It also identified underlying text showing through the bubble. The earlier visual acceptance is superseded by this finding and the checks below.

The change is restricted to `app/mascot-companion.tsx`, `app/mascot-companion.css`, mascot assertions in `scripts/ui-contract-check.mjs`, and this report. `lib/mascot.ts`, its mood/message contract, all page mounts, data/API/auth/proxy/package files, dependencies and supplied sprites remain unchanged.

**Final interaction model**

The companion starts collapsed. Its resting card is 64px wide and about 96px tall, with a 2:3 sprite, 12px corners, app border/shadow tokens and a tiny status dot. No bubble or controls remain once the initial announcement finishes. The sprite retains its intrinsic 320×480 dimensions and `PortManager guide — <mood>` alt text.

Initial load, changed mood/message values and unmuting start a finite announcement. The bubble displays for six seconds, then its text fades for 160ms before the bubble is removed. Its white background and every ancestor remain fully opaque throughout: only the text fades, so underlying dashboard text cannot show through the surface. The bubble uses a 1px #DFE5F2 border, 10px corners, the standard shadow and Outfit. Reduced motion removes the text transition and settles directly after six seconds.

The native `Toggle guide` button exposes `aria-expanded`. Clicking or keyboard activation expands the card to 128px with the current bubble and the labelled `Mute guide` checkbox and `Hide guide` button. An expanded bubble stays available until collapse or mute. Clicking the chip again or pressing Escape within the companion collapses it immediately to the resting chip and returns focus to the chip. A later mood/message change starts a new finite announcement without resetting expansion or remounting focused controls.

Mute hides bubbles while retaining the chip, exposes the checkbox state through `aria-pressed`, and supports Space and Enter. It persists across prop changes, navigation and reload under the existing `portmanager:mascot:muted` key. Hide preserves the existing `portmanager:mascot:hidden-document` token: dismissal survives client navigation within this document, and reload restores the collapsed companion. Browser storage failure retains the existing in-memory fallback; mute synchronization across documents is preserved.

The fixed wrapper matches the compact or expanded card width and has `pointer-events: none`; only visible surfaces receive pointer events. The bubble is positioned above the card. Page layouts are unchanged, and the sidebar remains above the companion.

**Verification**

The unchanged unit suite covers 112 existing tests, 56 pure mood/copy tests and five snapshot availability tests: **173/173 across 12 files**. The original harness baseline was 201 other UI checks plus 80 mascot checks (**281/281**). The final harness passes **297/297** checks: **201 other UI checks + 96 mascot checks**, including **26 screenshot-free DOM assertions** and **8 resting/occlusion checks**. This adds 16 mascot checks to the original baseline. The updated harness preserves those contracts while adapting controls, persistence and timers to the collapsed/expanded model, and adds explicit resting, opacity, keyboard and home occlusion assertions.

Production QA runs at **1440×1000** and **390×844**. It distinguishes first-view text hit tests at scroll position zero from any below-fold targets that need a separate scroll into view. It checks hero status/as-of/explanatory text and every class legend label/value, not only body overflow. Console, all nine mood sprites, login absence, source honesty and existing UI contracts remain part of the harness.

Local production QA uses the existing `/tmp/portmanager-pnl-offline.mjs` preload, which rejects external fetches without fabricating provider data. This exercises genuine unavailable-provider rendering; the existing separate browser fixture server supplies synthetic data for deterministic mood and prop-transition coverage. It does not change application authentication or proxy configuration. Standalone fixtures inherit the declared Arial fallback because they do not load Next’s root layout; the harness checks their inherited body font and strictly requires Outfit on the production origin.

**Printed self-QA — polish round**

All required commands completed successfully. Lint reports **0 errors** and the single pre-existing `proxy.ts` unused-function warning. The production build passes. Both viewports show a **64×95px** resting card with **3/3 hero metadata text targets and 12/12 class legend text targets visible and hit-testable in the first view**; none needed scrolling. No browser console, page or hydration errors were recorded.

```text
npm test
 Test Files  12 passed (12)
      Tests  173 passed (173)
   Duration  2.60s (transform 1.39s, setup 0ms, import 2.80s, tests 2.08s, environment 1ms)

npm run lint
npm notice run portmanager@0.1.0 lint
npm notice run eslint

/home/user/projects/portmanager/proxy.ts
  19:10  warning  'b64urlEncode' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)

npm run build
npm notice run portmanager@0.1.0 build
npm notice run next build
▲ Next.js 16.2.6 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 5.2s
  Running TypeScript ...
  Finished TypeScript in 2.5s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/5) ...
  Generating static pages using 7 workers (1/5)
  Generating static pages using 7 workers (2/5)
  Generating static pages using 7 workers (3/5)
✓ Generating static pages using 7 workers (5/5) in 101ms
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

NODE_OPTIONS=--import=/tmp/portmanager-pnl-offline.mjs npm run start -- --hostname 127.0.0.1 --port 8125
npm notice run portmanager@0.1.0 start
npm notice run next start --hostname 127.0.0.1 --port 8125
▲ Next.js 16.2.6
- Local:         http://127.0.0.1:8125
- Network:       http://127.0.0.1:8125
✓ Ready in 59ms

node scripts/ui-contract-check.mjs
PASS | desktop production mascot DOM transient bubble is opaque white without alpha — computed background rgb(255, 255, 255) · opacity 1 through every ancestor · #DFE5F2 border · 10px radius · app body font Outfit, Arial, sans-serif, Arial, sans-serif
PASS | desktop production mascot DOM resting chip has no visible bubble or controls after six seconds — 64×95px chip · 2:3 sprite · tiny status dot · no visible bubble or controls · settled in 5523ms after initial DOM checks · opaque through fade · no repeat
PASS | desktop production mascot DOM resting occlusion leaves home hero as-of/status metadata visible and hittable — hero as-of/status metadata: 3/3 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | desktop production mascot DOM resting occlusion leaves home class legend visible and hittable — four-class legend labels and USD/THB values: 12/12 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | desktop production mascot DOM click expands the current bubble and controls; panel stays expanded — 128px panel · aria-expanded=true · visible safe controls · current bubble visible · bubble and controls remain visible beyond the transient deadline
PASS | desktop production mascot DOM second click collapses back to the resting chip — 64×95px chip · 2:3 sprite · tiny status dot · no visible bubble or controls
PASS | desktop production mascot DOM keyboard expands; Escape from expanded controls collapses and restores chip focus — Enter and Space expand; Escape from Mute guide and Hide guide collapses, aria-expanded=false, focus returns to chip
PASS | desktop production mascot DOM mute hides the bubble, retains the sprite and persists on reload — mute checkbox/aria-pressed/localStorage agree · expanded sprite stays visible · reload rests silently · Space/Enter unmute restore current bubble
PASS | desktop production mascot DOM hide removes the companion, survives client navigation and resets on reload — companion absent across all four pages in one document; collapsed chip restored after reload; independent mute preference retained
PASS | desktop production mascot DOM interaction and hydration console stays clean — zero page errors, hydration errors or console errors
PASS | mobile production mascot DOM transient bubble is opaque white without alpha — computed background rgb(255, 255, 255) · opacity 1 through every ancestor · #DFE5F2 border · 10px radius · app body font Outfit, Arial, sans-serif, Arial, sans-serif
PASS | mobile production mascot DOM resting chip has no visible bubble or controls after six seconds — 64×95px chip · 2:3 sprite · tiny status dot · no visible bubble or controls · settled in 5505ms after initial DOM checks · opaque through fade · no repeat
PASS | mobile production mascot DOM resting occlusion leaves home hero as-of/status metadata visible and hittable — hero as-of/status metadata: 3/3 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | mobile production mascot DOM resting occlusion leaves home class legend visible and hittable — four-class legend labels and USD/THB values: 12/12 text targets intersect first view and are unoccluded/hittable; 0 outside/partial first-view targets separately scrolled fully into view and hit-tested
PASS | mobile production mascot DOM click expands the current bubble and controls; panel stays expanded — 128px panel · aria-expanded=true · visible safe controls · current bubble visible · bubble and controls remain visible beyond the transient deadline
PASS | mobile production mascot DOM second click collapses back to the resting chip — 64×95px chip · 2:3 sprite · tiny status dot · no visible bubble or controls
PASS | mobile production mascot DOM keyboard expands; Escape from expanded controls collapses and restores chip focus — Enter and Space expand; Escape from Mute guide and Hide guide collapses, aria-expanded=false, focus returns to chip
PASS | mobile production mascot DOM mute hides the bubble, retains the sprite and persists on reload — mute checkbox/aria-pressed/localStorage agree · expanded sprite stays visible · reload rests silently · Space/Enter unmute restore current bubble
PASS | mobile production mascot DOM hide removes the companion, survives client navigation and resets on reload — companion absent across all four pages in one document; collapsed chip restored after reload; independent mute preference retained
PASS | mobile production mascot DOM interaction and hydration console stays clean — zero page errors, hydration errors or console errors
PASS | desktop mascot fixture covers all nine distinct mood sprites — 9 mood sprites loaded with intrinsic dimensions and meaningful alt text
PASS | desktop mascot fixture DOM new server props refresh mood and preserve expanded mute — thinking → worried while muted: expanded controls retained, checkbox/aria-pressed/localStorage stay true, no bubble; unmute shows latest message
PASS | desktop mascot fixture DOM new mood restarts a finite transient bubble without expanding — 64×95px chip · 2:3 sprite · tiny status dot · no visible bubble or controls
PASS | desktop mascot fixture DOM changed message with the same mood restarts the bubble — alert source message expired; alert unreconciled message is newly visible while controls remain hidden
PASS | desktop mascot fixture reduced motion disables mascot animation and fade — 12 expanded companion elements: animation-name=none, transition durations=0; collapse leaves compact chip
PASS | mobile mascot fixture covers all nine distinct mood sprites — 9 mood sprites loaded with intrinsic dimensions and meaningful alt text
PASS | mobile mascot fixture DOM new server props refresh mood and preserve expanded mute — thinking → worried while muted: expanded controls retained, checkbox/aria-pressed/localStorage stay true, no bubble; unmute shows latest message
PASS | mobile mascot fixture DOM new mood restarts a finite transient bubble without expanding — 64×95px chip · 2:3 sprite · tiny status dot · no visible bubble or controls
PASS | mobile mascot fixture DOM changed message with the same mood restarts the bubble — alert source message expired; alert unreconciled message is newly visible while controls remain hidden
PASS | mobile mascot fixture reduced motion disables mascot animation and fade — 12 expanded companion elements: animation-name=none, transition durations=0; collapse leaves compact chip
PASS | Mascot resting/occlusion summary — 8/8 checks passed at 1440×1000 and 390×844
PASS | Screenshot-free mascot DOM assertion summary — 26/26 checks passed (individual DOM assertions printed above)
PASS | Mascot contract summary — 96/96 checks passed
PASS | UI contract summary — 297/297 checks passed
```

These DOM assertions prove the complete interaction sequence without screenshots: quiet chip without bubble/controls; click expansion with both visible; opaque white bubble through dismissal; persistent mute across server prop changes and reload; document-scoped hide across all four companion pages; Escape collapse with focus restoration; and clean consoles. Separate checks retain all nine moods, same-mood message refresh, finite announcements, unchanged-prop quiet state and reduced motion.

Independent read-only implementation and production DOM reviews found no further defects. `git diff --check` passes. Raw command output remains in `/tmp/portmanager-mascot-fix-{test,lint,build,start,harness}.log`; the first harness run exposed a fixture-font assertion assumption, which was corrected before the complete passing run. No screenshots were required for this polish QA. The local production server was stopped after verification.

Only the four scoped files are included in this polish commit. Pre-existing untracked briefs, reports, backups and screenshots remain excluded. Delivery is restricted to `feat/pnl-mascot`; main and deployment are untouched. The existing rollback tag `pre-pnl-mascot-2026-09-05` and supplied backup are unchanged.
