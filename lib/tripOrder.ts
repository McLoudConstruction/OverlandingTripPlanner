// Trip stop ordering, place search and directions helpers for the Trip screen.

export type LngLat = { longitude: number; latitude: number };
export type PathPoint = LngLat & { name?: string };

const METERS_PER_MILE = 1609.344;
/** Mapbox Matrix API limit for the driving profile. */
export const MATRIX_MAX_COORDS = 25;
/** Mapbox Directions API limit (including start). */
export const DIRECTIONS_MAX_COORDS = 25;

export function haversineMiles(a: LngLat, b: LngLat) {
  const r = 3958.7613;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * r * Math.asin(Math.sqrt(x));
}

/** Stable key for a list of points; used to tell whether a route is stale. */
export function pointsKey(points: LngLat[]): string {
  return points.map((p) => `${p.longitude.toFixed(5)},${p.latitude.toFixed(5)}`).join(";");
}

// ------------------------------------------------------------------ ordering

/**
 * Best open path that starts at node 0 and visits every other node once,
 * ending wherever is cheapest. `cost[i][j]` is the cost of driving i -> j.
 * Exact (Held-Karp) up to 12 stops; nearest-neighbor + 2-opt + or-opt beyond.
 * Returns node indices (excluding node 0) in visiting order.
 */
export function solveOpenPath(cost: number[][]): number[] {
  const n = cost.length - 1; // stops to visit
  if (n <= 0) return [];
  if (n === 1) return [1];
  return n <= 12 ? heldKarp(cost, n) : heuristicPath(cost, n);
}

function heldKarp(cost: number[][], n: number): number[] {
  const size = 1 << n;
  const dp = new Float64Array(size * n).fill(Infinity);
  const parent = new Int8Array(size * n).fill(-1);
  for (let j = 0; j < n; j++) dp[(1 << j) * n + j] = cost[0][j + 1];
  for (let mask = 1; mask < size; mask++) {
    for (let last = 0; last < n; last++) {
      if (!(mask & (1 << last))) continue;
      const cur = dp[mask * n + last];
      if (cur === Infinity) continue;
      for (let next = 0; next < n; next++) {
        if (mask & (1 << next)) continue;
        const nm = mask | (1 << next);
        const v = cur + cost[last + 1][next + 1];
        if (v < dp[nm * n + next]) { dp[nm * n + next] = v; parent[nm * n + next] = last; }
      }
    }
  }
  const full = size - 1;
  let bestLast = 0, best = Infinity;
  for (let j = 0; j < n; j++) if (dp[full * n + j] < best) { best = dp[full * n + j]; bestLast = j; }
  const order: number[] = [];
  let mask = full, last = bestLast;
  while (last !== -1) {
    order.push(last + 1);
    const p = parent[mask * n + last];
    mask &= ~(1 << last);
    last = p;
  }
  return order.reverse();
}

function pathCost(cost: number[][], path: number[]) {
  let total = 0, prev = 0;
  for (const node of path) { total += cost[prev][node]; prev = node; }
  return total;
}

function heuristicPath(cost: number[][], n: number): number[] {
  // Nearest neighbor from the start.
  const left = new Set<number>(Array.from({ length: n }, (_, i) => i + 1));
  let path: number[] = [];
  let cur = 0;
  while (left.size) {
    let best = -1, bd = Infinity;
    for (const c of left) if (cost[cur][c] < bd) { bd = cost[cur][c]; best = c; }
    path.push(best); left.delete(best); cur = best;
  }
  // 2-opt (segment reversal) and or-opt (move one stop) until no gain.
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    let base = pathCost(cost, path);
    for (let i = 0; i < path.length - 1; i++) {
      for (let j = i + 1; j < path.length; j++) {
        const cand = [...path.slice(0, i), ...path.slice(i, j + 1).reverse(), ...path.slice(j + 1)];
        const c = pathCost(cost, cand);
        if (c < base - 1e-9) { path = cand; base = c; improved = true; }
      }
    }
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      const rest = [...path.slice(0, i), ...path.slice(i + 1)];
      for (let k = 0; k <= rest.length; k++) {
        if (k === i) continue;
        const cand = [...rest.slice(0, k), node, ...rest.slice(k)];
        const c = pathCost(cost, cand);
        if (c < base - 1e-9) { path = cand; base = c; improved = true; }
      }
    }
  }
  return path;
}

/** Drive-time cost matrix from the Mapbox Matrix API; null when unavailable. */
export async function fetchDurationMatrix(points: LngLat[], token: string): Promise<number[][] | null> {
  if (points.length < 2 || points.length > MATRIX_MAX_COORDS) return null;
  try {
    const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(";");
    const res = await fetch(
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}?annotations=duration&access_token=${token}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !Array.isArray(data.durations)) return null;
    return data.durations as number[][];
  } catch {
    return null;
  }
}

/** Fill unreachable (null) or missing matrix cells from straight-line distance. */
function completeMatrix(points: LngLat[], durations: number[][] | null): number[][] {
  const n = points.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return 0;
      const d = durations?.[i]?.[j];
      // Straight-line fallback at ~45 mph, in seconds, with a detour penalty.
      return typeof d === "number" && Number.isFinite(d) ? d : (haversineMiles(points[i], points[j]) / 45) * 3600 * 1.5;
    })
  );
}

