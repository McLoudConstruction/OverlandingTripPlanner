-- 0.7: conservative route fuel budgeting settings.
alter table public.trips
  add column if not exists fuel_price_cushion numeric(8,2) not null default 0.30,
  add column if not exists fuel_mileage_buffer numeric(5,2) not null default 10;

update public.trips
set fuel_price_cushion = coalesce(fuel_price_cushion, 0.30),
    fuel_mileage_buffer = coalesce(fuel_mileage_buffer, 10);
