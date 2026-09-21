# Overland Planner MVP 0.7

Focused trip logistics app built around:
- personal campsite library with List / Map views
- trips made from saved campsite stops
- Mapbox driving routes and gas-station discovery along the route
- conservative route-driven fuel budgeting
- EIA weekly retail gasoline pricing as the baseline
- editable $/gal price cushion and mileage reserve
- simple trip budget and reusable pack list
- Supabase persistence and authentication

## Deploy

1. Run the original migrations if this is a new Supabase project:
   - `supabase/migrations/0001_overland_foundation.sql`
   - `supabase/migrations/0002_simplify_overland.sql`
2. Run `supabase/migrations/0003_fuel_budget.sql`.
3. Add these Vercel environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_MAPBOX_TOKEN`
   - `EIA_API_KEY`
4. Redeploy.

## Fuel budgeting

The planner uses EIA weekly regular gasoline retail averages as the price baseline. When EIA publishes a state series for the route state, that state average is used. Otherwise the planner falls back to the state's PADD regional average.

The default conservative assumptions are:
- +$0.30/gal price cushion
- +10% mileage reserve
- vehicle MPG, tank size, and tank reserve are editable

The recommended fuel budget is calculated from route miles, the mileage reserve, MPG, the EIA baseline, and the price cushion. It is a planning budget, not a guarantee of actual pump prices.

EIA requires a free API key for API access. Register at https://www.eia.gov/opendata/register.php.

## Mapbox

Mapbox is used for maps, multi-stop driving routes, reverse geocoding route stops to states, and gas-station discovery along the route.

## Product boundary

The app intentionally does not research campsites, attractions, hikes, or activities. Find campsites wherever you prefer, then save the useful ones into your personal library. iOverlander can remain part of that external research workflow.
