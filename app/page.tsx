"use client";

import { useMemo, useState } from "react";

type StopType = "start" | "destination" | "camp" | "fuel" | "attraction";
type Stop = { id: number; type: StopType; title: string; subtitle: string; miles: number; meta: string; day: number; elevation?: number };
type DayPlan = { day: number; label: string; destination: string; maxHours: number; overnight: string };

const seedStops: Stop[] = [
  { id: 1, type: "start", title: "Kansas City, MO", subtitle: "Trip start", miles: 0, meta: "Day 1", day: 1 },
  { id: 2, type: "fuel", title: "Loveland, CO", subtitle: "Fuel + supplies", miles: 540, meta: "Fuel stop", day: 1 },
  { id: 3, type: "camp", title: "Medicine Lodge", subtitle: "Dispersed / primitive camping", miles: 278, meta: "6,236 ft", day: 1, elevation: 6236 },
  { id: 4, type: "destination", title: "Yellowstone", subtitle: "Destination", miles: 166, meta: "Explore", day: 2 },
  { id: 5, type: "camp", title: "Jardine Dispersed", subtitle: "North of Yellowstone", miles: 73, meta: "6,143 ft", day: 2, elevation: 6143 },
  { id: 6, type: "destination", title: "Grand Teton", subtitle: "Destination", miles: 96, meta: "Explore", day: 3 },
  { id: 7, type: "camp", title: "Shadow Mountain", subtitle: "Dispersed camping", miles: 31, meta: "7,099 ft", day: 3, elevation: 7099 },
];

const discover = [
  { name: "Yellowstone National Park", reason: "Major destination on your route", tag: "Must see", type: "Attraction" },
  { name: "LeHardy Rapids", reason: "Quick scenic stop near Yellowstone Lake", tag: "15–30 min", type: "Scenic" },
  { name: "Clear Lake Artist Point Loop", reason: "3.9 mi moderate hike", tag: "1h 33m", type: "Hike" },
  { name: "Shadow Mountain", reason: "Dispersed camping near Grand Teton", tag: "7,099 ft", type: "Camp" },
  { name: "Grand Teton National Park", reason: "High-priority destination", tag: "Must see", type: "Attraction" },
];

const initialPacking = ["Recovery boards", "Air compressor", "First aid kit", "Headlamps", "Water storage", "Camp stove", "Cooler", "Tool kit"];

