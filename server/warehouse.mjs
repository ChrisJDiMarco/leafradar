import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const WAREHOUSE_PATH = 'data/leafradar-warehouse.json';

export function readWarehouse(root = process.cwd()) {
  const warehousePath = path.join(root, WAREHOUSE_PATH);

  if (!existsSync(warehousePath)) {
    return createEmptyWarehouse();
  }

  const emptyWarehouse = createEmptyWarehouse();
  const savedWarehouse = JSON.parse(readFileSync(warehousePath, 'utf8'));

  return {
    ...emptyWarehouse,
    ...savedWarehouse,
    user_alerts: mergeById(emptyWarehouse.user_alerts, savedWarehouse.user_alerts || []),
  };
}

export function writeWarehouse(root = process.cwd(), warehouse) {
  const warehousePath = path.join(root, WAREHOUSE_PATH);
  mkdirSync(path.dirname(warehousePath), { recursive: true });
  writeFileSync(warehousePath, `${JSON.stringify(warehouse, null, 2)}\n`);
}

export function warehouseExists(root = process.cwd()) {
  return existsSync(path.join(root, WAREHOUSE_PATH));
}

export function applyDispensarySync({
  provider = 'Dutchie',
  rawSnapshots = [],
  root = process.cwd(),
  syncedAt = new Date(),
  syncedDispensaries,
}) {
  const warehouse = readWarehouse(root);
  const syncedAtIso = syncedAt.toISOString();

  warehouse.updated_at = syncedAtIso;

  for (const dispensary of syncedDispensaries) {
    upsertById(warehouse.dispensaries, {
      city: dispensary.city,
      county: dispensary.county,
      id: dispensary.id,
      latitude: dispensary.latitude,
      longitude: dispensary.longitude,
      distance_miles: dispensary.distanceMiles,
      menu_source: provider,
      name: dispensary.name,
      open_now: dispensary.openNow,
      state: 'NJ',
      updated_at: syncedAtIso,
      value_score: dispensary.valueScore,
    });

    const sourceId = `${provider.toLowerCase()}:${dispensary.id}`;
    upsertById(warehouse.menu_sources, {
      dispensary_id: dispensary.id,
      id: sourceId,
      last_synced_at: syncedAtIso,
      provider,
      provider_location_id: dispensary.id,
      status: 'active',
    });

    const snapshotId = `snapshot:${dispensary.id}:${syncedAtIso}`;
    const rawSnapshot = rawSnapshots.find((snapshot) => dispensary.id.startsWith(snapshot.locationId));
    upsertById(warehouse.inventory_snapshots, {
      dispensary_id: dispensary.id,
      id: snapshotId,
      raw_payload: rawSnapshot || { dealCount: dispensary.deals.length },
      source_id: sourceId,
      synced_at: syncedAtIso,
    });

    for (const deal of dispensary.deals) {
      const productId = stableProductId(deal);

      upsertById(warehouse.products, {
        brand: deal.brand,
        category: deal.category,
        description: deal.description || deal.dealText,
        format: deal.format,
        id: productId,
        normalized_name: deal.productName,
        provider,
        provider_product_id: deal.id,
        thc: deal.thc,
        updated_at: syncedAtIso,
      });

      warehouse.deal_observations.push({
        current_price: deal.currentPrice,
        deal_id: deal.id,
        deal_text: deal.dealText,
        dispensary_id: dispensary.id,
        id: `observation:${deal.id}:${syncedAtIso}`,
        observed_at: syncedAtIso,
        original_price: deal.originalPrice || null,
        price_per_unit: deal.pricePerUnit,
        product_id: productId,
        savings_pct: deal.savingsPct,
        snapshot_id: snapshotId,
        strength: deal.strength,
        verification: deal.verification,
      });

      const historyPoints = deal.priceHistory?.length
        ? deal.priceHistory.map((point) => ({
            observed_date: historyLabelToDate(point.date, syncedAt),
            price: point.price,
          }))
        : [{ observed_date: dateOnly(syncedAtIso), price: deal.currentPrice }];

      for (const point of historyPoints) {
        upsertPriceHistory(warehouse.price_history, {
          dispensary_id: dispensary.id,
          id: `price:${dispensary.id}:${productId}:${point.observed_date}:${provider.toLowerCase()}`,
          observed_date: point.observed_date,
          price: point.price,
          product_id: productId,
          source: provider,
        });
      }
    }
  }

  trimWarehouse(warehouse);
  writeWarehouse(root, warehouse);

  return warehouse;
}

