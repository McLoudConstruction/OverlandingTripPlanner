-- 0.8: trips are planned as nights and days.
-- Run in the Supabase SQL editor after 0004.

-- Trip dates already exist (start_date / end_date from 0001). Add an optional
-- end location; null means "same as the start", which is the default.
alter table public.trips
  add column if not exists end_location text;

-- Campsite elevation is looked up once and cached here. Editable by hand.
alter table public.campsites
  add column if not exists elevation_ft numeric(8,1);

-- A stop is now a camp for a night, a backup for a night, or a day-stop
-- (a non-camp stop during a day's drive).
alter table public.trip_stops
  add column if not exists kind text not null default 'camp',
  add column if not exists night integer,
  add column if not exists day_number integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trip_stops_kind_check') then
    alter table public.trip_stops
      add constraint trip_stops_kind_check check (kind in ('camp', 'backup', 'daystop'));
  end if;
end $$;

-- Per-day settings. trip_days already exists from 0001 (day_number, max_hours).
-- notes: free text for the day. via: route-shaping points as [[lng, lat], ...];
-- they only bend the drive and never appear as stops.
alter table public.trip_days
  add column if not exists notes text,
  add column if not exists via jsonb not null default '[]';
