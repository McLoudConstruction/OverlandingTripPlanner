# Overland Planner — MVP 0.1

This is the first UI foundation for the Overland Planner web app. It is intentionally built as a clean Next.js app that can deploy directly to Vercel.

## Stack
- Next.js + React + TypeScript
- Plain CSS (no UI framework dependency)
- Supabase-ready, but database/auth are not wired yet
- GitHub → Vercel deployment friendly

## Run locally
```bash
npm install
npm run dev
```
Then open http://localhost:3000.

## Deploy to Vercel
Import this repository into Vercel and keep the Framework Preset as **Next.js**. Leave the build/install/output settings at their defaults.

## Next build steps
1. Wire Supabase authentication and database.
2. Create Trips, Destinations, Stops, Campsites, Fuel Stops, Attractions, Hikes, Budget Items and Packing Items tables.
3. Add real map/routing provider.
4. Build the trip creation workflow.
5. Add automatic route calculations and fuel-range warnings.
6. Add recommendation/search workflows for campsites, fuel, attractions and hikes.
7. Import the useful structures from the 2024 spreadsheet as an optional seed/template.

## Product direction
The goal is not to make a prettier spreadsheet. The goal is to make the research-heavy parts of overlanding trip planning automatic while preserving the practical information an experienced trip planner actually needs: exact campsite coordinates, elevation, driving time/mileage, fuel range, remote fuel availability, attractions, hikes and trip budget.
