// Range-aware fuel stop planning for the route planner.
//
// Two jobs:
//   1. findStationsAlongRoute(): split the route into windows and run one
//      Mapbox search-along-route request per window, so gas stations are
//      found along the whole trip (a single request returns at most 25).
//   2. planFuelStops(): choose the fewest fuel stops that keep the driver at
//      or above the minimum arrival range at every stop and destination.

export const MIN_ARRIVAL_RANGE_MILES = 100;
const METERS_PER_MILE = 1609.344;

export type VehicleSettings = {
  mpg: number;
  tankGallons: number;
  reservePercent: number;
  mileageBufferPercent: number;
};

export type RangeModel = {
  /** Nominal miles on a full tank (mpg x tank). */
  fullRange: number;
  /** Real route miles on a full tank after the mileage reserve is applied. */
  effectiveRange: number;
  /** Miles the tank-reserve percentage represents. */
  reserveMiles: number;
  /** Range that must remain on arrival: the larger of 100 mi and the reserve. */
  arrivalFloor: number;
  /** Longest leg allowed between fills (full tank in, floor remaining out). */
  maxHop: number;
};

export function computeRange(v: VehicleSettings): RangeModel {
  const mpg = Number.isFinite(v.mpg) && v.mpg > 0 ? v.mpg : 0;
  const tank = Number.isFinite(v.tankGallons) && v.tankGallons > 0 ? v.tankGallons : 0;
  const buffer = Math.max(0, Number.isFinite(v.mileageBufferPercent) ? v.mileageBufferPercent : 0);
  const reserve = Math.min(100, Math.max(0, Number.isFinite(v.reservePercent) ? v.reservePercent : 0));
  const fullRange = mpg * tank;
  const effectiveRange = fullRange / (1 + buffer / 100);
  const reserveMiles = effectiveRange * (reserve / 100);
  const arrivalFloor = Math.max(MIN_ARRIVAL_RANGE_MILES, reserveMiles);
  return { fullRange, effectiveRange, reserveMiles, arrivalFloor, maxHop: Math.max(0, effectiveRange - arrivalFloor) };
}

export type FuelStation = {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
  /** Miles along the route where the station's turn-off is. */
  mile: number;
  /** Straight-line miles from the route. */
  offsetMiles: number;
  /** Extra drive time to visit, from Mapbox, when provided. */
  detourMinutes: number | null;
  planned?: boolean;
};

export type WindowFailure = { fromMile: number; toMile: number; error: string };

// ---------------------------------------------------------------- geometry

type Pt = [number, number]; // [lng, lat]

function haversineMiles(a: Pt, b: Pt) {
  const r = 3958.7613;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * r * Math.asin(Math.sqrt(x));
}

/** Cumulative miles at each vertex, scaled so the total equals the routed distance. */
export function cumulativeMiles(coords: Pt[], routeMeters: number): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineMiles(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1];
  const target = routeMeters / METERS_PER_MILE;
  const scale = total > 0 && target > 0 ? target / total : 1;
  return cum.map((d) => d * scale);
}

/** Planar projection of a point onto the polyline slice [i0, i1]. */
function projectOnPolyline(p: Pt, coords: Pt[], cum: number[], i0: number, i1: number) {
  const cosLat = Math.cos((p[1] * Math.PI) / 180);
  const milesPerDegLat = 69.0468;
  const milesPerDegLng = milesPerDegLat * cosLat;
  let best = { offsetMiles: Infinity, mile: cum[i0] };
  for (let i = i0; i < i1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ax = (a[0] - p[0]) * milesPerDegLng, ay = (a[1] - p[1]) * milesPerDegLat;
    const bx = (b[0] - p[0]) * milesPerDegLng, by = (b[1] - p[1]) * milesPerDegLat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const px = ax + t * dx, py = ay + t * dy;
    const off = Math.sqrt(px * px + py * py);
    if (off < best.offsetMiles) best = { offsetMiles: off, mile: cum[i] + t * (cum[i + 1] - cum[i]) };
  }
  return best;
}

