# LeafRadar API

The app can read from a local backend while keeping bundled fallback data for demos. In production, set `DATABASE_URL` to switch the API to Postgres/Supabase.

## Run

```bash
npm run api
```

Default URL:

```text
http://localhost:8787
```

To make the iPhone app boot from the API:

```bash
EXPO_PUBLIC_LEAFRADAR_API_URL=http://localhost:8787 npm run ios
```

If the API is unavailable, the app falls back to bundled seed/Dutchie-generated data.

## Postgres/Supabase Mode

```bash
DATABASE_URL="postgres://..." DATABASE_SSL=true npm run db:migrate
DATABASE_URL="postgres://..." DATABASE_SSL=true npm run api
```

When `DATABASE_URL` is present, the API uses Postgres for deal reads, alerts, and push tokens. Without it, the API uses the local JSON warehouse at `data/leafradar-warehouse.json`.

## Endpoints

- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/dispensaries`
- `GET /api/dispensaries/:id`
- `GET /api/deals?category=flower&q=ounce`
- `GET /api/price-history/:dealId`
- `GET /api/alerts`
- `POST /api/alerts`
- `PATCH /api/alerts/:id`
- `DELETE /api/alerts/:id`
- `GET /api/alert-matches`
- `POST /api/push-tokens`

## Data Source Priority

1. Postgres/Supabase when `DATABASE_URL` is set
2. `data/leafradar-warehouse.json` from `npm run warehouse:seed`, `npm run sync:dutchie`, or `npm run import:csv`
3. `data/dutchie/latest-normalized.json` from `npm run sync:dutchie`
4. `server/seed-data.json`

Seed the local warehouse:

```bash
npm run warehouse:seed
```

Import a partner/menu CSV:

```bash
npm run import:csv -- examples/menu-import.csv --name "Zen Leaf - Lawrenceville" --city Lawrenceville
```

## Alert Matches

`GET /api/alert-matches` evaluates active `user_alerts` against the latest indexed deals and returns matching deal cards grouped by alert. This is the backend path for push/email/SMS notifications later.

## Alert Writes

`POST /api/alerts` creates or upserts an alert:

```json
{
  "id": "custom-carts-under-35",
  "label": "Carts under $35",
  "category": "vapes",
  "maxPrice": 35,
  "radiusMiles": 25,
  "region": "NJ",
  "active": true
}
```

`PATCH /api/alerts/:id` updates alert fields such as `active`, `maxPrice`, or `radiusMiles`.

`DELETE /api/alerts/:id` removes an alert.

## Push Tokens

`POST /api/push-tokens` stores an Expo push token for later notification dispatch:

```json
{
  "expoPushToken": "ExponentPushToken[...]",
  "platform": "ios",
  "userId": "anonymous"
}
```

## Database Schema

`server/schema.sql` is the Postgres/Supabase-ready shape for:

- dispensaries
- menu source credentials/connection state
- normalized products
- raw inventory snapshots
- deal observations
- price history
- user alerts
- push tokens
- alert events

This is the bridge from the current local API to Supabase or any Postgres host.

## Local Warehouse

`server/warehouse.mjs` is the file-backed version of the schema. It writes:

- `dispensaries`
- `menu_sources`
- `products`
- `inventory_snapshots`
- `deal_observations`
- `price_history`
- `user_alerts`
- `push_tokens`
- `alert_events`

The file lives at `data/leafradar-warehouse.json` and is gitignored because production snapshots can contain commercially sensitive menu data.
