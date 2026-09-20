"use client";

import { useMemo, useState } from "react";

type StopType = "start" | "destination" | "camp" | "fuel" | "attraction";
type Stop = { id: number; type: StopType; title: string; subtitle: string; miles: number; meta: string; day: number };

const seedStops: Stop[] = [
  { id: 1, type: "start", title: "Kansas City, MO", subtitle: "Trip start", miles: 0, meta: "Day 1", day: 1 },
  { id: 2, type: "fuel", title: "Loveland, CO", subtitle: "Fuel + supplies", miles: 540, meta: "Fuel stop", day: 1 },
  { id: 3, type: "camp", title: "Medicine Lodge", subtitle: "Dispersed / primitive camping", miles: 278, meta: "6,236 ft", day: 1 },
  { id: 4, type: "destination", title: "Yellowstone", subtitle: "Destination", miles: 166, meta: "Explore", day: 2 },
  { id: 5, type: "camp", title: "Jardine Dispersed", subtitle: "North of Yellowstone", miles: 73, meta: "6,143 ft", day: 2 },
  { id: 6, type: "destination", title: "Grand Tetons", subtitle: "Destination", miles: 96, meta: "Explore", day: 3 },
  { id: 7, type: "camp", title: "Shadow Mountain", subtitle: "Dispersed camping", miles: 31, meta: "7,099 ft", day: 3 },
];

const discover = [
  { name: "Yellowstone National Park", reason: "Major destination on your route", tag: "Must see", type: "Attraction" },
  { name: "LeHardy Rapids", reason: "Quick scenic stop near Yellowstone Lake", tag: "15–30 min", type: "Scenic" },
  { name: "Clear Lake Artist Point Loop", reason: "3.9 mi moderate hike", tag: "1h 33m", type: "Hike" },
  { name: "Shadow Mountain", reason: "Dispersed camping near Grand Teton", tag: "7,099 ft", type: "Camp" },
];

const initialPacking = ["Recovery boards", "Air compressor", "First aid kit", "Headlamps", "Water storage", "Camp stove", "Cooler", "Tool kit"];

