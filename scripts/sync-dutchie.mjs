#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applyDispensarySync } from '../server/warehouse.mjs';

const PROJECT_ROOT = process.cwd();
const GENERATED_PATH = path.join(PROJECT_ROOT, 'src/data/generated/dutchie.ts');
const LATEST_NORMALIZED_PATH = path.join(PROJECT_ROOT, 'data/dutchie/latest-normalized.json');
const SNAPSHOT_DIR = path.join(PROJECT_ROOT, 'data/dutchie/snapshots');

loadEnvFile('.env');
loadEnvFile('.env.local');

const DUTCHIE_API_BASE_URL = process.env.DUTCHIE_API_BASE_URL || 'https://api.pos.dutchie.com';

const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  printHelp();
  process.exit(0);
}

const dryRun = args.has('--dry-run');

main().catch((error) => {
  console.error(`Dutchie sync failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const locations = readLocationsConfig();
  const previousPriceByKey = readPreviousPriceIndex();
  const syncedAt = new Date();
  const syncedDispensaries = [];
  const rawSnapshots = [];

  for (const location of locations) {
    console.log(`Syncing Dutchie location: ${location.id}`);
    const client = createDutchieClient(location.apiKey);
    const identity = await client.get('/whoami');
    const locationState = normalizeState(identity.state);

    if (locationState !== 'NJ' && !location.allowOutOfState) {
      console.warn(
        `Skipping ${identity.locationName || location.id}: state is ${identity.state || 'unknown'}, expected NJ.`,
      );
      continue;
    }

    const products = await client.get('/products', { isActive: 'true' });
    const inventory = await fetchInventoryOrFallback(client, products);
    const dispensary = normalizeDispensary({
      identity,
      inventory,
      location,
      previousPriceByKey,
      products,
      syncedAt,
    });

    if (!dispensary) {
      console.warn(`No available cannabis inventory found for ${identity.locationName || location.id}.`);
      continue;
    }

    syncedDispensaries.push(dispensary);
    rawSnapshots.push({
      identity,
      inventoryCount: inventory.length,
      locationId: location.id,
      productCount: products.length,
      syncedAt: syncedAt.toISOString(),
    });
  }

  syncedDispensaries.sort((a, b) => b.valueScore - a.valueScore);

  if (dryRun) {
    console.log(JSON.stringify({ dispensaries: syncedDispensaries, rawSnapshots }, null, 2));
    return;
  }

  mkdirSync(path.dirname(GENERATED_PATH), { recursive: true });
  mkdirSync(path.dirname(LATEST_NORMALIZED_PATH), { recursive: true });
  mkdirSync(SNAPSHOT_DIR, { recursive: true });

  writeFileSync(GENERATED_PATH, renderGeneratedData(syncedAt, syncedDispensaries));
  writeFileSync(
    LATEST_NORMALIZED_PATH,
    `${JSON.stringify({ dispensaries: syncedDispensaries, syncedAt: syncedAt.toISOString() }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(SNAPSHOT_DIR, `${toSnapshotName(syncedAt)}.json`),
    `${JSON.stringify({ dispensaries: syncedDispensaries, rawSnapshots, syncedAt: syncedAt.toISOString() }, null, 2)}\n`,
  );
  applyDispensarySync({
    provider: 'Dutchie',
    rawSnapshots,
    root: PROJECT_ROOT,
    syncedAt,
    syncedDispensaries,
  });

  console.log(
    `Dutchie sync complete: ${syncedDispensaries.length} dispensaries, ${syncedDispensaries.reduce(
      (total, dispensary) => total + dispensary.deals.length,
      0,
    )} indexed prices.`,
  );
}

function printHelp() {
  console.log(`
Usage:
  npm run sync:dutchie
  npm run sync:dutchie -- --dry-run

Environment:
  DUTCHIE_LOCATIONS_JSON='[
    {
      "id": "dispensary-slug",
      "apiKey": "dutchie_api_key",
      "latitude": 40.4862,
      "longitude": -74.4518,
      "county": "Middlesex",
      "distanceMiles": 0
    }
  ]'

Fallback for one location:
  DUTCHIE_API_KEY=...
  DUTCHIE_LOCATION_ID=...
  DUTCHIE_LOCATION_LATITUDE=...
  DUTCHIE_LOCATION_LONGITUDE=...
`);
}

function loadEnvFile(filename) {
  const envPath = path.join(PROJECT_ROOT, filename);

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalsIndex = trimmed.indexOf('=');

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readLocationsConfig() {
  const rawLocations = process.env.DUTCHIE_LOCATIONS_JSON;

  if (rawLocations) {
    const parsed = JSON.parse(rawLocations);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('DUTCHIE_LOCATIONS_JSON must be a non-empty JSON array.');
    }

    return parsed.map(validateLocationConfig);
  }

  if (process.env.DUTCHIE_API_KEY) {
    return [
      validateLocationConfig({
        apiKey: process.env.DUTCHIE_API_KEY,
        county: process.env.DUTCHIE_LOCATION_COUNTY || 'Unknown',
        distanceMiles: Number(process.env.DUTCHIE_LOCATION_DISTANCE_MILES || 0),
        id: process.env.DUTCHIE_LOCATION_ID || 'dutchie-location',
        latitude: Number(process.env.DUTCHIE_LOCATION_LATITUDE || 40.0583),
        longitude: Number(process.env.DUTCHIE_LOCATION_LONGITUDE || -74.4057),
      }),
    ];
  }

  throw new Error('Set DUTCHIE_LOCATIONS_JSON or DUTCHIE_API_KEY before syncing.');
}

function validateLocationConfig(location) {
  if (!location || typeof location !== 'object') {
    throw new Error('Each Dutchie location must be an object.');
  }

  if (!location.id || typeof location.id !== 'string') {
    throw new Error('Each Dutchie location needs an id.');
  }

  if (!location.apiKey || typeof location.apiKey !== 'string') {
    throw new Error(`Dutchie location ${location.id} is missing apiKey.`);
  }

  return {
    allowOutOfState: Boolean(location.allowOutOfState),
    apiKey: location.apiKey,
    county: String(location.county || 'Unknown'),
    distanceMiles: Number(location.distanceMiles || 0),
    id: slugify(location.id),
    latitude: Number(location.latitude || 40.0583),
    longitude: Number(location.longitude || -74.4057),
    openNow: location.openNow !== false,
  };
}

function createDutchieClient(apiKey) {
  const encodedKey = Buffer.from(`${apiKey}:`).toString('base64');

  return {
    async get(endpoint, params = {}) {
      const url = new URL(endpoint, DUTCHIE_API_BASE_URL);

      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${encodedKey}`,
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`${endpoint} returned ${response.status}: ${body.slice(0, 240)}`);
      }

      return response.json();
    },
  };
}

async function fetchInventoryOrFallback(client, products) {
  try {
    return await client.get('/reporting/inventory', {
      includeAllocated: 'true',
      includeLabResults: 'true',
    });
  } catch (error) {
    console.warn(`Reporting inventory endpoint unavailable. ${error.message}`);
  }

  try {
    return await client.get('/inventory', {
      includeLabResults: 'true',
    });
  } catch (error) {
    console.warn(`Inventory endpoint unavailable; falling back to product catalog prices. ${error.message}`);

    return products.map((product) => ({
      brandName: product.brandName,
      category: product.category,
      imageUrl: product.imageUrl,
      isCannabis: product.isCannabis,
      lastModifiedDateUtc: product.lastModifiedDateUTC,
      masterCategory: product.masterCategory,
      medicalOnly: product.isMedicalOnly,
      productId: product.productId,
      productName: product.onlineTitle || product.productName || product.internalName,
      quantityAvailable: product.onlineAvailable || product.posProducts ? 1 : 0,
      recUnitPrice: product.recPrice,
      size: product.size,
      sku: product.sku,
      strain: product.strain,
      strainType: product.strainType,
      tags: product.tags,
      thcContent: product.thcContent,
      thcContentUnit: product.thcContentUnit,
      unitPrice: product.price,
      unitWeight: product.netWeight || product.productGrams,
    }));
  }
}

function normalizeDispensary({ identity, inventory, location, previousPriceByKey, products, syncedAt }) {
  const productById = new Map(products.map((product) => [String(product.productId), product]));
  const deals = inventory
    .map((item) => normalizeInventoryItem(item, productById.get(String(item.productId)), location, previousPriceByKey))
    .filter(Boolean)
    .sort((a, b) => {
      if (b.savingsPct !== a.savingsPct) {
        return b.savingsPct - a.savingsPct;
      }

      return a.currentPrice - b.currentPrice;
    })
    .slice(0, 25);

  if (deals.length === 0) {
    return null;
  }

  const averageSavings = Math.round(
    deals.reduce((total, deal) => total + deal.savingsPct, 0) / Math.max(deals.length, 1),
  );

  return {
    averageSavings,
    city: identity.city || 'Unknown',
    county: location.county,
    dealCount: deals.length,
    deals,
    distanceMiles: location.distanceMiles,
    id: `${location.id}-${identity.locationId || slugify(identity.locationName || 'location')}`,
    latitude: location.latitude,
    longitude: location.longitude,
    menuSource: 'Dutchie',
    name: identity.locationName || identity.doingBusinessAs || location.id,
    openNow: location.openNow,
    updatedAt: formatUpdatedAt(syncedAt),
    valueScore: calculateValueScore(deals),
  };
}

function normalizeInventoryItem(item, product, location, previousPriceByKey) {
  const quantityAvailable = Number(item.quantityAvailable ?? 0);

  if (quantityAvailable <= 0 || item.isCannabis === false || product?.isCannabis === false) {
    return null;
  }

  const category = normalizeCategory(
    [
      item.category,
      product?.category,
      item.masterCategory,
      product?.masterCategory,
      item.productName,
      product?.onlineTitle,
      product?.productName,
    ].join(' '),
  );

  if (!category) {
    return null;
  }

  const currentPrice = firstPositiveNumber([
    item.recUnitPrice,
    item.unitPrice,
    product?.recPrice,
    product?.price,
    product?.medPrice,
  ]);

  if (!currentPrice) {
    return null;
  }

  const productName = item.productName || product?.onlineTitle || product?.productName || product?.internalName;
  const brand = item.brandName || product?.brandName || item.vendor || product?.vendorName || 'Unknown brand';
  const dealId = slugify(`${location.id}-${item.inventoryId || item.productId || productName}`);
  const previousPrice = previousPriceByKey.get(dealId);
  const regularPrice = Math.max(
    ...[
      previousPrice,
      product?.recPrice,
      product?.price,
      item.unitPrice,
      item.medUnitPrice,
    ]
      .map(Number)
      .filter((price) => Number.isFinite(price) && price > currentPrice * 1.02),
    0,
  );
  const originalPrice = regularPrice > 0 ? roundMoney(regularPrice) : undefined;
  const savingsPct = originalPrice ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100) : 0;
  const thc = formatThc(item, product);

  return {
    currentPrice: roundMoney(currentPrice),
    dealText: savingsPct
      ? `Dutchie verified price drop from ${formatCurrency(originalPrice)}`
      : `Dutchie verified price; ${formatQuantity(quantityAvailable, item.quantityUnits)} available`,
    expiresIn: 'next sync',
    format: item.size || product?.size || formatWeight(item.unitWeight, item.unitWeightUnit),
    id: dealId,
    originalPrice,
    pricePerUnit: formatPricePerUnit(currentPrice, item, product),
    productName: productName || 'Unnamed product',
    savingsPct,
    strength: getDealStrength(savingsPct, currentPrice, item, product),
    thc,
    category,
    brand,
    verification: 'verified',
  };
}

function normalizeCategory(rawCategory = '') {
  const value = rawCategory.toLowerCase();

  if (value.includes('flower') || value.includes('bud') || value.includes('shake')) {
    return 'flower';
  }

  if (value.includes('vape') || value.includes('cart') || value.includes('disposable')) {
    return 'vapes';
  }

  if (value.includes('edible') || value.includes('gumm') || value.includes('chocolate') || value.includes('beverage')) {
    return 'edibles';
  }

  if (value.includes('pre-roll') || value.includes('preroll') || value.includes('pre roll')) {
    return 'prerolls';
  }

  if (
    value.includes('concentrate') ||
    value.includes('rosin') ||
    value.includes('resin') ||
    value.includes('wax') ||
    value.includes('shatter')
  ) {
    return 'concentrates';
  }

  return null;
}

function formatThc(item, product) {
  const directValue = firstPositiveNumber([item.thcContent, product?.thcContent]);
  const directUnit = item.thcContentUnit || product?.thcContentUnit;

  if (directValue && directUnit) {
    return `${formatNumber(directValue)}${directUnit}`;
  }

  if (item.effectivePotencyMg) {
    return `${formatNumber(item.effectivePotencyMg)}mg`;
  }

  return undefined;
}

function formatPricePerUnit(price, item, product) {
  const grams = firstPositiveNumber([item.unitWeight, product?.productGrams, product?.netWeight]);

  if (grams) {
    return `${formatCurrency(price / grams)}/g`;
  }

  return `${formatCurrency(price)}/unit`;
}

function formatQuantity(quantity, units) {
  if (!units) {
    return formatNumber(quantity);
  }

  return `${formatNumber(quantity)} ${units}`;
}

function formatWeight(weight, unit) {
  if (!weight) {
    return 'unit';
  }

  return `${formatNumber(weight)}${unit || 'g'}`;
}

function getDealStrength(savingsPct, currentPrice, item, product) {
  if (savingsPct >= 30) {
    return 'steal';
  }

  if (savingsPct >= 15) {
    return 'strong';
  }

  const grams = firstPositiveNumber([item.unitWeight, product?.productGrams, product?.netWeight]);

  if (grams && currentPrice / grams <= 7) {
    return 'strong';
  }

  return 'fair';
}

function calculateValueScore(deals) {
  const bestSavings = Math.max(...deals.map((deal) => deal.savingsPct), 0);
  const cheapDealBonus = deals.some((deal) => deal.strength === 'strong' || deal.strength === 'steal') ? 10 : 0;
  const depthBonus = Math.min(deals.length, 25);

  return Math.min(99, Math.max(50, 55 + bestSavings + cheapDealBonus + depthBonus));
}

function readPreviousPriceIndex() {
  if (!existsSync(LATEST_NORMALIZED_PATH)) {
    return new Map();
  }

  try {
    const latest = JSON.parse(readFileSync(LATEST_NORMALIZED_PATH, 'utf8'));
    const entries = [];

    for (const dispensary of latest.dispensaries || []) {
      for (const deal of dispensary.deals || []) {
        entries.push([deal.id, deal.currentPrice]);
      }
    }

    return new Map(entries);
  } catch {
    return new Map();
  }
}

function renderGeneratedData(syncedAt, dispensaries) {
  return `import { Dispensary } from '../../types/deals';

// Generated by scripts/sync-dutchie.mjs. Do not edit by hand.
export const dutchieGeneratedAt = ${JSON.stringify(formatUpdatedAt(syncedAt))};

export const dutchieDispensaries: Dispensary[] = ${JSON.stringify(dispensaries, null, 2)};
`;
}

function firstPositiveNumber(values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number) && number > 0) {
      return number;
    }
  }

  return undefined;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function formatCurrency(value) {
  return `$${roundMoney(value).toFixed(roundMoney(value) % 1 === 0 ? 0 : 2)}`;
}

function formatNumber(value) {
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function formatUpdatedAt(date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(date);
}

function toSnapshotName(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function normalizeState(state = '') {
  const value = String(state).trim().toLowerCase();

  if (value === 'nj' || value === 'new jersey') {
    return 'NJ';
  }

  return value.toUpperCase();
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
