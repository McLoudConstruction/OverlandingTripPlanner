"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FuelStation } from "@/lib/fuel";
import { nearestSegment } from "@/lib/tripPlan";

// Interactive trip map. The map is created once and its data is updated in
// place, so panning/zooming (which drives the "in view" sidebar) is never
// interrupted by React re-renders.
//
//  - Campsite pins are clickable; the selected pin anchors a card (children).
//  - Each day's drive is its own line. Hover a line to reveal its shaping
//    handles, drag the line to bend that day's route, double-click a handle to
//    remove it. Shaping points never appear as stops.

const NORTH_AMERICA: [[number, number], [number, number]] = [[-170, 7], [-52, 72]];

export type MapBounds = { west: number; south: number; east: number; north: number };
type MapCampsite = { id: string; name: string; latitude: number; longitude: number; favorite?: boolean };
type MapPoint = { name?: string; latitude: number; longitude: number };
export type MapLeg = { day: number; coordinates: number[][] };
export type MapVia = { day: number; idx: number; lng: number; lat: number };
export type MapCamp = { nights: number[]; name: string; latitude: number; longitude: number };
export type MapDayStop = { day: number; name: string; latitude: number; longitude: number };
export type CampRole = { camp: number[]; backup: number[] };

type Props = {
  campsites: MapCampsite[];
  roles: Record<string, CampRole>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onBoundsChange: (b: MapBounds) => void;
  start: MapPoint | null;
  /** Only set when the trip ends somewhere other than the start. */
  end: MapPoint | null;
  camps: MapCamp[];
  dayStops: MapDayStop[];
  legs: MapLeg[];
  vias: MapVia[];
  activeDay: number | null;
  onNightClick: (night: number) => void;
  onShape: (day: number, downSegment: number, point: [number, number]) => void;
  onMoveVia: (day: number, idx: number, point: [number, number]) => void;
  onRemoveVia: (day: number, idx: number) => void;
  fuelStations: FuelStation[];
  fitSignal: number;
  flyTo: { longitude: number; latitude: number; nonce: number; offsetCard?: boolean } | null;
  anchor: { longitude: number; latitude: number } | null;
  children?: ReactNode;
};

const EMPTY: any = { type: "FeatureCollection", features: [] };
const HIT = 9; // px around the cursor that counts as "on the route"