export default function Home() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [showPlanner, setShowPlanner] = useState(false);
  const [fuelReserve, setFuelReserve] = useState(15);
  const [tripName, setTripName] = useState("Wild West Adventure");
  const [start, setStart] = useState("Kansas City, MO");
  const [destinations, setDestinations] = useState("Yellowstone, Grand Tetons, Black Hills");
  const [mpg, setMpg] = useState(15);
  const [tank, setTank] = useState(36);
  const [gasPrice, setGasPrice] = useState(3.57);
  const [stops, setStops] = useState(seedStops);
  const [packing, setPacking] = useState(initialPacking.map((name, i) => ({ id: i + 1, name, done: false })));
  const [newItem, setNewItem] = useState("");

  const totalMiles = stops.reduce((sum, s) => sum + s.miles, 0);
  const fullRange = Math.round(tank * mpg);
  const usableRange = Math.round(fullRange * (1 - fuelReserve / 100));
  const gallons = totalMiles / Math.max(mpg, 1);
  const fuelCost = gallons * gasPrice;
  const tripBudget = fuelCost + 350 + 80 + 120 + 100;

  const days = useMemo(() => {
    const map = new Map<number, Stop[]>();
    stops.forEach((s) => map.set(s.day, [...(map.get(s.day) || []), s]));
    return [...map.entries()];
  }, [stops]);

  function createTrip() {
    const names = destinations.split(",").map((x) => x.trim()).filter(Boolean);
    const generated: Stop[] = [{ id: 1, type: "start", title: start || "Starting point", subtitle: "Trip start", miles: 0, meta: "Day 1", day: 1 }];
    names.forEach((name, i) => {
      generated.push({ id: i + 2, type: "destination", title: name, subtitle: "Destination", miles: i === 0 ? 0 : 250, meta: "Explore", day: Math.min(i + 1, 10) });
      if (i < names.length - 1) generated.push({ id: 100 + i, type: "camp", title: `${name} area camp`, subtitle: "Suggested overnight area", miles: 25, meta: "Research", day: Math.min(i + 1, 10) });
    });
    setStops(generated);
    setActiveTab("Route");
    setShowPlanner(false);
  }

  function addPackingItem() {
    if (!newItem.trim()) return;
    setPacking((items) => [...items, { id: Date.now(), name: newItem.trim(), done: false }]);
    setNewItem("");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">↟</span><span>OVERLAND<br/><b>PLANNER</b></span></div>
        <div className="trip-card"><span className="eyebrow">ACTIVE TRIP</span><h3>{tripName}</h3><p>{days.length} days · {Math.round(totalMiles).toLocaleString()} mi</p><div className="trip-progress"><span /></div><small>Planning mode</small></div>
        <nav>{["Overview", "Route", "Campsites", "Fuel", "Attractions", "Budget", "Pack List"].map((item) => <button key={item} className={activeTab === item ? "nav-item active" : "nav-item"} onClick={() => setActiveTab(item)}><span className="nav-icon">{iconFor(item)}</span>{item}</button>)}</nav>
        <div className="sidebar-bottom"><span className="status-dot" /> All changes stored in this session</div>
      </aside>

      <section className="main-content">
        <header className="topbar"><div><span className="breadcrumb">TRIPS / {tripName.toUpperCase()}</span><h1>{activeTab}</h1></div><div className="header-actions"><button className="ghost-button" onClick={() => setActiveTab("Overview")}>Dashboard</button><button className="primary-button" onClick={() => setShowPlanner(true)}>＋ Build Trip</button></div></header>

        <div className="content">
          {activeTab === "Overview" && <Overview totalMiles={totalMiles} fuelCost={fuelCost} usableRange={usableRange} fullRange={fullRange} tripBudget={tripBudget} fuelReserve={fuelReserve} setFuelReserve={setFuelReserve} stops={stops} setActiveTab={setActiveTab} />}
          {activeTab === "Route" && <RouteView stops={stops} totalMiles={totalMiles} />}
          {activeTab === "Fuel" && <FuelView stops={stops} usableRange={usableRange} fullRange={fullRange} fuelCost={fuelCost} gasPrice={gasPrice} setGasPrice={setGasPrice} />}
          {activeTab === "Campsites" && <SimpleList title="Campsites" eyebrow="OVERNIGHTS" items={stops.filter((s) => s.type === "camp").map((s) => `${s.title} · ${s.meta} · ${s.subtitle}`)} empty="No campsites have been added yet." />}
          {activeTab === "Attractions" && <SimpleList title="Attractions & hikes" eyebrow="DISCOVER" items={discover.map((d) => `${d.name} · ${d.type} · ${d.tag}`)} empty="No discoveries yet." />}
          {activeTab === "Budget" && <BudgetView fuelCost={fuelCost} tripBudget={tripBudget} />}
          {activeTab === "Pack List" && <PackView packing={packing} setPacking={setPacking} newItem={newItem} setNewItem={setNewItem} addPackingItem={addPackingItem} />}
        </div>
      </section>

      {showPlanner && <div className="modal-backdrop" onClick={() => setShowPlanner(false)}><div className="modal" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowPlanner(false)}>×</button><span className="eyebrow">NEW TRIP</span><h2>Start with the route.</h2><p>Enter the basics and the planner will create an editable trip structure. Research and smart suggestions will plug into this workflow next.</p><div className="form-grid"><label>Trip name<input value={tripName} onChange={(e) => setTripName(e.target.value)} placeholder="e.g. Colorado Backcountry 2027" /></label><label>Starting point<input value={start} onChange={(e) => setStart(e.target.value)} placeholder="Kansas City, MO" /></label><label className="wide">Destinations<input value={destinations} onChange={(e) => setDestinations(e.target.value)} placeholder="Yellowstone, Grand Tetons, Black Hills" /></label><label>MPG<input type="number" value={mpg} onChange={(e) => setMpg(Number(e.target.value))} /></label><label>Tank size<input type="number" value={tank} onChange={(e) => setTank(Number(e.target.value))} /></label></div><button className="primary-button full" onClick={createTrip}>Create trip →</button></div></div>}
    </main>
  );
}

