"use client";

import { useMemo, useState } from "react";

type Stop = {
  type: "start" | "camp" | "fuel" | "attraction";
  title: string;
  subtitle: string;
  miles?: number;
  meta?: string;
};

const stops: Stop[] = [
  { type: "start", title: "Kansas City, MO", subtitle: "Trip start", miles: 0, meta: "Day 1" },
  { type: "fuel", title: "Loveland, CO", subtitle: "Fuel + supplies", miles: 540, meta: "Fuel stop" },
  { type: "camp", title: "Medicine Lodge", subtitle: "Dispersed / primitive camping", miles: 278, meta: "6,236 ft" },
  { type: "attraction", title: "Yellowstone", subtitle: "LeHardy Rapids + Yellowstone Lake", miles: 166, meta: "Explore" },
  { type: "camp", title: "Jardine Dispersed", subtitle: "North of Yellowstone", miles: 73, meta: "6,143 ft" },
  { type: "attraction", title: "Grand Tetons", subtitle: "Scenic drive + hiking", miles: 96, meta: "Explore" },
  { type: "camp", title: "Shadow Mountain", subtitle: "Dispersed camping", miles: 31, meta: "7,099 ft" },
];

const attractions = [
  { name: "Yellowstone National Park", reason: "Major destination on your route", tag: "Must see" },
  { name: "LeHardy Rapids", reason: "Quick scenic stop near Yellowstone Lake", tag: "15–30 min" },
  { name: "Grand Tetons", reason: "High-value scenic destination", tag: "Must see" },
  { name: "Clear Lake Artist Point Loop", reason: "3.9 mi moderate hike", tag: "1h 33m" },
];

