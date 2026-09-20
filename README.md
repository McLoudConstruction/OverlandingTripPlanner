# Overland Planner — MVP 0.5

Version 0.5 establishes the real data foundation without making the product dependent on paid AI or undocumented third-party scraping.

## Stack
- Next.js + React + TypeScript
- Supabase Postgres + Row Level Security
- Supabase SSR helpers for Next.js
- Vercel deployment

## What changed
- Added Supabase browser/server clients.
- Added Next.js proxy for Supabase auth session refresh.
- Added a Supabase migration for trips, trip days, sources, places, trip places, budgets and packing items.
- Added source provenance fields to the place model.
- Seeded the source registry with NPS, BLM, USFS, Recreation.gov RIDB, OpenStreetMap and iOverlander as an external source.
- Added a Save to Supabase action to the prototype. It safely falls back when Supabase environment variables/auth are not configured.
- Added RLS policies so trip-owned records are isolated by authenticated user.

## Supabase setup
1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/migrations/0001_overland_foundation.sql`.
3. In Vercel Project Settings → Environment Variables, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Redeploy.

Supabase's current Next.js guidance uses `@supabase/ssr` for cookie-based sessions and `NEXT_PUBLIC_SUPABASE_URL` plus the publishable key for the client. See the official docs: https://supabase.com/docs/guides/getting-started/quickstarts/nextjs

## Important
This version does not scrape or bulk-copy iOverlander, GasBuddy or other third-party datasets. The schema is designed so approved APIs, open datasets and licensed/community sources can be added later without redesigning the app.

## Run locally
```bash
npm install
npm run dev
```


## MVP 0.5 changes
- Added email/password Supabase authentication UI.
- Added Next.js 15-compatible `middleware.ts` for Supabase session refresh.
- Added `/auth/callback` for email confirmation / PKCE callback handling.
- Added Save Trip, My Trips, Load Trip, and Sign Out controls.
- Saving an existing trip updates it instead of creating a duplicate.
- Trip days are replaced on save so edits stay synchronized.

After deploying, add the same Supabase environment variables from `.env.example` to Vercel. In Supabase Auth settings, make sure your site's URL is configured. If email confirmation is enabled, new users will receive a confirmation email.
