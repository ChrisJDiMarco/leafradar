# LeafRadar

iPhone-first MVP for New Jersey cannabis deal discovery.

LeafRadar is built as an Expo React Native app so it can run quickly in the iPhone Simulator and later graduate to a native iOS build when the data engine and compliance path are tighter.

## Current MVP

- 21+ age gate
- Live-style update timestamp
- NJ dispensary map with value-score pins
- Search and category filters
- Sort/radius/open-now/verified filter sheet
- Deal cards sorted by savings and distance
- Dispensary detail sheet
- Product detail sheet with 30-day price history
- Smart alert matches with an in-app alert builder
- Server-backed alert create/update/delete when the API is configured
- Expo push-token registration path for future deal notifications
- Saved deals, tracked savings, and editable shopper settings
- Local persistence for age confirmation, saved deals, alerts, and filters
- Seeded mock data shaped like the future ingestion pipeline
- Local backend API with deal, dispensary, alert, and price-history endpoints

## Run

```bash
npm run ios
```

Run the local API:

```bash
npm run warehouse:seed
npm run api
```

Run against Postgres/Supabase:

```bash
DATABASE_URL="postgres://..." DATABASE_SSL=true npm run db:migrate
DATABASE_URL="postgres://..." DATABASE_SSL=true npm run api
```

Point the iPhone app at the local API:

```bash
EXPO_PUBLIC_LEAFRADAR_API_URL=http://localhost:8787 npm run ios
```

## Data Path

The current app reads seeded data from `src/data/deals.ts`.

The app now prefers generated Dutchie data from `src/data/generated/dutchie.ts`. If no Dutchie sync has been run, it falls back to the seeded MVP data.

Run the Dutchie collector:

```bash
cp .env.example .env
npm run sync:dutchie
```

Import a dispensary CSV export while API partnerships are pending:

```bash
npm run import:csv -- examples/menu-import.csv \
  --dispensary-id zen-leaf-lawrenceville \
  --name "Zen Leaf - Lawrenceville" \
  --city Lawrenceville \
  --county Mercer \
  --lat 40.2962 \
  --lng -74.7296
```

The intended production pipeline is:

```text
menu source -> collector -> normalizer -> deal engine -> database -> mobile API
```

See `docs/backend-api.md`, `docs/csv-import.md`, `docs/dutchie-integration.md`, and `docs/data-pipeline.md` for the staged plan.
