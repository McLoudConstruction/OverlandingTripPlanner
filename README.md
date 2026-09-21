# Overland Planner MVP 0.6

Focused trip logistics app built around:
- personal campsite library with List / Map views
- trips made from saved campsite stops
- Mapbox routing and gas-station discovery along the route
- vehicle fuel-range planning
- budget and reusable pack list
- Supabase persistence and authentication

## Deploy

1. Run `supabase/migrations/0001_overland_foundation.sql` if this is a new Supabase project.
2. Run `supabase/migrations/0002_simplify_overland.sql`.
3. Add these Vercel environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_MAPBOX_TOKEN`
   - `COLLECTAPI_TOKEN` (when CollectAPI pricing is enabled)
   - `COLLECTAPI_GAS_ENDPOINT` (the exact Gas Prices endpoint from your CollectAPI account)
4. Redeploy.

## Mapbox

The app uses Mapbox for map display, driving routes, and gas-station discovery along a route. The Directions API supports multi-stop driving routes, and Search Box supports category searches along a supplied route. Keep the public Mapbox token in `NEXT_PUBLIC_MAPBOX_TOKEN`.

## CollectAPI

CollectAPI currently advertises a Gas Prices API with gasoline and diesel prices at fuel stations in cities. The exact endpoint/parameters should be taken from the user's CollectAPI account documentation before enabling live price lookups. The 0.6 data model is ready for station prices, but does not guess an endpoint or pretend that a city-level price is an exact station price.

## Product boundary

The app intentionally does not research campsites, attractions, hikes, or activities. Find campsites wherever you prefer, then save the useful ones into your personal library. iOverlander can remain part of that external research workflow.
