create extension if not exists pgcrypto;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  start_location text,
  destinations text[] not null default '{}',
  start_date date,
  end_date date,
  vehicle_name text,
  mpg numeric(6,2),
  tank_gallons numeric(6,2),
  fuel_reserve_percent numeric(5,2) not null default 15,
  daily_driving_hours numeric(4,2),
  camping_style text,
  planning_gas_price numeric(8,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_number integer not null,
  label text,
  destination text,
  max_hours numeric(4,2),
  overnight text,
  unique(trip_id, day_number)
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_type text not null,
  base_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete set null,
  source_record_id text,
  name text not null,
  place_type text not null,
  latitude double precision not null,
  longitude double precision not null,
  elevation_ft numeric(8,2),
  description text,
  area text,
  source_url text,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_id, source_record_id)
);

create table if not exists public.trip_places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  day_number integer,
  stop_order integer,
  notes text,
  status text not null default 'candidate',
  created_at timestamptz not null default now(),
  unique(trip_id, place_id)
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  category text not null,
  label text not null,
  amount numeric(10,2) not null default 0,
  source text default 'user',
  created_at timestamptz not null default now()
);

create table if not exists public.pack_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  category text,
  quantity integer not null default 1,
  packed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists places_type_idx on public.places(place_type);
create index if not exists places_lat_lon_idx on public.places(latitude, longitude);
create index if not exists places_source_idx on public.places(source_id);

insert into public.sources (name, source_type, base_url, notes) values
 ('National Park Service', 'government', 'https://www.nps.gov/', 'Official NPS data can be ingested when an appropriate endpoint/dataset is available.'),
 ('Bureau of Land Management', 'government', 'https://www.blm.gov/', 'Public-land and recreation datasets; verify local camping rules before recommending a site.'),
 ('U.S. Forest Service', 'government', 'https://www.fs.usda.gov/', 'Forest recreation/camping datasets; verify current local restrictions.'),
 ('Recreation.gov RIDB', 'government_api', 'https://ridb.recreation.gov/', 'Federal recreation facility/campsite source.'),
 ('OpenStreetMap', 'open_data', 'https://www.openstreetmap.org/', 'Open geographic data for place/station/road context; respect ODbL attribution/licensing.'),
 ('iOverlander', 'community_external', 'https://ioverlander.com/', 'External/community source. Do not copy or redistribute data without appropriate permission/license.')
on conflict (name) do nothing;

alter table public.trips enable row level security;
alter table public.trip_days enable row level security;
alter table public.trip_places enable row level security;
alter table public.budget_items enable row level security;
alter table public.pack_items enable row level security;
alter table public.sources enable row level security;
alter table public.places enable row level security;

create policy "users manage own trips" on public.trips for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own trip days" on public.trip_days for all using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())) with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));
create policy "users manage own trip places" on public.trip_places for all using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())) with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));
create policy "users manage own budgets" on public.budget_items for all using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())) with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));
create policy "users manage own pack items" on public.pack_items for all using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())) with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));
create policy "authenticated users can read sources" on public.sources for select to authenticated using (true);
create policy "authenticated users can read places" on public.places for select to authenticated using (true);

