-- 0.6: personal campsite library, trip stops, and fuel-stop storage.
create table if not exists public.campsites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  area text,
  type text not null default 'Other',
  latitude double precision not null,
  longitude double precision not null,
  cost numeric(10,2),
  reservation text,
  rating integer check (rating between 1 and 5),
  favorite boolean not null default false,
  notes text,
  source text,
  source_url text,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campsites_user_idx on public.campsites(user_id);
create index if not exists campsites_coords_idx on public.campsites(latitude,longitude);

create table if not exists public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  campsite_id uuid references public.campsites(id) on delete set null,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  stop_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists trip_stops_trip_idx on public.trip_stops(trip_id,stop_order);

create table if not exists public.fuel_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text,
  provider_place_id text,
  latitude double precision,
  longitude double precision,
  address text,
  distance_from_leg_start_miles numeric(10,2),
  price_regular numeric(8,3),
  price_midgrade numeric(8,3),
  price_premium numeric(8,3),
  price_diesel numeric(8,3),
  price_source text,
  price_checked_at timestamptz,
  selected boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.campsites enable row level security;
alter table public.trip_stops enable row level security;
alter table public.fuel_stops enable row level security;
create policy "users manage own campsites" on public.campsites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own trip stops" on public.trip_stops for all using (exists(select 1 from public.trips t where t.id=trip_id and t.user_id=auth.uid())) with check (exists(select 1 from public.trips t where t.id=trip_id and t.user_id=auth.uid()));
create policy "users manage own fuel stops" on public.fuel_stops for all using (exists(select 1 from public.trips t where t.id=trip_id and t.user_id=auth.uid())) with check (exists(select 1 from public.trips t where t.id=trip_id and t.user_id=auth.uid()));
