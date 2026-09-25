"use client";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FuelStation } from "@/lib/fuel";

// Interactive trip map. The map is created once and its data is updated in
// place, so panning/zooming (which drives the "in view" sidebar) is never
// interrupted by React re-renders.

const NORTH_AMERICA: [[number, number], [number, number]] = [[-170, 7], [-52, 72]];

export type MapBounds = { west: number; south: number; east: number; north: number };
type MapCampsite = { id: string; name: string; latitude: number; longitude: number; favorite?: boolean };
type MapPoint = { name?: string; latitude: number; longitude: number };

type Props = {
  campsites: MapCampsite[];
  tripCampsiteIds: Set<string>;
  showCampsites: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onBoundsChange: (b: MapBounds) => void;
  start: MapPoint | null;
  stops: MapPoint[];
  route: any;
  fuelStations: FuelStation[];
  fitSignal: number;
  flyTo: { longitude: number; latitude: number; nonce: number } | null;
};

const EMPTY: any = { type: "FeatureCollection", features: [] };

export default function TripMap(props: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
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
      map.addSource("campsites", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "camp-circles", type: "circle", source: "campsites",
        paint: {
          "circle-radius": ["case", ["==", ["get", "inTrip"], 1], 9, 7],
          "circle-color": ["case", ["==", ["get", "inTrip"], 1], "#16a34a", ["==", ["get", "favorite"], 1], "#d97706", "#7c4a1e"],
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

    map.on("click", (e) => {
      if (!map.getLayer("camp-circles")) return;
      const box: [mapboxgl.PointLike, mapboxgl.PointLike] = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]];
      const hits = map.queryRenderedFeatures(box, { layers: ["camp-circles"] });
      latest.current.onSelect(hits.length ? String((hits[0] as any).properties?.id) : null);
    });
    map.on("mousemove", (e) => {
      if (!map.getLayer("camp-circles")) return;
      const box: [mapboxgl.PointLike, mapboxgl.PointLike] = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]];
      map.getCanvas().style.cursor = map.queryRenderedFeatures(box, { layers: ["camp-circles"] }).length ? "pointer" : "";
    });
    emitBounds(); // report the initial view right away; do not wait for the style to load
    map.on("move", onMove);
    map.on("moveend", emitBounds);
    map.on("resize", onMove);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      if (raf) clearTimeout(raf);
      stopMarkers.current.forEach((m) => m.remove());
      fuelMarkers.current.forEach((m) => m.remove());
      stopMarkers.current = [];
      fuelMarkers.current = [];
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [token]);

  // Saved campsites.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("campsites") as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: props.campsites.map((c) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.longitude, c.latitude] },
        properties: { id: c.id, name: c.name, favorite: c.favorite ? 1 : 0, inTrip: props.tripCampsiteIds.has(c.id) ? 1 : 0 },
      })),
    } as any);
  }, [ready, props.campsites, props.tripCampsiteIds]);

  // Campsite layer visibility (hidden while entering destinations).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const id of ["camp-circles", "camp-labels"]) map.setLayoutProperty(id, "visibility", props.showCampsites ? "visible" : "none");
  }, [ready, props.showCampsites]);

  // Selected campsite ring.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("camp-selected", ["==", ["get", "id"], props.showCampsites ? props.selectedId || "" : ""]);
  }, [ready, props.selectedId, props.showCampsites]);

  // Route line.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("route") as mapboxgl.GeoJSONSource | undefined)?.setData(
      props.route?.geometry ? ({ type: "Feature", geometry: props.route.geometry, properties: {} } as any) : EMPTY
    );
  }, [ready, props.route]);

  // Numbered start / stop markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    stopMarkers.current.forEach((m) => m.remove());
    stopMarkers.current = [];
    const add = (p: MapPoint, label: string, cls: string) => {
      const el = document.createElement("div");
      el.className = `trip-marker ${cls}`;
      el.textContent = label;
      el.title = p.name || label;
      stopMarkers.current.push(new mapboxgl.Marker({ element: el }).setLngLat([p.longitude, p.latitude]).addTo(map));
    };
    if (props.start) add(props.start, "S", "start");
    props.stops.forEach((s, i) => add(s, String(i + 1), "stop"));
  }, [ready, props.start, props.stops]);

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
    props.stops.forEach((s) => extend(s.longitude, s.latitude));
    const coords: number[][] = props.route?.geometry?.coordinates || [];
    for (let i = 0; i < coords.length; i += Math.max(1, Math.floor(coords.length / 400))) extend(coords[i][0], coords[i][1]);
    if (!any) props.campsites.forEach((c) => extend(c.longitude, c.latitude));
    if (any) map.fitBounds(b, { padding: 60, maxZoom: 11, duration: 600 });
    else map.fitBounds(NORTH_AMERICA, { padding: 16, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.fitSignal]);

  // Fly to a campsite picked from the sidebar.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !props.flyTo) return;
    map.easeTo({ center: [props.flyTo.longitude, props.flyTo.latitude], zoom: Math.max(map.getZoom(), 9), duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.flyTo?.nonce]);

  return (
    <div className="map-wrap">
      {!token ? (
        <div className="map-placeholder"><strong>Mapbox is not connected.</strong><span>Add NEXT_PUBLIC_MAPBOX_TOKEN to Vercel, then redeploy.</span></div>
      ) : (
        <div ref={ref} className="map-canvas" />
      )}
      {token && props.showCampsites && (
        <div className="map-legend">
          <span><i style={{ background: "#7c4a1e" }} />Saved</span>
          <span><i style={{ background: "#d97706" }} />Favorite</span>
          <span><i style={{ background: "#16a34a" }} />In trip</span>
        </div>
      )}
    </div>
  );
}