export function buildDatasetFromWarehouse(root = process.cwd()) {
  const warehouse = readWarehouse(root);

  if (!warehouse.dispensaries.length || !warehouse.deal_observations.length) {
    return null;
  }

  const latestObservationByDealId = new Map();

  for (const observation of warehouse.deal_observations) {
    const current = latestObservationByDealId.get(observation.deal_id);

    if (!current || new Date(observation.observed_at) > new Date(current.observed_at)) {
      latestObservationByDealId.set(observation.deal_id, observation);
    }
  }

  const productById = new Map(warehouse.products.map((product) => [product.id, product]));
  const historyByProductAndDispensary = groupPriceHistory(warehouse.price_history);
  const observations = [...latestObservationByDealId.values()];
  const observationsByDispensary = groupBy(observations, (observation) => observation.dispensary_id);

  const dispensaries = warehouse.dispensaries
    .map((dispensary) => {
      const dispensaryObservations = observationsByDispensary.get(dispensary.id) || [];
      const deals = dispensaryObservations
        .map((observation) => observationToDeal({
          dispensary,
          history:
            historyByProductAndDispensary.get(`${observation.dispensary_id}:${observation.product_id}`) || [],
          observation,
          product: productById.get(observation.product_id),
        }))
        .sort((a, b) => {
          if (b.savingsPct !== a.savingsPct) {
            return b.savingsPct - a.savingsPct;
          }

          return a.currentPrice - b.currentPrice;
        });

      if (!deals.length) {
        return null;
      }

      return {
        averageSavings: Math.round(
          deals.reduce((total, deal) => total + deal.savingsPct, 0) / Math.max(deals.length, 1),
        ),
        city: dispensary.city,
        county: dispensary.county,
        dealCount: deals.length,
        deals,
        distanceMiles: dispensary.distance_miles || 0,
        id: dispensary.id,
        latitude: dispensary.latitude,
        longitude: dispensary.longitude,
        menuSource: dispensary.menu_source,
        name: dispensary.name,
        openNow: dispensary.open_now,
        updatedAt: formatUpdatedAt(new Date(dispensary.updated_at || warehouse.updated_at)),
        valueScore: dispensary.value_score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.valueScore - a.valueScore);

  return {
    dispensaries,
    source: 'Local warehouse',
    updatedAt: formatUpdatedAt(new Date(warehouse.updated_at)),
  };
}

export function createEmptyWarehouse() {
  return {
    deal_observations: [],
    dispensaries: [],
    inventory_snapshots: [],
    menu_sources: [],
    price_history: [],
    products: [],
    push_tokens: [],
    updated_at: null,
    user_alerts: [
      {
        active: true,
        category: 'flower',
        id: 'ounces-under-120',
        label: 'Ounces under $120',
        max_price: 120,
        region: 'NJ',
      },
      {
        active: true,
        category: 'vapes',
        id: 'carts-under-25',
        label: 'Carts under $25',
        max_price: 25,
        radius_miles: 15,
      },
      {
        active: true,
        brand: 'Cookies',
        category: 'vapes',
        id: 'cookies-carts-under-40',
        label: 'Cookies carts under $40',
        max_price: 40,
      },
      {
        active: true,
        category: 'edibles',
        id: 'bogo-edibles',
        label: 'BOGO edibles',
      },
      {
        active: true,
        category: 'flower',
        id: 'south-jersey-flower',
        label: 'South Jersey Flower Deals',
        region: 'South Jersey',
      },
    ],
    version: 1,
  };
}

export function listWarehouseAlerts(root = process.cwd()) {
  return readWarehouse(root).user_alerts;
}

export function createWarehouseAlert(root = process.cwd(), alert) {
  const warehouse = readWarehouse(root);
  const nextAlert = storageAlertFromPayload(alert);

  upsertById(warehouse.user_alerts, nextAlert);
  warehouse.updated_at = new Date().toISOString();
  writeWarehouse(root, warehouse);

  return nextAlert;
}

export function updateWarehouseAlert(root = process.cwd(), id, patch) {
  const warehouse = readWarehouse(root);
  const existing = warehouse.user_alerts.find((alert) => alert.id === id);

  if (!existing) {
    return null;
  }

  const nextAlert = storageAlertFromPayload({
    ...existing,
    ...patch,
    id,
  });

  upsertById(warehouse.user_alerts, nextAlert);
  warehouse.updated_at = new Date().toISOString();
  writeWarehouse(root, warehouse);

  return nextAlert;
}

export function deleteWarehouseAlert(root = process.cwd(), id) {
  const warehouse = readWarehouse(root);
  const beforeCount = warehouse.user_alerts.length;
  warehouse.user_alerts = warehouse.user_alerts.filter((alert) => alert.id !== id);

  if (warehouse.user_alerts.length === beforeCount) {
    return false;
  }

  warehouse.updated_at = new Date().toISOString();
  writeWarehouse(root, warehouse);

  return true;
}

export function upsertWarehousePushToken(root = process.cwd(), token) {
  const warehouse = readWarehouse(root);
  const now = new Date().toISOString();
  const nextToken = {
    active: token.active !== false,
    created_at: token.created_at || now,
    device_id: token.deviceId || token.device_id || null,
    expo_push_token: token.expoPushToken || token.expo_push_token,
    id: token.id || `push:${token.expoPushToken || token.expo_push_token}`,
    last_registered_at: now,
    platform: token.platform || null,
    user_id: token.userId || token.user_id || 'anonymous',
  };

  upsertById(warehouse.push_tokens, nextToken);
  warehouse.updated_at = now;
  writeWarehouse(root, warehouse);

  return nextToken;
}

function storageAlertFromPayload(alert) {
  return {
    active: alert.active !== false,
    brand: emptyToNull(alert.brand),
    category: emptyToNull(alert.category),
    id: alert.id || `alert:${Date.now()}`,
    label: alert.label || 'Custom alert',
    max_price: numberOrNull(alert.maxPrice ?? alert.max_price),
    radius_miles: numberOrNull(alert.radiusMiles ?? alert.radius_miles),
    region: emptyToNull(alert.region),
    user_id: alert.userId || alert.user_id || 'anonymous',
  };
}

function observationToDeal({ dispensary, history, observation, product }) {
  const prices = history.map((point) => point.price);
  const currentPrice = Number(observation.current_price);
  const lowestPrice = prices.length ? Math.min(...prices, currentPrice) : currentPrice;
  const highestPrice = prices.length ? Math.max(...prices, currentPrice) : observation.original_price || currentPrice;
  const averagePrice = prices.length
    ? Math.round(prices.reduce((total, price) => total + price, 0) / prices.length)
    : currentPrice;

  return {
    averagePrice,
    brand: product?.brand || 'Unknown brand',
    category: product?.category || 'flower',
    currentPrice,
    dealText: observation.deal_text,
    description: product?.description,
    expiresIn: 'next sync',
    format: product?.format || 'unit',
    highestPrice,
    id: observation.deal_id,
    lowestPrice,
    originalPrice: observation.original_price || undefined,
    priceHistory: history.map((point) => ({
      date: point.label,
      price: point.price,
    })),
    pricePerUnit: observation.price_per_unit || `${formatCurrency(currentPrice)}/unit`,
    productName: product?.normalized_name || 'Unnamed product',
    savingsPct: observation.savings_pct || 0,
    strength: observation.strength || 'fair',
    thc: product?.thc,
    verification: observation.verification || 'verified',
  };
}

function groupPriceHistory(priceHistory) {
  const grouped = new Map();

  for (const point of priceHistory) {
    const key = `${point.dispensary_id}:${point.product_id}`;
    const existing = grouped.get(key) || [];
    existing.push({
      label: formatHistoryDate(point.observed_date),
      observed_date: point.observed_date,
      price: Number(point.price),
    });
    grouped.set(key, existing);
  }

  for (const points of grouped.values()) {
    points.sort((a, b) => new Date(a.observed_date) - new Date(b.observed_date));
  }

  return grouped;
}

function groupBy(items, getKey) {
  const grouped = new Map();

  for (const item of items) {
    const key = getKey(item);
    const existing = grouped.get(key) || [];
    existing.push(item);
    grouped.set(key, existing);
  }

  return grouped;
}

function upsertById(items, nextItem) {
  const index = items.findIndex((item) => item.id === nextItem.id);

  if (index === -1) {
    items.push(nextItem);
    return;
  }

  items[index] = {
    ...items[index],
    ...nextItem,
  };
}

function mergeById(baseItems, overrideItems) {
  const merged = [...baseItems];

  for (const item of overrideItems) {
    upsertById(merged, item);
  }

  return merged;
}

function upsertPriceHistory(items, nextItem) {
  const index = items.findIndex(
    (item) =>
      item.dispensary_id === nextItem.dispensary_id &&
      item.product_id === nextItem.product_id &&
      item.observed_date === nextItem.observed_date &&
      item.source === nextItem.source,
  );

  if (index === -1) {
    items.push(nextItem);
    return;
  }

  items[index] = {
    ...items[index],
    ...nextItem,
  };
}

function trimWarehouse(warehouse) {
  warehouse.deal_observations = warehouse.deal_observations
    .sort((a, b) => new Date(b.observed_at) - new Date(a.observed_at))
    .slice(0, 10000)
    .sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));

  warehouse.inventory_snapshots = warehouse.inventory_snapshots
    .sort((a, b) => new Date(b.synced_at) - new Date(a.synced_at))
    .slice(0, 1000);
}

function stableProductId(deal) {
  return `product:${slugify(`${deal.brand}-${deal.productName}-${deal.format}`)}`;
}

function dateOnly(value) {
  return value.slice(0, 10);
}

function historyLabelToDate(label, syncedAt) {
  if (!label || String(label).toLowerCase() === 'today') {
    return dateOnly(syncedAt.toISOString());
  }

  const parsed = new Date(`${label} ${syncedAt.getUTCFullYear()} 00:00:00 UTC`);

  if (Number.isNaN(parsed.getTime())) {
    return dateOnly(syncedAt.toISOString());
  }

  return dateOnly(parsed.toISOString());
}

function formatHistoryDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  const today = new Date().toISOString().slice(0, 10);

  if (dateValue === today) {
    return 'Today';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function formatUpdatedAt(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(date);
}

function formatCurrency(value) {
  return `$${Number(value).toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}`;
}

function emptyToNull(value) {
  return value === undefined || value === null || value === '' || value === 'all' ? null : value;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