export default function TripMap(props: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const stopMarkers = useRef<mapboxgl.Marker[]>([]);
  const fuelMarkers = useRef<mapboxgl.Marker[]>([]);
  // Latest callbacks/data without re-binding map listeners.
  const latest = useRef(props);
  latest.current = props;
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Create the map once.
  useEffect(() => {
    if (!ref.current || !token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: ref.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      bounds: NORTH_AMERICA,
      fitBoundsOptions: { padding: 16 },
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    let raf = 0;
    let lastEmit = 0;
    const emitBounds = () => {
      raf = 0;
      lastEmit = performance.now();
      const b = map.getBounds();
      if (!b) return;
      latest.current.onBoundsChange({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    };
    // Throttled while moving so the sidebar keeps up with the map, plus an exact update when it stops.
    const onMove = () => {
      if (raf) return;
      const wait = Math.max(0, 120 - (performance.now() - lastEmit));
      raf = window.setTimeout(emitBounds, wait) as unknown as number;
    };

    const campHit = (pt: mapboxgl.Point) => {
      if (!map.getLayer("camp-circles")) return [];
      const box: [mapboxgl.PointLike, mapboxgl.PointLike] = [[pt.x - 8, pt.y - 8], [pt.x + 8, pt.y + 8]];
      return map.queryRenderedFeatures(box, { layers: ["camp-circles"] });
    };
    const routeHit = (pt: mapboxgl.Point) => {
      if (!map.getLayer("route-line")) return [];
      const box: [mapboxgl.PointLike, mapboxgl.PointLike] = [[pt.x - HIT, pt.y - HIT], [pt.x + HIT, pt.y + HIT]];
      return map.queryRenderedFeatures(box, { layers: ["route-line"] });
    };
    // Handles are matched by screen distance so they stay grabbable regardless of how they are drawn.
    const handleHit = (pt: mapboxgl.Point): MapVia | null => {
      let best: MapVia | null = null, bestD = 11;
      for (const v of latest.current.vias) {
        const p = map.project([v.lng, v.lat]);
        const d = Math.hypot(p.x - pt.x, p.y - pt.y);
        if (d < bestD) { bestD = d; best = v; }
      }
      return best;
    };

    // ---- handle visibility: only while the cursor is on a route line
    let handlesOn = false;
    const showHandles = (on: boolean) => {
      if (on === handlesOn || !map.getLayer("via-handles")) return;
      handlesOn = on;
      map.setPaintProperty("via-handles", "circle-opacity", on ? 1 : 0);
      map.setPaintProperty("via-handles", "circle-stroke-opacity", on ? 1 : 0);
    };

    // ---- dragging
    type Drag = {
      kind: "new" | "via"; day: number; seg: number; idx: number; coords: number[][];
      startX: number; startY: number; moved: boolean; origin: [number, number];
    };
    let drag: Drag | null = null;
    let suppressClick = false;
    const ghost = document.createElement("div");
    ghost.className = "via-ghost";
    const ghostMarker = new mapboxgl.Marker({ element: ghost });
    const toLngLat = (ev: MouseEvent): [number, number] => {
      const r = map.getCanvas().getBoundingClientRect();
      const ll = map.unproject([ev.clientX - r.left, ev.clientY - r.top]);
      return [ll.lng, ll.lat];
    };
    const setPreview = (coords: number[][]) =>
      (map.getSource("drag-preview") as mapboxgl.GeoJSONSource | undefined)?.setData(
        coords.length ? ({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} } as any) : EMPTY
      );
    const winMove = (ev: MouseEvent) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) > 4) drag.moved = true;
      if (!drag.moved) return;
      const p = toLngLat(ev);
      ghostMarker.setLngLat(p).addTo(map);
      if (drag.kind === "new") {
        const a = drag.coords[drag.seg], b = drag.coords[drag.seg + 1] || a;
        setPreview([a, p, b]);
      } else {
        setPreview([drag.origin, p]);
      }
    };
    const winUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", winMove);
      window.removeEventListener("mouseup", winUp);
      const d = drag;
      drag = null;
      ghostMarker.remove();
      setPreview([]);
      map.getCanvas().style.cursor = "";
      if (!d || !d.moved) return;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      const p = toLngLat(ev);
      if (d.kind === "new") latest.current.onShape(d.day, d.seg, p);
      else latest.current.onMoveVia(d.day, d.idx, p);
    };
    const beginDrag = (d: Omit<Drag, "startX" | "startY" | "moved">, ev: MouseEvent) => {
      drag = { ...d, startX: ev.clientX, startY: ev.clientY, moved: false };
      map.getCanvas().style.cursor = "grabbing";
      window.addEventListener("mousemove", winMove);
      window.addEventListener("mouseup", winUp);
    };

    map.on("load", () => {
      map.addSource("route", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "route-casing", type: "line", source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "route-line", type: "line", source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#111827", "line-width": 4 },
      });
      map.addLayer({
        id: "route-active", type: "line", source: "route", filter: ["==", ["get", "day"], -1],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#d97706", "line-width": 5 },
      });
      map.addSource("drag-preview", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "drag-preview-line", type: "line", source: "drag-preview",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#d97706", "line-width": 4, "line-dasharray": [1.5, 1.5] },
      });
      map.addSource("vias", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "via-handles", type: "circle", source: "vias",
        paint: {
          "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#111827", "circle-stroke-width": 2,
          "circle-opacity": 0, "circle-stroke-opacity": 0,
        },
      });
      map.addSource("campsites", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "camp-circles", type: "circle", source: "campsites",
        paint: {
          "circle-radius": ["case", [">", ["get", "role"], 0], 9, 7],
          "circle-color": ["case", ["==", ["get", "role"], 1], "#16a34a", ["==", ["get", "role"], 2], "#0284c7", ["==", ["get", "favorite"], 1], "#d97706", "#7c4a1e"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "camp-selected", type: "circle", source: "campsites", filter: ["==", ["get", "id"], ""],
        paint: { "circle-radius": 14, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#111827", "circle-stroke-width": 3 },
      });
      map.addLayer({
        id: "camp-labels", type: "symbol", source: "campsites", minzoom: 8,
        layout: {
          "text-field": ["get", "name"], "text-size": 11, "text-anchor": "top", "text-offset": [0, 1.2],
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"], "text-optional": true,
        },
        paint: { "text-color": "#171714", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      });
      setReady(true);
      emitBounds();
    });

    map.on("mousedown", (e) => {
      if (e.originalEvent.button !== 0) return;
      if (campHit(e.point).length) return; // pins win over the line they sit on
      const h = handlesOn ? handleHit(e.point) : null;
      if (h) {
        e.preventDefault();
        beginDrag({ kind: "via", day: h.day, idx: h.idx, seg: 0, coords: [], origin: [h.lng, h.lat] }, e.originalEvent);
        return;
      }
      const hits = routeHit(e.point);
      if (hits.length) {
        const day = Number((hits[0] as any).properties?.day);
        const leg = latest.current.legs.find((l) => l.day === day);
        if (!leg || leg.coordinates.length < 2) return;
        e.preventDefault();
        const seg = nearestSegment(leg.coordinates, [e.lngLat.lng, e.lngLat.lat]);
        beginDrag({ kind: "new", day, seg, idx: -1, coords: leg.coordinates, origin: [e.lngLat.lng, e.lngLat.lat] }, e.originalEvent);
      }
    });
    map.on("dblclick", (e) => {
      const h = handlesOn ? handleHit(e.point) : null;
      if (!h) return;
      e.preventDefault(); // do not zoom
      latest.current.onRemoveVia(h.day, h.idx);
    });
    map.on("click", (e) => {
      if (suppressClick || !map.getLayer("camp-circles")) return;
      const hits = campHit(e.point);
      latest.current.onSelect(hits.length ? String((hits[0] as any).properties?.id) : null);
    });
    map.on("mousemove", (e) => {
      if (drag) return;
      const onCamp = campHit(e.point).length > 0;
      const near = !onCamp && (routeHit(e.point).length > 0 || !!handleHit(e.point));
      showHandles(near || (handlesOn && !!handleHit(e.point)));
      map.getCanvas().style.cursor = onCamp ? "pointer" : near ? "grab" : "";
    });
    map.on("mouseout", () => { if (!drag) showHandles(false); });
    emitBounds(); // report the initial view right away; do not wait for the style to load
    map.on("move", onMove);
    map.on("moveend", emitBounds);
    map.on("resize", onMove);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      if (raf) clearTimeout(raf);
      window.removeEventListener("mousemove", winMove);
      window.removeEventListener("mouseup", winUp);
      ghostMarker.remove();
      stopMarkers.current.forEach((m) => m.remove());
      fuelMarkers.current.forEach((m) => m.remove());
      stopMarkers.current = [];
      fuelMarkers.current = [];
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [token]);

  // Saved campsites: role 1 = a camp on the trip, 2 = only a backup.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("campsites") as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: props.campsites.map((c) => {
        const r = props.roles[c.id];
        const role = r?.camp.length ? 1 : r?.backup.length ? 2 : 0;
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [c.longitude, c.latitude] },
          properties: { id: c.id, name: c.name, favorite: c.favorite ? 1 : 0, role },
        };
      }),
    } as any);
  }, [ready, props.campsites, props.roles]);

  // Selected campsite ring.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("camp-selected", ["==", ["get", "id"], props.selectedId || ""]);
  }, [ready, props.selectedId]);

  // One line per day so each can be highlighted and reshaped on its own.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("route") as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: props.legs.map((l) => ({
        type: "Feature", geometry: { type: "LineString", coordinates: l.coordinates }, properties: { day: l.day },
      })),
    } as any);
  }, [ready, props.legs]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("route-active", ["==", ["get", "day"], props.activeDay ?? -1]);
  }, [ready, props.activeDay]);

  // Shaping handles (drawn only while hovering a route line).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("vias") as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: props.vias.map((v) => ({
        type: "Feature", geometry: { type: "Point", coordinates: [v.lng, v.lat] }, properties: { day: v.day, idx: v.idx },
      })),
    } as any);
  }, [ready, props.vias]);

  // Start / end / numbered night badges / day-stops.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    stopMarkers.current.forEach((m) => m.remove());
    stopMarkers.current = [];
    const add = (p: MapPoint, label: string, cls: string, title?: string, onClick?: () => void) => {
      const el = document.createElement("div");
      el.className = `trip-marker ${cls}`;
      el.textContent = label;
      el.title = title || p.name || label;
      if (onClick) el.addEventListener("click", (ev) => { ev.stopPropagation(); onClick(); });
      stopMarkers.current.push(new mapboxgl.Marker({ element: el }).setLngLat([p.longitude, p.latitude]).addTo(map));
    };
    if (props.start) {
      const same = !props.end;
      add(props.start, same ? "S/E" : "S", same ? "start wide" : "start", same ? `Start and end: ${props.start.name || ""}` : undefined);
    }
    if (props.end) add(props.end, "E", "end");
    props.camps.forEach((c) =>
      add(c, c.nights.join(","), `night${c.nights.length > 1 ? " wide" : ""}`, `Night ${c.nights.join(", ")}: ${c.name}`, () => props.onNightClick(c.nights[0]))
    );
    props.dayStops.forEach((d) => add(d, "◆", "daystop", `Day ${d.day} stop: ${d.name}`));
  }, [ready, props.start, props.end, props.camps, props.dayStops]);

  // Fuel stations: planned stops are large and green, other candidates small and amber.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    fuelMarkers.current.forEach((m) => m.remove());
    fuelMarkers.current = [];
    for (const s of props.fuelStations) {
      const marker = new mapboxgl.Marker({ color: s.planned ? "#16a34a" : "#d97706", scale: s.planned ? 0.9 : 0.5 })
        .setLngLat([s.lng, s.lat])
        .setPopup(new mapboxgl.Popup({ offset: 14 }).setText(`${s.planned ? "Planned fuel stop: " : ""}${s.name}`))
        .addTo(map);
      fuelMarkers.current.push(marker);
    }
  }, [ready, props.fuelStations]);

  // Fit the trip on demand (and once when the map first becomes ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const b = new mapboxgl.LngLatBounds();
    let any = false;
    const extend = (lng: number, lat: number) => { b.extend([lng, lat]); any = true; };
    if (props.start) extend(props.start.longitude, props.start.latitude);
    if (props.end) extend(props.end.longitude, props.end.latitude);
    props.camps.forEach((c) => extend(c.longitude, c.latitude));
    props.dayStops.forEach((s) => extend(s.longitude, s.latitude));
    for (const leg of props.legs) {
      const coords = leg.coordinates;
      for (let i = 0; i < coords.length; i += Math.max(1, Math.floor(coords.length / 200))) extend(coords[i][0], coords[i][1]);
    }
    if (!any) props.campsites.forEach((c) => extend(c.longitude, c.latitude));
    if (any) map.fitBounds(b, { padding: 60, maxZoom: 11, duration: 600 });
    else map.fitBounds(NORTH_AMERICA, { padding: 16, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.fitSignal]);

  // Fly to a campsite picked from a list. With a card open, leave room above the pin for it.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !props.flyTo) return;
    const h = map.getContainer().clientHeight;
    map.easeTo({
      center: [props.flyTo.longitude, props.flyTo.latitude],
      zoom: Math.max(map.getZoom(), 9),
      offset: props.flyTo.offsetCard ? [0, Math.round(h * 0.22)] : [0, 0],
      duration: 500,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.flyTo?.nonce]);

  // Keep the card glued to its pin while the map moves.
  const ax = props.anchor?.longitude, ay = props.anchor?.latitude;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || ax == null || ay == null) { setPos(null); return; }
    const update = () => {
      const p = map.project([ax, ay]);
      setPos({ x: p.x, y: p.y, w: map.getContainer().clientWidth });
    };
    update();
    map.on("move", update);
    map.on("resize", update);
    return () => { map.off("move", update); map.off("resize", update); };
  }, [ready, ax, ay]);

  const below = pos ? pos.y < 400 : false;
  const cardX = pos ? Math.min(Math.max(pos.x, 175), Math.max(175, pos.w - 175)) : 0;

  return (
    <div className="map-wrap">
      {!token ? (
        <div className="map-placeholder"><strong>Mapbox is not connected.</strong><span>Add NEXT_PUBLIC_MAPBOX_TOKEN to Vercel, then redeploy.</span></div>
      ) : (
        <div ref={ref} className="map-canvas" />
      )}
      {token && (
        <div className="map-legend">
          <span><i style={{ background: "#7c4a1e" }} />Saved</span>
          <span><i style={{ background: "#d97706" }} />Favorite</span>
          <span><i style={{ background: "#16a34a" }} />Camp</span>
          <span><i style={{ background: "#0284c7" }} />Backup</span>
        </div>
      )}
      {props.anchor && pos && props.children && (
        <div
          className={`pin-card${below ? " below" : ""}`}
          style={{ left: cardX, top: pos.y, ["--caret" as any]: `${pos.x - cardX}px` }}
        >
          {props.children}
        </div>
      )}
    </div>
  );
}
