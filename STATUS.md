# PortManager — Status

As of: 2026-09-05 (UTC)

## 2026-09-05: Run 3 — mascot guide (Sol gpt-6-astra ultra; commits 04a1784 assets + d21b7db feat + 23ecdce fix, merge 23ecdce)
- Bodin approved Run 3 after topping up the ChatGPT usage cap (first dispatch was cut at 42.9k tokens by the cap; re-dispatch completed at ~117k + 159k tokens).
- Guide: one anime character, 9 emotion sprites (calm/happy/excited/thinking/worried/sad/sleepy/proud/alert). Art = GPT-rendered sprites staged by parent from ~/projects/portmanager-mascot-assets (1024×1536 PNG) → committed webp 320×480 (100KB total) under public/mascot/. NO voice, no real-time 3D.
- Emotion derivation is PURE `lib/mascot.ts` `deriveMascotState(portfolio, now?)` with parent-authored copy (never states USD/THB numbers, never claims P&L on unrecorded basis, no advice/hype). Priority: sad (total outage) → alert (partial/unavailable, unreconciled, history-unavailable) → thinking (not-recorded) → worried (recorded negative) → happy (recorded positive) → excited (complete or ≥5% eligible) → proud (full coverage) → sleepy (UTC 0–6) → calm (healthy/empty). Empty healthy book stays calm even at night.
- Companion = floating client component mounted on the 4 logged-in pages (NOT /login), compact resting chip (62×93) + transient opaque bubble on state change + click-to-expand panel (mute checkbox + hide button, localStorage-persisted, session hide token). Reduced-motion safe; images have alt + explicit dimensions. lib/pnl-history.ts added `createSnapshotHistoryReader`/`readPortfolioSnapshotHistory` returning {snapshots, available} (empty ≠ unavailable) while preserving the old reader API.
- Parent visual QA caught occlusion (full panel + translucent bubble covered hero status/legend) → polish commit 23ecdce: collapsed default, opaque bubble, click-to-expand, occlusion checks at 1440×1000 + 390×844.
- Parent QA (independent): npm test 173/173 (12 files), lint 0 errors (1 pre-existing proxy.ts warning), build clean, UI contracts 297/297 (mascot 96/96 incl. resting/occlusion 8/8 + 26 DOM assertions), live verified (new build chunks serving; /login 200; /mascot asset gated 307 pre-auth as expected).
- Revert: tag `pre-pnl-mascot-2026-09-05` + snapshot `backups/site-pre-pnl-mascot-2026-09-05/` (diff-clean).
- Known flag: /mascot/* public assets are NOT in proxy.ts static allowlist → 307 pre-auth (fine post-login with session cookie; add to allowlist only if a public page ever needs them — proxy.ts is otherwise frozen).



## 2026-09-05: Run 2 — light USD restyle + P&L center (Sol gpt-6-astra ultra; commits 0ecd3b1 + 731128f, merge 731128f)
- Bodin: "continue to finish" after Run 1 shipped invisible-by-design. Full light restyle of EVERY page + P&L center on the locked reference design: body #F5F7FB, white cards 10px radius / 1px #DFE5F2 / shadow rgba(21,35,72,.07) 0 14px 35px, headings #11162E, muted #5B6680, **Outfit font**, **USD primary + THB secondary** (was dark + THB-primary). Dark theme removed (bp6-dark / Classes.DARK = 0 in app/).
- Home `/` = value hero → P&L metric strip → performance (value-vs-cost over `portfolio_snapshot`, 1M/3M/All) → allocation by class → UTC P&L calendar → per-asset P&L table (basisStatus chips t212-live / onchain-derived / airdrop-free / not-recorded + basisNote titles) → source strip. `/asset-list`, `/portfolio`, `/exchange-rate`, `/login` restyled; read-only + logout POST-only + wallet filter semantics preserved.
- **Honesty enforced**: current book has zero recorded basis → home renders "No recorded cost basis yet — P&L unavailable", values `—`, coverage partial 0 eligible; unreconciled/dust/unpriced excluded from sums with explicit labels; cash "value only, no P&L"; airdrop-free $0 basis but pnlPct `—`; THB never stale-rate. Nulls never rendered $0 (harness negative controls prove UI "unavailable" copy cannot waive known fixture data).
- Reader `listPortfolioSnapshots()` in lib/pnl-history.ts (SELECT-only, gated on isNeonConfigured, [] on failure, no DDL/seed). New pure lib/pnl-view.ts + 8 new lib test files/32 tests.
- Harness expanded 77 → **201 checks** (light tokens, /login both viewports, P&L states none/partial/complete, fixture-populated interactions: chart retry after failure, calendar day clicks + month nav, wallet $1 threshold + full-set totals). Independent review round 1 found 1 logic error (chart retry left blank after error → fixed 731128f + regression test) + 1 contract gap (live marker must be validated vs independent fixture → fixed with positive/negative controls).
- Parent QA (independent): npm test 112/112 (10 files), lint 0 errors (1 pre-existing proxy.ts warning), build clean, UI contracts 201/201, live verified (#F5F7FB rgb(245,247,251) body + Outfit on prod /login, 0 dark refs). Merged 731128f → pushed → Vercel auto-deploy.
- Revert: tag `pre-pnl-ui-2026-09-05` + snapshot `backups/site-pre-pnl-ui-2026-09-05/` (diff-verified clean).

## 2026-09-05: Run 1 — P&L data core (Sol gpt-6-astra ultra; commits b5526ea/9ca94a1/05e089f, merge 05e089f)
- Pure cost-basis engine + vocabulary `lib/pnl.ts`: `t212-live` (API avg cost + ppl, reconciliation guard → `unreconciled` excluded from sums), `onchain-derived` (requires verified acquisition evidence + historical payment-asset price), `airdrop-free` (verified no-payment only, basis $0, pnlPct null), `not-recorded` (never fake $0; dust <$1 and unpriced excluded from P&L). Additive `HoldingPnl` on every joined holding + `totals.costBasisUsd/Thb`, `pnlUsd/Thb`, `pnlPct`, `pnlCoverage`, `pnlByClass` (USD primary + THB mirrors, snapshot FX).
- `portfolio_snapshot` Neon table (idempotent DDL in lib/assets-db.ts; archive tables untouched) + recorder `lib/pnl-history.ts` (once per UTC day, ON CONFLICT DO NOTHING, injectable clock, 2s bound, error-swallow; hook behind isNeonConfigured in getJoinedPortfolio). No rendered-UI change in Run 1 (Bodin rule: data core first).
- Parent QA: npm test 79/79, lint 0 errors, build clean, UI contracts 77/77 (pre-restyle), independent Codex review PASS. Current book = no recorded basis anywhere (correct). Revert: tag `pre-pnl-astra-2026-09-05` + snapshot `backups/site-pre-pnl-astra-2026-09-05/`.


## 2026-09-04: Hide-under-$1 extended to HOME "Wallet Balances" panel (Bodin: "it still has not"; Sol gpt-5.6-sol ultra aa38d1d, merge 603b057)
- Gap: 2026-09-04 earlier round scoped the hide-under-$1 toggle to /asset-list only; home page Wallet Balances panel (the landing view) still rendered dust rows unfiltered. Bodin confirmed home was the surface (clarify 2026-09-04).
- Implementation: new client component `app/home-wallet-panel.tsx` (mirror of asset-list pattern) + server preformat in `app/page.tsx`; server page stays server. `WalletBalancesPanel` receives preformatted row views + full-set totals; `useState(true)` default ON (SSR no-flash); filter = `shouldHideWalletDust` (lib/dust-filter.ts unchanged): token hidden when unpriced or valueUsd < 1, native hidden when valueUsd < 1, native null-price stays visible; threshold strictly < 1.00.
- Display-only: header shows visible counts `N NATIVE · M TOKENS` + muted `(K hidden under $1)`; tfoot "Total wallet (priced)" + KPI 04 count remain FULL-SET truth; all-hidden edge renders one muted colSpan row (`All N wallet assets are hidden under $1 — uncheck ...`); empty/unavailable states + availability notes preserved. CSS added to app/home.css only.
- Harness: scripts/ui-contract-check.mjs + H1–H4 home checks (toggle default-on, default view hides unpriced/< $1, toggle restores full ordered set + totals unchanged, console clean).
- Parent QA (2026-09-04, independent): npm test 33/33 ✓, lint 0 errors (1 pre-existing proxy.ts warning) ✓, build clean ✓, UI contracts 77/77 ✓ (H2: 3/18 visible default; H3: 3 default → 18 restored, totals unchanged; H4 console clean). Merged 603b057 → pushed → Vercel auto-deploy. Revert: tag `pre-home-under1-2026-09-04` + snapshot `backups/site-pre-home-under1-2026-09-04/` (diff-verified clean).

## 2026-09-04: "Hide under $1" toggle on Asset List wallet registry (Bodin ask; Sol gpt-5.6-sol ultra, merge ea573cf)
- Bodin: "can we hide in the asset list first page anything under $1". Clarify answers: toggle **default ON** with show-all option; hide unpriced rows too; threshold = row USD value **strictly < 1.00** (exactly 1.00 stays). Scope question timed out → proceeded with **Asset List page Live Wallet Asset Registry only** (the first asset table, where the dust lives: Base native ≈ $0.24, sub-cent GME/SPY/CRCL/PLTR/AMZN/STACK, unpriced meme dust; USDG ≈ $1.48 stays). Home page wallet table untouched — offer to mirror if wanted.
- Implementation (Sol 51a13d9, worker on feat/under1-filter; parent QA'd, merged ea573cf): narrow client component `app/asset-list/wallet-asset-registry.tsx` (useState true, SSR default-on, no flash/hydration mismatch); server passes preformatted row views (byte-identical formatting, no live-data import into client bundle). Pure filter `lib/dust-filter.ts` + 7 unit tests: token hidden when `priced === false || (valueUsd !== null && valueUsd < 1)`; native hidden when `valueUsd !== null && valueUsd < 1`; **native valueUsd null stays visible** (ETH price feed down ≠ dust — never infer unknown = under $1). Toggle OFF restores all 18 rows.
- Display-only: tfoot "Total wallet (priced)" + all totals remain FULL-set truth; row count shows visible + muted "(N hidden under $1)". `.panel-count`, thead order, data-wallet-kind/priced attrs, native-before-token + priced-before-unpriced order, source badges, footer, empty states all preserved (74/74 UI contracts pass against local production build; toggle behavior verified in-browser: 3 visible default → 18 when OFF, totals unchanged, 0 console errors).
- Parent QA (2026-09-04): npm test 33/33 (was 26), lint 0 errors (1 pre-existing proxy.ts warning), build clean. Revert: tag `pre-under1-filter-2026-09-04` + snapshot `backups/site-pre-under1-filter-2026-09-04/`.

## State
- App: portmanager-psi.vercel.app (Next.js 16 + Neon serverless, no API routes)
- Repo: github.com/bodineden/portmanager — deploy key `~/.ssh/id_portmanager` (WRITE allowed)
- Local mirror: ~/projects/portmanager (auto-deploys to Vercel on push to main)
- **Price cron RETIRED 2026-09-01** — job 61421751b828 PAUSED; no scraping anywhere
- **UNIFIED LIVE PORTFOLIO (Sol ultra run, merge 9c37247, 334k tokens)** — the whole site is ONE live picture:
  - **One data core `getJoinedPortfolio()`** (lib/live-data.ts): T212 account summary + positions (live API), OpenSea NFT port (live floors), ECB FX (open.er-api), ETH/USD (CoinGecko). Home, portfolio, asset-list, and exchange-rate render from it — no page fetches live providers independently
  - **Portfolio model**: one portfolio; named allocation fields are no longer returned from lib/live-data.ts
  - T212 live today: **£487.00 cash GBP, 0 positions** → "No positions yet — stocks/ETFs you buy in T212 appear here live"
  - NFT port live: 2× Stackers + 2× G00fyz @ live floors ≈ 0.1831 ETH
  - Legacy scraped-era UI replaced: asset-list = read-only live registry, exchange-rate = read-only live rates, portfolio chart = live point + dashed legacy context with boundary marker
  - Neon DB untouched (schema/data) — remains history/cost-basis ledger only
  - Verified: build ✓, 14/14 unit tests ✓ (incl. 0.1831154 ETH arithmetic + £487×45=฿21,915), 70/70 UI contract checks ✓, live-render verified locally (฿35,672.63 total) + prod chunk match ✓
- **Gmail login gate**: Google OAuth (PKCE) via `proxy.ts`, allowlist `ALLOWED_EMAILS` (putthiphan1608@gmail.com, physic.din@gmail.com), HMAC session cookie `pm_session` (AUTH_SECRET). Gate arms only when GOOGLE_CLIENT_ID/SECRET set. **ARMED + verified live 2026-09-01** (anon → /login 307)

## 2026-09-03: Full wallet holdings + logout/auth fix + snapshot sync (Sol gpt-5.6-sol @ ultra, merge b73d90f)
- **Wallet non-NFT holdings now in the joined portfolio** (verified live 2026-09-03 by operator probes): native ETH on Ethereum (0.000781), Base (0.000099), **Arbitrum One (0.248396 — the material one, ≈$596)**, Robinhood Chain (0.000526); RH-chain ERC-20s via checked-in 13-contract registry (USDG 1.475 ≈$1.48 + sub-cent GME/SPY/CRCL/PLTR/AMZN/STACK + unpriced meme dust) — balances via RPC live; ERC-20 inventory on Ethereum/Base/Arbitrum via Blockscout v2 API (keyless). Unpriced rows show raw amount + "—" and never fake a zero.
- **Token pricing**: Blockscout exchange_rate hints → DefiLlama bulk → CoinGecko single-contract (1.2s spacing, cap 5, stop on 429). ETH/USD + FX unchanged.
- **Logout prefetch bug FIXED**: sidebar sign-out was `<Link href="/api/auth/logout">`; Next prefetched it → GET deleted pm_session → next tab = re-login. Now POST-only (405 on GET) + native form button; /login redirects already-signed-in users to /.
- **Snapshot sync**: single-flight 30s TTL cache around the whole fetch phase — pages/tabs within the window share one asOf + totals; cuts provider burst (T212 ~1 req/50s). Injectable clock + reset for tests.
- Verified: build ✓, tsc ✓, lint ✓ (1 pre-existing proxy warning), **26/26 unit tests ✓** (incl. exact BigInt arithmetic: grand ฿53,138.22713086259 with wallet fixtures), **89/89 UI contract checks ✓** (desktop+mobile, POST-only logout everywhere). Deployed 2026-09-03 (auto).
- Risk notes: RH registry is static (new RH tokens need a registry line); 30s cache is per-instance; OpenSea still omits 2 explorer-only RH NFTs (Clay Cooker, RH BTC) — flagged, not invented.

## 2026-08-22: NFT portfolio asset added (direct DB write via stored Neon creds)
- New asset **NFT / NFT portfolio**, GBP, current + previous price £67.36, NO source link (static valuation — cron's hardcoded 12-ticker list never touches it)
- £67.36 cash moved out of BOTH investors A and B (A 67.36 + B 67.36 = £134.72 total into NFT — confirmed by Bodin after an initial even-split assumption was corrected): A & B CASH GBP 616.635 → **549.275**, cost basis carried proportionally (23,765 → 21,168.96 THB)
- Each investor holds **1 share** of NFT portfolio @ £67.36; cost basis 2,596.04 THB each = exact carry-over (23,765 − 21,168.96) so total value AND gain/loss per investor unchanged by the transfer
- price_history row added (67.36, Aug 22) so /portfolio chart values it from today
- Verified live: holder-list shows NFT rows for A+B (1 sh, £67.36, THB 3,017.88 each); holdings 24 → 26

## 2026-08-25: New £89.79 into NFT portfolio (A+B 50/50, direct DB write)
- A and B each moved **£44.895** cash → NFT (total £89.79). CASH GBP 549.275 → **504.380** each; NFT shares 1.0 → **1.666493…** each (at £67.36 valuation); cost basis carried proportionally (NFT cost 2,596.04 → **4,326.29 THB** each, cash 21,168.96 → 19,438.71 THB)
- Invariant verified in-transaction: per-investor total cost unchanged at 23,765.00 THB — no phantom gain/loss
- **⚠ ASSUMPTION FLAGGED:** interpreted as NEW money on top (Bodin asked to "update", no reply within 60m to the addition-vs-correction clarify). If it was meant as the corrected TOTAL (replacing £134.72), say so — one message fixes it
- NFT position value now £224.51 total (was £134.72). Verified live: holder-list shows A+B NFT 1.666 sh @ £67.36, cash 504.38; C untouched

## 2026-08-30: +£223 NEW money into NFT portfolio (A+B 50/50, transfer dated 2026-08-29)
- Bodin: "223 pounds, equal 50/50 was transferred from A and B into NFT port" — this is **NEW money on top** (NOT a correction of the total; an initial correction read was wrong and reverted same day)
- Per investor: NFT shares 1.666493… → **3.321778503562945368171021378** (+111.50 / 67.36); CASH GBP 504.380 → **392.880** (−£111.50); cost carried proportionally: cash 19,438.71 → **15,141.52 THB**, NFT 4,326.29 → **8,623.48 THB**
- Invariant verified in-transaction: per-investor cash+NFT cost exactly **23,765.00 THB**; value unchanged at £616.635 (cash 392.88 + NFT £223.755) — no phantom gain/loss
- NFT position now **£447.51 total** (was £224.51) → **THB 20,017.60** @ 44.731024
- Verified live: holder-list A+B NFT 3.322 sh @ £67.36 = THB 10,008.79 each; cash 392.88; C untouched

## 2026-08-30: transactions ledger table added (audit trail)
- New `transactions` table in Neon; DDL added to `lib/assets-db.ts` createSchema (idempotent, commit a21ac6a → main, auto-deployed). No app behavior change — the app never reads it
- Columns: occurred_at, investor_id, from_asset_id (NULL = external deposit), to_asset_id, amount (source currency), shares (dest delta), price, cost_basis_delta (THB), note
- **Backfilled 9 rows**: initial capital A/B/C (2026-08-10, per STATUS record) + all NFT transfer legs (08-22 £67.36, 08-25 £44.895, 08-29 £111.50, × A/B) with exact cost deltas
- Rule going forward: every transfer/contribution logs one transactions row in the SAME DB transaction as the holding updates — history is now auditable in-DB, not only in this file

## Palantir-grade UI pass (Sol gpt-5.6-sol @ ultra, 2026-08-20, branch improve/palantir-ui → merge 9ec5a70)
- Full restyle to Palantir aesthetic: **Blueprint 6.18.0 + Plottable 3.13.0** (same stack as Organics dashboard), dark mission-control theme (#0B0E14 canvas, cyan accent #38BDF8, monospace numbers)
- All 6 pages redesigned: Command Center home, asset-list ops dashboard, holder management, FX control, asset-master redirect, portfolio analytics
- /portfolio chart PORTED to Plottable 3: daily THB series + dashed monthly average + 1M/3M/6M/ALL range — verified rendering
- HARD CONSTRAINTS preserved (verified live post-deploy): `input[aria-label="{TICKER} price"]` + Save per-asset forms; `select[name=fromCurrency/toCurrency]` + `input[name=rate]` + Save Rate; no API routes; DB schema + lib/ untouched; actions.ts untouched
- **Regression harness committed**: scripts/ui-contract-check.mjs — 35 checks (all asset price forms, add/edit, remove forms, FX form, console errors) — ran against LIVE prod: **35/35 PASS**
- Real updater run post-deploy: **`PortManager OK 2026-08-20 17:09: 12/12 updated, FX 6/6`**
- Screenshots: ~/projects/portmanager/ui-screenshots/ (home, asset-list, portfolio, holder-list, exchange-rate, asset-master)

## Key facts
- 15 assets now tracked (12 with price sources + CASH, CASH GBP, NFT) — contract check lists: CASH, CASH GBP, CNX1, EUNN, IKOR, IWDA, JEDI, NFT, NUCG, RBOT, SXRT, URNU, USPY, VUAG, XAU
- VUAG −84.67% change bug FIXED 2026-08-17: previous_price stored as column shifted atomically on save (commit ae8efcc)
- FX regex hardened 2026-08-17: spread trap + sanity bounds in fetch_rates
- DATABASE_URL not present locally (shared 2026-08-18, keep out of git) — local dev shows NeonSetupPage; test against live prod
- Portfolio value time-series (/portfolio): daily total in THB, now Plottable 3

## Next actions
- Verify login with both accounts (putthiphan1608@gmail.com + physic.din@gmail.com) at portmanager-psi.vercel.app — private window, sign in, check home + asset-list + exchange-rate all show the LIVE joined portfolio
- Vercel env (already set): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET + T212_API_KEY, T212_API_SECRET, OPENSEA_API_KEY, ALLOWED_EMAILS, NFT_WALLET
- The live app uses a single portfolio; the named allocation model has been removed
- Housekeeping: BRIEF.md/REPORT.md in repo root are untracked (worker artifacts); backups/ has pre-live-join snapshot; tag pre-live-join-0901

## 2026-09-03: Single portfolio — investor model removed (Bodin decision)
- Removed named investors and allocation splits from the rendered UI; the live app now presents one portfolio.
- Removed the ownership constants and field from `lib/live-data.ts`; deleted `/holder-list` and its sidebar, UI-contract, and capture entries.
- The Neon investor, holding, and transaction tables remain a frozen archive and were untouched.
- Verification: `npm run build` ✓; `npm run lint` ✓ (one pre-existing `proxy.ts` warning); `npm test` ✓ (26/26); rendered UI contracts ✓ (74/74); removed-token counts are zero across active/rendered targets and all new-state anchors pass. Three inert `/holder-list` cache invalidations remain in unimported legacy action modules, as directed.
- Revert pointers: git tag `pre-investor-removal-2026-09-03`; `backups/site-pre-investor-removal-2026-09-03/`.
