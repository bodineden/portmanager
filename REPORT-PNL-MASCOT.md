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

**Companion behavior**

`app/mascot-companion.tsx` and its dedicated CSS add a bottom-right image card using existing light tokens, Outfit, rounded borders and shadows. The original 320×480 WebP sprites retain explicit intrinsic dimensions and meaningful `PortManager guide — <mood>` alt text. Display width is 128px on desktop and 104px on mobile; backgrounds are displayed as supplied, without treating the art as transparent cutouts.

The server and first hydration render show the guide. `useSyncExternalStore` loads browser preferences after hydration. Bubbles remain for six seconds, fade once over 160ms, and become a small status dot. Reduced motion disables that transition; there is no looping animation or voice. Changed mood/message props or unmuting starts a fresh finite bubble.

`Mute guide` is a labelled native checkbox exposed as a toggle button with `aria-pressed`, Space and Enter activation. Muting hides bubbles while preserving the sprite. `Hide guide` is a non-form `button type="button"`. The only new control labels are those two safe labels. Existing POST-only sidebar logout is untouched.

Mute persists in `localStorage` under `portmanager:mascot:muted`. Hide stores the current document's `performance.timeOrigin` under `portmanager:mascot:hidden-document`: it survives client navigation but resets on reload, following the brief's explicit reload rule. Storage failure falls back to current-document memory so controls still work without browser errors. Mute changes synchronize between open documents.

The fixed wrapper has `pointer-events: none`; only the visible bubble/card receive pointer events. Blank bounds and a faded bubble pass clicks through. The sidebar remains above the guide. The guide's visible card necessarily overlays a small part of the content; Hide makes that area accessible. Existing page layout/styles are unchanged.

**Verification and human review limits**

`lib/mascot.test.ts` adds 56 tests covering all nine moods, each live/partial/unavailable source, total outage specialization, unreconciled priority, history evidence, basis priority, null/nonfinite/zero-eligible guards, exact excited threshold, complete coverage/exclusions, UTC boundaries, healthy empty books, immutable input and actual pure joined airdrop-free fixtures. `lib/mascot-history.test.ts` adds five offline tests for the availability boundary. All 112 existing tests remain unmodified.

The browser harness extends the existing production-route and synthetic fixture checks. It verifies four logged-in mounts and login absence at 1440px and 390px; SSR markup; sprite loading, dimensions and alt text; fixture moods and qualitative copy constraints; mute, hide and persistence; finite bubble timing, reduced motion, safe control labels, pointer boundaries and sidebar access; clean browser console; and horizontal overflow of at most one pixel. Fixture data is synthetic and the fixture server remains outside the app routes.

Bubbles intentionally carry no monetary or percentage numbers: only the dashboard can display amounts with the relevant observation and eligibility context. Mood reflects a supplied observation, never a prediction, recommendation or statement about unrecorded holdings. Unknown value remains unknown, including during complete provider outages.

The human review should consider the documented priority/copy conflict resolutions, the additional bounded history read on three pages, the deliberately small floating card, and the brief's Hide-reset-on-reload behavior. Local production QA uses the existing temporary `/tmp/portmanager-pnl-offline.mjs` preload, which rejects external fetches and supplies no invented provider responses. Actual provider credentials and configured production authentication remain for the parent's live verification after merge; no auth/proxy settings were changed.

**Printed self-QA**

All checks completed successfully. The production build passed twice: the first build ran the local production harness, and the final build checked the completed fixture-entry TypeScript as well. Full tests were repeated after the fixture changes settled; the final count remains 112 existing + 56 mood + 5 history-availability = **173**. Lint has only the allowed pre-existing proxy warning. The full harness passed its previous 201 checks plus **80 mascot checks**, for **281/281**.

