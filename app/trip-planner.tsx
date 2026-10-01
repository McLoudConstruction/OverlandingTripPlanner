"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import TripMap, { type CampRole, type MapBounds, type MapCamp, type MapLeg, type MapVia } from "./trip-map";
import { CampsiteCard, DayPanel, NightRail, TripSetup } from "./trip-parts";
import { createClient } from "@/lib/supabase/client";
import type { FuelStation, FuelStopPlan } from "@/lib/fuel";
import { fetchDirections, geocodeText, haversineMiles, optimizeStopOrder, pointsKey, type PathPoint } from "@/lib/tripOrder";
import {
  MAX_VIA_PER_LEG, addDayStop, aggregateRoutes, assignBackup, assignCamp, backupsAt, blankDay, buildLegs, campAt, dateRangeLabel,
  effectiveCap, fetchLegRoute, firstFreeNight, fmtHrs, fmtMi, insertVia, isUnassigned, M_PER_MI, moveDayStop, nextCamp, nightsBetween,
  nightsOfCampsite, previousPoint, promoteBackup, removeStopRef, renumber, sameStop, trimToNights, unassignedStops,
  type DayInfo, type DayRun, type PlanStop, type Preview, type TripCampsite, type TripMeta,
} from "@/lib/tripPlan";

export type TripStop = PlanStop;
export type { TripCampsite };

type Props = {
  trip: TripMeta;
  updateTrip: (patch: Record<string, any>) => Promise<boolean>;
  startText: string;
  setStartText: (t: string) => void;
  startPoint: PathPoint | null;
  setStartPoint: (p: PathPoint | null) => void;
  commitStart: (text: string) => void;
  stops: PlanStop[];
  setStops: React.Dispatch<React.SetStateAction<PlanStop[]>>;
  campsites: TripCampsite[];
  hasRoute: boolean;
  routeKey: string;
  setRoute: (r: any) => void;
  setRouteKey: (k: string) => void;
  setRouteWaypoints: (w: PathPoint[]) => void;
  clearFuel: () => void;
  persistStops: (silent?: boolean) => Promise<void>;
  calculateRoute: () => Promise<void>;
  routeLoading: boolean;
  fuelStations: FuelStation[];
  fuelStopPlan: FuelStopPlan | null;
  setMessage: (m: string) => void;
  openEditCampsite: (c: TripCampsite) => void;
  goTab: (t: string) => void;
};

