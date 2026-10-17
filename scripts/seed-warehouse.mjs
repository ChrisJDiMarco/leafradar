#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applyDispensarySync } from '../server/warehouse.mjs';

const root = process.cwd();
const seedPath = path.join(root, 'server/seed-data.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
const syncedAt = new Date();

applyDispensarySync({
  provider: 'Seed',
  rawSnapshots: seed.dispensaries.map((dispensary) => ({
    identity: {
      city: dispensary.city,
      locationName: dispensary.name,
      state: 'NJ',
    },
    inventoryCount: dispensary.deals.length,
    locationId: dispensary.id,
    productCount: dispensary.deals.length,
    syncedAt: syncedAt.toISOString(),
  })),
  root,
  syncedAt,
  syncedDispensaries: seed.dispensaries,
});

console.log(`Seeded warehouse with ${seed.dispensaries.length} dispensaries.`);
