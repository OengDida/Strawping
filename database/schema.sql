-- Strawping secure schema for serverless functions + Supabase.
-- Run in Supabase SQL Editor as project owner.
create table if not exists public.store_data (
  key text primary key check (key in ('products','settings')),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.store_orders (
  id text primary key,
  "createdAt" timestamptz not null,
  status text not null default 'New' check (status in ('New','Contacted','Shipped','Completed','Cancelled')),
  customer jsonb not null,
  items jsonb not null,
  total numeric(12,2) not null check (total >= 0)
);
alter table public.store_data enable row level security;
alter table public.store_orders enable row level security;
-- Remove the permissive policy shown in an older admin-page setup guide.
drop policy if exists "Allow all on store_data" on public.store_data;
revoke all on public.store_data from public, anon, authenticated;
revoke all on public.store_orders from public, anon, authenticated;
-- Serverless functions use the service-role key. Never put that key in frontend code.
insert into public.store_data(key,value)
values
 ('products', '[]'::jsonb),
 ('settings', $settings${"storeName": "Strawping", "tagline": "Thoughtfully crafted lifestyle essentials and aesthetic goods.", "announcement": "✨ Free express doorstep delivery on all orders!", "announcementActive": true, "currency": "$", "contactTelegram": "@didaoeng"}$settings$::jsonb)
on conflict(key) do nothing;


-- Database-backed fixed-window rate limiting for serverless functions.
-- Only the service role should call the RPC. No public table access is granted.
create table if not exists public.store_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);
alter table public.store_rate_limits enable row level security;

-- This app accesses these tables only through the server-side service-role API.
-- Remove any legacy/direct-client policies so anon/authenticated have no path.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('store_data', 'store_orders', 'store_rate_limits')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_record.policyname,
      policy_record.tablename
    );
  end loop;
end;
$$;

revoke all on public.store_rate_limits from public, anon, authenticated;

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_time timestamptz := pg_catalog.now();
  allowed boolean := false;
begin
  if p_key is null or length(p_key) > 128 or p_limit < 1 or p_limit > 1000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    return false;
  end if;

  insert into public.store_rate_limits(rate_key, window_started_at, request_count)
  values (p_key, current_time, 1)
  on conflict (rate_key) do update
    set window_started_at = case
          when public.store_rate_limits.window_started_at + pg_catalog.make_interval(secs => p_window_seconds) <= current_time
          then current_time else public.store_rate_limits.window_started_at end,
        request_count = case
          when public.store_rate_limits.window_started_at + pg_catalog.make_interval(secs => p_window_seconds) <= current_time
          then 1 else public.store_rate_limits.request_count + 1 end
  returning request_count <= p_limit into allowed;
  return allowed;
end;
$$; 
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;


-- Server-side admin sessions (allows logout / revocation). Only the service role
-- touches this table; only a SHA-256 of the session id is stored.
create table if not exists public.store_sessions (
  session_id_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
alter table public.store_sessions enable row level security;
revoke all on public.store_sessions from public, anon, authenticated;
create index if not exists store_sessions_expires_at_idx on public.store_sessions (expires_at);