export default function Home() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [showPlanner, setShowPlanner] = useState(false);
  const [fuelReserve, setFuelReserve] = useState(15);
  const [tripName, setTripName] = useState("Wild West Adventure");
  const [start, setStart] = useState("Kansas City, MO");
  const [destinations, setDestinations] = useState("Yellowstone, Grand Teton, Black Hills");
  const [mpg, setMpg] = useState(15);
  const [tank, setTank] = useState(36);
  const [gasPrice, setGasPrice] = useState(3.57);
  const [foodBudget, setFoodBudget] = useState(350);
  const [parkBudget, setParkBudget] = useState(80);
  const [campBudget, setCampBudget] = useState(120);
  const [funBudget, setFunBudget] = useState(150);
  const [bufferBudget, setBufferBudget] = useState(200);
  const [dailyHours, setDailyHours] = useState(6);
  const [campingStyle, setCampingStyle] = useState("Dispersed / primitive");
  const [stops, setStops] = useState(seedStops);
  const [packing, setPacking] = useState(initialPacking.map((name, i) => ({ id: i + 1, name, done: false })));
  const [newItem, setNewItem] = useState("");
  const [days, setDays] = useState<DayPlan[]>([
    { day: 1, label: "Travel Day", destination: "Colorado / Wyoming", maxHours: 6, overnight: "Medicine Lodge area" },
    { day: 2, label: "Yellowstone", destination: "Yellowstone National Park", maxHours: 4, overnight: "Jardine area" },
    { day: 3, label: "Grand Teton", destination: "Grand Teton National Park", maxHours: 4, overnight: "Shadow Mountain" },
  ]);

  const totalMiles = stops.reduce((sum, s) => sum + s.miles, 0);
  const fullRange = Math.round(tank * mpg);
  const usableRange = Math.round(fullRange * (1 - fuelReserve / 100));
  const gallons = totalMiles / Math.max(mpg, 1);
  const fuelCost = gallons * gasPrice;
  const tripBudget = fuelCost + foodBudget + parkBudget + campBudget + funBudget + bufferBudget;
  const daysCount = Math.max(days.length, 1);

  const groupedDays = useMemo(() => {
    const map = new Map<number, Stop[]>();
    stops.forEach((s) => map.set(s.day, [...(map.get(s.day) || []), s]));
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [stops]);

  function createTrip() {
    const names = destinations.split(",").map((x) => x.trim()).filter(Boolean);
    const generated: Stop[] = [{ id: 1, type: "start", title: start || "Starting point", subtitle: "Trip start", miles: 0, meta: "Day 1", day: 1 }];
    const generatedDays: DayPlan[] = [];
    names.forEach((name, i) => {
      const day = i + 1;
      generated.push({ id: i + 2, type: "destination", title: name, subtitle: "Destination", miles: i === 0 ? 0 : 250, meta: "Explore", day });
      generatedDays.push({ day, label: i === 0 ? "Travel Day" : "Explore", destination: name, maxHours: Math.min(dailyHours, 8), overnight: `${name} area` });
      if (i < names.length - 1) generated.push({ id: 100 + i, type: "camp", title: `${name} area camp`, subtitle: campingStyle, miles: 25, meta: "Suggested overnight", day, elevation: 6000 + i * 500 });
    });
    setStops(generated);
    setDays(generatedDays.length ? generatedDays : [{ day: 1, label: "Trip", destination: "Add a destination", maxHours: dailyHours, overnight: "TBD" }]);
    setActiveTab("Route");
    setShowPlanner(false);
  }

  function addPackingItem() {
    if (!newItem.trim()) return;
    setPacking((items) => [...items, { id: Date.now(), name: newItem.trim(), done: false }]);
    setNewItem("");
  }

  function addDay() {
    const day = days.length + 1;
    setDays((items) => [...items, { day, label: "Explore", destination: "New destination", maxHours: dailyHours, overnight: "TBD" }]);
  }

  function updateDay(day: number, key: keyof DayPlan, value: string | number) {
    setDays((items) => items.map((d) => d.day === day ? { ...d, [key]: value } : d));
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">↟</span><span>OVERLAND<br/><b>PLANNER</b></span></div>
        <div className="trip-card"><span className="eyebrow">ACTIVE TRIP</span><h3>{tripName}</h3><p>{daysCount} days · {Math.round(totalMiles).toLocaleString()} mi</p><div className="trip-progress"><span /></div><small>Planning mode</small></div>
        <nav>{["Overview", "Route", "Campsites", "Fuel", "Attractions", "Budget", "Pack List"].map((item) => <button key={item} className={activeTab === item ? "nav-item active" : "nav-item"} onClick={() => setActiveTab(item)}><span className="nav-icon">{iconFor(item)}</span>{item}</button>)}</nav>
        <div className="sidebar-bottom"><span className="status-dot" /> Local planning workspace</div>
      </aside>

      <section className="main-content">
        <header className="topbar"><div><span className="breadcrumb">TRIPS / {tripName.toUpperCase()}</span><h1>{activeTab}</h1></div><div className="header-actions"><button className="ghost-button" onClick={() => setActiveTab("Overview")}>Dashboard</button><button className="primary-button" onClick={() => setShowPlanner(true)}>＋ Build Trip</button></div></header>
        <div className="content">
          {activeTab === "Overview" && <Overview totalMiles={totalMiles} fuelCost={fuelCost} usableRange={usableRange} fullRange={fullRange} tripBudget={tripBudget} fuelReserve={fuelReserve} setFuelReserve={setFuelReserve} stops={stops} setActiveTab={setActiveTab} days={days} />}
          {activeTab === "Route" && <RouteView stops={stops} totalMiles={totalMiles} days={days} addDay={addDay} updateDay={updateDay} />}
          {activeTab === "Fuel" && <FuelView stops={stops} usableRange={usableRange} fullRange={fullRange} fuelCost={fuelCost} gasPrice={gasPrice} setGasPrice={setGasPrice} mpg={mpg} tank={tank} />}
          {activeTab === "Campsites" && <SimpleList title="Campsites" eyebrow="OVERNIGHTS" items={stops.filter((s) => s.type === "camp").map((s) => `${s.title} · ${s.meta} · ${s.subtitle}`)} empty="No campsites have been added yet." />}
          {activeTab === "Attractions" && <SimpleList title="Attractions & hikes" eyebrow="DISCOVER" items={discover.map((d) => `${d.name} · ${d.type} · ${d.tag}`)} empty="No discoveries yet." />}
          {activeTab === "Budget" && <BudgetView fuelCost={fuelCost} foodBudget={foodBudget} setFoodBudget={setFoodBudget} parkBudget={parkBudget} setParkBudget={setParkBudget} campBudget={campBudget} setCampBudget={setCampBudget} funBudget={funBudget} setFunBudget={setFunBudget} bufferBudget={bufferBudget} setBufferBudget={setBufferBudget} tripBudget={tripBudget} />}
          {activeTab === "Pack List" && <PackView packing={packing} setPacking={setPacking} newItem={newItem} setNewItem={setNewItem} addPackingItem={addPackingItem} />}
        </div>
      </section>

      {showPlanner && <div className="modal-backdrop" onClick={() => setShowPlanner(false)}><div className="modal wide-modal" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowPlanner(false)}>×</button><span className="eyebrow">NEW TRIP</span><h2>Start with the route.</h2><p>These inputs become the planning rules the recommendation engine will use later for campsites, fuel, attractions and hikes.</p><div className="form-grid"><label>Trip name<input value={tripName} onChange={(e) => setTripName(e.target.value)} placeholder="e.g. Colorado Backcountry 2027" /></label><label>Starting point<input value={start} onChange={(e) => setStart(e.target.value)} placeholder="Kansas City, MO" /></label><label className="wide">Destinations<input value={destinations} onChange={(e) => setDestinations(e.target.value)} placeholder="Yellowstone, Grand Teton, Black Hills" /></label><label>Vehicle MPG<input type="number" min="1" value={mpg} onChange={(e) => setMpg(Number(e.target.value))} /></label><label>Tank size (gal)<input type="number" min="1" value={tank} onChange={(e) => setTank(Number(e.target.value))} /></label><label>Daily driving limit (hrs)<input type="number" min="1" max="12" value={dailyHours} onChange={(e) => setDailyHours(Number(e.target.value))} /></label><label>Camping style<select value={campingStyle} onChange={(e) => setCampingStyle(e.target.value)}><option>Dispersed / primitive</option><option>Established campground</option><option>Mix of dispersed + campground</option><option>Hotels / cabins</option></select></label><label>Fuel reserve (%)<input type="number" min="0" max="50" value={fuelReserve} onChange={(e) => setFuelReserve(Number(e.target.value))} /></label><label>Gas price ($/gal)<input type="number" min="0" step="0.01" value={gasPrice} onChange={(e) => setGasPrice(Number(e.target.value))} /></label></div><div className="planner-preview"><div><b>Usable fuel range</b><span>{usableRange} miles</span></div><div><b>Estimated fuel</b><span>${Math.round((totalMiles / Math.max(mpg, 1)) * gasPrice)}</span></div><div><b>Planning days</b><span>{Math.max(destinations.split(",").filter(Boolean).length, 1)}</span></div></div><button className="primary-button full" onClick={createTrip}>Create trip →</button></div></div>}
    </main>
  );
}

