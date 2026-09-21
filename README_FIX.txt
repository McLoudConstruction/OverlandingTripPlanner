OVERLAND PLANNER MVP 0.7.1

Build fix for MVP 0.7.

Fix:
- Renamed the imported map component in app/page.tsx from Map to MapboxMap.
- This prevents the imported React component from shadowing the native JavaScript Map constructor used for EIA fuel-price lookup.

This fixes the Vercel TypeScript error:
"Type error: 'new' expression, whose target lacks a construct signature, implicitly has an 'any' type."

Deploy the contents of this ZIP as the replacement for 0.7.