function Overview({ totalMiles, fuelCost, usableRange, fullRange, tripBudget, fuelReserve, setFuelReserve, stops, setActiveTab }: any) {
  return <><section className="hero"><div><span className="eyebrow">PLANNING MODE</span><h2>{stops[0]?.title} → {stops.filter((s: Stop) => s.type === "destination").map((s: Stop) => s.title).join(" → ")}</h2><p>Build the route first, then layer in campsites, fuel, attractions and budget.</p></div><div className="hero-stat"><strong>{Math.round(totalMiles).toLocaleString()}</strong><span>estimated miles</span></div></section><section className="stat-grid"><Stat label="Travel Time" value="Route pending" detail="Will calculate with routing" icon="◷" /><Stat label="Fuel Estimate" value={`$${Math.round(fuelCost)}`} detail={`${Math.round(totalMiles / 15)} gal at current MPG`} icon="⛽" /><Stat label="Fuel Range" value={`${usableRange} mi`} detail={`${fuelReserve}% reserve · ${fullRange} full`} icon="↔" /><Stat label="Trip Budget" value={`$${Math.round(tripBudget).toLocaleString()}`} detail="Fuel + planning allowances" icon="$" /></section><div className="dashboard-grid"><section className="panel route-panel"><div className="panel-header"><div><span className="eyebrow">ROUTE</span><h3>Trip at a glance</h3></div><button className="text-button" onClick={() => setActiveTab("Route")}>Open route →</button></div><div className="route-map"><div className="map-road road-a"/><div className="map-road road-b"/><div className="map-road road-c"/>{stops.slice(1).map((stop: Stop, i: number) => <div key={stop.id} className={`map-pin pin-${i % 6} ${stop.type}`}><span>{symbolFor(stop.type)}</span></div>)}<div className="map-label label-yellow">TRIP ROUTE</div></div><div className="timeline">{stops.slice(0, 7).map((stop: Stop) => <TimelineRow stop={stop} key={stop.id} />)}</div></section><div className="right-column"><FuelCard usableRange={usableRange} fullRange={fullRange} fuelReserve={fuelReserve} setFuelReserve={setFuelReserve} setActiveTab={setActiveTab} /><section className="panel suggestions-panel"><div className="panel-header"><div><span className="eyebrow">DISCOVER</span><h3>Suggested for this route</h3></div><button className="text-button" onClick={() => setActiveTab("Attractions")}>See all →</button></div>{discover.map((a) => <div className="suggestion" key={a.name}><div className="suggestion-icon">✦</div><div><strong>{a.name}</strong><span>{a.reason}</span></div><small>{a.tag}</small></div>)}</section></div></div></>;
}

function FuelCard({ usableRange, fullRange, fuelReserve, setFuelReserve, setActiveTab }: any) { return <section className="panel fuel-panel"><div className="panel-header"><div><span className="eyebrow">FUEL PLANNING</span><h3>Know before you go</h3></div><span className="safe-badge">SAFE RANGE</span></div><div className="range-number"><strong>{usableRange}</strong><span>miles usable range</span></div><div className="range-track"><span style={{ width: `${Math.min(100, (usableRange / fullRange) * 100)}%` }} /><i style={{ left: `${Math.min(100, (usableRange / fullRange) * 100)}%` }} /></div><div className="range-labels"><span>0 mi</span><span>{fullRange} mi full tank</span></div><label className="slider-label">Reserve buffer <b>{fuelReserve}%</b></label><input className="slider" type="range" min="5" max="30" value={fuelReserve} onChange={(e) => setFuelReserve(Number(e.target.value))} /><div className="fuel-callout"><strong>Next step</strong><span>Add fuel stops to compare every leg against this usable range.</span><button className="text-button" onClick={() => setActiveTab("Fuel")}>Plan fuel →</button></div></section>; }