function Overview({ totalMiles, fuelCost, usableRange, fullRange, tripBudget, fuelReserve, setFuelReserve, stops, setActiveTab, days }: any) {
  return <><section className="hero"><div><span className="eyebrow">PLANNING MODE</span><h2>{stops[0]?.title} → {stops.filter((s: Stop) => s.type === "destination").map((s: Stop) => s.title).join(" → ")}</h2><p>Route first. Then layer in campsites, fuel, attractions, hikes and budget.</p></div><div className="hero-stat"><strong>{Math.round(totalMiles).toLocaleString()}</strong><span>estimated miles</span></div></section><section className="stat-grid"><Stat label="Planning Days" value={`${days.length}`} detail="Editable in Route" icon="◷" /><Stat label="Fuel Estimate" value={`$${Math.round(fuelCost)}`} detail={`${Math.round(totalMiles / 15)} gal at current MPG`} icon="⛽" /><Stat label="Fuel Range" value={`${usableRange} mi`} detail={`${fuelReserve}% reserve · ${fullRange} full`} icon="↔" /><Stat label="Trip Budget" value={`$${Math.round(tripBudget).toLocaleString()}`} detail="Current planning estimate" icon="$" /></section><div className="dashboard-grid"><section className="panel route-panel"><div className="panel-header"><div><span className="eyebrow">ROUTE</span><h3>Trip at a glance</h3></div><button className="text-button" onClick={() => setActiveTab("Route")}>Open route →</button></div><div className="route-map"><div className="map-road road-a"/><div className="map-road road-b"/><div className="map-road road-c"/>{stops.slice(1).map((stop: Stop, i: number) => <div key={stop.id} className={`map-pin pin-${i % 6} ${stop.type}`}><span>{symbolFor(stop.type)}</span></div>)}<div className="map-label label-yellow">PLANNED ROUTE</div></div><div className="timeline">{stops.slice(0, 7).map((stop: Stop) => <TimelineRow key={stop.id} stop={stop} />)}</div></section><div className="right-column"><FuelPanel usableRange={usableRange} fullRange={fullRange} fuelReserve={fuelReserve} setFuelReserve={setFuelReserve} stops={stops} /><Suggestions /></div></div></>;
}

