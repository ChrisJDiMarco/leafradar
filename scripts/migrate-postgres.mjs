#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { query } from '../server/postgres-store.mjs';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to run Postgres migrations.');
  process.exit(1);
}

const schemaPath = path.join(process.cwd(), 'server/schema.sql');
const schemaSql = readFileSync(schemaPath, 'utf8');

await query(schemaSql);

console.log('LeafRadar Postgres schema is up to date.');
process.exit(0);