```text
npm test
RUN v4.1.10 /home/user/projects/portmanager
Test Files  12 passed (12)
      Tests  173 passed (173)
   Start at  09:16:33
   Duration  1.94s (transform 946ms, setup 0ms, import 2.11s, tests 1.72s, environment 1ms)

npm notice run portmanager@0.1.0 lint
npm notice run eslint

/home/user/projects/portmanager/proxy.ts
  19:10  warning  'b64urlEncode' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)

npm notice run portmanager@0.1.0 build
npm notice run next build
▲ Next.js 16.2.6 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 4.0s
  Running TypeScript ...
  Finished TypeScript in 2.5s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/5) ...
  Generating static pages using 7 workers (1/5)
  Generating static pages using 7 workers (2/5)
  Generating static pages using 7 workers (3/5)
✓ Generating static pages using 7 workers (5/5) in 90ms
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
✓ Ready in 60ms

node scripts/ui-contract-check.mjs
PASS | desktop / mascot server HTML defaults visible only after login — visible sprite present before hydration
PASS | desktop / mascot renders an accessible sprite and read-only controls — sad · matching WebP/alt · 320×480 · number-free copy · safe controls
PASS | desktop / mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | desktop /asset-list mascot server HTML defaults visible only after login — visible sprite present before hydration
PASS | desktop /asset-list mascot renders an accessible sprite and read-only controls — sad · matching WebP/alt · 320×480 · number-free copy · safe controls
PASS | desktop /asset-list mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | desktop /portfolio mascot server HTML defaults visible only after login — visible sprite present before hydration
PASS | desktop /portfolio mascot renders an accessible sprite and read-only controls — sad · matching WebP/alt · 320×480 · number-free copy · safe controls
PASS | desktop /portfolio mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | desktop /exchange-rate mascot server HTML defaults visible only after login — visible sprite present before hydration
PASS | desktop /exchange-rate mascot renders an accessible sprite and read-only controls — sad · matching WebP/alt · 320×480 · number-free copy · safe controls
PASS | desktop /exchange-rate mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | desktop /asset-master mascot server HTML defaults visible only after login — visible sprite present before hydration
PASS | desktop /asset-master mascot renders an accessible sprite and read-only controls — sad · matching WebP/alt · 320×480 · number-free copy · safe controls
PASS | desktop /asset-master mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | desktop /login mascot server HTML defaults visible only after login — absent from login HTML
PASS | desktop /login mascot remains absent after hydration
PASS | desktop production mascot interaction route loads
PASS | desktop production mascot mute hides the bubble, retains the sprite and persists on reload
PASS | desktop production mascot bubble settles once into a status dot after six seconds
PASS | desktop production mascot hide survives real client navigation and resets on reload — hidden across all four pages in one document; visible after reload
PASS | desktop production mascot interaction and hydration console stays clean
PASS | mobile / mascot server HTML defaults visible only after login — visible sprite present before hydration
PASS | mobile / mascot renders an accessible sprite and read-only controls — sad · matching WebP/alt · 320×480 · number-free copy · safe controls
PASS | mobile / mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile /asset-list mascot server HTML defaults visible only after login — visible sprite present before hydration
PASS | mobile /asset-list mascot renders an accessible sprite and read-only controls — sad · matching WebP/alt · 320×480 · number-free copy · safe controls
PASS | mobile /asset-list mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile /portfolio mascot server HTML defaults visible only after login — visible sprite present before hydration
PASS | mobile /portfolio mascot renders an accessible sprite and read-only controls — sad · matching WebP/alt · 320×480 · number-free copy · safe controls
PASS | mobile /portfolio mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile /exchange-rate mascot server HTML defaults visible only after login — visible sprite present before hydration
PASS | mobile /exchange-rate mascot renders an accessible sprite and read-only controls — sad · matching WebP/alt · 320×480 · number-free copy · safe controls
PASS | mobile /exchange-rate mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile /asset-master mascot server HTML defaults visible only after login — visible sprite present before hydration
PASS | mobile /asset-master mascot renders an accessible sprite and read-only controls — sad · matching WebP/alt · 320×480 · number-free copy · safe controls
PASS | mobile /asset-master mascot preserves navigation, page hit targets and viewport bounds — 0px overflow · nav clickable · blank overlay passes through
PASS | mobile /login mascot server HTML defaults visible only after login — absent from login HTML
PASS | mobile /login mascot remains absent after hydration
PASS | mobile production mascot interaction route loads
PASS | mobile production mascot mute hides the bubble, retains the sprite and persists on reload
PASS | mobile production mascot bubble settles once into a status dot after six seconds
PASS | mobile production mascot hide survives real client navigation and resets on reload — hidden across all four pages in one document; visible after reload
PASS | mobile production mascot interaction and hydration console stays clean
PASS | desktop mascot fixture portfolio-live derives calm — Healthy empty joined holding set, no recorded gain or loss.
PASS | desktop mascot fixture portfolio-unavailable derives sad — Every source offline and joined total unknown.
PASS | desktop mascot fixture portfolio-mascot-thinking derives thinking — Sources all live; one holding has no acquisition basis.
PASS | desktop mascot fixture portfolio-mascot-worried derives worried — Eligible recorded loss beats otherwise complete coverage.
PASS | desktop mascot fixture portfolio-mascot-happy derives happy — Recorded gain below threshold; dust excluded, no missing basis.
PASS | desktop mascot fixture portfolio-mascot-excited derives excited — Recorded gain with full basis coverage, even below threshold.
PASS | desktop mascot fixture portfolio-mascot-proud derives proud — Flat recorded P&L and every holding eligible.
PASS | desktop mascot fixture portfolio-mascot-sleepy derives sleepy — Healthy flat eligible subset with dust; no higher priority state.
PASS | desktop mascot fixture portfolio-mascot-alert derives alert — One partial source outranks a recorded gain.
PASS | desktop mascot fixture portfolio-mascot-history-unavailable derives alert — All sources live but snapshot history unavailable.
PASS | desktop mascot fixture portfolio-mascot-unreconciled derives alert — An unreconciled holding outranks missing acquisition basis.
PASS | desktop mascot fixture portfolio-mascot-excited-partial derives excited — Threshold reached with excluded dust, without claiming full coverage.
PASS | desktop mascot fixture portfolio-mascot-airdrop derives happy — Verified free acquisition has positive recorded P&L and no percentage; dust keeps coverage partial.
PASS | desktop mascot fixture portfolio-mascot-null-pnl derives calm — Only excluded dust; unknown P&L never implies a gain or loss.
PASS | desktop mascot fixture covers all nine distinct mood sprites — 9 mood sprites loaded with intrinsic dimensions and meaningful alt text
PASS | desktop mascot fixture new server props refresh mood and preserve mute
PASS | desktop mascot fixture reduced motion disables mascot animation and fade
PASS | desktop mascot fixture console remains clean across every mood and prop transition
PASS | mobile mascot fixture portfolio-live derives calm — Healthy empty joined holding set, no recorded gain or loss.
PASS | mobile mascot fixture portfolio-unavailable derives sad — Every source offline and joined total unknown.
PASS | mobile mascot fixture portfolio-mascot-thinking derives thinking — Sources all live; one holding has no acquisition basis.
PASS | mobile mascot fixture portfolio-mascot-worried derives worried — Eligible recorded loss beats otherwise complete coverage.
PASS | mobile mascot fixture portfolio-mascot-happy derives happy — Recorded gain below threshold; dust excluded, no missing basis.
PASS | mobile mascot fixture portfolio-mascot-excited derives excited — Recorded gain with full basis coverage, even below threshold.
PASS | mobile mascot fixture portfolio-mascot-proud derives proud — Flat recorded P&L and every holding eligible.
PASS | mobile mascot fixture portfolio-mascot-sleepy derives sleepy — Healthy flat eligible subset with dust; no higher priority state.
PASS | mobile mascot fixture portfolio-mascot-alert derives alert — One partial source outranks a recorded gain.
PASS | mobile mascot fixture portfolio-mascot-history-unavailable derives alert — All sources live but snapshot history unavailable.
PASS | mobile mascot fixture portfolio-mascot-unreconciled derives alert — An unreconciled holding outranks missing acquisition basis.
PASS | mobile mascot fixture portfolio-mascot-excited-partial derives excited — Threshold reached with excluded dust, without claiming full coverage.
PASS | mobile mascot fixture portfolio-mascot-airdrop derives happy — Verified free acquisition has positive recorded P&L and no percentage; dust keeps coverage partial.
PASS | mobile mascot fixture portfolio-mascot-null-pnl derives calm — Only excluded dust; unknown P&L never implies a gain or loss.
PASS | mobile mascot fixture covers all nine distinct mood sprites — 9 mood sprites loaded with intrinsic dimensions and meaningful alt text
PASS | mobile mascot fixture new server props refresh mood and preserve mute
PASS | mobile mascot fixture reduced motion disables mascot animation and fade
PASS | mobile mascot fixture console remains clean across every mood and prop transition
PASS | Mascot contract summary — 80/80 checks passed
PASS | UI contract summary — 281/281 checks passed

Grep anchors and protected-file checks
PASS | mascot-companion mounts = 4 pages (app/portfolio/page.tsx, app/asset-list/page.tsx, app/page.tsx, app/exchange-rate/page.tsx); login = 0
PASS | meaningful mood alt text + explicit 320×480 dimensions; 9 committed sprites
PASS | new control labels: Mute guide / Hide guide; banned words = 0
PASS | bp6-dark in app/ = 0
PASS | protected auth/data/config/package/page design files unchanged
PASS | companion has no live-data import, provider access or voice
```

The production checks recorded zero horizontal overflow at both viewport widths, and no browser errors. Visual inspection of the local desktop/mobile screenshots confirmed the rounded full-body sprite, readable bubble and accessible navigation. Screenshots and raw command logs remain in `/tmp/portmanager-pnl-mascot-qa/` rather than the commit. The local production server was stopped after QA.

Independent read-only review found no additional implementation defects; it specifically confirmed the four additive mounts, legacy history-reader compatibility, protected-file preservation and the documented copy/priority decisions. `git diff --check` passed. Only the fifteen implementation/test/harness/report paths belong to this change; pre-existing briefs, reports, backups and screenshots are excluded. Delivery is restricted to `feat/pnl-mascot`; main and deployment are reserved for the parent. The existing rollback tag is `pre-pnl-mascot-2026-09-05`, with the supplied `backups/site-pre-pnl-mascot-2026-09-05/` snapshot untouched.
