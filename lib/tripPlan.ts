// Trip structure: nights, days, legs, shaping points, and the pure helpers the
// trip planner and map share. Nothing here touches React or Supabase.

import { DIRECTIONS_MAX_COORDS, haversineMiles, pointsKey, type LngLat, type PathPoint } from "./tripOrder";
import type { FuelStopPlan } from "./fuel";

export const MAX_NIGHTS = 30;
export const MAX_VIA_PER_LEG = 20;
export const M_PER_MI = 1609.344;

// ------------------------------------------------------------------- types

export type StopKind = "camp" | "backup" | "daystop";

/**
 * One row of trip_stops.
 *  camp    - where you sleep on `night`
 *  backup  - an alternative for `night` (any number allowed)
 *  daystop - a non-camp stop during the drive that arrives on `day_number`
 * A camp with no night is "unassigned" (older trips, or added from the library).
 */
export type PlanStop = {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  campsite_id?: string;
  stop_order: number;
  notes?: string;
  kind: StopKind;
  night?: number | null;
  day_number?: number | null;
};

/** Per-day settings (trip_days). Days are numbered 1..nights+1; the last is the drive home. */
export type DayInfo = {
  day_number: number;
  max_hours: number | null;
  notes: string;
  /** Route-shaping points [lng, lat]. They bend the drive and are never shown as stops. */
  via: [number, number][];
};

export const blankDay = (day_number: number): DayInfo => ({ day_number, max_hours: null, notes: "", via: [] });

// ------------------------------------------------------------------- dates

