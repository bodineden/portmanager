# PortManager — Status

As of: 2026-08-18

## State
- App: portmanager-psi.vercel.app (Next.js 16 + Neon serverless, no API routes)
- Repo: github.com/bodineden/portmanager — deploy key `~/.ssh/id_portmanager` (WRITE allowed)
- Local mirror: ~/projects/portmanager (auto-deploys to Vercel on push to main)
- Price cron: daily 08:00 UTC = 15:00 Bangkok, job 61421751b828, script ~/.hermes/scripts/portmanager_price_updater.sh
- Cron updates BOTH prices and exchange rates (FX from open.er-api.com, 6 pairs, verified saves)
- Data model: asset.current_price + asset.previous_price (column, atomic shift on save), price_history audit table, exchange_rate
- Codex CLI (GPT-5.6 Sol) now logged in on this Linux box via device auth (2026-08-18) — full-pass improvements shipped

## Full product pass (Sol, 2026-08-18, commits f2656b2 + merge 7e5047e)
- /asset-list → real dashboard: asset cards, green/red change badges, portfolio summary header, sort (ticker/value/change), client-side search, responsive grid
- /portfolio: range selector (1M/3M/6M/ALL) + monthly-average dashed trend line on the SVG chart
- /holder-list: CSV export button (ticker, name, shares, price, value THB)
- "Biggest movers" panel on dashboard (from previous_price)
- Quality: README rewritten, icon.svg + layout metadata, vitest suite (3 tests, lib/portfolio-helpers.ts)
- HARD CONSTRAINTS preserved (verified in served DOM + code): `input[aria-label="{TICKER} price"]` + Save per-asset forms on /asset-list; `select[name=fromCurrency/toCurrency]` + `input[name=rate]` + Save Rate on /exchange-rate; no API routes; DB schema untouched

## Key facts
- VUAG −84.67% change bug FIXED 2026-08-17: root cause was previous_price derived from price_history scan; now stored as column shifted atomically on save (commit ae8efcc)
- FX regex hardened 2026-08-17: spread trap (0.00014 vs 0.85494) + sanity bounds in fetch_rates
- Exchange rates refreshed 2026-08-17 12:33: USD/THB 33.14, GBP/THB 44.87, EUR/THB 38.34 + crosses. Holder value THB 138,249.81
- Portfolio value time-series page added 2026-08-17 (/portfolio): daily total in THB from holding shares × as-of price × as-of FX, SVG chart + table. Verified current value matches holder list.
- KNOWN: price_history contains polluted rows from bug era → chart spikes on Aug 6 (+86k, XTB widget trap: VUAG/USPY ~720) and Aug 16 (+64k, another bad write corrected Aug 17). Needs DB cleanup (delete bad rows) — requires DATABASE_URL access.

## Next actions
- Clean polluted price_history rows (Aug 6: VUAG 720.42, USPY 720.84; Aug 16: investigate + delete bad rows) — need DATABASE_URL from Vercel env