export type OrderResult<T> = { ordered: T[]; method: "road" | "distance" };

/**
 * Most efficient visiting order for `stops`, leaving from `start` (or, when
 * there is no start, from the first stop, which stays first). The route ends
 * at whichever stop makes the whole drive shortest.
 */
export async function optimizeStopOrder<T extends LngLat>(
  start: LngLat | null,
  stops: T[],
  token: string | undefined
): Promise<OrderResult<T>> {
  const anchor = start ?? stops[0];
  const movable = start ? stops : stops.slice(1);
  if (!anchor || movable.length < 2) return { ordered: [...stops], method: "distance" };
  const points: LngLat[] = [anchor, ...movable];
  const matrix = token ? await fetchDurationMatrix(points, token) : null;
  const cost = completeMatrix(points, matrix);
  const order = solveOpenPath(cost);
  const ordered = order.map((i) => movable[i - 1]);
  return { ordered: start ? ordered : [stops[0], ...ordered], method: matrix ? "road" : "distance" };
}

/**
 * Manual mode: put a new stop where it adds the least driving, without
 * disturbing the order the person chose. Straight-line distance.
 */
export function cheapestInsertionIndex(start: LngLat | null, stops: LngLat[], stop: LngLat): number {
  // Without a start, the first stop is the origin and must stay first.
  const firstSlot = start ? 0 : 1;
  if (stops.length < firstSlot) return stops.length;
  let bestSlot = stops.length, bestAdd = Infinity;
  for (let slot = firstSlot; slot <= stops.length; slot++) {
    const prev = (slot === 0 ? start : stops[slot - 1]) as LngLat;
    const next = stops[slot];
    const add = next
      ? haversineMiles(prev, stop) + haversineMiles(stop, next) - haversineMiles(prev, next)
      : haversineMiles(prev, stop);
    if (add < bestAdd) { bestAdd = add; bestSlot = slot; }
  }
  return bestSlot;
}

// -------------------------------------------------------------- directions

export type DirectionsResult = { route: any | null; error: string | null };

export async function fetchDirections(points: LngLat[], token: string, signal?: AbortSignal): Promise<DirectionsResult> {
  if (points.length < 2) return { route: null, error: null };
  if (points.length > DIRECTIONS_MAX_COORDS) {
    return { route: null, error: `Mapbox can route at most ${DIRECTIONS_MAX_COORDS} points at once (including the start).` };
  }
  try {
    const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(";");
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&steps=false&access_token=${token}`,
      { signal }
    );
    const data = await res.json();
    if (!res.ok || data.code !== "Ok") return { route: null, error: data.message || "No drivable route found between these points." };
    return { route: data.routes?.[0] ?? null, error: null };
  } catch (e: any) {
    if (e?.name === "AbortError") return { route: null, error: null };
    return { route: null, error: e?.message || "Routing failed." };
  }
}

// ------------------------------------------------------------ place search

export type PlaceResult = { id: string; name: string; subtitle: string; longitude: number; latitude: number };

export async function searchPlaces(
  query: string,
  token: string,
  proximity: LngLat | null,
  signal?: AbortSignal
): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const prox = proximity ? `&proximity=${proximity.longitude},${proximity.latitude}` : "";
  try {
    const res = await fetch(
      `https://api.mapbox.com/search/searchbox/v1/forward?q=${encodeURIComponent(q)}&auto_complete=true&limit=6&types=poi,address,place,locality,neighborhood,region${prox}&access_token=${token}`,
      { signal }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || [])
      .map((f: any): PlaceResult | null => {
        const c = f?.geometry?.coordinates;
        if (!Array.isArray(c) || c.length < 2) return null;
        const p = f.properties || {};
        return {
          id: String(p.mapbox_id || f.id || `${c[0]},${c[1]}`),
          name: p.name || p.name_preferred || q,
          subtitle: p.place_formatted || p.full_address || "",
          longitude: Number(c[0]),
          latitude: Number(c[1]),
        };
      })
      .filter(Boolean) as PlaceResult[];
  } catch {
    return [];
  }
}

/** Single best match for free text (used to restore a saved start location). */
export async function geocodeText(text: string, token: string): Promise<PathPoint | null> {
  try {
    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(text)}&limit=1&access_token=${token}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const c = data.features?.[0]?.geometry?.coordinates;
    return Array.isArray(c) && c.length === 2 ? { name: text, longitude: Number(c[0]), latitude: Number(c[1]) } : null;
  } catch {
    return null;
  }
}

export function legMiles(leg: any) {
  return typeof leg?.distance === "number" ? leg.distance / METERS_PER_MILE : null;
}

/** Key used to tell whether the stops on screen differ from what was last saved. */
export function stopsSaveKey(stops: { campsite_id?: string | null; latitude: number; longitude: number }[]): string {
  return stops.map((s) => `${s.campsite_id || ""}|${s.latitude}|${s.longitude}`).join("~");
}