function RouteView({ stops, totalMiles, days, addDay, updateDay }: any) {
  return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">ROUTE BUILDER</span><h2>Shape the trip day by day.</h2><p>Set your daily driving limit and overnight target now. Later, route data will replace the placeholder distances with real routing and automatically suggest sensible fuel and camping stops.</p></div><div className="day-grid">{days.map((d: DayPlan) => <article className="day-card" key={d.day}><div className="day-number">DAY {d.day}</div><label>Day label<input value={d.label} onChange={(e) => updateDay(d.day, "label", e.target.value)} /></label><label>Destination<input value={d.destination} onChange={(e) => updateDay(d.day, "destination", e.target.value)} /></label><label>Overnight<input value={d.overnight} onChange={(e) => updateDay(d.day, "overnight", e.target.value)} /></label><label>Driving limit<select value={d.maxHours} onChange={(e) => updateDay(d.day, "maxHours", Number(e.target.value))}>{[3,4,5,6,7,8,9,10].map((h) => <option key={h} value={h}>{h} hours</option>)}</select></label></article>)}</div><div className="route-footer"><div><b>{Math.round(totalMiles).toLocaleString()} mi</b><span>current estimate</span></div><div><b>{stops.length}</b><span>planned stops</span></div><button className="ghost-button" onClick={addDay}>＋ Add day</button></div><div className="route-table">{stops.map((stop: Stop, i: number) => <div className="route-row" key={stop.id}><span className={`route-badge ${stop.type}`}>{symbolFor(stop.type)}</span><div><strong>{stop.title}</strong><span>{stop.subtitle}</span></div><span>{stop.day ? `Day ${stop.day}` : ""}</span><span>{stop.miles ? `${stop.miles} mi` : "Start"}</span><span>{stop.meta}</span></div>)}</div></section>;
}

function FuelView({ stops, usableRange, fullRange, fuelCost, gasPrice, setGasPrice, mpg, tank }: any) {
  const fuelStops = stops.filter((s: Stop) => s.type === "fuel");
  return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">FUEL PLAN</span><h2>Know where the tank gets you.</h2><p>Fuel planning is a first-class part of the route. The next version can calculate actual station-to-station legs and flag any segment that exceeds your safe range.</p></div><div className="fuel-summary"><div><span>Full tank range</span><b>{fullRange} mi</b></div><div><span>Safe planning range</span><b>{usableRange} mi</b></div><div><span>Estimated trip fuel</span><b>${Math.round(fuelCost)}</b></div><label><span>Planning gas price</span><input type="number" min="0" step="0.01" value={gasPrice} onChange={(e) => setGasPrice(Number(e.target.value))} /></label></div><div className="fuel-callout"><span className="safe-badge">CURRENT ASSUMPTION</span><strong>{mpg} MPG · {tank} gal tank</strong><span>Safe range intentionally leaves a reserve.</span></div><div className="fuel-list large">{fuelStops.length ? fuelStops.map((s: Stop) => <div className="fuel-row" key={s.id}><span className="fuel-icon">⛽</span><div><strong>{s.title}</strong><small>{s.subtitle}</small></div><em>{s.miles} mi into route</em></div>) : <div className="empty">No fuel stops yet. Once routing is connected, the planner can propose fuel stops automatically.</div>}</div></section>;
}

function BudgetView({ fuelCost, foodBudget, setFoodBudget, parkBudget, setParkBudget, campBudget, setCampBudget, funBudget, setFunBudget, bufferBudget, setBufferBudget, tripBudget }: any) {
  const rows = [{ label: "Fuel", value: fuelCost, fixed: true }, { label: "Food", value: foodBudget, set: setFoodBudget }, { label: "National park fees", value: parkBudget, set: setParkBudget }, { label: "Camping", value: campBudget, set: setCampBudget }, { label: "Activities / souvenirs", value: funBudget, set: setFunBudget }, { label: "Emergency / buffer", value: bufferBudget, set: setBufferBudget }];
  return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">TRIP BUDGET</span><h2>Plan the money before the miles.</h2><p>Fuel is calculated from the route and vehicle assumptions. The other categories are editable allowances until the app can recommend more accurate costs.</p></div>{rows.map((r) => <div className="budget-row" key={r.label}><span>{r.label}</span>{r.set ? <input className="inline-number" type="number" min="0" value={r.value} onChange={(e) => r.set(Number(e.target.value))} /> : <b>${Math.round(r.value).toLocaleString()}</b>}</div>)}<div className="budget-total"><span>Estimated trip total</span><strong>${Math.round(tripBudget).toLocaleString()}</strong></div></section>;
}

