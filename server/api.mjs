#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import {
  buildDatasetFromWarehouse,
  createWarehouseAlert,
  deleteWarehouseAlert,
  listWarehouseAlerts,
  updateWarehouseAlert,
  upsertWarehousePushToken,
  warehouseExists,
} from './warehouse.mjs';
import {
  buildDatasetFromPostgres,
  createPostgresAlert,
  deletePostgresAlert,
  listPostgresAlerts,
  postgresConfigured,
  updatePostgresAlert,
  upsertPostgresPushToken,
} from './postgres-store.mjs';

const PORT = Number(process.env.PORT || 8787);
const ROOT = process.cwd();
const DUTCHIE_DATA_PATH = path.join(ROOT, 'data/dutchie/latest-normalized.json');
const SEED_DATA_PATH = path.join(ROOT, 'server/seed-data.json');

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'OPTIONS') {
    return sendJson(response, 204, null);
  }

  try {
    if (url.pathname === '/api/health') {
      return sendJson(response, 200, {
        ok: true,
        service: 'leafradar-api',
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === '/api/bootstrap') {
      return sendJson(response, 200, await readDataset());
    }

    if (url.pathname === '/api/dispensaries') {
      const dataset = await readDataset();
      return sendJson(response, 200, {
        dispensaries: dataset.dispensaries,
        source: dataset.source,
        updatedAt: dataset.updatedAt,
      });
    }

    if (url.pathname.startsWith('/api/dispensaries/')) {
      const id = decodeURIComponent(url.pathname.replace('/api/dispensaries/', ''));
      const dispensary = (await readDataset()).dispensaries.find((item) => item.id === id);

      if (!dispensary) {
        return sendJson(response, 404, { error: 'Dispensary not found' });
      }

      return sendJson(response, 200, { dispensary });
    }

    if (url.pathname === '/api/deals') {
      return sendJson(response, 200, {
        deals: filterDeals(indexDeals((await readDataset()).dispensaries), url.searchParams),
      });
    }

    if (url.pathname.startsWith('/api/price-history/')) {
      const id = decodeURIComponent(url.pathname.replace('/api/price-history/', ''));
      const deal = indexDeals((await readDataset()).dispensaries).find((item) => item.id === id);

      if (!deal) {
        return sendJson(response, 404, { error: 'Deal not found' });
      }

      return sendJson(response, 200, {
        dealId: id,
        history: getPriceHistory(deal),
        stats: getPriceStats(deal),
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/alerts') {
      return sendJson(response, 200, {
        alerts: await readAlerts(),
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/alerts') {
      const payload = await readJsonBody(request);
      const alert = await createAlert(payload);

      return sendJson(response, 201, {
        alert: alertRowToApi(alert),
      });
    }

    if (url.pathname.startsWith('/api/alerts/')) {
      const id = decodeURIComponent(url.pathname.replace('/api/alerts/', ''));

      if (request.method === 'PATCH') {
        const payload = await readJsonBody(request);
        const alert = await updateAlert(id, payload);

        if (!alert) {
          return sendJson(response, 404, { error: 'Alert not found' });
        }

        return sendJson(response, 200, {
          alert: alertRowToApi(alert),
        });
      }

      if (request.method === 'DELETE') {
        const deleted = await deleteAlert(id);

        if (!deleted) {
          return sendJson(response, 404, { error: 'Alert not found' });
        }

        return sendJson(response, 204, null);
      }
    }

    if (url.pathname === '/api/alert-matches') {
      const dataset = await readDataset();
      const deals = filterDeals(indexDeals(dataset.dispensaries), url.searchParams);

      return sendJson(response, 200, {
        generatedAt: new Date().toISOString(),
        matches: buildAlertMatches(await readAlerts(), deals),
        source: dataset.source,
        updatedAt: dataset.updatedAt,
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/push-tokens') {
      const payload = await readJsonBody(request);

      if (!payload.expoPushToken && !payload.expo_push_token) {
        return sendJson(response, 400, { error: 'expoPushToken is required' });
      }

      const token = await upsertPushToken(payload);

      return sendJson(response, 201, {
        token: {
          active: token.active !== false,
          id: token.id,
          platform: token.platform,
          userId: token.user_id || token.userId,
        },
      });
    }

    return sendJson(response, 404, { error: 'Route not found' });
  } catch (error) {
    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Unknown server error',
    });
  }
});

server.listen(PORT, () => {
  console.log(`LeafRadar API listening on http://localhost:${PORT}`);
});

async function readDataset() {
  if (postgresConfigured()) {
    const postgresDataset = await buildDatasetFromPostgres();

    if (postgresDataset?.dispensaries?.length) {
      return postgresDataset;
    }
  }

  if (warehouseExists(ROOT)) {
    const warehouseDataset = buildDatasetFromWarehouse(ROOT);

    if (warehouseDataset?.dispensaries?.length) {
      return warehouseDataset;
    }
  }

  if (existsSync(DUTCHIE_DATA_PATH)) {
    const latest = JSON.parse(readFileSync(DUTCHIE_DATA_PATH, 'utf8'));
    return {
      dispensaries: latest.dispensaries || [],
      source: 'Dutchie sync',
      updatedAt: formatUpdatedAt(latest.syncedAt ? new Date(latest.syncedAt) : new Date()),
    };
  }

  return JSON.parse(readFileSync(SEED_DATA_PATH, 'utf8'));
}

function indexDeals(dispensaries) {
  return dispensaries.flatMap((dispensary) =>
    (dispensary.deals || []).map((deal) => ({
      ...deal,
      city: dispensary.city,
      county: dispensary.county,
      dispensaryId: dispensary.id,
      dispensaryName: dispensary.name,
      distanceMiles: dispensary.distanceMiles,
      menuSource: dispensary.menuSource,
      updatedAt: dispensary.updatedAt,
      valueScore: dispensary.valueScore,
    })),
  );
}

function filterDeals(deals, searchParams) {
  const category = searchParams.get('category');
  const query = (searchParams.get('q') || '').trim().toLowerCase();

  return deals
    .filter((deal) => !category || category === 'all' || deal.category === category)
    .filter((deal) => {
      if (!query) {
        return true;
      }

      return [
        deal.productName,
        deal.brand,
        deal.category,
        deal.format,
        deal.dealText,
        deal.dispensaryName,
        deal.city,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      if ((b.savingsPct || 0) !== (a.savingsPct || 0)) {
        return (b.savingsPct || 0) - (a.savingsPct || 0);
      }

      return (a.distanceMiles || 0) - (b.distanceMiles || 0);
    });
}

function getPriceHistory(deal) {
  if (deal.priceHistory?.length) {
    return deal.priceHistory;
  }

  const high = deal.highestPrice || deal.originalPrice || Math.round(deal.currentPrice * 1.35);
  const current = deal.currentPrice;
  const prices = [
    high,
    Math.round(high * 0.94),
    Math.round(high * 0.9),
    Math.round(high * 0.92),
    Math.round((high + current) / 2),
    Math.round(current * 1.18),
    Math.round(current * 1.12),
    Math.round(current * 1.06),
    Math.round(current * 1.02),
    current,
  ];

  return ['Apr 15', 'Apr 18', 'Apr 21', 'Apr 24', 'Apr 27', 'Apr 30', 'May 3', 'May 6', 'May 9', 'Today'].map(
    (date, index) => ({
      date,
      price: prices[index],
    }),
  );
}

function getPriceStats(deal) {
  const history = getPriceHistory(deal);
  const prices = history.map((point) => point.price);

  return {
    average: deal.averagePrice || Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length),
    highest: deal.highestPrice || Math.max(...prices),
    lowest: deal.lowestPrice || Math.min(...prices),
  };
}

async function readAlerts() {
  const sourceAlerts = postgresConfigured() ? await listPostgresAlerts() : listWarehouseAlerts(ROOT);
  return mergeAlertRows(defaultAlerts(), sourceAlerts).map(alertRowToApi);
}

async function createAlert(payload) {
  return postgresConfigured()
    ? createPostgresAlert(payload)
    : createWarehouseAlert(ROOT, payload);
}

async function updateAlert(id, payload) {
  const defaultAlert = defaultAlerts().find((alert) => alert.id === id);
  const patch = defaultAlert
    ? {
        ...defaultAlert,
        ...payload,
        id,
      }
    : payload;

  return postgresConfigured()
    ? updatePostgresAlert(id, patch)
    : updateWarehouseAlert(ROOT, id, patch);
}

async function deleteAlert(id) {
  return postgresConfigured()
    ? deletePostgresAlert(id)
    : deleteWarehouseAlert(ROOT, id);
}

async function upsertPushToken(payload) {
  return postgresConfigured()
    ? upsertPostgresPushToken(payload)
    : upsertWarehousePushToken(ROOT, payload);
}

function alertRowToApi(alert) {
  return {
    active: alert.active !== false,
    brand: alert.brand,
    category: alert.category,
    id: alert.id,
    label: alert.label,
    maxPrice: numberOrUndefined(alert.maxPrice ?? alert.max_price),
    radiusMiles: numberOrUndefined(alert.radiusMiles ?? alert.radius_miles),
    region: alert.region,
  };
}

function mergeAlertRows(baseAlerts, overrideAlerts = []) {
  const merged = new Map();

  for (const alert of baseAlerts) {
    merged.set(alert.id, alert);
  }

  for (const alert of overrideAlerts) {
    merged.set(alert.id, {
      ...merged.get(alert.id),
      ...alert,
    });
  }

  return [...merged.values()];
}

function buildAlertMatches(alerts, deals) {
  return alerts
    .filter((alert) => alert.active)
    .map((alert) => {
      const matchingDeals = deals
        .filter((deal) => alertMatchesDeal(alert, deal))
        .sort((a, b) => {
          if ((b.savingsPct || 0) !== (a.savingsPct || 0)) {
            return (b.savingsPct || 0) - (a.savingsPct || 0);
          }

          return (a.currentPrice || 0) - (b.currentPrice || 0);
        });

      return {
        ...alert,
        matchCount: matchingDeals.length,
        topDeals: matchingDeals.slice(0, 6),
      };
    })
    .filter((alert) => alert.matchCount > 0);
}

function alertMatchesDeal(alert, deal) {
  if (alert.category && deal.category !== alert.category) {
    return false;
  }

  if (alert.maxPrice && Number(deal.currentPrice) > Number(alert.maxPrice)) {
    return false;
  }

  if (alert.radiusMiles && Number(deal.distanceMiles || 0) > Number(alert.radiusMiles)) {
    return false;
  }

  if (alert.brand && !textIncludes(`${deal.brand} ${deal.productName}`, alert.brand)) {
    return false;
  }

  if (alert.region && !regionMatchesDeal(alert.region, deal)) {
    return false;
  }

  if (String(alert.id).includes('bogo')) {
    return textIncludes(deal.dealText, 'bogo') || Number(deal.savingsPct || 0) >= 40;
  }

  if (String(alert.id).includes('cookies')) {
    return textIncludes(`${deal.brand} ${deal.productName}`, 'cookies');
  }

  return true;
}

function regionMatchesDeal(region, deal) {
  const normalized = String(region).toLowerCase();

  if (!normalized || normalized === 'nj' || normalized === 'new jersey' || normalized === 'any') {
    return true;
  }

  const county = String(deal.county || '').toLowerCase();
  const city = String(deal.city || '').toLowerCase();
  const southJerseyCounties = new Set([
    'atlantic',
    'burlington',
    'camden',
    'cape may',
    'cumberland',
    'gloucester',
    'ocean',
    'salem',
  ]);

  if (normalized.includes('south jersey')) {
    return southJerseyCounties.has(county);
  }

  return textIncludes(`${city} ${county} ${deal.dispensaryName}`, normalized);
}

function textIncludes(value, query) {
  return String(value || '').toLowerCase().includes(String(query || '').toLowerCase());
}

function numberOrUndefined(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function defaultAlerts() {
  return [
    { active: true, category: 'flower', id: 'ounces-under-120', label: 'Ounces under $120', max_price: 120, region: 'NJ' },
    { active: true, category: 'vapes', id: 'carts-under-25', label: 'Carts under $25', max_price: 25, radius_miles: 15 },
    { active: true, brand: 'Cookies', category: 'vapes', id: 'cookies-carts-under-40', label: 'Cookies carts under $40', max_price: 40 },
    { active: true, category: 'edibles', id: 'bogo-edibles', label: 'BOGO edibles' },
    { active: true, category: 'flower', id: 'south-jersey-flower', label: 'South Jersey Flower Deals', region: 'South Jersey' },
  ];
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  });

  if (status === 204) {
    response.end();
    return;
  }

  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();

  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody);
}

function formatUpdatedAt(date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(date);
}