/** Iterative Douglas-Peucker in a local planar frame; tolerance in miles. */
function simplify(coords: Pt[], toleranceMiles: number): Pt[] {
  if (coords.length <= 2) return coords;
  const lat0 = coords[Math.floor(coords.length / 2)][1];
  const kx = 69.0468 * Math.cos((lat0 * Math.PI) / 180), ky = 69.0468;
  const xs = coords.map((c) => c[0] * kx), ys = coords.map((c) => c[1] * ky);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0, idx = -1;
    const dx = xs[e] - xs[s], dy = ys[e] - ys[s];
    const len2 = dx * dx + dy * dy;
    for (let i = s + 1; i < e; i++) {
      let d: number;
      if (len2 === 0) d = Math.hypot(xs[i] - xs[s], ys[i] - ys[s]);
      else {
        const t = Math.max(0, Math.min(1, ((xs[i] - xs[s]) * dx + (ys[i] - ys[s]) * dy) / len2));
        d = Math.hypot(xs[i] - (xs[s] + t * dx), ys[i] - (ys[s] + t * dy));
      }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > toleranceMiles) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return coords.filter((_, i) => keep[i]);
}

function encodeSigned(v: number) {
  let n = v < 0 ? ~(v << 1) : v << 1;
  let s = "";
  while (n >= 0x20) { s += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
  return s + String.fromCharCode(n + 63);
}

export function encodePolyline6(coords: Pt[]) {
  let lastLat = 0, lastLng = 0, out = "";
  for (const [lng, lat] of coords) {
    const lat6 = Math.round(lat * 1e6), lng6 = Math.round(lng * 1e6);
    out += encodeSigned(lat6 - lastLat) + encodeSigned(lng6 - lastLng);
    lastLat = lat6; lastLng = lng6;
  }
  return out;
}

// ------------------------------------------------------ search along route

type RouteWindow = { fromMile: number; toMile: number; i0: number; i1: number };

export function splitRoute(cum: number[], windowMiles: number): RouteWindow[] {
  const total = cum[cum.length - 1];
  if (cum.length < 2 || total <= 0) return [];
  // Spread the route evenly so there is no tiny trailing window.
  const count = Math.max(1, Math.round(total / Math.max(20, windowMiles)));
  const size = total / count;
  const windows: RouteWindow[] = [];
  for (let k = 0; k < count; k++) {
    const from = k * size;
    const to = k === count - 1 ? total : (k + 1) * size;
    let i0 = 0;
    while (i0 < cum.length - 2 && cum[i0 + 1] <= from) i0++; // last vertex at or before `from`
    let i1 = Math.max(i0 + 1, 0);
    while (i1 < cum.length - 1 && cum[i1] < to) i1++; // first vertex at or after `to`
    windows.push({ fromMile: from, toMile: to, i0, i1 });
  }
  return windows;
}

const MAX_URL = 7000;

function buildSearchUrl(slice: Pt[], token: string, deviationMinutes: number) {
  let tol = 0.15;
  let url = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const encoded = encodePolyline6(simplify(slice, tol));
    url =
      `https://api.mapbox.com/search/searchbox/v1/category/gas_station` +
      `?route=${encodeURIComponent(encoded)}&route_geometry=polyline6&sar_type=isochrone` +
      `&time_deviation=${deviationMinutes}&limit=25&access_token=${token}`;
    if (url.length <= MAX_URL) break;
    tol *= 2;
  }
  return url;
}