function PackView({ packing, setPacking, newItem, setNewItem, addPackingItem }: any) { return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">PACK LIST</span><h2>Build once. Reuse every trip.</h2><p>Keep your core overlanding loadout here. We can add saved packing templates, categories and vehicle-specific checklists later.</p></div><div className="add-item"><input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPackingItem()} placeholder="Add a packing item..." /><button className="primary-button" onClick={addPackingItem}>Add</button></div>{packing.map((item: any) => <label className="check-row" key={item.id}><input type="checkbox" checked={item.done} onChange={() => setPacking((items: any[]) => items.map((x) => x.id === item.id ? { ...x, done: !x.done } : x))} /><span className={item.done ? "checked" : ""}>{item.name}</span></label>)}</section>; }

function SimpleList({ title, eyebrow, items, empty }: any) { return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>These are the current planning candidates. The research engine will eventually populate this list from your route and preferences.</p></div>{items.length ? items.map((item: string, i: number) => <div className="list-row" key={i}><span className="list-icon">{i + 1}</span><div><strong>{item.split(" · ")[0]}</strong><small>{item.split(" · ").slice(1).join(" · ")}</small></div><em>Candidate</em></div>) : <div className="empty">{empty}</div>}</section>; }

function Stat({ label, value, detail, icon }: any) { return <div className="stat-card"><span className="stat-icon">{icon}</span><span className="eyebrow">{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function TimelineRow({ stop }: { stop: Stop }) { return <div className="timeline-row"><span className={`timeline-dot ${stop.type}`}>{symbolFor(stop.type)}</span><div className="timeline-main"><strong>{stop.title}</strong><span>{stop.subtitle}</span></div><div className="timeline-meta"><strong>{stop.miles ? `${stop.miles} mi` : "Start"}</strong><span>{stop.meta}</span></div></div>; }
function FuelPanel({ usableRange, fullRange, fuelReserve, setFuelReserve, stops }: any) { const fuelStops = stops.filter((s: Stop) => s.type === "fuel"); return <section className="panel fuel-panel"><div className="panel-header"><div><span className="eyebrow">FUEL SAFETY</span><h3>Safe driving range</h3></div><span className="safe-badge">Planning buffer</span></div><div className="range-number"><strong>{usableRange}</strong><span>miles</span></div><div className="range-track"><span style={{ width: `${Math.max(0, Math.min(100, usableRange / Math.max(fullRange, 1) * 100))}%` }} /></div><div className="range-labels"><span>Reserve</span><span>{fullRange} mi full</span></div><div className="slider-label"><span>Reserve</span><b>{fuelReserve}%</b></div><input className="slider" type="range" min="0" max="40" value={fuelReserve} onChange={(e) => setFuelReserve(Number(e.target.value))} />{fuelStops.slice(0, 3).map((s: Stop) => <div className="fuel-row" key={s.id}><span className="fuel-icon">⛽</span><div><strong>{s.title}</strong><small>{s.miles} mi into route</small></div><em>Planned</em></div>)}</section>; }
function Suggestions() { return <section className="panel suggestions-panel"><div className="panel-header"><div><span className="eyebrow">DISCOVER</span><h3>Good candidates</h3></div><span className="safe-badge">Prototype</span></div>{discover.slice(0, 4).map((d) => <div className="suggestion" key={d.name}><span className="suggestion-icon">{d.type === "Hike" ? "⌁" : d.type === "Camp" ? "⌂" : "✦"}</span><div><strong>{d.name}</strong><span>{d.reason}</span></div><small>{d.tag}</small></div>)}</section>; }
function symbolFor(type: StopType) { return type === "fuel" ? "⛽" : type === "camp" ? "⌂" : type === "attraction" ? "✦" : type === "destination" ? "◆" : "●"; }
function iconFor(item: string) { return ({ Overview: "▦", Route: "⌁", Campsites: "⌂", Fuel: "⛽", Attractions: "✦", Budget: "$", "Pack List": "✓" } as Record<string, string>)[item]; }
