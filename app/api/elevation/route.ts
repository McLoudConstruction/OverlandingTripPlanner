import { NextRequest, NextResponse } from "next/server";

// Elevation lookup for campsites. Runs on the server so the browser never has
// to deal with third-party CORS rules.
//   1. USGS Elevation Point Query Service (accurate, United States only)
//   2. Open-Meteo elevation (worldwide, coarser) for anything USGS cannot answer
// Request:  /api/elevation?points=lat,lon;lat,lon
// Response: { elevations: (number | null)[] }  in feet, same order as the request.

export const runtime = "nodejs";

const MAX_POINTS = 50;
const M_TO_FT = 3.28084;

async function usgs(lat: number, lon: number): Promise<number | null> {
  try {
    const url = `https://epqs.nationalmap.gov/v1/json?x=${lon}&y=${lat}&wkid=4326&units=Feet&includeDate=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const v = Number(data?.value);
    // USGS answers -1,000,000 for locations outside its coverage.
    return Number.isFinite(v) && v > -1000 ? v : null;
  } catch {
    return null;
  }
}

async function openMeteo(points: { lat: number; lon: number }[]): Promise<(number | null)[]> {
  if (!points.length) return [];
  try {
    const url =
      `https://api.open-meteo.com/v1/elevation?latitude=${points.map((p) => p.lat).join(",")}` +
      `&longitude=${points.map((p) => p.lon).join(",")}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return points.map(() => null);
    const data = await res.json();
    const list: unknown[] = Array.isArray(data?.elevation) ? data.elevation : [];
    return points.map((_, i) => {
      const v = Number(list[i]);
      return Number.isFinite(v) ? v * M_TO_FT : null;
    });
  } catch {
    return points.map(() => null);
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("points") || "";
  const points = raw
    .split(";")
    .map((s) => s.split(",").map(Number))
    .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)
    .slice(0, MAX_POINTS)
    .map(([lat, lon]) => ({ lat, lon }));
  if (!points.length) return NextResponse.json({ error: "No valid points. Use ?points=lat,lon;lat,lon" }, { status: 400 });

  const out: (number | null)[] = new Array(points.length).fill(null);
  // USGS takes one point per request, so keep the fan-out small.
  let cursor = 0;
  async function worker() {
    while (cursor < points.length) {
      const i = cursor++;
      out[i] = await usgs(points[i].lat, points[i].lon);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, points.length) }, worker));

  const missing = out.map((v, i) => (v == null ? i : -1)).filter((i) => i >= 0);
  if (missing.length) {
    const fallback = await openMeteo(missing.map((i) => points[i]));
    missing.forEach((idx, j) => { out[idx] = fallback[j]; });
  }
  return NextResponse.json({ elevations: out.map((v) => (v == null ? null : Math.round(v * 10) / 10)) });
}
