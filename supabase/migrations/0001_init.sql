-- Storefront AI — SPEC v4.4 §6 (includes v4.1–v4.4 constraints: T1 event_day, T14/T24 visitor_id, T18 product_id)

create extension if not exists pgcrypto;

create table if not exists stores (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text unique not null,            -- kebab(name)-xxxx (4 random base36 chars)
  client_request_id       text unique not null,            -- idempotency for POST /api/stores
  creator_ip_hash         text,                            -- sha256(ip + salt), rate limiting only
  edit_token_hash         text unique not null,            -- sha256(token); raw token only ever in the URL
  status                  text not null default 'pending'
                          check (status in ('pending','generating','needs_input','ready','failed')),
  input                   jsonb not null,                  -- S1 answers + direction chosen
  follow_up               jsonb,                           -- { question, directions[3], round }
  draft                   jsonb,                           -- StoreContent (§7.2)
  published               jsonb,                           -- snapshot at last publish
  published_at            timestamptz,
  has_unpublished_changes boolean not null default false,
  gen_started_at          timestamptz,                     -- atomic claim + stale detection
  gen_attempts            int not null default 0,
  model_used              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists stores_creator_ip_created on stores (creator_ip_hash, created_at);

create table if not exists events (
  id          bigserial primary key,
  store_id    uuid references stores(id) on delete cascade,
  visitor_id  text,                                        -- random id in localStorage (per browser)
  ip_hash     text,                                        -- sha256(ip + salt), throttling only
  type        text not null,                               -- §10
  product_id  text,
  meta        jsonb,
  created_at  timestamptz not null default now(),
  event_day   date not null default ((now() at time zone 'utc')::date),
  constraint public_events_need_visitor
    check (type not in ('store_viewed','interest_tapped','whatsapp_tapped') or visitor_id is not null),
  constraint product_events_need_product
    check (type not in ('interest_tapped','whatsapp_tapped') or product_id is not null)
);

create index if not exists events_store_type on events (store_id, type);
create index if not exists events_store_ip_created on events (store_id, ip_hash, created_at);
-- one interest tap per browser per product; one view per browser per day
create unique index if not exists events_interest_once
  on events (store_id, product_id, visitor_id) where type = 'interest_tapped';
create unique index if not exists events_view_daily
  on events (store_id, visitor_id, event_day) where type = 'store_viewed';

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists stores_updated_at on stores;
create trigger stores_updated_at before update on stores
  for each row execute function set_updated_at();

-- RLS on, no anon policies: only the server (service role) touches these tables.
alter table stores enable row level security;
alter table events enable row level security;
revoke all on stores, events from anon, authenticated;
