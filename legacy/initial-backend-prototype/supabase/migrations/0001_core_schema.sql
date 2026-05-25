create extension if not exists pgcrypto;

create type asset_type as enum ('stock', 'crypto', 'option', 'etf', 'other');
create type holding_action as enum ('buy', 'sell', 'hold', 'add', 'trim', 'close', 'unknown');
create type source_type as enum ('twitter', 'substack', 'wechat', '13f', 'terminal', 'app', 'article', 'manual', 'rss', 'other');
create type ingest_status as enum ('pending_review', 'accepted', 'rejected', 'needs_manual_review');
create type rule_status as enum ('active', 'paused', 'archived');

create table kols (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique,
  platform text not null default 'other',
  display_name text,
  avatar_url text,
  bio text,
  tags text[] not null default '{}',
  trust_score numeric(4, 3) not null default 0.750 check (trust_score >= 0 and trust_score <= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type source_type not null,
  platform text not null default 'other',
  url text,
  status text not null default 'active',
  trust_level text not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table holdings (
  id uuid primary key default gen_random_uuid(),
  kol_id uuid not null references kols(id) on delete cascade,
  source_id uuid references sources(id) on delete set null,
  ticker text not null check (ticker ~ '^[A-Z0-9.]{1,12}$'),
  asset_type asset_type not null,
  action holding_action not null,
  weight_pct numeric(6, 3) check (weight_pct is null or (weight_pct >= 0 and weight_pct <= 100)),
  weight_rank integer check (weight_rank is null or weight_rank > 0),
  shares bigint check (shares is null or shares >= 0),
  market_value_usd bigint check (market_value_usd is null or market_value_usd >= 0),
  option_direction text check (option_direction is null or option_direction in ('call', 'put')),
  option_strike numeric(12, 4),
  option_expiry date,
  source_text text,
  source_image_url text,
  extraction_confidence numeric(4, 3) check (extraction_confidence is null or (extraction_confidence >= 0 and extraction_confidence <= 1)),
  field_confidence jsonb not null default '{}'::jsonb,
  is_verified boolean not null default false,
  note text,
  starred boolean not null default false,
  user_tags text[] not null default '{}',
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table holding_snapshots (
  id uuid primary key default gen_random_uuid(),
  kol_id uuid not null references kols(id) on delete cascade,
  snapshot_at timestamptz not null,
  source_id uuid references sources(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table snapshot_holdings (
  snapshot_id uuid not null references holding_snapshots(id) on delete cascade,
  holding_id uuid not null references holdings(id) on delete cascade,
  primary key (snapshot_id, holding_id)
);

create table holding_events (
  id uuid primary key default gen_random_uuid(),
  kol_id uuid not null references kols(id) on delete cascade,
  ticker text not null check (ticker ~ '^[A-Z0-9.]{1,12}$'),
  event_type text not null check (event_type in ('new_position', 'add', 'trim', 'close', 'unknown_change')),
  prev_weight_pct numeric(6, 3),
  curr_weight_pct numeric(6, 3),
  prev_snapshot_id uuid references holding_snapshots(id) on delete set null,
  curr_snapshot_id uuid references holding_snapshots(id) on delete set null,
  detected_at timestamptz not null default now()
);

create table ingest_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id) on delete set null,
  raw_text text,
  source_image_url text,
  parsed_payload jsonb not null default '{}'::jsonb,
  status ingest_status not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table alert_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rule_type text not null,
  config jsonb not null default '{}'::jsonb,
  status rule_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table quality_events (
  id uuid primary key default gen_random_uuid(),
  ingest_item_id uuid references ingest_items(id) on delete set null,
  holding_id uuid references holdings(id) on delete set null,
  event_type text not null,
  field_name text,
  expected_value text,
  actual_value text,
  note text,
  created_at timestamptz not null default now()
);

create index holdings_ticker_recorded_idx on holdings (ticker, recorded_at desc);
create index holdings_kol_recorded_idx on holdings (kol_id, recorded_at desc);
create index holdings_asset_action_idx on holdings (asset_type, action);
create index ingest_items_status_created_idx on ingest_items (status, created_at desc);
create index alert_rules_status_idx on alert_rules (status);

comment on table holdings is 'Canonical structured holdings records. RAG/embedding is intentionally out of scope for this migration.';

