# PortManager — Status

As of: 2026-09-01

## State
- App: portmanager-psi.vercel.app (Next.js 16 + Neon serverless, no API routes)
- Repo: github.com/bodineden/portmanager — deploy key `~/.ssh/id_portmanager` (WRITE allowed)
- Local mirror: ~/projects/portmanager (auto-deploys to Vercel on push to main)
- **Price cron RETIRED 2026-09-01 (Bodin decision)** — job 61421751b828 PAUSED; the scraping updater is no longer the product (skill portmanager-price-updater marked RETIRED)
- **Live joined portfolio is the new home** (commit e5124fa):
  - Stocks port: Trading 212 Public API `/equity/positions` (live, env T212_API_KEY/T212_API_SECRET)
  - Crypto/NFT port: OpenSea wallet holdings + floors (env OPENSEA_API_KEY/NFT_WALLET, wallet 0xC1bd…c609, RH chain — currently 2× Stackers + 2× GOOFYZ)
  - FX live from open.er-api.com (ECB) + ETH price from CoinGecko; THB base
  - **Gmail login gate**: Google OAuth (PKCE) via `proxy.ts` (Next 16 middleware), allowlist env `ALLOWED_EMAILS` (defaults: putthiphan1608@gmail.com, physic.din@gmail.com), session = HMAC cookie `pm_session` (AUTH_SECRET). Gate arms only when GOOGLE_CLIENT_ID/SECRET are set — until then the site stays open (never bricks access mid-deploy)
  - Verified live post-deploy: gate redirects anonymous → /login; joined view renders wallet floors + FX with valid session; login/logout + error states OK
- Historical ledger pages (/asset-list, /holder-list, /exchange-rate, /portfolio) still work off Neon behind the login gate; their prices are now stale (no cron) — the home page is the live source of truth

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
- DATABASE_URL not present locally (Bodin shared 2026-08-18, keep out of git) — local dev shows NeonSetupPage; test against live prod
- Portfolio value time-series (/portfolio): daily total in THB, now Plottable 3

## Next actions
- **Bodin: create Google Cloud OAuth client** (Web application) for portmanager-psi.vercel.app with redirect URI `https://portmanager-psi.vercel.app/api/auth/callback`, then set these Vercel env vars to arm the gate + live data:
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (from the OAuth client)
  - `AUTH_SECRET` (any strong random string; the HMAC key for pm_session)
  - `T212_API_KEY`, `T212_API_SECRET` (from ~/.hermes/secrets/t212_api.json — same values as local)
  - `OPENSEA_API_KEY` (from ~/.opensea_api_key)
  - `ALLOWED_EMAILS` (defaults are correct: putthiphan1608@gmail.com,physic.din@gmail.com — set explicitly to be safe)
  - `NFT_WALLET` (defaults to 0xC1bd…c609 — set explicitly to be safe)
- Until GOOGLE_CLIENT_ID/SECRET are set, the site is open (gate dormant by design). After setting them, anonymous users get redirected to /login and only allowlisted Gmail accounts get in.
