# PortManager — Status

As of: 2026-08-17

## State
- App: portmanager-psi.vercel.app (Next.js 16 + Neon serverless, no API routes)
- Repo: github.com/bodineden/portmanager — deploy key `~/.ssh/id_portmanager` (WRITE allowed, Bodin granted 2026-08-17)
- Local mirror: ~/projects/portmanager (auto-deploys to Vercel on push to main)
- Price cron: daily 08:00 UTC = 15:00 Bangkok, job 61421751b828, script ~/.hermes/scripts/portmanager_price_updater.sh
- Cron now updates BOTH prices and exchange rates (added 2026-08-17; FX from open.er-api.com, 6 pairs, verified saves)
- Data model: asset.current_price + asset.previous_price (column added 2026-08-17), price_history audit table, exchange_rate (now cron-updated)

## Key facts
- VUAG −84.67% change bug FIXED 2026-08-17: root cause was previous_price derived from price_history scan; now stored as column shifted atomically on save (commit ae8efcc)
- FX regex hardened 2026-08-17: spread trap (0.00014 vs 0.85494) + sanity bounds in fetch_rates
- Exchange rates refreshed 2026-08-17 12:33: USD/THB 33.14, GBP/THB 44.87, EUR/THB 38.34 + crosses. Holder value THB 138,249.81

## Next actions
- None urgent — prices + exchange rates both cron-updated daily (08:00 UTC)
