# LeafRadar CSV Import

CSV import is the no-wait ingestion path for dispensaries that cannot provide Dutchie/Jane/Weedmaps API access yet.

## Run

```bash
npm run import:csv -- examples/menu-import.csv \
  --dispensary-id zen-leaf-lawrenceville \
  --name "Zen Leaf - Lawrenceville" \
  --city Lawrenceville \
  --county Mercer \
  --lat 40.2962 \
  --lng -74.7296 \
  --distance 2.1
```

The importer writes into the same local warehouse used by the Dutchie collector:

```text
data/leafradar-warehouse.json
```

Restart or refresh the API after import if it is already running.

## Required Columns

- `productName`
- `brand`
- `category`
- `format`
- `currentPrice`

## Optional Columns

- `originalPrice`
- `thc`
- `quantityAvailable`
- `dealText`

## Notes

- Category names are normalized into app categories like `flower`, `vapes`, `edibles`, `concentrates`, and `prerolls`.
- Savings percentage is calculated when `originalPrice` is present.
- Imported rows become durable observations and price-history points, so repeated imports build a historical price curve.
