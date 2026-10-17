#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applyDispensarySync } from '../server/warehouse.mjs';

const PROJECT_ROOT = process.cwd();

main();

function main() {
  const { flags, inputPath } = parseArgs(process.argv.slice(2));

  if (flags.help || !inputPath) {
    printHelp();
    process.exit(flags.help ? 0 : 1);
  }

  const csvPath = path.resolve(PROJECT_ROOT, inputPath);
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));

  if (!rows.length) {
    throw new Error(`No menu rows found in ${csvPath}`);
  }

  const syncedAt = flags.date ? new Date(flags.date) : new Date();

  if (Number.isNaN(syncedAt.getTime())) {
    throw new Error(`Invalid --date value: ${flags.date}`);
  }

  const dispensary = buildDispensary({ flags, rows, syncedAt });

  if (flags['dry-run']) {
    console.log(
      JSON.stringify(
        {
          dealCount: dispensary.deals.length,
          dispensary,
          provider: 'CSV',
          sourceFile: csvPath,
        },
        null,
        2,
      ),
    );
    return;
  }

  applyDispensarySync({
    provider: 'CSV',
    rawSnapshots: [
      {
        locationId: dispensary.id,
        provider: 'CSV',
        rowCount: rows.length,
        sourceFile: csvPath,
      },
    ],
    root: PROJECT_ROOT,
    syncedAt,
    syncedDispensaries: [dispensary],
  });

  console.log(`Imported ${dispensary.deals.length} menu rows for ${dispensary.name}.`);
}

function buildDispensary({ flags, rows, syncedAt }) {
  const name = flags.name || 'Imported Dispensary';
  const id = flags['dispensary-id'] || slugify(name);
  const deals = rows.map((row, index) => normalizeDeal({ id, index, row, syncedAt })).filter(Boolean);
  const averageSavings = Math.round(
    deals.reduce((total, deal) => total + deal.savingsPct, 0) / Math.max(deals.length, 1),
  );

  return {
    averageSavings,
    city: flags.city || 'New Jersey',
    county: flags.county || 'NJ',
    dealCount: deals.length,
    deals,
    distanceMiles: parseNumber(flags.distance) || 0,
    id,
    latitude: parseNumber(flags.lat) || 40.0583,
    longitude: parseNumber(flags.lng) || -74.4057,
    menuSource: 'CSV',
    name,
    openNow: true,
    updatedAt: formatUpdatedAt(syncedAt),
    valueScore: clamp(78 + Math.round(averageSavings * 0.55), 72, 98),
  };
}

function normalizeDeal({ id, index, row }) {
  const productName = row.productName || row.product || row.name;
  const currentPrice = parseNumber(row.currentPrice || row.price || row.salePrice);

  if (!productName || !currentPrice) {
    return null;
  }

  const brand = row.brand || 'House';
  const category = normalizeCategory(row.category || row.type || productName);
  const format = row.format || row.size || 'unit';
  const originalPrice = parseNumber(row.originalPrice || row.wasPrice || row.regularPrice);
  const savingsPct = originalPrice && originalPrice > currentPrice
    ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
    : 0;

  return {
    brand,
    category,
    currentPrice,
    dealText: row.dealText || buildDealText({ category, currentPrice, originalPrice, savingsPct }),
    expiresIn: 'next sync',
    format,
    id: `csv-${id}-${slugify(`${brand}-${productName}-${format}`)}-${index}`,
    originalPrice: originalPrice || undefined,
    pricePerUnit: buildPricePerUnit({ currentPrice, format }),
    productName,
    quantityAvailable: parseNumber(row.quantityAvailable || row.quantity || row.stock),
    savingsPct,
    strength: dealStrength(savingsPct),
    thc: row.thc || row.thcPercent || row.potency,
    verification: 'partner-feed',
  };
}

function parseArgs(args) {
  const flags = {};
  let inputPath = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[index + 1];

      if (!next || next.startsWith('--')) {
        flags[key] = true;
        continue;
      }

      flags[key] = next;
      index += 1;
      continue;
    }

    if (!inputPath) {
      inputPath = arg;
    }
  }

  return { flags, inputPath };
}

function parseCsv(csv) {
  const records = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }

      row.push(current);
      current = '';

      if (row.some((cell) => cell.trim())) {
        records.push(row);
      }

      row = [];
      continue;
    }

    current += char;
  }

  row.push(current);

  if (row.some((cell) => cell.trim())) {
    records.push(row);
  }

  if (records.length < 2) {
    return [];
  }

  const headers = records[0].map((header) => header.trim());

  return records.slice(1).map((record) =>
    headers.reduce((rowObject, header, index) => {
      rowObject[header] = (record[index] || '').trim();
      return rowObject;
    }, {}),
  );
}

function normalizeCategory(value) {
  const normalized = String(value).toLowerCase();

  if (normalized.includes('cart') || normalized.includes('vape') || normalized.includes('disposable')) {
    return 'vapes';
  }

  if (normalized.includes('edible') || normalized.includes('gummy') || normalized.includes('chocolate')) {
    return 'edibles';
  }

  if (normalized.includes('concentrate') || normalized.includes('resin') || normalized.includes('rosin')) {
    return 'concentrates';
  }

  if (normalized.includes('pre') || normalized.includes('joint')) {
    return 'prerolls';
  }

  return 'flower';
}

function buildDealText({ category, currentPrice, originalPrice, savingsPct }) {
  if (savingsPct > 0) {
    return `${savingsPct}% off ${category}`;
  }

  if (category === 'flower' && currentPrice <= 120) {
    return 'Low flower price';
  }

  if (category === 'vapes' && currentPrice <= 35) {
    return 'Low cart price';
  }

  return 'Fresh menu price';
}

function buildPricePerUnit({ currentPrice, format }) {
  const grams = String(format).match(/(\d+(?:\.\d+)?)\s*g\b/i)?.[1];

  if (grams) {
    return `${formatCurrency(currentPrice / Number(grams))}/g`;
  }

  return `${formatCurrency(currentPrice)}/unit`;
}

function dealStrength(savingsPct) {
  if (savingsPct >= 30) {
    return 'steal';
  }

  if (savingsPct >= 15) {
    return 'strong';
  }

  return 'fair';
}

function parseNumber(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatCurrency(value) {
  return `$${Number(value).toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}`;
}

function formatUpdatedAt(date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(date);
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function printHelp() {
  console.log(`Usage:
  npm run import:csv -- menu.csv --dispensary-id zen-leaf-lawrenceville --name "Zen Leaf - Lawrenceville" --city Lawrenceville --lat 40.2962 --lng -74.7296

Required CSV columns:
  productName, brand, category, format, currentPrice

Useful optional columns:
  originalPrice, thc, quantityAvailable, dealText
`);
}
