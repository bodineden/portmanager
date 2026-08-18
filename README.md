# PortManager

PortManager is a personal portfolio tracker built with Next.js 16, React 19, Tailwind CSS 4, and Neon serverless Postgres. It values multi-currency holdings in Thai baht and keeps a daily history of asset prices, FX rates, and total portfolio value.

## Pages

- `/asset-list` — portfolio dashboard, asset price updates, daily movement, movers, asset registry, and price history.
- `/holder-list` — investors and holdings, valuation and gain/loss, plus CSV export.
- `/portfolio` — daily THB portfolio value with range filters and a monthly-average trend.
- `/exchange-rate` — native server-action form for recording currency pairs and rates.
- `/asset-master` — compact asset reference view.

All database writes use React server actions. There are no API routes.

## Data model

Neon stores `currency`, `investor`, `asset`, `holding`, `price_history`, and `exchange_rate` records. Assets are soft-deleted. A price update atomically shifts `current_price` into `previous_price` before saving the new value, which powers daily change reporting. Portfolio history is reconstructed as-of each price/FX date from the recorded histories.

## Automated price updates

Market data is not fetched by the app. A daily Playwright cron opens the deployed UI, fills each `<TICKER> price` field on `/asset-list`, saves it, and records exchange rates through the named fields on `/exchange-rate`. The “Refresh prices” control is intentionally cosmetic; the cron is the only external price source. Keep these UI contracts intact when changing forms.

## Local development

Requirements: Node.js 20+ and a Neon Postgres database.

1. Install dependencies with `npm install`.
2. Create `.env.local` and set `DATABASE_URL` to the Neon connection string.
3. Start the app with `npm run dev` and open `http://localhost:3000`.

The schema and seed rows are initialized by `lib/assets-db.ts` on first database use.

## Checks and deployment

- `npm test` runs the minimal Vitest helper suite.
- `npm run lint` runs ESLint.
- `npm run build` creates the production build.

Vercel deploys automatically when changes are pushed to `main`.
