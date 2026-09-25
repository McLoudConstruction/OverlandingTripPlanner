-- 0.7.5: keep state separate from the user-defined campsite area label.
alter table public.campsites add column if not exists state text;
create index if not exists campsites_state_idx on public.campsites(state);

-- Google Maps imports previously populated Area from geocoding. Clear those
-- generated values so Area can become a user-defined label.
update public.campsites
set area = null
where source = 'Google Maps';
