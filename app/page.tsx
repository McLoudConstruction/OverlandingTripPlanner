"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type StopType = "start" | "destination" | "camp" | "fuel" | "attraction";
type Stop = { id: number; type: StopType; title: string; subtitle: string; miles: number; meta: string; day: number; elevation?: number };
type DayPlan = { day: number; label: string; destination: string; maxHours: number; overnight: string };
type Candidate = { id: number; type: "Camp" | "Fuel" | "Attraction" | "Hike"; name: string; area: string; distance: number; detail: string; tag: string; score: number };

const seedStops: Stop[] = [
  { id: 1, type: "start", title: "Kansas City, MO", subtitle: "Trip start", miles: 0, meta: "Day 1", day: 1 },
  { id: 2, type: "fuel", title: "Loveland, CO", subtitle: "Fuel + supplies", miles: 540, meta: "Fuel stop", day: 1 },
  { id: 3, type: "camp", title: "Medicine Lodge", subtitle: "Dispersed / primitive camping", miles: 278, meta: "6,236 ft", day: 1, elevation: 6236 },
  { id: 4, type: "destination", title: "Yellowstone", subtitle: "Destination", miles: 166, meta: "Explore", day: 2 },
  { id: 5, type: "camp", title: "Jardine Dispersed", subtitle: "North of Yellowstone", miles: 73, meta: "6,143 ft", day: 2, elevation: 6143 },
  { id: 6, type: "destination", title: "Grand Teton", subtitle: "Destination", miles: 96, meta: "Explore", day: 3 },
  { id: 7, type: "camp", title: "Shadow Mountain", subtitle: "Dispersed camping", miles: 31, meta: "7,099 ft", day: 3, elevation: 7099 },
];

