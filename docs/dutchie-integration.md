# Dutchie POS Integration

## What Dutchie Gives Us

Dutchie's official POS API can support the LeafRadar pricing engine, but it is an authorized integration model, not an open public menu index.

Useful endpoints:

- `GET /whoami` validates the API key and returns location identity.
- `GET /products?isActive=true` returns the active product catalog and product-level prices. Requires the `Inventory` permission scope.
- `GET /reporting/inventory?includeLabResults=true&includeAllocated=true` returns available inventory, quantities, package-level prices, and optional lab data. Requires the `Reporting` permission scope.
- `GET /inventory?includeLabResults=true` is used as a fallback inventory endpoint when reporting access is unavailable.

Official docs:

- API docs home: https://api.pos.dutchie.com/
- Quick start: https://api.pos.dutchie.com/pages/quick-start.html
- Authentication: https://api.pos.dutchie.com/pages/authentication.html
- Permissions: https://api.pos.dutchie.com/pages/permissions.html
- OpenAPI spec: https://api.pos.dutchie.com/swagger/v001/swagger.json

## Auth Model

Dutchie uses HTTP Basic Auth with the API key as the username and an empty password.

```text
Authorization: Basic base64(api_key:)
```

Keys are vendor-specific and permission-scoped. In practice, LeafRadar needs either:

- each participating dispensary/location to authorize us and provide a scoped key, or
- a Dutchie partnership path that grants broader authorized access.

## Why This Runs Server-Side

Never put Dutchie API keys in the iPhone app. Mobile bundles are inspectable, so keys would leak.

LeafRadar's path is:

```text
Dutchie POS API
  -> scheduled Node sync
  -> normalized public price snapshot
  -> mobile app
```

## Local Setup

Create `.env` from `.env.example`.

```bash
cp .env.example .env
```

Use single-line JSON for `DUTCHIE_LOCATIONS_JSON`.

```text
DUTCHIE_LOCATIONS_JSON=[{"id":"dispensary-slug","apiKey":"key","latitude":40.4862,"longitude":-74.4518,"county":"Middlesex","distanceMiles":0}]
```

Run:

```bash
npm run sync:dutchie
```

Dry run:

```bash
npm run sync:dutchie -- --dry-run
```

## Output

The sync writes:

- `src/data/generated/dutchie.ts` for the mobile app
- `data/dutchie/latest-normalized.json` for local inspection
- `data/dutchie/snapshots/*.json` for price-history comparison
- `data/leafradar-warehouse.json` with durable warehouse tables for the API

`data/dutchie/` is gitignored because raw POS-derived inventory snapshots may be commercially sensitive.

## Current Normalization

The sync script:

- verifies each key with `/whoami`
- skips non-NJ locations unless `allowOutOfState` is set
- fetches active products
- prefers reporting inventory for available quantity and current price
- falls back to inventory, then product catalog prices
- maps Dutchie categories into LeafRadar categories
- calculates price-per-gram when weight is present
- detects price drops by comparing against the previous local snapshot
- generates app-ready `Dispensary[]` data
- appends durable `inventory_snapshots`, `deal_observations`, and `price_history` rows to the local warehouse

## Important Limitation

Dutchie can give us prices for authorized locations. It will not magically give us every NJ dispensary. For the MVP, the realistic path is to onboard a handful of dispensaries, prove traffic/referrals, then use that traction to get more locations connected.