function parseISO(s?: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Nights between two ISO dates (0 when either is missing or the order is wrong). */
export function nightsBetween(start?: string | null, end?: string | null): number {
  const a = parseISO(start), b = parseISO(end);
  if (a == null || b == null) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** "Sat, Oct 5" for day `dayNumber` (1 = the start date). */
export function dayDate(start: string | null | undefined, dayNumber: number): string {
  const a = parseISO(start);
  if (a == null) return "";
  return new Date(a + (dayNumber - 1) * 86400000).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

export function dateRangeLabel(start?: string | null, end?: string | null): string {
  const a = parseISO(start), b = parseISO(end);
  if (a == null || b == null) return "";
  const f = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(a)} – ${f(b)}`;
}

// ------------------------------------------------------------- formatting

export const fmtMi = (n: number) => Math.round(n).toLocaleString();
export const fmtHrs = (sec: number) => {
  const total = Math.round(sec / 60);
  const h = Math.floor(total / 60), m = total % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
};
export const fmtFt = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString()} ft`);

// -------------------------------------------------------------- selectors

export const isUnassigned = (s: PlanStop) => s.kind === "camp" && s.night == null;

export function campAt(stops: PlanStop[], night: number): PlanStop | undefined {
  return stops.find((s) => s.kind === "camp" && s.night === night);
}
export function backupsAt(stops: PlanStop[], night: number): PlanStop[] {
  return stops.filter((s) => s.kind === "backup" && s.night === night);
}
export function dayStopsOf(stops: PlanStop[], day: number): PlanStop[] {
  return stops.filter((s) => s.kind === "daystop" && s.day_number === day);
}
export function unassignedStops(stops: PlanStop[]): PlanStop[] {
  return stops.filter(isUnassigned);
}
export function nightsOfCampsite(stops: PlanStop[], campsiteId: string): { camp: number[]; backup: number[] } {
  const camp: number[] = [], backup: number[] = [];
  for (const s of stops) {
    if (s.campsite_id !== campsiteId || s.night == null) continue;
    if (s.kind === "camp") camp.push(s.night);
    else if (s.kind === "backup") backup.push(s.night);
  }
  return { camp: camp.sort((a, b) => a - b), backup: backup.sort((a, b) => a - b) };
}
export function firstFreeNight(stops: PlanStop[], nights: number): number | null {
  for (let n = 1; n <= nights; n++) if (!campAt(stops, n)) return n;
  return null;
}
/** The point you drive from to reach `night`: the nearest earlier camp, else the start. */
export function previousPoint(stops: PlanStop[], night: number, start: PathPoint | null): { point: PathPoint | null; label: string; night: number | null } {
  for (let n = night - 1; n >= 1; n--) {
    const c = campAt(stops, n);
    if (c) return { point: c, label: `Night ${n}`, night: n };
  }
  return { point: start, label: "start", night: null };
}
export function nextCamp(stops: PlanStop[], night: number, nights: number): { stop: PlanStop; night: number } | null {
  for (let n = night + 1; n <= nights; n++) {
    const c = campAt(stops, n);
    if (c) return { stop: c, night: n };
  }
  return null;
}

export function sameStop(a: PlanStop, b: PlanStop) {
  return a.kind === b.kind && a.night === b.night && a.day_number === b.day_number &&
    a.campsite_id === b.campsite_id && a.name === b.name && a.latitude === b.latitude && a.longitude === b.longitude;
}

export function renumber(stops: PlanStop[]): PlanStop[] {
  return stops.map((s, i) => ({ ...s, stop_order: i }));
}

// -------------------------------------------------------------- mutations
// All return new arrays; none mutate their input.

type CampInput = { name: string; latitude: number; longitude: number; campsite_id?: string };

/** Make `camp` the camp for `night`. A camp already there is kept as a backup. */
export function assignCamp(stops: PlanStop[], camp: CampInput, night: number): { stops: PlanStop[]; displaced: PlanStop | null } {
  const sameSite = (s: PlanStop) => !!camp.campsite_id && s.campsite_id === camp.campsite_id;
  const existing = campAt(stops, night);
  const displaced = existing && !sameSite(existing) ? existing : null;
  let next = stops.filter((s) => {
    if (sameSite(s) && (s.night === night || s.night == null)) return false; // this site at this night, or its unassigned entry
    if (existing && s === existing) return false; // re-added below as a backup
    return true;
  });
  if (displaced) next.push({ ...displaced, kind: "backup", night });
  next.push({ ...camp, stop_order: next.length, kind: "camp", night, day_number: null, notes: "" });
  return { stops: renumber(next), displaced };
}

/** Add `camp` as a backup for `night`. No-op when it already is that night's camp. */
export function assignBackup(stops: PlanStop[], camp: CampInput, night: number): PlanStop[] {
  const sameSite = (s: PlanStop) => !!camp.campsite_id && s.campsite_id === camp.campsite_id;
  if (stops.some((s) => sameSite(s) && s.kind === "camp" && s.night === night)) return stops;
  const next = stops.filter((s) => !(sameSite(s) && ((s.kind === "backup" && s.night === night) || s.night == null)));
  next.push({ ...camp, stop_order: next.length, kind: "backup", night, day_number: null, notes: "" });
  return renumber(next);
}

/** Swap a backup in as the night's camp; the old camp becomes a backup. */
export function promoteBackup(stops: PlanStop[], backup: PlanStop): PlanStop[] {
  if (backup.night == null) return stops;
  const night = backup.night;
  const current = campAt(stops, night);
  return stops.map((s) => {
    if (sameStop(s, backup)) return { ...s, kind: "camp" as const };
    if (current && s === current) return { ...s, kind: "backup" as const };
    return s;
  });
}

export function removeStopRef(stops: PlanStop[], target: PlanStop): PlanStop[] {
  const i = stops.indexOf(target) >= 0 ? stops.indexOf(target) : stops.findIndex((s) => sameStop(s, target));
  if (i < 0) return stops;
  return renumber(stops.filter((_, idx) => idx !== i));
}

export function addDayStop(stops: PlanStop[], day: number, p: CampInput): PlanStop[] {
  return renumber([...stops, { ...p, stop_order: stops.length, kind: "daystop", night: null, day_number: day, notes: "" }]);
}

/** Move a day-stop up or down among the same day's stops. */
export function moveDayStop(stops: PlanStop[], target: PlanStop, dir: -1 | 1): PlanStop[] {
  if (target.day_number == null) return stops;
  const idxs = stops.map((s, i) => (s.kind === "daystop" && s.day_number === target.day_number ? i : -1)).filter((i) => i >= 0);
  const at = idxs.findIndex((i) => sameStop(stops[i], target));
  const swap = at + dir;
  if (at < 0 || swap < 0 || swap >= idxs.length) return stops;
  const next = [...stops];
  [next[idxs[at]], next[idxs[swap]]] = [next[idxs[swap]], next[idxs[at]]];
  return renumber(next);
}

/** Put every unassigned camp on the earliest free nights, in list order. */
export function fillUnassigned(stops: PlanStop[], nights: number): PlanStop[] {
  const next = [...stops];
  for (let i = 0; i < next.length; i++) {
    if (!isUnassigned(next[i])) continue;
    const n = firstFreeNight(next, nights);
    if (n == null) break;
    next[i] = { ...next[i], night: n };
  }
  return next;
}

// ------------------------------------------------------------------- legs

/**
 * A leg is one drive: from the previous camp (or the start) to the next camp
 * (or the end). Empty nights are skipped, so a night with no camp simply makes
 * the next leg longer. Each leg is routed on its own, which is what lets a
 * scenic detour on one day leave every other day untouched.
 */
export type Leg = {
  /** Day the leg arrives on: the night number, or nights + 1 for the drive home. */
  day: number;
  fromName: string;
  toName: string;
  /** Everything sent to Directions, in order: waypoints plus silent shaping points. */
  coords: PathPoint[];
  /** Indexes into coords that are real waypoints (the rest are silent). */
  waypointIdx: number[];
  /** The real waypoints, named, in order: start of leg, day-stops, end of leg. */
  waypoints: PathPoint[];
  hasVia: boolean;
  trivial: boolean;
  key: string;
};

const ll = (t: [number, number]): LngLat => ({ longitude: t[0], latitude: t[1] });

export function buildLegs(args: {
  nights: number;
  start: PathPoint | null;
  end: PathPoint | null;
  stops: PlanStop[];
  days: Record<number, DayInfo>;
}): Leg[] {
  const { nights, start, end, stops, days } = args;
  if (!start || !end || nights < 1) return [];

  const arrivals: { day: number; point: PathPoint }[] = [];
  for (let n = 1; n <= nights; n++) {
    const c = campAt(stops, n);
    if (c) arrivals.push({ day: n, point: { name: c.name, latitude: c.latitude, longitude: c.longitude } });
  }
  arrivals.push({ day: nights + 1, point: { ...end, name: end.name || "Trip end" } });

  const hasAnyDayStop = stops.some((s) => s.kind === "daystop");
  if (arrivals.length === 1 && !hasAnyDayStop) return [];

  const legs: Leg[] = [];
  let prev: PathPoint = start;
  let prevDay = 0;
  for (const a of arrivals) {
    // Day-stops for days prevDay+1 .. a.day ride on this leg.
    const ds = stops
      .filter((s) => s.kind === "daystop" && s.day_number != null && s.day_number > prevDay && s.day_number <= a.day)
      .sort((x, y) => x.stop_order - y.stop_order)
      .map((s) => ({ name: s.name, latitude: s.latitude, longitude: s.longitude }));
    const via = (days[a.day]?.via || []).slice(0, MAX_VIA_PER_LEG);

    const W: PathPoint[] = [prev, ...ds, a.point];
    const segVias: [number, number][][] = W.slice(0, -1).map(() => []);
    for (const v of via) {
      const p = ll(v);
      let best = 0, bestAdd = Infinity;
      for (let i = 0; i < W.length - 1; i++) {
        const add = haversineMiles(W[i], p) + haversineMiles(p, W[i + 1]) - haversineMiles(W[i], W[i + 1]);
        if (add < bestAdd) { bestAdd = add; best = i; }
      }
      segVias[best].push(v);
    }
    const coords: PathPoint[] = [];
    const waypointIdx: number[] = [];
    for (let i = 0; i < W.length; i++) {
      waypointIdx.push(coords.length);
      coords.push(W[i]);
      if (i < W.length - 1) segVias[i].forEach((v) => coords.push(ll(v)));
    }
    const trivial = coords.length === 2 && haversineMiles(coords[0], coords[1]) < 0.03;
    legs.push({
      day: a.day,
      fromName: prev.name || "Start",
      toName: a.point.name || "Stop",
      coords, waypointIdx, waypoints: W,
      hasVia: via.length > 0, trivial,
      key: `${a.day}|${pointsKey(coords)}|${waypointIdx.join(",")}`,
    });
    prev = a.point;
    prevDay = a.day;
  }
  return legs;
}

export function syntheticRoute(a: LngLat, b: LngLat) {
  return {
    distance: 0, duration: 0, synthetic: true,
    geometry: { type: "LineString", coordinates: [[a.longitude, a.latitude], [b.longitude, b.latitude]] },
    legs: [{ distance: 0, duration: 0 }],
  };
}

export async function fetchLegRoute(leg: Leg, token: string, signal?: AbortSignal): Promise<{ route: any | null; error: string | null }> {
  if (leg.trivial) return { route: syntheticRoute(leg.coords[0], leg.coords[1]), error: null };
  if (leg.coords.length > DIRECTIONS_MAX_COORDS) {
    return { route: null, error: `Day ${leg.day} has too many route points for Mapbox (limit ${DIRECTIONS_MAX_COORDS}). Reset the shaping points for that day.` };
  }
  try {
    const coords = leg.coords.map((p) => `${p.longitude},${p.latitude}`).join(";");
    // `waypoints` marks which coordinates are real stops; every other coordinate
    // only bends the path. Skipped when there is nothing silent to mark.
    const silent = leg.coords.length > leg.waypointIdx.length;
    const wp = silent ? `&waypoints=${leg.waypointIdx.join(";")}` : "";
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&steps=false${wp}&access_token=${token}`,
      { signal }
    );
    const data = await res.json();
    if (!res.ok || data.code !== "Ok" || !data.routes?.[0]) {
      return { route: null, error: `Day ${leg.day}: ${data.message || "no drivable route between these points."}` };
    }
    return { route: data.routes[0], error: null };
  } catch (e: any) {
    if (e?.name === "AbortError") return { route: null, error: null };
    return { route: null, error: `Day ${leg.day}: ${e?.message || "routing failed."}` };
  }
}

export type DayRun = { day: number; startMile: number; endMile: number; distance: number; duration: number };
export type TripRoute = {
  /** Shaped like a single Mapbox route so the fuel planner can use it as is. */
  route: any;
  /** Real waypoints in order; route.legs[i] runs waypoints[i] -> waypoints[i + 1]. */
  waypoints: PathPoint[];
  days: DayRun[];
};

/** Joins the per-leg routes into one trip route. Returns null until every leg has a route. */
export function aggregateRoutes(legs: Leg[], routes: (any | null)[]): TripRoute | null {
  if (!legs.length || routes.length !== legs.length || routes.some((r) => !r)) return null;
  const coordinates: number[][] = [];
  const allLegs: any[] = [];
  const waypoints: PathPoint[] = [legs[0].waypoints[0]];
  const days: DayRun[] = [];
  let distance = 0, duration = 0, mile = 0;
  legs.forEach((leg, i) => {
    const r = routes[i];
    const pts: number[][] = r.geometry?.coordinates || [];
    pts.forEach((c, j) => {
      if (j === 0 && coordinates.length) {
        const last = coordinates[coordinates.length - 1];
        if (last[0] === c[0] && last[1] === c[1]) return;
      }
      coordinates.push(c);
    });
    allLegs.push(...(r.legs || []));
    waypoints.push(...leg.waypoints.slice(1));
    const miles = (r.distance || 0) / M_PER_MI;
    days.push({ day: leg.day, startMile: mile, endMile: mile + miles, distance: r.distance || 0, duration: r.duration || 0 });
    mile += miles;
    distance += r.distance || 0;
    duration += r.duration || 0;
  });
  return { route: { distance, duration, legs: allLegs, geometry: { type: "LineString", coordinates } }, waypoints, days };
}

// ----------------------------------------------------------- route shaping

const flat = (lat0: number) => Math.cos((lat0 * Math.PI) / 180);

/** Index of the polyline segment (coords[i] -> coords[i+1]) closest to `pt`. */
export function nearestSegment(coords: number[][], pt: [number, number]): number {
  if (coords.length < 2) return 0;
  const k = flat(pt[1]);
  let best = 0, bestD = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = coords[i][0] * k, ay = coords[i][1], bx = coords[i + 1][0] * k, by = coords[i + 1][1];
    const px = pt[0] * k, py = pt[1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const d = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function nearestVertex(coords: number[][], pt: [number, number]): number {
  const k = flat(pt[1]);
  let best = 0, bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = ((coords[i][0] - pt[0]) * k) ** 2 + (coords[i][1] - pt[1]) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Where a newly dragged shaping point goes in the stored order: after every
 * existing point that sits earlier along the leg's current path.
 */
export function insertVia(existing: [number, number][], legCoords: number[][], downSegment: number, pt: [number, number]): [number, number][] {
  const out = [...existing];
  const at = out.findIndex((v) => nearestVertex(legCoords, v) > downSegment);
  if (at < 0) out.push(pt);
  else out.splice(at, 0, pt);
  return out.slice(0, MAX_VIA_PER_LEG);
}

// ------------------------------------------------------------ per-day data

export function effectiveCap(day: DayInfo | undefined, tripDefault: number | null | undefined): number | null {
  const v = day?.max_hours ?? tripDefault ?? null;
  return v != null && v > 0 ? v : null;
}

/** Fuel stops from the fuel plan that fall within a day's stretch of the route. */
export function fuelStopsForDay(plan: FuelStopPlan | null, run: DayRun | undefined) {
  if (!plan || plan.problem || !run) return [];
  return plan.stops.filter((f) => f.mile > run.startMile - 0.01 && f.mile <= run.endMile + 0.01);
}

// ------------------------------------------------------- shared UI types

export type TripCampsite = {
  id: string; name: string; area: string; state: string; type: string; latitude: number; longitude: number;
  cost: number | null; reservation: string; rating: number | null; favorite: boolean;
  notes: string; source: string; source_url: string; last_verified_at: string | null; elevation_ft?: number | null;
};

export type TripMeta = {
  id: string;
  name: string;
  start_location: string | null;
  end_location: string | null;
  start_date: string | null;
  end_date: string | null;
  daily_driving_hours: number | null;
};

/** What the campsite card shows for "from previous" while a night is being considered. */
export type Preview = {
  status: "idle" | "loading" | "ready" | "error" | "nostart";
  fromLabel: string;
  distance?: number; // meters
  duration?: number; // seconds
  next?: { label: string; distance: number; duration: number } | null;
};

/** Keep a trip consistent when its length changes. */
export function trimToNights(stops: PlanStop[], nights: number): PlanStop[] {
  return renumber(
    stops
      .filter((s) => !(s.kind === "backup" && s.night != null && s.night > nights))
      .map((s) => {
        if (s.kind === "camp" && s.night != null && s.night > nights) return { ...s, night: null };
        if (s.kind === "daystop" && s.day_number != null && s.day_number > nights + 1) return { ...s, day_number: nights + 1 };
        return s;
      })
  );
}