const candidates: Candidate[] = [
  { id: 1, type: "Camp", name: "Shadow Mountain Dispersed", area: "Grand Teton", distance: 11, detail: "Primitive camping candidate · 7,099 ft", tag: "Camping style match", score: 94 },
  { id: 2, type: "Camp", name: "Jardine Area Dispersed", area: "Yellowstone North", distance: 18, detail: "Dispersed candidate · 6,143 ft", tag: "Near destination", score: 91 },
  { id: 3, type: "Fuel", name: "Cody Fuel Stop", area: "Cody, WY", distance: 43, detail: "Useful resupply point before remote travel", tag: "Fuel safety", score: 96 },
  { id: 4, type: "Fuel", name: "West Yellowstone Fuel", area: "West Yellowstone, MT", distance: 7, detail: "Convenient fill before park travel", tag: "Fuel safety", score: 90 },
  { id: 5, type: "Attraction", name: "LeHardy Rapids", area: "Yellowstone", distance: 5, detail: "Quick scenic stop · 15–30 minutes", tag: "Low time cost", score: 88 },
  { id: 6, type: "Attraction", name: "Artist Point", area: "Yellowstone", distance: 22, detail: "Major canyon overlook and scenic stop", tag: "Must see", score: 95 },
  { id: 7, type: "Hike", name: "Clear Lake Artist Point Loop", area: "Yellowstone", distance: 24, detail: "3.9 mi · moderate · ~1h 33m", tag: "Fits day plan", score: 92 },
  { id: 8, type: "Hike", name: "Jenny Lake Trail", area: "Grand Teton", distance: 9, detail: "Scenic lake route · adjustable distance", tag: "High interest", score: 89 },
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
  const [researchType, setResearchType] = useState("All");
  const [researchArea, setResearchArea] = useState("All");
  const [savedResearch, setSavedResearch] = useState<number[]>([1, 3, 6]);
  const [routeAlert, setRouteAlert] = useState(true);
  const [saveMessage, setSaveMessage] = useState("");
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
  const filteredCandidates = candidates.filter((c) => (researchType === "All" || c.type === researchType) && (researchArea === "All" || c.area.includes(researchArea)));
  const saved = candidates.filter((c) => savedResearch.includes(c.id));

  const groupedDays = useMemo(() => {
    const map = new Map<number, Stop[]>();
    stops.forEach((s) => map.set(s.day, [...(map.get(s.day) || []), s]));
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [stops]);

  async function saveTripToSupabase() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      setSaveMessage("Supabase is not connected yet. Add the two environment variables in Vercel.");
      return;
    }
    setSaveMessage("Saving trip…");
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSaveMessage("Database is connected, but you are not signed in. Auth will be added to the next pass.");
      return;
    }
    const { data: trip, error } = await supabase.from("trips").insert({
      user_id: auth.user.id, name: tripName, start_location: start,
      destinations: destinations.split(",").map((x) => x.trim()).filter(Boolean),
      mpg, tank_gallons: tank, fuel_reserve_percent: fuelReserve,
      daily_driving_hours: dailyHours, camping_style: campingStyle, planning_gas_price: gasPrice
    }).select().single();
    if (error || !trip) { setSaveMessage(error?.message || "Unable to save trip."); return; }
    const { error: dayError } = await supabase.from("trip_days").insert(days.map((d) => ({ trip_id: trip.id, day_number: d.day, label: d.label, destination: d.destination, max_hours: d.maxHours, overnight: d.overnight })));
    setSaveMessage(dayError ? `Trip saved, but days failed: ${dayError.message}` : "Trip saved to Supabase.");
  }

  function createTrip() {
    const names = destinations.split(",").map((x) => x.trim()).filter(Boolean);
    const generated: Stop[] = [{ id: 1, type: "start", title: start || "Starting point", subtitle: "Trip start", miles: 0, meta: "Day 1", day: 1 }];
    const generatedDays: DayPlan[] = [];
    names.forEach((name, i) => {
      const day = i + 1;
      generated.push({ id: i + 2, type: "destination", title: name, subtitle: "Destination", miles: i === 0 ? 0 : 250, meta: "Explore", day });
      generatedDays.push({ day, label: i === 0 ? "Travel Day" : "Explore", destination: name, maxHours: Math.min(dailyHours, 8), overnight: `${name} area` });
      if (i < names.length - 1) generated.push({ id: 100 + i, type: "camp", title: `${name} area camp`, subtitle: campingStyle, miles: 25, meta: `${6000 + i * 500} ft`, day, elevation: 6000 + i * 500 });
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
  function toggleSaved(id: number) {
    setSavedResearch((items) => items.includes(id) ? items.filter((x) => x !== id) : [...items, id]);
  }
  function addCandidate(c: Candidate) {
    const day = Math.min(Math.max(days.length, 1), 3);
    const typeMap: Record<Candidate["type"], StopType> = { Camp: "camp", Fuel: "fuel", Attraction: "attraction", Hike: "attraction" };
    setStops((items) => [...items, { id: Date.now(), type: typeMap[c.type], title: c.name, subtitle: c.detail, miles: c.distance, meta: c.tag, day }]);
    setActiveTab("Route");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">↟</span><span>OVERLAND<br/><b>PLANNER</b></span></div>
        <div className="trip-card"><span className="eyebrow">ACTIVE TRIP</span><h3>{tripName}</h3><p>{daysCount} days · {Math.round(totalMiles).toLocaleString()} mi</p><div className="trip-progress"><span /></div><small>Planning mode</small></div>
        <nav>{["Overview", "Route", "Research", "Campsites", "Fuel", "Attractions", "Budget", "Pack List"].map((item) => <button key={item} className={activeTab === item ? "nav-item active" : "nav-item"} onClick={() => setActiveTab(item)}><span className="nav-icon">{iconFor(item)}</span>{item}</button>)}</nav>
        <div className="sidebar-bottom"><span className="status-dot" /> Research workspace</div>
      </aside>

      <section className="main-content">
        <header className="topbar"><div><span className="breadcrumb">TRIPS / {tripName.toUpperCase()}</span><h1>{activeTab}</h1></div><div className="header-actions"><button className="ghost-button" onClick={() => setActiveTab("Overview")}>Dashboard</button><button className="ghost-button" onClick={saveTripToSupabase}>Save to Supabase</button><button className="primary-button" onClick={() => setShowPlanner(true)}>＋ Build Trip</button></div></header>
        <div className="content">{saveMessage && <div className="save-banner">{saveMessage}</div>}
          {activeTab === "Overview" && <Overview totalMiles={totalMiles} fuelCost={fuelCost} usableRange={usableRange} fullRange={fullRange} tripBudget={tripBudget} fuelReserve={fuelReserve} setFuelReserve={setFuelReserve} stops={stops} setActiveTab={setActiveTab} days={days} routeAlert={routeAlert} setRouteAlert={setRouteAlert} />}
          {activeTab === "Route" && <RouteView stops={stops} totalMiles={totalMiles} days={days} addDay={addDay} updateDay={updateDay} usableRange={usableRange} routeAlert={routeAlert} setRouteAlert={setRouteAlert} groupedDays={groupedDays} />}
          {activeTab === "Research" && <ResearchView candidates={filteredCandidates} researchType={researchType} setResearchType={setResearchType} researchArea={researchArea} setResearchArea={setResearchArea} saved={saved} savedResearch={savedResearch} toggleSaved={toggleSaved} addCandidate={addCandidate} />}
          {activeTab === "Fuel" && <FuelView stops={stops} usableRange={usableRange} fullRange={fullRange} fuelCost={fuelCost} gasPrice={gasPrice} setGasPrice={setGasPrice} mpg={mpg} tank={tank} />}
          {activeTab === "Campsites" && <SimpleList title="Campsites" eyebrow="OVERNIGHTS" items={stops.filter((s) => s.type === "camp").map((s) => `${s.title} · ${s.meta} · ${s.subtitle}`)} empty="No campsites have been added yet." />}
          {activeTab === "Attractions" && <SimpleList title="Attractions & hikes" eyebrow="DISCOVER" items={candidates.filter((c) => c.type === "Attraction" || c.type === "Hike").map((d) => `${d.name} · ${d.type} · ${d.tag}`)} empty="No discoveries yet." />}
          {activeTab === "Budget" && <BudgetView fuelCost={fuelCost} foodBudget={foodBudget} setFoodBudget={setFoodBudget} parkBudget={parkBudget} setParkBudget={setParkBudget} campBudget={campBudget} setCampBudget={setCampBudget} funBudget={funBudget} setFunBudget={setFunBudget} bufferBudget={bufferBudget} setBufferBudget={setBufferBudget} tripBudget={tripBudget} />}
          {activeTab === "Pack List" && <PackView packing={packing} setPacking={setPacking} newItem={newItem} setNewItem={setNewItem} addPackingItem={addPackingItem} />}
        </div>
      </section>

      {showPlanner && <div className="modal-backdrop" onClick={() => setShowPlanner(false)}><div className="modal wide-modal" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowPlanner(false)}>×</button><span className="eyebrow">NEW TRIP</span><h2>Start with the route.</h2><p>These inputs become the planning rules the research engine will use for campsites, fuel, attractions and hikes.</p><div className="form-grid"><label>Trip name<input value={tripName} onChange={(e) => setTripName(e.target.value)} placeholder="e.g. Colorado Backcountry 2027" /></label><label>Starting point<input value={start} onChange={(e) => setStart(e.target.value)} placeholder="Kansas City, MO" /></label><label className="wide">Destinations<input value={destinations} onChange={(e) => setDestinations(e.target.value)} placeholder="Yellowstone, Grand Teton, Black Hills" /></label><label>Vehicle MPG<input type="number" min="1" value={mpg} onChange={(e) => setMpg(Number(e.target.value))} /></label><label>Tank size (gal)<input type="number" min="1" value={tank} onChange={(e) => setTank(Number(e.target.value))} /></label><label>Daily driving limit<select value={dailyHours} onChange={(e) => setDailyHours(Number(e.target.value))}>{[3,4,5,6,7,8,9,10].map((h) => <option key={h} value={h}>{h} hours</option>)}</select></label><label>Camping style<select value={campingStyle} onChange={(e) => setCampingStyle(e.target.value)}><option>Dispersed / primitive</option><option>Established campground</option><option>Either</option></select></label></div><div className="planner-preview"><div><b>Safe range</b><span>{usableRange} mi</span></div><div><b>Fuel estimate</b><span>${Math.round(fuelCost)}</span></div><div><b>Research candidates</b><span>{candidates.length}</span></div></div><button className="primary-button full" onClick={createTrip}>Build this trip →</button></div></div>}
    </main>
  );
}

function Overview({ totalMiles, fuelCost, usableRange, fullRange, tripBudget, fuelReserve, setFuelReserve, stops, setActiveTab, days, routeAlert, setRouteAlert }: any) {
  return <><section className="hero"><div><span className="eyebrow">TRIP WORKSPACE</span><h2>Plan the miles.<br/><em>Enjoy the adventure.</em></h2><p>Build the route, research what is around it, and keep fuel, campsites, activities and budget connected.</p></div><div className="hero-stat"><span>ROUTE STATUS</span><strong>{routeAlert ? "1 fuel check" : "Looks good"}</strong><small>{routeAlert ? "Review remote legs before departure" : "No current planning alerts"}</small></div></section><section className="stat-grid"><Stat label="Trip Miles" value={`${Math.round(totalMiles).toLocaleString()} mi`} detail={`${days.length} planning days`} icon="↗" /><Stat label="Fuel Estimate" value={`$${Math.round(fuelCost)}`} detail="Based on current MPG + price" icon="⛽" /><Stat label="Safe Range" value={`${usableRange} mi`} detail={`${fuelReserve}% reserve · ${fullRange} full`} icon="↔" /><Stat label="Trip Budget" value={`$${Math.round(tripBudget).toLocaleString()}`} detail="Current planning estimate" icon="$" /></section><div className="dashboard-grid"><section className="panel route-panel"><div className="panel-header"><div><span className="eyebrow">ROUTE</span><h3>Trip at a glance</h3></div><button className="text-button" onClick={() => setActiveTab("Route")}>Open route →</button></div><div className="route-map"><div className="map-road road-a"/><div className="map-road road-b"/><div className="map-road road-c"/>{stops.slice(1).map((stop: Stop, i: number) => <div key={stop.id} className={`map-pin pin-${i % 6} ${stop.type}`}><span>{symbolFor(stop.type)}</span></div>)}<div className="map-label label-yellow">PLANNED ROUTE</div></div><div className="timeline">{stops.slice(0, 7).map((stop: Stop) => <TimelineRow key={stop.id} stop={stop} />)}</div></section><div className="right-column"><FuelPanel usableRange={usableRange} fullRange={fullRange} fuelReserve={fuelReserve} setFuelReserve={setFuelReserve} stops={stops} /><Suggestions routeAlert={routeAlert} setRouteAlert={setRouteAlert} /></div></div></>;
}

function RouteView({ stops, totalMiles, days, addDay, updateDay, usableRange, routeAlert, setRouteAlert, groupedDays }: any) {
  const fuelLeg = stops.find((s: Stop) => s.type === "fuel")?.miles || 0;
  const overRange = fuelLeg > usableRange;
  return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">ROUTE BUILDER</span><h2>Shape the trip day by day.</h2><p>Every stop will eventually carry real coordinates, route distance and drive time. For now, the planner exposes the relationships we need before connecting live routing.</p></div>{routeAlert && <div className={`route-alert ${overRange ? "danger" : "warning"}`}><span>!</span><div><strong>{overRange ? "Fuel range needs attention" : "Fuel planning check"}</strong><small>{overRange ? `A planned leg is beyond your ${usableRange} mi safe range.` : `Confirm a fuel stop before remote legs. Your current safe range is ${usableRange} mi.`}</small></div><button onClick={() => setRouteAlert(false)}>Dismiss</button></div>}<div className="day-grid">{days.map((d: DayPlan) => <article className="day-card" key={d.day}><div className="day-number">DAY {d.day}</div><label>Day label<input value={d.label} onChange={(e) => updateDay(d.day, "label", e.target.value)} /></label><label>Destination<input value={d.destination} onChange={(e) => updateDay(d.day, "destination", e.target.value)} /></label><label>Overnight<input value={d.overnight} onChange={(e) => updateDay(d.day, "overnight", e.target.value)} /></label><label>Driving limit<select value={d.maxHours} onChange={(e) => updateDay(d.day, "maxHours", Number(e.target.value))}>{[3,4,5,6,7,8,9,10].map((h) => <option key={h} value={h}>{h} hours</option>)}</select></label></article>)}</div><div className="route-footer"><div><b>{Math.round(totalMiles).toLocaleString()} mi</b><span>current estimate</span></div><div><b>{stops.length}</b><span>planned stops</span></div><div><b>{groupedDays.length}</b><span>trip days</span></div><button className="ghost-button" onClick={addDay}>＋ Add day</button></div><div className="route-table">{stops.map((stop: Stop) => <div className="route-row" key={stop.id}><span className={`route-badge ${stop.type}`}>{symbolFor(stop.type)}</span><div><strong>{stop.title}</strong><span>{stop.subtitle}</span></div><span>{stop.day ? `Day ${stop.day}` : ""}</span><span>{stop.miles ? `${stop.miles} mi` : "Start"}</span><span>{stop.meta}</span></div>)}</div></section>;
}

function ResearchView({ candidates, researchType, setResearchType, researchArea, setResearchArea, saved, savedResearch, toggleSaved, addCandidate }: any) {
  return <section className="research-layout"><div className="panel full-panel research-main"><div className="page-intro"><span className="eyebrow">TRIP RESEARCH ENGINE · PROTOTYPE</span><h2>Find the useful stuff before you leave.</h2><p>The app now has a place for research candidates. The next step is connecting live search, maps and routing so these cards are generated from your actual route and preferences.</p></div><div className="research-controls"><select value={researchType} onChange={(e) => setResearchType(e.target.value)}><option>All</option><option>Camp</option><option>Fuel</option><option>Attraction</option><option>Hike</option></select><select value={researchArea} onChange={(e) => setResearchArea(e.target.value)}><option>All</option><option>Yellowstone</option><option>Grand Teton</option><option>Cody</option></select><span>{candidates.length} candidates</span></div><div className="candidate-grid">{candidates.map((c: Candidate) => <article className="candidate-card" key={c.id}><div className={`candidate-icon ${c.type.toLowerCase()}`}>{symbolForResearch(c.type)}</div><div className="candidate-body"><div className="candidate-top"><span className="candidate-type">{c.type}</span><button className={savedResearch.includes(c.id) ? "save-button saved" : "save-button"} onClick={() => toggleSaved(c.id)}>{savedResearch.includes(c.id) ? "Saved" : "Save"}</button></div><h3>{c.name}</h3><p>{c.area} · {c.distance} mi from route</p><small>{c.detail}</small><div className="candidate-bottom"><span>{c.tag}</span><b>{c.score}% fit</b></div><button className="add-candidate" onClick={() => addCandidate(c)}>＋ Add to trip</button></div></article>)}</div></div><aside className="research-side"><section className="panel"><div className="panel-header"><div><span className="eyebrow">SHORTLIST</span><h3>Saved research</h3></div><span className="safe-badge">{saved.length}</span></div>{saved.map((c: Candidate) => <div className="saved-row" key={c.id}><span>{symbolForResearch(c.type)}</span><div><strong>{c.name}</strong><small>{c.type} · {c.area}</small></div></div>)}{!saved.length && <div className="empty">Save candidates you want to evaluate later.</div>}</section><section className="panel research-idea"><span className="eyebrow">NEXT AUTOMATION</span><h3>Route-aware research</h3><p>When live data is connected, the planner can search a corridor around each leg instead of making you search every town manually.</p><div className="mini-flow"><span>Route</span><i>→</i><span>Search radius</span><i>→</i><span>Rank</span></div></section></aside></section>;
}

function FuelView({ stops, usableRange, fullRange, fuelCost, gasPrice, setGasPrice, mpg, tank }: any) {
  const fuelStops = stops.filter((s: Stop) => s.type === "fuel");
  return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">FUEL PLAN</span><h2>Know where the tank gets you.</h2><p>Fuel planning is a first-class part of the route. Next we can turn each leg into an actual station-to-station calculation and flag remote gaps.</p></div><div className="fuel-summary"><div><span>Full tank range</span><b>{fullRange} mi</b></div><div><span>Safe planning range</span><b>{usableRange} mi</b></div><div><span>Estimated trip fuel</span><b>${Math.round(fuelCost)}</b></div><label><span>Planning gas price</span><input type="number" min="0" step="0.01" value={gasPrice} onChange={(e) => setGasPrice(Number(e.target.value))} /></label></div><div className="fuel-callout"><span className="safe-badge">CURRENT ASSUMPTION</span><strong>{mpg} MPG · {tank} gal tank</strong><span>Safe range intentionally leaves a reserve.</span></div><div className="fuel-list large">{fuelStops.length ? fuelStops.map((s: Stop) => <div className="fuel-row" key={s.id}><span className="fuel-icon">⛽</span><div><strong>{s.title}</strong><small>{s.subtitle}</small></div><em>{s.miles} mi into route</em></div>) : <div className="empty">No fuel stops yet. Use Research to add candidates.</div>}</div></section>;
}

function BudgetView({ fuelCost, foodBudget, setFoodBudget, parkBudget, setParkBudget, campBudget, setCampBudget, funBudget, setFunBudget, bufferBudget, setBufferBudget, tripBudget }: any) {
  const rows = [{ label: "Fuel", value: fuelCost, fixed: true }, { label: "Food", value: foodBudget, set: setFoodBudget }, { label: "National park fees", value: parkBudget, set: setParkBudget }, { label: "Camping", value: campBudget, set: setCampBudget }, { label: "Activities / souvenirs", value: funBudget, set: setFunBudget }, { label: "Emergency / buffer", value: bufferBudget, set: setBufferBudget }];
  return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">TRIP BUDGET</span><h2>Plan the money before the miles.</h2><p>Fuel is calculated from the route and vehicle assumptions. The other categories are editable allowances until live prices can be added.</p></div>{rows.map((r) => <div className="budget-row" key={r.label}><span>{r.label}</span>{r.set ? <input className="inline-number" type="number" min="0" value={r.value} onChange={(e) => r.set(Number(e.target.value))} /> : <b>${Math.round(r.value).toLocaleString()}</b>}</div>)}<div className="budget-total"><span>Estimated trip total</span><strong>${Math.round(tripBudget).toLocaleString()}</strong></div></section>;
}

function PackView({ packing, setPacking, newItem, setNewItem, addPackingItem }: any) { return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">PACK LIST</span><h2>Build once. Reuse every trip.</h2><p>Keep your core overlanding loadout here. Saved templates and vehicle-specific checklists can come next.</p></div><div className="add-item"><input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPackingItem()} placeholder="Add a packing item..." /><button className="primary-button" onClick={addPackingItem}>Add</button></div>{packing.map((item: any) => <label className="check-row" key={item.id}><input type="checkbox" checked={item.done} onChange={() => setPacking((items: any[]) => items.map((x) => x.id === item.id ? { ...x, done: !x.done } : x))} /><span className={item.done ? "checked" : ""}>{item.name}</span></label>)}</section>; }

function SimpleList({ title, eyebrow, items, empty }: any) { return <section className="panel full-panel"><div className="page-intro"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>Current trip candidates. Live research will eventually populate these from your route and preferences.</p></div>{items.length ? items.map((item: string, i: number) => <div className="list-row" key={i}><span className="list-icon">{i + 1}</span><div><strong>{item.split(" · ")[0]}</strong><small>{item.split(" · ").slice(1).join(" · ")}</small></div><em>Candidate</em></div>) : <div className="empty">{empty}</div>}</section>; }
function Stat({ label, value, detail, icon }: any) { return <div className="stat-card"><span className="stat-icon">{icon}</span><span className="eyebrow">{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function TimelineRow({ stop }: { stop: Stop }) { return <div className="timeline-row"><span className={`timeline-dot ${stop.type}`}>{symbolFor(stop.type)}</span><div className="timeline-main"><strong>{stop.title}</strong><span>{stop.subtitle}</span></div><div className="timeline-meta"><strong>{stop.miles ? `${stop.miles} mi` : "Start"}</strong><span>{stop.meta}</span></div></div>; }
function FuelPanel({ usableRange, fullRange, fuelReserve, setFuelReserve, stops }: any) { const fuelStops = stops.filter((s: Stop) => s.type === "fuel"); return <section className="panel fuel-panel"><div className="panel-header"><div><span className="eyebrow">FUEL SAFETY</span><h3>Safe driving range</h3></div><span className="safe-badge">Planning buffer</span></div><div className="range-number"><strong>{usableRange}</strong><span>miles</span></div><div className="range-track"><span style={{ width: `${Math.max(0, Math.min(100, usableRange / Math.max(fullRange, 1) * 100))}%` }} /></div><div className="range-labels"><span>Reserve</span><span>{fullRange} mi full</span></div><div className="slider-label"><span>Reserve</span><b>{fuelReserve}%</b></div><input className="slider" type="range" min="0" max="40" value={fuelReserve} onChange={(e) => setFuelReserve(Number(e.target.value))} />{fuelStops.slice(0, 3).map((s: Stop) => <div className="fuel-row" key={s.id}><span className="fuel-icon">⛽</span><div><strong>{s.title}</strong><small>{s.miles} mi into route</small></div><em>Planned</em></div>)}</section>; }
function Suggestions({ routeAlert, setRouteAlert }: any) { return <section className="panel suggestions-panel"><div className="panel-header"><div><span className="eyebrow">DISCOVER</span><h3>Research engine</h3></div><span className="safe-badge">Prototype</span></div><div className="suggestion"><span className="suggestion-icon">⌕</span><div><strong>8 route-aware candidates</strong><span>Camping, fuel, hikes and attractions</span></div><button className="mini-button" onClick={() => setRouteAlert(true)}>Review</button></div><div className="suggestion"><span className="suggestion-icon">⛽</span><div><strong>Fuel safety check</strong><span>Keep a reserve before remote legs</span></div><small>{routeAlert ? "Review" : "Clear"}</small></div></section>; }
function symbolFor(type: StopType) { return type === "fuel" ? "⛽" : type === "camp" ? "⌂" : type === "attraction" ? "✦" : type === "destination" ? "◆" : "●"; }
function symbolForResearch(type: Candidate["type"]) { return type === "Fuel" ? "⛽" : type === "Camp" ? "⌂" : type === "Hike" ? "⌁" : "✦"; }
function iconFor(item: string) { return ({ Overview: "▦", Route: "⌁", Research: "⌕", Campsites: "⌂", Fuel: "⛽", Attractions: "✦", Budget: "$", "Pack List": "✓" } as Record<string, string>)[item]; }
