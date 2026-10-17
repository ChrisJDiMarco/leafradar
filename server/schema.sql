create table if not exists dispensaries (
  id text primary key,
  name text not null,
  city text not null,
  county text,
  state text not null default 'NJ',
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  distance_miles numeric(8, 2),
  license_number text,
  menu_source text not null,
  value_score integer not null default 0,
  open_now boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists menu_sources (
  id text primary key,
  dispensary_id text not null references dispensaries(id) on delete cascade,
  provider text not null,
  provider_location_id text,
  api_key_ref text,
  status text not null default 'pending',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_location_id)
);

create table if not exists products (
  id text primary key,
  provider text not null,
  provider_product_id text,
  normalized_name text not null,
  brand text,
  category text not null,
  format text,
  thc text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_snapshots (
  id text primary key,
  dispensary_id text not null references dispensaries(id) on delete cascade,
  source_id text references menu_sources(id) on delete set null,
  synced_at timestamptz not null default now(),
  raw_payload jsonb not null
);

create table if not exists deal_observations (
  id text primary key,
  dispensary_id text not null references dispensaries(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  snapshot_id text references inventory_snapshots(id) on delete set null,
  deal_id text not null,
  current_price numeric(10, 2) not null,
  original_price numeric(10, 2),
  savings_pct integer not null default 0,
  price_per_unit text,
  quantity_available numeric(12, 3),
  deal_text text,
  strength text not null default 'fair',
  verification text not null default 'verified',
  observed_at timestamptz not null default now()
);

create table if not exists price_history (
  id text primary key,
  dispensary_id text not null references dispensaries(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  observed_date date not null,
  price numeric(10, 2) not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (dispensary_id, product_id, observed_date, source)
);

create table if not exists user_alerts (
  id text primary key,
  user_id text,
  label text not null,
  category text,
  brand text,
  max_price numeric(10, 2),
  radius_miles integer,
  region text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists push_tokens (
  id text primary key,
  user_id text,
  expo_push_token text not null unique,
  device_id text,
  platform text,
  active boolean not null default true,
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists alert_events (
  id text primary key,
  alert_id text not null references user_alerts(id) on delete cascade,
  deal_id text not null,
  event_type text not null default 'match',
  payload jsonb not null default '{}'::jsonb,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists deal_observations_best_deals_idx
  on deal_observations (observed_at desc, savings_pct desc, current_price asc);

create index if not exists deal_observations_deal_lookup_idx
  on deal_observations (deal_id, observed_at desc);

create index if not exists price_history_lookup_idx
  on price_history (product_id, dispensary_id, observed_date desc);

create index if not exists products_search_idx
  on products using gin (to_tsvector('english', normalized_name || ' ' || coalesce(brand, '') || ' ' || category));

create index if not exists push_tokens_user_idx
  on push_tokens (user_id, active);

create index if not exists alert_events_lookup_idx
  on alert_events (alert_id, created_at desc);
