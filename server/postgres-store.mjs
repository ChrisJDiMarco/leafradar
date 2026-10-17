import { Pool } from 'pg';

let pool;

export function postgresConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export async function buildDatasetFromPostgres() {
  const observations = await query(`
    with latest_observations as (
      select distinct on (deal_id) *
      from deal_observations
      order by deal_id, observed_at desc
    )
    select
      d.id as dispensary_id,
      d.name as dispensary_name,
      d.city,
      d.county,
      d.latitude,
      d.longitude,
      d.distance_miles,
      d.menu_source,
      d.value_score,
      d.open_now,
      d.updated_at as dispensary_updated_at,
      p.id as product_id,
      p.normalized_name,
      p.brand,
      p.category,
      p.format,
      p.thc,
      p.description,
      o.deal_id,
      o.current_price,
      o.original_price,
      o.savings_pct,
      o.price_per_unit,
      o.deal_text,
      o.strength,
      o.verification,
      o.observed_at
    from latest_observations o
    join dispensaries d on d.id = o.dispensary_id
    join products p on p.id = o.product_id
    order by d.value_score desc, o.savings_pct desc, o.current_price asc
  `);

  if (!observations.rows.length) {
    return null;
  }

  const history = await query(`
    select dispensary_id, product_id, observed_date, price
    from price_history
    order by observed_date asc
  `);
  const historyByProductAndDispensary = groupPriceHistory(history.rows);
  const observationsByDispensary = groupBy(observations.rows, (row) => row.dispensary_id);
  const updatedAt = observations.rows.reduce((latest, row) => {
    const observedAt = new Date(row.observed_at);
    return observedAt > latest ? observedAt : latest;
  }, new Date(0));

  const dispensaries = [...observationsByDispensary.entries()]
    .map(([dispensaryId, rows]) => {
      const first = rows[0];
      const deals = rows.map((row) =>
        observationRowToDeal({
          history: historyByProductAndDispensary.get(`${row.dispensary_id}:${row.product_id}`) || [],
          row,
        }),
      );

      return {
        averageSavings: Math.round(
          deals.reduce((total, deal) => total + deal.savingsPct, 0) / Math.max(deals.length, 1),
        ),
        city: first.city,
        county: first.county,
        dealCount: deals.length,
        deals,
        distanceMiles: toNumber(first.distance_miles),
        id: dispensaryId,
        latitude: toNumber(first.latitude),
        longitude: toNumber(first.longitude),
        menuSource: first.menu_source,
        name: first.dispensary_name,
        openNow: first.open_now,
        updatedAt: formatUpdatedAt(new Date(first.dispensary_updated_at || updatedAt)),
        valueScore: Number(first.value_score || 0),
      };
    })
    .sort((a, b) => b.valueScore - a.valueScore);

  return {
    dispensaries,
    source: 'Postgres warehouse',
    updatedAt: formatUpdatedAt(updatedAt),
  };
}

export async function listPostgresAlerts() {
  const result = await query(`
    select id, user_id, label, category, brand, max_price, radius_miles, region, active, created_at, updated_at
    from user_alerts
    order by created_at asc
  `);

  return result.rows;
}

export async function createPostgresAlert(alert) {
  const nextAlert = storageAlertFromPayload(alert);
  const result = await query(
    `
      insert into user_alerts (
        id, user_id, label, category, brand, max_price, radius_miles, region, active
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      on conflict (id) do update set
        user_id = excluded.user_id,
        label = excluded.label,
        category = excluded.category,
        brand = excluded.brand,
        max_price = excluded.max_price,
        radius_miles = excluded.radius_miles,
        region = excluded.region,
        active = excluded.active,
        updated_at = now()
      returning *
    `,
    [
      nextAlert.id,
      nextAlert.user_id,
      nextAlert.label,
      nextAlert.category,
      nextAlert.brand,
      nextAlert.max_price,
      nextAlert.radius_miles,
      nextAlert.region,
      nextAlert.active,
    ],
  );

  return result.rows[0];
}