async function fetchJson(url: string, retries = 2): Promise<any> {
  let lastError = "request failed";
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      lastError = `Mapbox returned ${res.status}`;
      // 4xx other than rate limiting will not improve on retry.
      if (res.status !== 429 && res.status < 500) break;
    } catch (e: any) {
      lastError = e?.message || "network error";
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  throw new Error(lastError);
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function detourMinutesOf(props: any): number | null {
  return num(props?.added_time) ?? num(props?.metadata?.added_time) ?? num(props?.eta_added);
}

async function pool<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

/**
 * Find gas stations along the entire route. The route is cut into windows
 * (about a third of the vehicle's usable hop, 50-150 mi) and each window is
 * searched separately, in parallel, with a simplified polyline so the request
 * URL stays short. A window with no hits is retried with a wider detour.
 */
export async function findStationsAlongRoute(
  geometry: { coordinates: number[][] },
  routeMeters: number,
  token: string,
  vehicle: VehicleSettings
): Promise<{ stations: FuelStation[]; failedWindows: WindowFailure[]; windowCount: number }> {
  const coords = (geometry?.coordinates || []) as Pt[];
  if (coords.length < 2) return { stations: [], failedWindows: [], windowCount: 0 };
  const cum = cumulativeMiles(coords, routeMeters);
  const { maxHop } = computeRange(vehicle);
  const windowMiles = maxHop > 0 ? Math.min(150, Math.max(50, maxHop / 3)) : 100;
  const windows = splitRoute(cum, windowMiles);

  const failedWindows: WindowFailure[] = [];
  const perWindow = await pool(windows, 4, async (win) => {
    const slice = coords.slice(win.i0, win.i1 + 1);
    try {
      let data = await fetchJson(buildSearchUrl(slice, token, 15));
      if (!(data?.features?.length > 0)) data = await fetchJson(buildSearchUrl(slice, token, 45));
      return (data?.features || []) as any[];
    } catch (e: any) {
      failedWindows.push({ fromMile: win.fromMile, toMile: win.toMile, error: e?.message || "search failed" });
      return [] as any[];
    }
  });

  const byKey = new Map<string, FuelStation>();
  perWindow.forEach((features, w) => {
    const win = windows[w];
    for (const f of features) {
      const c = f?.geometry?.coordinates;
      if (!Array.isArray(c) || c.length < 2) continue;
      const point: Pt = [Number(c[0]), Number(c[1])];
      const proj = projectOnPolyline(point, coords, cum, win.i0, win.i1);
      const props = f.properties || {};
      const id = String(props.mapbox_id || f.id || `${point[0].toFixed(5)},${point[1].toFixed(5)}`);
      const station: FuelStation = {
        id,
        name: props.name || f.text || "Gas station",
        address: props.full_address || props.place_formatted || props.address || "",
        lng: point[0],
        lat: point[1],
        mile: proj.mile,
        offsetMiles: proj.offsetMiles,
        detourMinutes: detourMinutesOf(props),
      };
      const prev = byKey.get(id);
      if (!prev || station.offsetMiles < prev.offsetMiles) byKey.set(id, station);
    }
  });

  const stations = [...byKey.values()].sort((a, b) => a.mile - b.mile);
  return { stations, failedWindows, windowCount: windows.length };
}

// ---------------------------------------------------------------- planning

export type Waypoint = { name: string; mile: number };

export type PlannedFuelStop = {
  station: FuelStation;
  mile: number;
  milesSincePrevious: number;
  rangeOnArrival: number;
};

export type FuelGap = {
  fromMile: number;
  toMile: number;
  distance: number;
  shortfallMiles: number;
  extraGallons: number;
  /** True when a station search failed inside this stretch, so a station may exist. */
  dataIncomplete: boolean;
};

export type Arrival = { name: string; mile: number; rangeOnArrival: number; ok: boolean };

export type FuelStopPlan = {
  range: RangeModel;
  stops: PlannedFuelStop[];
  gaps: FuelGap[];
  arrivals: Arrival[];
  feasible: boolean;
  failedWindows: WindowFailure[];
  problem: string | null;
};

const SAME_SPOT_MILES = 0.5;
const PREFER_LOW_DETOUR_BAND_MILES = 8;

function detourScore(s: FuelStation) {
  return s.detourMinutes ?? s.offsetMiles * 2;
}

/**
 * Greedy planner: leave full, and at each step take the furthest station the
 * vehicle can reach while still keeping the arrival floor (within a small
 * band, prefer the smallest detour). Greedy-furthest uses the fewest stops and
 * finds a plan whenever one exists. Where no station is reachable, the stretch
 * is reported as a gap along with the extra fuel needed to cover it.
 */
export function planFuelStops(
  stations: FuelStation[],
  waypoints: Waypoint[],
  totalMiles: number,
  vehicle: VehicleSettings,
  failedWindows: WindowFailure[] = []
): FuelStopPlan {
  const range = computeRange(vehicle);
  const empty = (problem: string): FuelStopPlan => ({
    range, stops: [], gaps: [], arrivals: [], feasible: false, failedWindows, problem,
  });
  if (!(vehicle.mpg > 0) || !(vehicle.tankGallons > 0)) return empty("Enter your MPG and tank size to plan fuel stops.");
  if (range.maxHop <= 0) {
    return empty(
      `With ${Math.round(range.effectiveRange)} mi of usable range, this vehicle cannot keep ${Math.round(range.arrivalFloor)} mi in reserve on arrival. Increase tank size or MPG, or lower the mileage reserve.`
    );
  }

  const sorted = [...stations].sort((a, b) => a.mile - b.mile);
  const fills: PlannedFuelStop[] = [];
  const gaps: FuelGap[] = [];
  const overlapsFailure = (a: number, b: number) => failedWindows.some((w) => w.fromMile < b && w.toMile > a);
  const gallonsFor = (miles: number) => (miles * (1 + Math.max(0, vehicle.mileageBufferPercent) / 100)) / vehicle.mpg;

  let pos = 0; // last fill; the trip starts with a full tank
  for (let guard = 0; totalMiles - pos > range.maxHop + 1e-6 && guard < 500; guard++) {
    const reach = pos + range.maxHop;
    const inReach = sorted.filter((s) => s.mile > pos + SAME_SPOT_MILES && s.mile <= reach);
    if (inReach.length) {
      const furthest = inReach[inReach.length - 1].mile;
      const band = inReach.filter((s) => s.mile >= furthest - PREFER_LOW_DETOUR_BAND_MILES);
      const pick = band.reduce((a, b) => (detourScore(b) < detourScore(a) ? b : a));
      fills.push({
        station: pick, mile: pick.mile, milesSincePrevious: pick.mile - pos,
        rangeOnArrival: range.effectiveRange - (pick.mile - pos),
      });
      pos = pick.mile;
    } else {
      const next = sorted.find((s) => s.mile > reach);
      const toMile = next ? next.mile : totalMiles;
      const shortfall = toMile - pos - range.maxHop;
      gaps.push({
        fromMile: pos, toMile, distance: toMile - pos, shortfallMiles: shortfall,
        extraGallons: gallonsFor(shortfall), dataIncomplete: overlapsFailure(pos, toMile),
      });
      if (!next) break;
      fills.push({
        station: next, mile: next.mile, milesSincePrevious: next.mile - pos,
        rangeOnArrival: range.effectiveRange - (next.mile - pos),
      });
      pos = next.mile;
    }
  }

  const arrivals: Arrival[] = waypoints.map((w) => {
    const lastFill = fills.reduce((m, f) => (f.mile <= w.mile + 1e-6 ? Math.max(m, f.mile) : m), 0);
    const rangeOnArrival = range.effectiveRange - (w.mile - lastFill);
    return { name: w.name, mile: w.mile, rangeOnArrival, ok: rangeOnArrival >= range.arrivalFloor - 1e-6 };
  });

  return {
    range, stops: fills, gaps, arrivals,
    feasible: gaps.length === 0 && arrivals.every((a) => a.ok),
    failedWindows, problem: null,
  };
}