const fuelStops = [
  { name: "Loveland, CO", distance: "540 mi from start", status: "Planned" },
  { name: "Cody, WY", distance: "~185 mi from Yellowstone area", status: "Recommended" },
  { name: "Jackson, WY", distance: "~95 mi from Shadow Mountain", status: "Backup" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [showPlanner, setShowPlanner] = useState(false);
  const [fuelReserve, setFuelReserve] = useState(15);

  const totalMiles = 2860;
  const mpg = 15;
  const tank = 36;
  const fuelCost = 680;
  const usableRange = useMemo(() => Math.round(tank * mpg * (1 - fuelReserve / 100)), [fuelReserve]);
  const tripBudget = 1030;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">↟</span><span>OVERLAND<br/><b>PLANNER</b></span></div>
        <div className="trip-card">
          <span className="eyebrow">ACTIVE TRIP</span>
          <h3>Wild West Adventure</h3>
          <p>10 days · 2,860 mi</p>
          <div className="trip-progress"><span /></div>
          <small>Planning mode</small>
        </div>
        <nav>
          {["Overview", "Route", "Campsites", "Fuel", "Attractions", "Budget", "Pack List"].map((item) => (
            <button key={item} className={activeTab === item ? "nav-item active" : "nav-item"} onClick={() => setActiveTab(item)}>
              <span className="nav-icon">{({ Overview: "◈", Route: "⌁", Campsites: "⌂", Fuel: "⛽", Attractions: "✦", Budget: "$", "Pack List": "✓" } as Record<string, string>)[item]}</span>
              {item}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom"><span className="status-dot" /> All trip data saved locally</div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div><span className="breadcrumb">TRIPS / WILD WEST ADVENTURE</span><h1>{activeTab}</h1></div>
          <div className="header-actions"><button className="ghost-button">Share</button><button className="primary-button" onClick={() => setShowPlanner(true)}>＋ Build Trip</button></div>
        </header>

        <div className="content">
          <section className="hero">
            <div><span className="eyebrow">AUG 9 — AUG 18, 2024</span><h2>Kansas City → Yellowstone → Grand Tetons → Black Hills</h2><p>Everything you need to know before you leave the pavement.</p></div>
            <div className="hero-stat"><strong>{totalMiles.toLocaleString()}</strong><span>estimated miles</span></div>
          </section>

          <section className="stat-grid">
            <Stat label="Travel Time" value="46h 20m" detail="8 driving days" icon="◷" />
            <Stat label="Fuel Estimate" value={`$${fuelCost}`} detail={`${Math.round(totalMiles / mpg)} gal @ $3.57/gal`} icon="⛽" />
            <Stat label="Fuel Range" value={`${usableRange} mi`} detail={`${fuelReserve}% reserve`} icon="↔" />
            <Stat label="Trip Budget" value={`$${tripBudget.toLocaleString()}`} detail="$1,030 planned" icon="$" />
          </section>

          <div className="dashboard-grid">
            <section className="panel route-panel">
              <div className="panel-header"><div><span className="eyebrow">ROUTE</span><h3>Trip at a glance</h3></div><button className="text-button">Open map →</button></div>
              <div className="route-map"><div className="map-road road-a"/><div className="map-road road-b"/><div className="map-road road-c"/>{stops.slice(1, 7).map((stop, i) => <div key={stop.title} className={`map-pin pin-${i} ${stop.type}`}><span>{stop.type === "fuel" ? "⛽" : stop.type === "camp" ? "⌂" : "✦"}</span></div>)}<div className="map-label label-yellow">YELLOWSTONE</div><div className="map-label label-tetons">GRAND TETONS</div></div>
              <div className="timeline">{stops.map((stop, i) => <div className="timeline-row" key={stop.title}><div className={`timeline-dot ${stop.type}`}>{stop.type === "fuel" ? "⛽" : stop.type === "camp" ? "⌂" : stop.type === "attraction" ? "✦" : "●"}</div><div className="timeline-main"><strong>{stop.title}</strong><span>{stop.subtitle}</span></div><div className="timeline-meta"><strong>{stop.miles ? `+${stop.miles} mi` : "Start"}</strong><span>{stop.meta}</span></div></div>)}</div>
            </section>

            <div className="right-column">
              <section className="panel fuel-panel">
                <div className="panel-header"><div><span className="eyebrow">FUEL PLANNING</span><h3>Know before you go</h3></div><span className="safe-badge">SAFE RANGE</span></div>
                <div className="range-number"><strong>{usableRange}</strong><span>miles usable range</span></div>
                <div className="range-track"><span style={{ width: `${Math.min(100, (usableRange / (tank * mpg)) * 100)}%` }}/><i style={{ left: `${Math.min(100, (usableRange / (tank * mpg)) * 100)}%` }}/></div>
                <div className="range-labels"><span>0 mi</span><span>{tank * mpg} mi full tank</span></div>
                <label className="slider-label">Reserve buffer <b>{fuelReserve}%</b></label>
                <input className="slider" type="range" min="5" max="30" value={fuelReserve} onChange={(e) => setFuelReserve(Number(e.target.value))} />
                <div className="fuel-list">{fuelStops.map((stop) => <div className="fuel-row" key={stop.name}><span className="fuel-icon">⛽</span><div><strong>{stop.name}</strong><small>{stop.distance}</small></div><em>{stop.status}</em></div>)}</div>
              </section>

              <section className="panel suggestions-panel">
                <div className="panel-header"><div><span className="eyebrow">DISCOVER</span><h3>Suggested for this route</h3></div><button className="text-button">See all →</button></div>
                {attractions.map((a) => <div className="suggestion" key={a.name}><div className="suggestion-icon">✦</div><div><strong>{a.name}</strong><span>{a.reason}</span></div><small>{a.tag}</small></div>)}
              </section>
            </div>
          </div>
        </div>
      </section>

      {showPlanner && <div className="modal-backdrop" onClick={() => setShowPlanner(false)}><div className="modal" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowPlanner(false)}>×</button><span className="eyebrow">NEW TRIP</span><h2>Let's build your next adventure.</h2><p>Start with the basics. We'll turn the destinations into a route, then layer in campsites, fuel stops, attractions and a budget.</p><div className="form-grid"><label>Trip name<input placeholder="e.g. Colorado Backcountry 2027" /></label><label>Starting point<input placeholder="Kansas City, MO" /></label><label className="wide">Destinations<input placeholder="Add destinations separated by commas" /></label><label>MPG<input type="number" defaultValue="15" /></label><label>Tank size<input type="number" defaultValue="36" /></label></div><button className="primary-button full" onClick={() => setShowPlanner(false)}>Create trip →</button></div></div>}
    </main>
  );
}

function Stat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: string }) {
  return <div className="stat-card"><span className="stat-icon">{icon}</span><span className="eyebrow">{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}