export default function TripPlanner(props: Props) {
  const { trip, stops, setStops, campsites, startPoint, setStartPoint, startText, setStartText, setMessage } = props;
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const nights = nightsBetween(trip.start_date, trip.end_date);
  const [editingSetup, setEditingSetup] = useState(false);
  const needsSetup = nights < 1 || editingSetup;

  // ------------------------------------------------------------ per-day data
  const [days, setDays] = useState<Record<number, DayInfo>>({});
  const [daysLoaded, setDaysLoaded] = useState(false);
  const savedDays = useRef("");
  const dayChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await createClient().from("trip_days").select("day_number,max_hours,notes,via").eq("trip_id", trip.id);
      if (!alive) return;
      if (error) { setMessage(`Could not load the day settings (${error.message}). Run migration 0005 in Supabase.`); return; }
      const map: Record<number, DayInfo> = {};
      ((data || []) as any[]).forEach((r) => {
        map[r.day_number] = {
          day_number: r.day_number,
          max_hours: r.max_hours == null ? null : Number(r.max_hours),
          notes: r.notes || "",
          via: Array.isArray(r.via) ? r.via.filter((v: any) => Array.isArray(v) && v.length === 2).map((v: any) => [Number(v[0]), Number(v[1])]) : [],
        };
      });
      const kept = Object.values(map).filter((d) => d.max_hours != null || d.notes.trim() || d.via.length).sort((a, b) => a.day_number - b.day_number);
      savedDays.current = JSON.stringify(kept);
      setDays(map);
      setDaysLoaded(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  const daysPayload = useMemo(
    () => Object.values(days)
      .filter((d) => d.day_number >= 1 && d.day_number <= nights + 1 && (d.max_hours != null || d.notes.trim() || d.via.length))
      .sort((a, b) => a.day_number - b.day_number),
    [days, nights]
  );
  const daysKey = JSON.stringify(daysPayload);
  const latestDays = useRef({ payload: daysPayload, key: daysKey, loaded: false });
  latestDays.current = { payload: daysPayload, key: daysKey, loaded: daysLoaded };

  function flushDays() {
    const { payload, key, loaded } = latestDays.current;
    if (!loaded || key === savedDays.current) return;
    dayChain.current = dayChain.current.then(async () => {
      const sb = createClient();
      const del = await sb.from("trip_days").delete().eq("trip_id", trip.id);
      if (del.error) { setMessage(del.error.message); return; }
      if (payload.length) {
        const { error } = await sb.from("trip_days").insert(
          payload.map((d) => ({ trip_id: trip.id, day_number: d.day_number, max_hours: d.max_hours, notes: d.notes, via: d.via }))
        );
        if (error) { setMessage(error.message); return; }
      }
      savedDays.current = key;
    });
  }
  useEffect(() => {
    if (!daysLoaded || daysKey === savedDays.current) return;
    const t = setTimeout(flushDays, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey, daysLoaded]);

  const setDayInfo = (day: number, patch: Partial<DayInfo>) =>
    setDays((d) => ({ ...d, [day]: { ...(d[day] || blankDay(day)), ...patch } }));

  // Stops autosave shortly after they change; both saves also flush when leaving the screen.
  const saveKey = useMemo(() => stops.map((s) => `${s.campsite_id || ""}|${s.latitude}|${s.longitude}|${s.kind}|${s.night ?? ""}|${s.day_number ?? ""}`).join("~"), [stops]);
  const persistRef = useRef(props.persistStops);
  persistRef.current = props.persistStops;
  useEffect(() => {
    const t = setTimeout(() => { persistRef.current(true); }, 1200);
    return () => clearTimeout(t);
  }, [saveKey]);
  useEffect(() => () => { persistRef.current(true); flushDays(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // ----------------------------------------------------------- start and end
  const triedStart = useRef("");
  useEffect(() => {
    const text = startText.trim();
    if (!token || !text || startPoint || triedStart.current === text) return;
    triedStart.current = text;
    let alive = true;
    geocodeText(text, token).then((p) => {
      if (!alive) return;
      if (p) setStartPoint(p);
      else setMessage(`Could not locate the starting point "${text}". Search for it again under Edit trip.`);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startText, startPoint, token]);

  const endText = trip.end_location || "";
  const [endGeo, setEndGeo] = useState<PathPoint | null>(null);
  useEffect(() => {
    if (!token || !endText) { setEndGeo(null); return; }
    let alive = true;
    geocodeText(endText, token).then((p) => { if (alive) setEndGeo(p); });
    return () => { alive = false; };
  }, [endText, token]);
  const endPoint: PathPoint | null = endText ? endGeo : startPoint;
  const mapEnd = useMemo(
    () => (endText && endGeo ? { name: endText, latitude: endGeo.latitude, longitude: endGeo.longitude } : null),
    [endText, endGeo]
  );

  function chooseStart(text: string, p: { latitude: number; longitude: number }) {
    triedStart.current = text;
    setStartText(text);
    setStartPoint({ name: text, latitude: p.latitude, longitude: p.longitude });
    props.commitStart(text);
  }
  function clearStart() {
    setStartText("");
    setStartPoint(null);
    props.commitStart("");
  }

  // ------------------------------------------------------------------ routes
  // Shaping points only matter to routing, so legs are rebuilt when they change, not on every note keystroke.
  const viaKey = JSON.stringify(Object.values(days).map((d) => [d.day_number, d.via]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const viaDays = useMemo(() => days, [viaKey]);
  const legs = useMemo(
    () => buildLegs({ nights, start: startPoint, end: endPoint, stops, days: viaDays }),
    [nights, startPoint, endPoint, stops, viaDays]
  );
  const syncKey = useMemo(() => legs.map((l) => l.key).join("#"), [legs]);

  const [legRoutes, setLegRoutes] = useState<Record<string, any>>({});
  const [routeError, setRouteError] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    const need = legs.filter((l) => !(l.key in legRoutes));
    if (!need.length) { setRouteError(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const results = await Promise.all(need.map(async (l) => ({ l, ...(await fetchLegRoute(l, token, ctrl.signal)) })));
      if (ctrl.signal.aborted) return;
      const add: Record<string, any> = {};
      let err: string | null = null;
      for (const r of results) { if (r.route) add[r.l.key] = r.route; else if (r.error) err = r.error; }
      setLegRoutes((prev) => ({ ...prev, ...add }));
      setRouteError(err);
    }, 450);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey, token]);

  const routeBusy = legs.some((l) => !legRoutes[l.key]) && !routeError;
  const tripRoute = useMemo(() => aggregateRoutes(legs, legs.map((l) => legRoutes[l.key] || null)), [legs, legRoutes]);

  // Hand the joined route to the fuel planner whenever it is complete.
  const published = useRef("");
  useEffect(() => {
    if (tripRoute) {
      props.setRoute(tripRoute.route);
      props.setRouteKey(syncKey);
      props.setRouteWaypoints(tripRoute.waypoints);
      published.current = syncKey;
      if (props.routeKey !== syncKey) props.clearFuel(); // fuel stops belong to the old route
    } else if (published.current) {
      published.current = "";
      props.setRoute(null);
      props.setRouteKey("");
      props.setRouteWaypoints([]);
      props.clearFuel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripRoute, syncKey]);

  // Per-day figures, available as each leg finishes (the fuel mileposts need the joined route).
  const runs = useMemo(() => {
    const out: Record<number, DayRun> = {};
    let mile = 0;
    for (const l of legs) {
      const r = legRoutes[l.key];
      if (!r) continue;
      const miles = (r.distance || 0) / M_PER_MI;
      out[l.day] = { day: l.day, startMile: mile, endMile: mile + miles, distance: r.distance || 0, duration: r.duration || 0 };
      mile += miles;
    }
    return out;
  }, [legs, legRoutes]);

  // Lines on the map. A day keeps its previous line while a new one is on the way, so edits never blink the route away.
  const lastGeom = useRef(new Map<number, number[][]>());
  const mapLegs: MapLeg[] = useMemo(() => {
    const out: MapLeg[] = [];
    const keep = new Set<number>();
    for (const l of legs) {
      keep.add(l.day);
      const coords = legRoutes[l.key]?.geometry?.coordinates as number[][] | undefined;
      if (coords && coords.length > 1) lastGeom.current.set(l.day, coords);
      const use = lastGeom.current.get(l.day);
      if (use) out.push({ day: l.day, coordinates: use });
    }
    for (const k of Array.from(lastGeom.current.keys())) if (!keep.has(k)) lastGeom.current.delete(k);
    return out;
  }, [legs, legRoutes]);

  const mapVias: MapVia[] = useMemo(
    () => mapLegs.flatMap((l) => (viaDays[l.day]?.via || []).map((v, i) => ({ day: l.day, idx: i, lng: v[0], lat: v[1] }))),
    [mapLegs, viaDays]
  );

  const [fitSignal, setFitSignal] = useState(0);
  const fittedOnce = useRef(false);
  useEffect(() => {
    if (tripRoute && !fittedOnce.current) { fittedOnce.current = true; setFitSignal((n) => n + 1); }
  }, [tripRoute]);

  // ----------------------------------------------------- shaping the route
  function shapeRoute(day: number, seg: number, pt: [number, number]) {
    const leg = mapLegs.find((l) => l.day === day);
    if (!leg) return;
    if ((days[day]?.via.length || 0) >= MAX_VIA_PER_LEG) {
      setMessage(`A day can have up to ${MAX_VIA_PER_LEG} shaping points. Reset that day's route to start over.`);
      return;
    }
    setDays((d) => {
      const cur = d[day] || blankDay(day);
      return { ...d, [day]: { ...cur, via: insertVia(cur.via, leg.coordinates, seg, pt) } };
    });
  }
  const moveVia = (day: number, idx: number, pt: [number, number]) =>
    setDays((d) => {
      const cur = d[day] || blankDay(day);
      return { ...d, [day]: { ...cur, via: cur.via.map((v, i) => (i === idx ? pt : v)) } };
    });
  const removeVia = (day: number, idx: number) =>
    setDays((d) => {
      const cur = d[day] || blankDay(day);
      return { ...d, [day]: { ...cur, via: cur.via.filter((_, i) => i !== idx) } };
    });

  // --------------------------------------------------------------- selection
  const [activeDay, setActiveDay] = useState(1);
  const day = Math.min(Math.max(activeDay, 1), nights + 1);
  const activeNight = day <= nights ? day : firstFreeNight(stops, nights) ?? 1;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardNight, setCardNight] = useState(1);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [flyTo, setFlyTo] = useState<{ longitude: number; latitude: number; nonce: number; offsetCard?: boolean } | null>(null);
  const flyNonce = useRef(0);
  const selected = campsites.find((c) => c.id === selectedId) || null;

  function selectCampsite(id: string | null) {
    setSelectedId(id);
    if (id) {
      const mine = nightsOfCampsite(stops, id);
      setCardNight(mine.camp[0] ?? mine.backup[0] ?? activeNight);
    }
  }
  function pickCampsite(c: TripCampsite) {
    selectCampsite(c.id);
    setFlyTo({ longitude: c.longitude, latitude: c.latitude, nonce: ++flyNonce.current, offsetCard: true });
  }
  function flyToPoint(p: { longitude: number; latitude: number }) {
    setFlyTo({ longitude: p.longitude, latitude: p.latitude, nonce: ++flyNonce.current });
  }
  function pickDay(d: number) {
    setActiveDay(d);
    const c = d <= nights ? campAt(stops, d) : null;
    if (c) flyToPoint(c);
    else if (d === nights + 1 && endPoint) flyToPoint(endPoint);
  }
  function focusStop(s: PlanStop) {
    const site = s.campsite_id ? campsites.find((c) => c.id === s.campsite_id) : undefined;
    if (site) pickCampsite(site);
    else flyToPoint(s);
  }

  // ------------------------------------------------- "from previous" preview
  const [preview, setPreview] = useState<Preview>({ status: "idle", fromLabel: "start" });
  const previewCache = useRef(new Map<string, { distance: number; duration: number }>());
  const prevInfo = useMemo(() => (selected ? previousPoint(stops, cardNight, startPoint) : null), [selected, stops, cardNight, startPoint]);
  const nextInfo = useMemo(() => (selected ? nextCamp(stops, cardNight, nights) : null), [selected, stops, cardNight, nights]);
  useEffect(() => {
    if (!selected || !prevInfo) { setPreview({ status: "idle", fromLabel: "start" }); return; }
    if (!prevInfo.point) { setPreview({ status: "nostart", fromLabel: "start" }); return; }
    if (!token) { setPreview({ status: "error", fromLabel: prevInfo.label }); return; }
    const from = prevInfo.point, label = prevInfo.label;
    const ctrl = new AbortController();
    setPreview({ status: "loading", fromLabel: label });
    const get = async (a: PathPoint, b: PathPoint) => {
      if (haversineMiles(a, b) < 0.03) return { distance: 0, duration: 0 };
      const k = pointsKey([a, b]);
      const hit = previewCache.current.get(k);
      if (hit) return hit;
      const { route } = await fetchDirections([a, b], token, ctrl.signal);
      if (!route) return null;
      const v = { distance: route.distance as number, duration: route.duration as number };
      previewCache.current.set(k, v);
      return v;
    };
    (async () => {
      const main = await get(from, selected);
      const nxt = nextInfo ? await get(selected, nextInfo.stop) : null;
      if (ctrl.signal.aborted) return;
      if (!main) { setPreview({ status: "error", fromLabel: label }); return; }
      setPreview({
        status: "ready", fromLabel: label, distance: main.distance, duration: main.duration,
        next: nxt && nextInfo ? { label: `Night ${nextInfo.night} camp`, distance: nxt.distance, duration: nxt.duration } : null,
      });
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, prevInfo?.point?.latitude, prevInfo?.point?.longitude, nextInfo?.stop.latitude, nextInfo?.stop.longitude, token]);

  // ------------------------------------------------------- camp assignments
  const campInput = (c: TripCampsite) => ({ name: c.name, latitude: c.latitude, longitude: c.longitude, campsite_id: c.id });
  function makeCamp(c: TripCampsite, night: number) {
    const r = assignCamp(stops, campInput(c), night);
    setStops(r.stops);
    setActiveDay(night);
    setMessage(r.displaced ? `${c.name} is now Night ${night}'s camp. ${r.displaced.name} stays as a backup.` : `${c.name} is Night ${night}'s camp.`);
  }
  const removeCamp = (c: TripCampsite, night: number) =>
    setStops((prev) => renumber(prev.filter((s) => !(s.campsite_id === c.id && s.kind === "camp" && s.night === night))));
  const addBackup = (c: TripCampsite, night: number) => setStops((prev) => assignBackup(prev, campInput(c), night));
  const removeBackup = (c: TripCampsite, night: number) =>
    setStops((prev) => renumber(prev.filter((s) => !(s.campsite_id === c.id && s.kind === "backup" && s.night === night))));

  // Camps with no night (older trips, or added from the library).
  const unassigned = useMemo(() => unassignedStops(stops), [stops]);
  const [ordering, setOrdering] = useState(false);
  async function orderAndFill() {
    if (!unassigned.length) return;
    setOrdering(true);
    const { ordered } = await optimizeStopOrder(startPoint, unassigned, token);
    setStops((prev) => {
      const next = [...prev];
      for (const o of ordered) {
        const i = next.findIndex((s) => sameStop(s, o));
        const n = firstFreeNight(next, nights);
        if (i >= 0 && n != null) next[i] = { ...next[i], night: n };
      }
      return renumber(next);
    });
    setOrdering(false);
  }
  const assignUnassigned = (s: PlanStop, night: number) =>
    setStops((prev) => (s.campsite_id
      ? assignCamp(prev, { name: s.name, latitude: s.latitude, longitude: s.longitude, campsite_id: s.campsite_id }, night).stops
      : prev.map((x) => (x === s ? { ...x, night } : x))));

  // ------------------------------------------------------------- map inputs
  const roles = useMemo(() => {
    const r: Record<string, CampRole> = {};
    for (const s of stops) {
      if (!s.campsite_id || s.kind === "daystop") continue;
      const e = r[s.campsite_id] || (r[s.campsite_id] = { camp: [], backup: [] });
      if (s.kind === "camp") e.camp.push(s.night ?? 0); // 0 = on the trip but no night yet
      else if (s.night != null) e.backup.push(s.night);
    }
    return r;
  }, [stops]);

  const badges: MapCamp[] = useMemo(() => {
    const m = new Map<string, MapCamp>();
    for (const s of stops) {
      if (s.kind !== "camp" || s.night == null) continue;
      const k = `${s.campsite_id || s.name}|${s.latitude}|${s.longitude}`;
      const e = m.get(k);
      if (e) e.nights.push(s.night);
      else m.set(k, { nights: [s.night], name: s.name, latitude: s.latitude, longitude: s.longitude });
    }
    return Array.from(m.values()).map((e) => ({ ...e, nights: e.nights.sort((a, b) => a - b) }));
  }, [stops]);
  const mapDayStops = useMemo(
    () => stops.filter((s) => s.kind === "daystop" && s.day_number != null).map((s) => ({ day: s.day_number as number, name: s.name, latitude: s.latitude, longitude: s.longitude })),
    [stops]
  );

  const visibleCampsites = useMemo(() => {
    if (!bounds) return [];
    const cLng = (bounds.west + bounds.east) / 2, cLat = (bounds.south + bounds.north) / 2;
    return campsites
      .filter((c) => c.latitude >= bounds.south && c.latitude <= bounds.north && c.longitude >= bounds.west && c.longitude <= bounds.east)
      .map((c) => ({ c, d: haversineMiles({ longitude: cLng, latitude: cLat }, c) }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.c);
  }, [campsites, bounds]);

  // --------------------------------------------------------------- summaries
  const tripCap = trip.daily_driving_hours && trip.daily_driving_hours > 0 ? Number(trip.daily_driving_hours) : null;
  const capFor = (d: number) => effectiveCap(days[d], tripCap);
  const overCap = useMemo(() => {
    const s = new Set<number>();
    for (const r of Object.values(runs)) { const cap = effectiveCap(days[r.day], tripCap); if (cap != null && r.duration / 3600 > cap) s.add(r.day); }
    return s;
  }, [runs, days, tripCap]);
  const campCost = useMemo(() => {
    let total = 0, any = false;
    for (let n = 1; n <= nights; n++) {
      const c = campAt(stops, n);
      const site = c?.campsite_id ? campsites.find((x) => x.id === c.campsite_id) : undefined;
      if (site?.cost != null) { total += site.cost; any = true; }
    }
    return any ? total : null;
  }, [stops, campsites, nights]);
  const filled = useMemo(() => Array.from({ length: nights }, (_, i) => i + 1).filter((n) => campAt(stops, n)).length, [stops, nights]);

  // ------------------------------------------------------------------- setup
  async function saveSetup(patch: { name: string; start_date: string; end_date: string; end_location: string | null; daily_driving_hours: number | null }) {
    const newNights = nightsBetween(patch.start_date, patch.end_date);
    const ok = await props.updateTrip(patch);
    if (!ok) return;
    if (newNights !== nights) setStops((prev) => trimToNights(prev, newNights));
    setEditingSetup(false);
    setActiveDay(1);
    setFitSignal((n) => n + 1);
  }

  if (needsSetup) {
    return (
      <section className="content trip-screen">
        <div className="page-head">
          <div>
            <span className="eyebrow">TRIP</span>
            <h1>{trip.name}</h1>
            <p>{nights < 1 ? "Set the dates first. They decide how many nights you plan, and each night gets its own camp." : "Change the dates, start, end or daily drive cap."}</p>
          </div>
        </div>
        <TripSetup
          trip={trip} token={token} startText={startText} firstTime={nights < 1}
          onPickStart={(text, p) => chooseStart(text, p)} onClearStart={clearStart}
          onSave={saveSetup} onCancel={nights >= 1 ? () => setEditingSetup(false) : undefined}
        />
      </section>
    );
  }

  const leg = legs.find((l) => l.day === day);
  const run = runs[day];
  const totalRun = tripRoute ? tripRoute.route : null;
  const prevForSearch = (() => {
    if (day > nights) return endPoint;
    return previousPoint(stops, day, startPoint).point;
  })();

  return (
    <section className="content trip-screen">
      <div className="page-head">
        <div>
          <span className="eyebrow">TRIP</span>
          <h1>{trip.name}</h1>
          <p className="trip-meta">
            {dateRangeLabel(trip.start_date, trip.end_date)} · <b>{nights}</b> night{nights === 1 ? "" : "s"} ·{" "}
            {startText || "No start set"} → {trip.end_location || "back to start"}
            {campCost != null ? ` · camping about $${Math.round(campCost).toLocaleString()}` : ""}
          </p>
        </div>
        <div className="page-head-actions">
          <button className="secondary" onClick={() => setFitSignal((n) => n + 1)}>Fit trip</button>
          <button className="secondary" onClick={() => setEditingSetup(true)}>Edit trip</button>
        </div>
      </div>

      {routeError && <div className="warning-box">{routeError}</div>}
      {!startPoint && <div className="warning-box">Set a starting location (Edit trip) to see drive times and distances.</div>}

      <NightRail nights={nights} startDate={trip.start_date} stops={stops} activeDay={day} overCap={overCap} onPick={pickDay} />

      <div className="trip-body workspace">
        <div className="trip-map">
          <TripMap
            campsites={campsites} roles={roles} selectedId={selectedId} onSelect={selectCampsite} onBoundsChange={setBounds}
            start={startPoint} end={mapEnd} camps={badges} dayStops={mapDayStops} legs={mapLegs} vias={mapVias} activeDay={day}
            onNightClick={(n) => pickDay(n)} onShape={shapeRoute} onMoveVia={moveVia} onRemoveVia={removeVia}
            fuelStations={props.fuelStations} fitSignal={fitSignal} flyTo={flyTo}
            anchor={selected ? { longitude: selected.longitude, latitude: selected.latitude } : null}
          >
            {selected && (
              <CampsiteCard
                c={selected} nights={nights} startDate={trip.start_date} stops={stops} night={cardNight} setNight={setCardNight}
                preview={preview} cap={capFor(cardNight)}
                onMakeCamp={() => makeCamp(selected, cardNight)} onRemoveCamp={() => removeCamp(selected, cardNight)}
                onAddBackup={() => addBackup(selected, cardNight)} onRemoveBackup={() => removeBackup(selected, cardNight)}
                onStart={() => chooseStart(selected.name, selected)} onEdit={() => props.openEditCampsite(selected)}
                onClose={() => setSelectedId(null)}
              />
            )}
          </TripMap>
        </div>

        <aside className="pick-sidebar">
          <DayPanel
            key={day}
            day={day} nights={nights} startDate={trip.start_date} dayInfo={days[day] || blankDay(day)}
            setDayInfo={(patch) => setDayInfo(day, patch)} stops={stops} campsites={campsites} leg={leg} run={run}
            routeBusy={routeBusy} tripCap={tripCap} fuelPlan={props.fuelStopPlan} proximity={prevForSearch} token={token}
            onResetRoute={() => setDayInfo(day, { via: [] })}
            onPromote={(s) => setStops((prev) => promoteBackup(prev, s))}
            onRemove={(s) => setStops((prev) => removeStopRef(prev, s))}
            onAddDayStop={(p) => setStops((prev) => addDayStop(prev, day, p))}
            onMoveDayStop={(s, dir) => setStops((prev) => moveDayStop(prev, s, dir))}
            onFocus={focusStop}
          />

          {unassigned.length > 0 && (
            <div className="unassigned">
              <div className="section-title">
                <h3>Camps without a night</h3>
                <button className="secondary" disabled={ordering || !firstFreeNight(stops, nights)} onClick={orderAndFill}>
                  {ordering ? "Ordering…" : "Order & fill nights"}
                </button>
              </div>
              {unassigned.map((s, i) => (
                <div className="dp-camp" key={`${s.campsite_id || s.name}-${i}`}>
                  <div className="dp-camp-main"><button className="linklike strong" onClick={() => focusStop(s)}>{s.name}</button></div>
                  <select value="" onChange={(e) => e.target.value && assignUnassigned(s, Number(e.target.value))}>
                    <option value="">Night…</option>
                    {Array.from({ length: nights }, (_, k) => k + 1).map((n) => (
                      <option key={n} value={n}>{n}{campAt(stops, n) ? " (replace)" : ""}</option>
                    ))}
                  </select>
                  <button aria-label={`Remove ${s.name}`} onClick={() => setStops((prev) => removeStopRef(prev, s))}>×</button>
                </div>
              ))}
            </div>
          )}

          <div className="section-title">
            <h3>Saved campsites in view</h3><span className="muted">{visibleCampsites.length} of {campsites.length}</span>
          </div>
          {!campsites.length && <div className="empty">No saved campsites yet. Add some on the Campsites tab.</div>}
          {campsites.length > 0 && !visibleCampsites.length && <div className="empty">No saved campsites in this part of the map. Pan or zoom out.</div>}
          <ul className="visible-list">
            {visibleCampsites.slice(0, 100).map((c) => {
              const mine = roles[c.id];
              const campNights = (mine?.camp || []).filter((n) => n > 0);
              return (
                <li key={c.id} className={c.id === selectedId ? "selected" : ""}>
                  <button className="row-main" onClick={() => pickCampsite(c)}>
                    <strong>{c.favorite ? "★ " : ""}{c.name}</strong>
                    <small>{[c.type, c.area, c.elevation_ft != null ? `${Math.round(c.elevation_ft).toLocaleString()} ft` : "", c.cost != null ? (c.cost === 0 ? "Free" : `$${c.cost}`) : ""].filter(Boolean).join(" · ")}</small>
                  </button>
                  {campNights.length
                    ? <button className="mini in" onClick={() => pickCampsite(c)} title="Open its card">✓ Night {campNights.join(",")}</button>
                    : <button className="mini" onClick={() => makeCamp(c, activeNight)}>＋ Night {activeNight}</button>}
                </li>
              );
            })}
          </ul>
          {visibleCampsites.length > 100 && <small className="muted">Showing the 100 closest to the map center. Zoom in to narrow the list.</small>}
        </aside>
      </div>

      <div className="trip-footer">
        <div className="trip-summary">
          {totalRun ? (
            <span><b>{fmtMi(totalRun.distance / M_PER_MI)} mi</b> · {fmtHrs(totalRun.duration)} driving · {filled} of {nights} nights planned</span>
          ) : routeBusy ? <span className="muted">Updating route…</span>
            : <span className="muted">{filled} of {nights} nights planned{legs.length ? "" : ". Pick a camp for a night to build the route."}</span>}
        </div>
        <div className="trip-footer-right">
          {props.fuelStopPlan && (
            <span className={props.fuelStopPlan.feasible ? "plan-chip ok" : "plan-chip bad"}>
              {props.fuelStopPlan.problem ? "Fuel plan needs attention" : props.fuelStopPlan.feasible ? `Fuel plan OK · ${props.fuelStopPlan.stops.length} stop${props.fuelStopPlan.stops.length === 1 ? "" : "s"}` : "Fuel gap on route"}
            </span>
          )}
          <button className="secondary" disabled={props.routeLoading || !props.hasRoute} onClick={props.calculateRoute}>
            {props.routeLoading ? "Calculating…" : "Calculate fuel plan"}
          </button>
          {props.fuelStopPlan && <button className="secondary" onClick={() => props.goTab("Fuel")}>View fuel plan</button>}
        </div>
      </div>
    </section>
  );
}