function RouteView({ stops, totalMiles }: { stops: Stop[]; totalMiles: number }) { return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">ROUTE BUILDER</span><h2>Build the trip one leg at a time.</h2><p>{Math.round(totalMiles).toLocaleString()} estimated miles across {new Set(stops.map((s) => s.day)).size} planning days. Routing, drive time and map data will be connected next.</p></div><div className="route-table">{stops.map((s, i) => <div className="route-row" key={s.id}><span className={`route-badge ${s.type}`}>{symbolFor(s.type)}</span><div><strong>{s.title}</strong><span>{s.subtitle}</span></div><span>Day {s.day}</span><strong>{s.miles ? `+${s.miles} mi` : "Start"}</strong><span>{s.meta}</span></div>)}</div></section>; }

function FuelView({ stops, usableRange, fullRange, fuelCost, gasPrice, setGasPrice }: any) { const fuels = stops.filter((s: Stop) => s.type === "fuel"); return <><section className="hero compact"><div><span className="eyebrow">FUEL PLAN</span><h2>Never wonder how far the next station is.</h2><p>Fuel planning is based on your vehicle range and route legs.</p></div></section><section className="stat-grid"><Stat label="Usable Range" value={`${usableRange} mi`} detail={`of ${fullRange} mi full range`} icon="↔" /><Stat label="Fuel Estimate" value={`$${Math.round(fuelCost)}`} detail="Based on route mileage" icon="⛽" /><Stat label="Stations Added" value={`${fuels.length}`} detail="Planned fuel stops" icon="＋" /><div className="stat-card"><span className="eyebrow">PRICE / GALLON</span><strong>$<input className="inline-number" type="number" step="0.01" value={gasPrice} onChange={(e) => setGasPrice(Number(e.target.value))} /></strong><small>Use a planning average</small></div></section><section className="panel full-panel"><div className="panel-header"><div><span className="eyebrow">FUEL STOPS</span><h3>Current route fuel plan</h3></div></div>{fuels.length ? fuels.map((s: Stop) => <div className="list-row" key={s.id}><span className="list-icon">⛽</span><div><strong>{s.title}</strong><small>{s.subtitle}</small></div><em>Planned</em></div>) : <div className="empty">No fuel stops yet. Add them from the route builder once routing is connected.</div>}</section></>; }

function BudgetView({ fuelCost, tripBudget }: any) { const rows = [["Fuel", fuelCost], ["Food", 350], ["National Park / public land fees", 80], ["Camping", 120], ["Souvenirs", 100], ["Emergency buffer", 200]]; return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">TRIP BUDGET</span><h2>Know what the adventure is likely to cost.</h2><p>These are planning allowances. Later, we'll let you customize categories and track actual spending.</p></div>{rows.map(([name, value]) => <div className="budget-row" key={name as string}><span>{name}</span><strong>${Math.round(value as number).toLocaleString()}</strong></div>)}<div className="budget-total"><span>Estimated trip total</span><strong>${Math.round(tripBudget).toLocaleString()}</strong></div></section>; }

function PackView({ packing, setPacking, newItem, setNewItem, addPackingItem }: any) { return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">PACK LIST</span><h2>Start with the loadout you already know works.</h2><p>Check items off as you pack. Saved templates will come in a later version.</p></div><div className="add-item"><input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPackingItem()} placeholder="Add an item" /><button className="primary-button" onClick={addPackingItem}>Add item</button></div>{packing.map((item: any) => <label className="check-row" key={item.id}><input type="checkbox" checked={item.done} onChange={() => setPacking((items: any[]) => items.map((x) => x.id === item.id ? { ...x, done: !x.done } : x))} /><span className={item.done ? "checked" : ""}>{item.name}</span></label>)}</section>; }

function SimpleList({ title, eyebrow, items, empty }: { title: string; eyebrow: string; items: string[]; empty: string }) { return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>These records are currently seeded from the prototype. We'll replace them with live research and route-aware suggestions.</p></div>{items.length ? items.map((item) => <div className="list-row" key={item}><span className="list-icon">✦</span><div><strong>{item.split(" · ")[0]}</strong><small>{item.split(" · ").slice(1).join(" · ")}</small></div></div>) : <div className="empty">{empty}</div>}</section>; }

function TimelineRow({ stop }: { stop: Stop }) { return <div className="timeline-row"><div className={`timeline-dot ${stop.type}`}>{symbolFor(stop.type)}</div><div className="timeline-main"><strong>{stop.title}</strong><span>{stop.subtitle}</span></div><div className="timeline-meta"><strong>{stop.miles ? `+${stop.miles} mi` : "Start"}</strong><span>{stop.meta}</span></div></div>; }

function Stat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: string }) { return <div className="stat-card"><span className="stat-icon">{icon}</span><span className="eyebrow">{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function symbolFor(type: StopType) { return type === "fuel" ? "⛽" : type === "camp" ? "⌂" : type === "destination" ? "✦" : "●"; }
function iconFor(item: string) { return ({ Overview: "◈", Route: "⌁", Campsites: "⌂", Fuel: "⛽", Attractions: "✦", Budget: "$", "Pack List": "✓" } as Record<string, string>)[item]; }
