# LeafRadar Data Pipeline

## The Core Problem

Manual daily checking does not scale. LeafRadar needs an ingestion pipeline that can collect menu and deal data, normalize messy product names, detect real savings, and expose freshness timestamps users can trust.

## Recommended Source Strategy

### Tier 1: Official Menu/POS Integrations

Target dispensaries and menu platforms directly.

Likely source categories:

- Dutchie POS API or similar menu/POS feeds
- Jane menu integrations
- Weedmaps/Leafly menu feeds where available
- Direct dispensary CSV/API uploads

Pros: reliable, defensible, less brittle.

Cons: requires partnerships, API keys, legal review, and sales effort.

### Tier 2: Dispensary Dashboard

Give dispensaries a simple self-serve path:

- Upload daily deals
- Paste menu export
- Connect platform credentials
- Mark featured deals
- Set expiration windows

Pros: turns LeafRadar into a marketing channel for dispensaries.

Cons: requires adoption and validation.

### Tier 3: Public Menu Indexing

For MVP coverage, index public menu pages where permitted.

Capture:

- Product name
- Brand
- Category
- Size/format
- Current price
- Original price or sale badge
- THC/CBD where visible
- Last seen timestamp
- Source URL

Pros: fastest way to validate consumer demand.

Cons: ToS and maintenance risk; should be reviewed before production scale.

### Tier 4: Human Verification

Use manual review only for high-value/high-traffic cards:

- Top 10 statewide deals
- Suspicious price drops
- New source formats
- Dispensary-submitted promos

## Production Architecture

```text
collectors
  -> raw menu snapshots
  -> product normalizer
  -> category classifier
  -> deal detector
  -> price-history store
  -> mobile API
  -> alerts engine
```

## Production Store

`server/api.mjs` now supports two storage modes:

- Local mode: JSON warehouse at `data/leafradar-warehouse.json`
- Production mode: Postgres/Supabase via `DATABASE_URL`

Run migrations with:

```bash
DATABASE_URL="postgres://..." DATABASE_SSL=true npm run db:migrate
```

The Postgres schema lives in `server/schema.sql` and includes deal observations, price history, user alerts, push tokens, and alert event tables.

## Dutchie Collector

The first real collector is `scripts/sync-dutchie.mjs`.

It uses the official Dutchie POS API with server-side API keys:

- `/whoami` to identify the location
- `/products` to fetch the active catalog
- `/reporting/inventory` or `/inventory` to fetch current sellable inventory and prices

Dutchie's own docs recommend syncing into a local database/cache and serving the application from local data, not querying the POS API for every user interaction. LeafRadar follows that model by generating an app-readable snapshot.

See `docs/dutchie-integration.md`.

## CSV Partner Feed

The fastest non-manual path is `scripts/import-menu-csv.mjs`.

It lets a dispensary or operator import a daily menu export into the same warehouse as Dutchie:

```bash
npm run import:csv -- examples/menu-import.csv --name "Zen Leaf - Lawrenceville" --city Lawrenceville
```

This gives the MVP a practical launch path even before official API keys are approved. See `docs/csv-import.md`.

## MVP Database Shape

Core tables:

- `dispensaries`
- `menu_sources`
- `raw_menu_snapshots`
- `products`
- `normalized_products`
- `deal_observations`
- `price_history`
- `user_alerts`
- `saved_deals`

## Deal Engine

A deal is not just "price is low." Score it with:

- Current price vs observed 30-day average
- Savings percent
- Price per gram or price per mg
- Distance from user
- Stock confidence
- Source freshness
- Verification state

## Update Cadence

MVP:

- Morning refresh
- Optional evening refresh
- Manual verification for top statewide deals

Production:

- Every 2 to 6 hours for active sources
- Immediate refresh for dispensary-submitted deals
- Alert dispatch after deal score changes

## Alert Engine

`GET /api/alert-matches` now computes active alert matches from the latest deal index. It supports category, max price, brand, region, and radius filters, which covers the first MVP alerts:

- ounces under a target price
- carts under a target price
- brand-specific cart alerts
- BOGO/high-savings edible alerts
- South Jersey flower deals

## Compliance Notes

Apple currently allows legal cannabis apps only within strict boundaries. Apple says apps must not encourage illegal drug use, and apps facilitating legal cannabis sales must be submitted by a legal entity and geo-restricted to the legal jurisdiction. LeafRadar should begin as price intelligence with no checkout flow.

New Jersey's Cannabis Regulatory Commission states adult-use cannabis is for people 21 and older, and legal purchases must be from licensed dispensaries.

Sources:

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- NJ Cannabis Regulatory Commission adult-use page: https://www.nj.gov/cannabis/adult-personal/