export async function updatePostgresAlert(id, patch) {
  const existing = await query('select * from user_alerts where id = $1', [id]);

  if (!existing.rows[0]) {
    return createPostgresAlert({
      ...patch,
      id,
    });
  }

  return createPostgresAlert({
    ...existing.rows[0],
    ...patch,
    id,
  });
}

export async function deletePostgresAlert(id) {
  const result = await query('delete from user_alerts where id = $1', [id]);
  return result.rowCount > 0;
}

export async function upsertPostgresPushToken(token) {
  const now = new Date().toISOString();
  const expoPushToken = token.expoPushToken || token.expo_push_token;
  const nextToken = {
    active: token.active !== false,
    device_id: token.deviceId || token.device_id || null,
    expo_push_token: expoPushToken,
    id: token.id || `push:${expoPushToken}`,
    last_registered_at: now,
    platform: token.platform || null,
    user_id: token.userId || token.user_id || 'anonymous',
  };

  const result = await query(
    `
      insert into push_tokens (
        id, user_id, expo_push_token, device_id, platform, active, last_registered_at
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (expo_push_token) do update set
        user_id = excluded.user_id,
        device_id = excluded.device_id,
        platform = excluded.platform,
        active = excluded.active,
        last_registered_at = excluded.last_registered_at
      returning *
    `,
    [
      nextToken.id,
      nextToken.user_id,
      nextToken.expo_push_token,
      nextToken.device_id,
      nextToken.platform,
      nextToken.active,
      nextToken.last_registered_at,
    ],
  );

  return result.rows[0];
}

export async function query(sql, params = []) {
  return getPool().query(sql, params);
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }

  return pool;
}

function observationRowToDeal({ history, row }) {
  const prices = history.map((point) => point.price);
  const currentPrice = toNumber(row.current_price);
  const lowestPrice = prices.length ? Math.min(...prices, currentPrice) : currentPrice;
  const highestPrice = prices.length ? Math.max(...prices, currentPrice) : toNumber(row.original_price) || currentPrice;
  const averagePrice = prices.length
    ? Math.round(prices.reduce((total, price) => total + price, 0) / prices.length)
    : currentPrice;

  return {
    averagePrice,
    brand: row.brand || 'Unknown brand',
    category: row.category || 'flower',
    currentPrice,
    dealText: row.deal_text,
    description: row.description,
    expiresIn: 'next sync',
    format: row.format || 'unit',
    highestPrice,
    id: row.deal_id,
    lowestPrice,
    originalPrice: row.original_price === null ? undefined : toNumber(row.original_price),
    priceHistory: history.map((point) => ({
      date: point.label,
      price: point.price,
    })),
    pricePerUnit: row.price_per_unit || `${formatCurrency(currentPrice)}/unit`,
    productName: row.normalized_name || 'Unnamed product',
    savingsPct: Number(row.savings_pct || 0),
    strength: row.strength || 'fair',
    thc: row.thc,
    verification: row.verification || 'verified',
  };
}

function groupPriceHistory(priceHistory) {
  const grouped = new Map();

  for (const point of priceHistory) {
    const key = `${point.dispensary_id}:${point.product_id}`;
    const existing = grouped.get(key) || [];
    existing.push({
      label: formatHistoryDate(String(point.observed_date).slice(0, 10)),
      observed_date: point.observed_date,
      price: toNumber(point.price),
    });
    grouped.set(key, existing);
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

function storageAlertFromPayload(alert) {
  return {
    active: alert.active !== false,
    brand: emptyToNull(alert.brand),
    category: emptyToNull(alert.category),
    id: alert.id || `alert:${Date.now()}:${slugify(alert.label || 'custom-alert')}`,
    label: alert.label || 'Custom alert',
    max_price: numberOrNull(alert.maxPrice ?? alert.max_price),
    radius_miles: numberOrNull(alert.radiusMiles ?? alert.radius_miles),
    region: emptyToNull(alert.region),
    user_id: alert.userId || alert.user_id || 'anonymous',
  };
}

function formatHistoryDate(dateValue) {
  const today = new Date().toISOString().slice(0, 10);

  if (dateValue === today) {
    return 'Today';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${dateValue}T00:00:00`));
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

function toNumber(value) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  return Number(value);
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
