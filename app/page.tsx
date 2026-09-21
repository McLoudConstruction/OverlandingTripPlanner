"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MapboxMap from "./map";

type Campsite = {
  id: string; name: string; area: string; type: string; latitude: number; longitude: number;
  cost: number | null; reservation: string; rating: number | null; favorite: boolean;
  notes: string; source: string; source_url: string; last_verified_at: string | null;
};
type ImportCandidate = {
  key: string;
  name: string;
  area: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  source_url: string;
  notes: string;
  selected: boolean;
  status: "ready" | "needs-location" | "duplicate";
};

type Trip = {
  id: string; name: string; start_location: string | null; destinations: string[];
  mpg: number | null; tank_gallons: number | null; fuel_reserve_percent: number;
  fuel_price_cushion: number; fuel_mileage_buffer: number; created_at: string;
};
type Stop = { id?: string; name: string; latitude: number; longitude: number; campsite_id?: string; stop_order: number; notes?: string };
type FuelSegment = {
  from: string; to: string; state: string; miles: number; price: number | null;
  planningPrice: number | null; gallons: number; cost: number | null;
  source: string | null; period: string | null; geography: string | null;
};
type FuelPlan = {
  routeMiles: number; bufferedMiles: number; gallons: number; baselinePrice: number | null;
  planningPrice: number | null; estimatedCost: number | null; segments: FuelSegment[];
  states: string[]; priceDate: string | null; warning: string | null;
};

const STATE_NAMES: Record<string, string> = {
  Alabama:"AL", Alaska:"AK", Arizona:"AZ", Arkansas:"AR", California:"CA", Colorado:"CO", Connecticut:"CT", Delaware:"DE", Florida:"FL", Georgia:"GA", Hawaii:"HI", Idaho:"ID", Illinois:"IL", Indiana:"IN", Iowa:"IA", Kansas:"KS", Kentucky:"KY", Louisiana:"LA", Maine:"ME", Maryland:"MD", Massachusetts:"MA", Michigan:"MI", Minnesota:"MN", Mississippi:"MS", Missouri:"MO", Montana:"MT", Nebraska:"NE", Nevada:"NV", "New Hampshire":"NH", "New Jersey":"NJ", "New Mexico":"NM", "New York":"NY", "North Carolina":"NC", "North Dakota":"ND", Ohio:"OH", Oklahoma:"OK", Oregon:"OR", Pennsylvania:"PA", "Rhode Island":"RI", "South Carolina":"SC", "South Dakota":"SD", Tennessee:"TN", Texas:"TX", Utah:"UT", Vermont:"VT", Virginia:"VA", Washington:"WA", "West Virginia":"WV", Wisconsin:"WI", Wyoming:"WY", "District of Columbia":"DC"
};

const sampleCampsites: Campsite[] = [
  { id:"demo-1", name:"Shadow Mountain", area:"Grand Teton, WY", type:"Dispersed", latitude:43.697, longitude:-110.631, cost:0, reservation:"Dispersed / no reservation", rating:5, favorite:true, notes:"Great backup near Grand Teton.", source:"iOverlander", source_url:"", last_verified_at:"2026-08-01" },
  { id:"demo-2", name:"Madison Campground", area:"Yellowstone, WY", type:"Developed", latitude:44.645, longitude:-110.862, cost:35, reservation:"Reservation", rating:5, favorite:true, notes:"Primary Yellowstone option.", source:"Recreation.gov", source_url:"", last_verified_at:"2026-08-01" },
  { id:"demo-3", name:"Baker's Hole", area:"West Yellowstone, MT", type:"Forest campground", latitude:44.684, longitude:-111.122, cost:25, reservation:"First come / check current rules", rating:4, favorite:false, notes:"Good Yellowstone backup.", source:"Personal research", source_url:"", last_verified_at:"2026-08-01" },
  { id:"demo-4", name:"Gros Ventre Campground", area:"Grand Teton, WY", type:"Developed", latitude:43.660, longitude:-110.649, cost:25, reservation:"Varies", rating:4, favorite:false, notes:"Useful backup for the Jackson side.", source:"Recreation.gov", source_url:"", last_verified_at:"2026-08-01" },
];

export default function Home() {
  const [tab,setTab]=useState<"Dashboard"|"Trips"|"Campsites"|"Fuel"|"Budget"|"Pack List">("Dashboard");
  const [view,setView]=useState<"list"|"map">("list");
  const [userEmail,setUserEmail]=useState(""); const [authOpen,setAuthOpen]=useState(false); const [authBusy,setAuthBusy]=useState(false); const [authEmail,setAuthEmail]=useState(""); const [authPassword,setAuthPassword]=useState("");
  const [message,setMessage]=useState("");
  const [campsites,setCampsites]=useState<Campsite[]>([]); const [loadingCamps,setLoadingCamps]=useState(false);
  const [showCampForm,setShowCampForm]=useState(false); const [showImporter,setShowImporter]=useState(false); const [editing,setEditing]=useState<Campsite|null>(null); const [search,setSearch]=useState(""); const [areaFilter,setAreaFilter]=useState("All");
  const [trips,setTrips]=useState<Trip[]>([]); const [tripName,setTripName]=useState("Yellowstone Adventure"); const [start,setStart]=useState("Kansas City, MO"); const [selectedTrip,setSelectedTrip]=useState<Trip|null>(null);
  const [mpg,setMpg]=useState(15); const [tank,setTank]=useState(36); const [reserve,setReserve]=useState(15); const [priceCushion,setPriceCushion]=useState(0.30); const [mileageBuffer,setMileageBuffer]=useState(10);
  const [stops,setStops]=useState<Stop[]>([]); const [routeLoading,setRouteLoading]=useState(false); const [route,setRoute]=useState<any>(null); const [fuelStations,setFuelStations]=useState<any[]>([]); const [fuelPlan,setFuelPlan]=useState<FuelPlan|null>(null);
  const [budget,setBudget]=useState({camp:300,food:500,fees:100,other:200});
  const [pack,setPack]=useState(["Recovery boards","Air compressor","First aid kit","Headlamps","Water storage","Camp stove","Cooler","Tool kit"]);
  const [newPack,setNewPack]=useState("");

  useEffect(()=>{ const sb=createClient(); let mounted=true; sb.auth.getUser().then(({data})=>{if(mounted)setUserEmail(data.user?.email||"")}); const {data}=sb.auth.onAuthStateChange((_e,s)=>mounted&&setUserEmail(s?.user?.email||"")); return()=>{mounted=false;data.subscription.unsubscribe()}; },[]);
  useEffect(()=>{ if(userEmail) { loadCampsites(); loadTrips(); } else { setCampsites([]); setTrips([]); setSelectedTrip(null); setStops([]); setRoute(null); setFuelPlan(null); } },[userEmail]);

  async function loadCampsites(){setLoadingCamps(true); const sb=createClient(); const {data,error}=await sb.from("campsites").select("*").order("name"); if(error){setMessage(error.message)} else setCampsites(data||[]); setLoadingCamps(false)}
  async function loadTrips(){const sb=createClient(); const {data,error}=await sb.from("trips").select("id,name,start_location,destinations,mpg,tank_gallons,fuel_reserve_percent,fuel_price_cushion,fuel_mileage_buffer,created_at").order("created_at",{ascending:false}); if(error)setMessage(error.message); setTrips(data||[])}
  async function selectTrip(t:Trip){setSelectedTrip(t);setMpg(t.mpg||15);setTank(t.tank_gallons||36);setReserve(t.fuel_reserve_percent??15);setPriceCushion(t.fuel_price_cushion??0.30);setMileageBuffer(t.fuel_mileage_buffer??10);setRoute(null);setFuelPlan(null);const {data,error}=await createClient().from("trip_stops").select("id,name,latitude,longitude,campsite_id,stop_order,notes").eq("trip_id",t.id).order("stop_order");if(error)setMessage(error.message);setStops(data||[])}
  async function auth(mode:"signin"|"signup"){setAuthBusy(true);setMessage("");const sb=createClient();const fn=mode==="signin"?sb.auth.signInWithPassword({email:authEmail,password:authPassword}):sb.auth.signUp({email:authEmail,password:authPassword});const {error}=await fn;if(error)setMessage(error.message);else {setMessage(mode==="signup"?"Account created. Check your email if confirmation is required.":"Signed in.");setAuthOpen(false)}setAuthBusy(false)}
  async function signOut(){await createClient().auth.signOut();setMessage("Signed out.")}

  const areas=useMemo(()=>["All",...Array.from(new Set(campsites.map(c=>c.area))).sort()],[campsites]);
  const filtered=campsites.filter(c=>`${c.name} ${c.area} ${c.type}`.toLowerCase().includes(search.toLowerCase())&&(areaFilter==="All"||c.area===areaFilter));
  const fullRange=Math.max(0,Math.round(mpg*tank)); const safeRange=Math.max(0,Math.round(fullRange*(1-reserve/100)));

  function openNew(){setEditing(null);setShowCampForm(true)}
  function openEdit(c:Campsite){setEditing(c);setShowCampForm(true)}
  async function saveCampsite(c:Campsite){if(!userEmail){setAuthOpen(true);return}const sb=createClient(); const payload={name:c.name,area:c.area,type:c.type,latitude:c.latitude,longitude:c.longitude,cost:c.cost,reservation:c.reservation,rating:c.rating,favorite:c.favorite,notes:c.notes,source:c.source,source_url:c.source_url,last_verified_at:c.last_verified_at||null}; const q=editing?sb.from("campsites").update(payload).eq("id",editing.id):sb.from("campsites").insert({...payload,user_id:(await sb.auth.getUser()).data.user?.id}).select().single(); const {error}=await q;if(error){setMessage(error.message);return}setShowCampForm(false);setMessage("Campsite saved.");loadCampsites()}
  async function deleteCampsite(c:Campsite){if(!confirm(`Delete ${c.name}?`))return;const {error}=await createClient().from("campsites").delete().eq("id",c.id);if(error)setMessage(error.message);else loadCampsites()}
  async function importCampsites(rows:ImportCandidate[]){
    if(!userEmail){setAuthOpen(true);return}
    const selected=rows.filter(r=>r.selected && r.name.trim() && r.latitude!=null && r.longitude!=null);
    if(!selected.length){setMessage("Select at least one campsite with a valid location to import.");return}
    const sb=createClient();
    const {data:user}=await sb.auth.getUser();
    const payload=selected.map(r=>({
      user_id:user.user?.id, name:r.name.trim(), area:r.area.trim(), type:r.type||"Other",
      latitude:Number(r.latitude), longitude:Number(r.longitude), cost:null, reservation:"", rating:null,
      favorite:false, notes:r.notes||"Imported from Google Maps Saved", source:"Google Maps", source_url:r.source_url,
      last_verified_at:new Date().toISOString().slice(0,10)
    }));
    const {error}=await sb.from("campsites").insert(payload);
    if(error){setMessage(error.message);return}
    setShowImporter(false);
    await loadCampsites();
    setMessage(`${selected.length} campsite${selected.length===1?"":"s"} imported.`);
  }
  async function createTrip(){if(!userEmail){setAuthOpen(true);return}const sb=createClient();const {data:user}=await sb.auth.getUser();const {data,error}=await sb.from("trips").insert({user_id:user.user?.id,name:tripName,start_location:start,destinations:[],mpg,tank_gallons:tank,fuel_reserve_percent:reserve,fuel_price_cushion:priceCushion,fuel_mileage_buffer:mileageBuffer}).select().single();if(error){setMessage(error.message);return}setTrips([data,...trips]);await selectTrip(data);setTab("Trips");setMessage("Trip created.")}
  function addStop(c:Campsite){setStops(prev=>[...prev,{name:c.name,latitude:c.latitude,longitude:c.longitude,campsite_id:c.id,stop_order:prev.length}]);setTab("Trips")}
  async function saveStops(){if(!selectedTrip)return;const sb=createClient();await sb.from("trip_stops").delete().eq("trip_id",selectedTrip.id);const {error}=await sb.from("trip_stops").insert(stops.map((s,i)=>({trip_id:selectedTrip.id,campsite_id:s.campsite_id||null,name:s.name,latitude:s.latitude,longitude:s.longitude,stop_order:i,notes:s.notes||""})));setMessage(error?error.message:"Trip stops saved.")}
  async function saveVehicleSettings(){if(!selectedTrip)return;const payload={mpg,tank_gallons:tank,fuel_reserve_percent:reserve,fuel_price_cushion:priceCushion,fuel_mileage_buffer:mileageBuffer};const {data,error}=await createClient().from("trips").update(payload).eq("id",selectedTrip.id).select().single();if(error){setMessage(error.message);return}setSelectedTrip(data);setTrips(prev=>prev.map(t=>t.id===data.id?data:t));setMessage("Vehicle and fuel settings saved.")}

  async function getStopStates(points:Stop[], token:string):Promise<string[]> {
    try {
      const body=points.map(p=>({types:["region"],longitude:p.longitude,latitude:p.latitude,limit:1}));
      const response=await fetch(`https://api.mapbox.com/search/geocode/v6/batch?access_token=${token}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(!response.ok)return points.map(()=>"");
      const data=await response.json();
      return (data.batch||[]).map((result:any)=>{const feature=result.features?.find((f:any)=>f.properties?.feature_type==="region")||result.features?.[0];const name=feature?.properties?.name_preferred||feature?.properties?.name||"";return STATE_NAMES[name]||""});
    } catch { return points.map(()=>""); }
  }

  async function geocodeStart(location:string, token:string){
    try {
      const url=`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(location)}&country=US&limit=1&access_token=${token}`;
      const response=await fetch(url);if(!response.ok)return null;const data=await response.json();const coordinates=data.features?.[0]?.geometry?.coordinates;
      return Array.isArray(coordinates)&&coordinates.length===2?{name:location,longitude:Number(coordinates[0]),latitude:Number(coordinates[1])}:null;
    } catch { return null; }
  }

  async function calculateRoute(){
    if(stops.length<1){setMessage("Add at least one campsite stop to calculate a route.");return}
    const token=process.env.NEXT_PUBLIC_MAPBOX_TOKEN;if(!token){setMessage("Add NEXT_PUBLIC_MAPBOX_TOKEN in Vercel to enable maps and routing.");return}
    setRouteLoading(true);setMessage("");
    try {
      const startPoint=start.trim()?await geocodeStart(start.trim(),token):null;
      const routePoints:any[]=startPoint?[startPoint,...stops]:stops;
      if(routePoints.length<2)throw new Error("Add a starting point or at least two campsite stops.");
      const coords=routePoints.map(s=>`${s.longitude},${s.latitude}`).join(";");
      const res=await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&steps=false&access_token=${token}`);const data=await res.json();
      if(!res.ok||data.code!=="Ok")throw new Error(data.message||"Mapbox routing failed.");
      const currentRoute=data.routes?.[0];setRoute(currentRoute||null);
      const geometry=currentRoute?.geometry;
      if(geometry){const encoded=encodePolyline6(geometry.coordinates);const searchUrl=`https://api.mapbox.com/search/searchbox/v1/category/gas_station?route=${encodeURIComponent(encoded)}&route_geometry=polyline6&sar_type=isochrone&time_deviation=15&limit=25&access_token=${token}`;try{const fr=await fetch(searchUrl);const fd=await fr.json();setFuelStations(addRouteMiles(fd.features||[],geometry))}catch{setFuelStations([])}}
      const states=await getStopStates(routePoints as Stop[],token);
      const stateList=[...new Set(states.filter(Boolean))];
      const priceResponse=stateList.length?await fetch(`/api/fuel-prices?states=${stateList.join(",")}`):null;
      const priceData=priceResponse?.ok?await priceResponse.json():null;
      const priceMap=new Map<string,any>((priceData?.results||[]).map((x:any)=>[x.state,x]));
      const segments:FuelSegment[]=(currentRoute?.legs||[]).map((leg:any,i:number)=>{
        const state=states[i+1]||states[i]||"";const priceInfo=priceMap.get(state);const miles=leg.distance/1609.344;const gallons=mpg>0?miles*(1+mileageBuffer/100)/mpg:0;const price=typeof priceInfo?.price==="number"?priceInfo.price:null;const planningPrice=price==null?null:price+priceCushion;return {from:routePoints[i]?.name||`Stop ${i+1}`,to:routePoints[i+1]?.name||`Stop ${i+2}`,state,miles,price,planningPrice,gallons,cost:planningPrice==null?null:gallons*planningPrice,source:priceInfo?.source||null,period:priceInfo?.period||null,geography:priceInfo?.geography||null};
      });
      const valid=segments.filter(s=>s.cost!=null);const bufferedMiles=segments.reduce((a,s)=>a+s.miles,0)*(1+mileageBuffer/100);const gallons=segments.reduce((a,s)=>a+s.gallons,0);const estimatedCost=valid.length===segments.length?segments.reduce((a,s)=>a+(s.cost||0),0):null;const baselinePrice=gallons?segments.reduce((a,s)=>a+(s.price||0)*s.gallons,0)/gallons:null;const planningPrice=gallons?segments.reduce((a,s)=>a+(s.planningPrice||0)*s.gallons,0)/gallons:null;
      const warning=priceResponse&&!priceResponse.ok?"EIA pricing is not available yet. Add EIA_API_KEY in Vercel to calculate the fuel budget.":estimatedCost==null?"One or more route segments is missing a fuel price.":start.trim()&&!startPoint?"Starting point could not be geocoded, so the route starts at the first campsite.":null;
      setFuelPlan({routeMiles:currentRoute?.distance/1609.344||0,bufferedMiles,gallons,baselinePrice,planningPrice,estimatedCost,segments,states:stateList,priceDate:segments.find(s=>s.period)?.period||null,warning});
      await saveStops();
      if(selectedTrip) await saveVehicleSettings();
      setMessage(estimatedCost==null?"Route calculated. Fuel pricing still needs attention.":"Route and conservative fuel budget calculated.");
    } catch(error:any){setMessage(error?.message||"Route calculation failed")} finally {setRouteLoading(false)}
  }

  const fuelBudget=fuelPlan?.estimatedCost??0;
  const nonFuelBudget=Object.values(budget).reduce((a:number,b:unknown)=>a+Number(b),0);

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">↗</span><div><strong>OVERLAND PLANNER</strong><small>Trip logistics, simplified.</small></div></div><div className="top-actions">{userEmail?<><span className="user-pill">{userEmail}</span><button onClick={signOut}>Sign out</button></>:<button className="primary" onClick={()=>setAuthOpen(true)}>Sign in</button>}</div></header>
    <div className="body"><aside className="sidebar">{["Dashboard","Trips","Campsites","Fuel","Budget","Pack List"].map(x=><button key={x} className={tab===x?"nav active":"nav"} onClick={()=>setTab(x as any)}><span>{x==="Campsites"?"⌂":x==="Fuel"?"⛽":x==="Budget"?"$":x==="Pack List"?"✓":x==="Trips"?"⌁":"▦"}</span>{x}</button>)}<div className="side-note"><b>Our lane</b><span>Your campsites. Your route. Your fuel plan.</span></div></aside>
    <main className="main">
      {tab==="Dashboard"&&<Dashboard trips={trips} campsites={campsites} safeRange={safeRange} fuelBudget={fuelBudget} createTrip={()=>setTab("Trips")} />}
      {tab==="Trips"&&<TripsView trips={trips} tripName={tripName} setTripName={setTripName} start={start} setStart={setStart} createTrip={createTrip} selectedTrip={selectedTrip} setSelectedTrip={selectTrip} campsites={campsites} addStop={addStop} stops={stops} setStops={setStops} route={route} routeLoading={routeLoading} calculateRoute={calculateRoute} fuelStations={fuelStations} saveStops={saveStops}/>} 
      {tab==="Campsites"&&<section className="content"><div className="page-head"><div><span className="eyebrow">CAMPSITE LIBRARY</span><h1>Your campsites.</h1><p>Save the places you find elsewhere. Use them as primary stops or backups on future trips.</p></div><div className="page-head-actions"><button className="secondary" onClick={()=>setShowImporter(true)}>Import from Google Maps</button><button className="primary" onClick={openNew}>＋ Add campsite</button></div></div><div className="toolbar"><input placeholder="Search campsites..." value={search} onChange={e=>setSearch(e.target.value)}/><select value={areaFilter} onChange={e=>setAreaFilter(e.target.value)}>{areas.map(a=><option key={a}>{a}</option>)}</select><div className="seg"><button className={view==="list"?"selected":""} onClick={()=>setView("list")}>List</button><button className={view==="map"?"selected":""} onClick={()=>setView("map")}>Map</button></div></div>{!userEmail?<EmptyState title="Sign in to build your campsite library." action={()=>setAuthOpen(true)}/>:loadingCamps?<div className="loading">Loading campsites…</div>:view==="map"?<div className="map-card"><MapboxMap campsites={filtered} route={null} onSelect={openEdit}/></div>:<div className="table-card"><div className="table-head"><span>Campsite</span><span>Area</span><span>Type</span><span>Cost</span><span>Rating</span><span></span></div>{filtered.length?filtered.map(c=><div className="table-row" key={c.id}><div><strong>{c.favorite?"★ ":""}{c.name}</strong><small>{c.notes||"No notes yet"}</small></div><span>{c.area}</span><span>{c.type}</span><span>{c.cost==null?"—":c.cost===0?"Free":`$${c.cost}`}</span><span>{c.rating?"★".repeat(c.rating):"—"}</span><div className="row-actions"><button onClick={()=>addStop(c)}>＋ Trip</button><button onClick={()=>openEdit(c)}>Edit</button><button onClick={()=>deleteCampsite(c)}>Delete</button></div></div>):<div className="empty">No campsites match your filters.</div>}</div>}</section>}
      {tab==="Fuel"&&<FuelView mpg={mpg} setMpg={setMpg} tank={tank} setTank={setTank} reserve={reserve} setReserve={setReserve} priceCushion={priceCushion} setPriceCushion={setPriceCushion} mileageBuffer={mileageBuffer} setMileageBuffer={setMileageBuffer} safeRange={safeRange} fullRange={fullRange} route={route} stations={fuelStations} plan={fuelPlan} selectedTrip={selectedTrip} saveSettings={saveVehicleSettings}/>} 
      {tab==="Budget"&&<BudgetView budget={budget} setBudget={setBudget} fuelBudget={fuelBudget} fuelPlan={fuelPlan}/>} 
      {tab==="Pack List"&&<PackView pack={pack} setPack={setPack} newPack={newPack} setNewPack={setNewPack}/>} 
    </main></div>
    {showCampForm&&<CampForm initial={editing} onClose={()=>setShowCampForm(false)} onSave={saveCampsite} onDelete={deleteCampsite}/>} {showImporter&&<CampsiteImporter existing={campsites} onClose={()=>setShowImporter(false)} onImport={importCampsites}/>} {authOpen&&<AuthModal email={authEmail} password={authPassword} setEmail={setAuthEmail} setPassword={setAuthPassword} busy={authBusy} onClose={()=>setAuthOpen(false)} onSignIn={()=>auth("signin")} onSignUp={()=>auth("signup")}/>} {message&&<button className="toast" onClick={()=>setMessage("")}>{message}</button>}
  </div>
}

function Dashboard({trips,campsites,safeRange,fuelBudget,createTrip}:any){return <section className="content"><div className="hero"><span className="eyebrow">OVERLAND PLANNER 0.7</span><h1>Plan the trip.<br/><i>Not everything else.</i></h1><p>A focused workspace for the parts of overlanding that are hardest to keep straight: campsites, routes, fuel and budget.</p><button className="primary" onClick={createTrip}>Build a trip</button></div><div className="stat-grid"><Stat n={trips.length} label="Saved trips"/><Stat n={campsites.length} label="Saved campsites"/><Stat n={`${safeRange} mi`} label="Current safe range"/><Stat n={fuelBudget?`$${Math.round(fuelBudget).toLocaleString()}`:"—"} label="Current fuel budget"/></div><div className="three"><Card title="Campsite library" text="Keep your own list of primary and backup campsites, with coordinates ready for routing."/><Card title="Fuel planning" text="Use current EIA averages, then deliberately add a price cushion and mileage reserve so the budget is conservative."/><Card title="Simple budget" text="Fuel becomes route-driven. Camping, food, park fees and everything else stay editable."/></div></section>}

function TripsView({trips,tripName,setTripName,start,setStart,createTrip,selectedTrip,setSelectedTrip,campsites,addStop,stops,setStops,route,routeLoading,calculateRoute,fuelStations,saveStops}:any){return <section className="content"><div className="page-head"><div><span className="eyebrow">TRIPS</span><h1>Route your stops.</h1><p>Pick campsites from your library. Then let routing and fuel planning handle the logistics.</p></div></div><div className="trip-builder"><div className="form-card"><h3>New trip</h3><label>Trip name<input value={tripName} onChange={e=>setTripName(e.target.value)}/></label><label>Starting point<input value={start} onChange={e=>setStart(e.target.value)}/></label><button className="primary" onClick={createTrip}>Create trip</button></div><div className="form-card"><h3>Saved trips</h3>{trips.length?trips.map((t:Trip)=><button className={selectedTrip?.id===t.id?"trip-item selected":"trip-item"} key={t.id} onClick={()=>setSelectedTrip(t)}><strong>{t.name}</strong><small>{t.start_location||"No start"}</small></button>):<div className="empty">No saved trips yet.</div>}</div></div>{selectedTrip&&<div className="route-workspace"><div className="route-sidebar"><div className="section-title"><div><span className="eyebrow">{selectedTrip.name}</span><h2>Stops</h2></div><button onClick={saveStops}>Save</button></div>{stops.map((s:Stop,i:number)=><div className="stop-row" key={`${s.id||s.name}-${i}`}><span>{i+1}</span><div><strong>{s.name}</strong><small>{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}</small></div><button onClick={()=>setStops((p:Stop[])=>p.filter((_,idx)=>idx!==i))}>×</button></div>)}<div className="library-mini"><b>Add from library</b>{campsites.slice(0,8).map((c:Campsite)=><button key={c.id} onClick={()=>addStop(c)}>＋ {c.name}</button>)}</div><button className="primary full" disabled={routeLoading} onClick={calculateRoute}>{routeLoading?"Calculating…":"Calculate route & fuel"}</button></div><div className="route-map"><MapboxMap campsites={campsites} route={route} stops={stops} fuelStations={fuelStations}/></div></div>}</section>}

function FuelView({mpg,setMpg,tank,setTank,reserve,setReserve,priceCushion,setPriceCushion,mileageBuffer,setMileageBuffer,safeRange,fullRange,route,stations,plan,selectedTrip,saveSettings}:any){const miles=route?Math.round(route.distance/1609.344):0;const hours=route?Math.round(route.duration/3600*10)/10:0;return <section className="content"><div className="page-head"><div><span className="eyebrow">FUEL</span><h1>Build a conservative fuel budget.</h1><p>EIA provides the baseline. Your cushion and mileage reserve keep the trip budget from being too optimistic.</p></div></div><div className="fuel-grid"><div className="form-card"><h3>Vehicle & budget cushion</h3><label>MPG<input type="number" min="1" step="0.1" value={mpg} onChange={e=>setMpg(Number(e.target.value))}/></label><label>Tank gallons<input type="number" min="1" step="0.1" value={tank} onChange={e=>setTank(Number(e.target.value))}/></label><label>Tank reserve %<input type="number" min="0" max="50" step="1" value={reserve} onChange={e=>setReserve(Number(e.target.value))}/></label><label>Fuel price cushion / gallon<input type="number" min="0" step="0.05" value={priceCushion} onChange={e=>setPriceCushion(Number(e.target.value))}/></label><label>Mileage reserve %<input type="number" min="0" max="50" step="1" value={mileageBuffer} onChange={e=>setMileageBuffer(Number(e.target.value))}/></label><div className="big-number">{safeRange}<small>practical miles before reserve</small></div><span className="muted">{fullRange} miles at a full tank</span>{selectedTrip&&<button className="secondary full" onClick={saveSettings}>Save vehicle settings to this trip</button>}</div><div className="form-card"><h3>Current route</h3>{route?<><div className="metric-line"><span>Distance</span><b>{miles.toLocaleString()} mi</b></div><div className="metric-line"><span>Drive time</span><b>{hours} hr</b></div>{plan?.warning&&<div className="warning-box">{plan.warning}</div>}{plan?.estimatedCost!=null?<><div className="fuel-budget-number">${Math.round(plan.estimatedCost).toLocaleString()}<small>recommended fuel budget</small></div><div className="metric-line"><span>Route miles + reserve</span><b>{Math.round(plan.bufferedMiles).toLocaleString()} mi</b></div><div className="metric-line"><span>Planning gallons</span><b>{plan.gallons.toFixed(1)} gal</b></div><div className="metric-line"><span>Weighted EIA baseline</span><b>${plan.baselinePrice?.toFixed(2)}/gal</b></div><div className="metric-line"><span>Weighted planning price</span><b>${plan.planningPrice?.toFixed(2)}/gal</b></div><p className="muted">Planning price = EIA baseline + ${priceCushion.toFixed(2)}/gal. Mileage reserve is {mileageBuffer}%.</p></>:<div className="empty">Calculate the route again to generate the fuel budget.</div>}</>:<div className="empty">Calculate a route from the Trips page first.</div>}</div></div>{plan?.segments?.length>0&&<div className="fuel-segments"><div className="section-title"><div><span className="eyebrow">ROUTE LEGS</span><h2>Fuel cost by leg</h2></div><span className="muted">EIA weekly retail averages{plan.priceDate?` · week ${plan.priceDate}`:""}</span></div>{plan.segments.map((s:FuelSegment,i:number)=><div className="fuel-segment" key={`${s.from}-${s.to}-${i}`}><div><strong>{s.from} → {s.to}</strong><small>{s.state||"State unavailable"} · {Math.round(s.miles).toLocaleString()} route mi · {s.source||"No EIA price"}</small></div><div className="fuel-segment-right"><span>{s.price==null?"—":`$${s.price.toFixed(2)}/gal`}</span><b>{s.cost==null?"—":`$${Math.round(s.cost).toLocaleString()}`}</b></div></div>)}</div>}<div className="fuel-stations-card"><div className="section-title"><div><span className="eyebrow">MAPBOX</span><h2>Gas stations along the route</h2></div><span className="muted">Candidates within the route search corridor</span></div>{stations?.length?stations.slice(0,12).map((s:any)=>{const routeMiles=typeof s.routeMiles==="number"?Math.round(s.routeMiles):null;const rangeFlag=routeMiles!=null&&routeMiles<=safeRange?"Within first-tank range":routeMiles!=null?"Beyond first-tank range":"Route position unavailable";return <div className="station" key={s.properties?.mapbox_id||s.id}><div><strong>{s.properties?.name||s.text||"Gas station"}</strong><small>{s.properties?.full_address||s.properties?.place_formatted||""}{routeMiles!=null?` · ${routeMiles.toLocaleString()} route mi`:""}</small></div><span>{rangeFlag}</span></div>}):<div className="empty">No stations returned yet.</div>}<p className="muted">Stations are ordered by approximate position along the route. Your practical range is {safeRange.toLocaleString()} miles, so the first-tank marker helps identify where a fuel stop needs to happen. EIA supplies the planning price; it is not a station-specific pump quote.</p></div></section>}

function BudgetView({budget,setBudget,fuelBudget,fuelPlan}:any){const nonFuel=Object.values(budget).reduce((a:number,b:any)=>a+Number(b),0);const total=nonFuel+fuelBudget;return <section className="content"><div className="page-head"><div><span className="eyebrow">BUDGET</span><h1>Keep the math simple.</h1><p>Fuel is route-driven. Everything else stays editable.</p></div></div><div className="budget-card">{Object.entries(budget).map(([k,v]:any)=><label key={k}>{k.replace("fees","park fees").replace("camp","camping").replace("other","other").replace("food","food")}<input type="number" value={v} onChange={e=>setBudget({...budget,[k]:Number(e.target.value)})}/></label>)}<label className="budget-fuel"><span>Fuel budget</span><strong>{fuelBudget?`$${Math.round(fuelBudget).toLocaleString()}`:"—"}</strong></label><div className="total"><span>Trip budget</span><strong>${Math.round(total).toLocaleString()}</strong></div>{fuelPlan?.estimatedCost!=null&&<p className="muted">Fuel budget is based on route miles, {fuelPlan.gallons.toFixed(1)} planning gallons, EIA pricing and your configured cushion.</p>}</div></section>}

function PackView({pack,setPack,newPack,setNewPack}:any){return <section className="content"><div className="page-head"><div><span className="eyebrow">PACK LIST</span><h1>Reuse your loadout.</h1><p>A simple checklist. Nothing more.</p></div></div><div className="pack-card"><div className="add-row"><input placeholder="Add item" value={newPack} onChange={e=>setNewPack(e.target.value)}/><button className="primary" onClick={()=>{if(newPack.trim()){setPack([...pack,newPack.trim()]);setNewPack("")}}}>Add</button></div>{pack.map((x:string,i:number)=><label className="check" key={`${x}-${i}`}><input type="checkbox"/><span>{x}</span></label>)}</div></section>}

function CampsiteImporter({existing,onClose,onImport}:{existing:Campsite[];onClose:()=>void;onImport:(rows:ImportCandidate[])=>void}){
  const [rows,setRows]=useState<ImportCandidate[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [fileName,setFileName]=useState("");
  const token=process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  async function handleFiles(files:File[]){
    setBusy(true);setError("");setFileName(files.map(f=>f.name).join(", "));
    try{
      const parsedGroups=await Promise.all(files.map(async file=>({file,rows:parseCsv(await file.text())})));
      const parsed: Array<Record<string,string> & {__sourceFile:string}> = parsedGroups.reduce((all,g)=>{
        return all.concat(g.rows.map((r:Record<string,string>)=>({...r,__sourceFile:g.file.name})));
      }, [] as Array<Record<string,string> & {__sourceFile:string}>);
      if(!parsed.length)throw new Error("No saved places were found in those CSV files.");
      const candidates=parsed.map((r,i)=>{
        const name=(r.title||r.name||r.saved_place||r.place||r.label||`Saved place ${i+1}`).trim();
        const url=(r.url||r.link||r.google_maps_url||r.google_maps_link||"").trim();
        const note=(r.note||r.notes||r.description||"").trim();
        const coords=extractGoogleCoordinates(url); const dup=isDuplicate(name,coords,existing);
        return {key:`${i}-${name}-${url}`,name,area:"",type:"Other",latitude:coords?.latitude??null,longitude:coords?.longitude??null,source_url:url,notes:note,selected:!dup,status:(dup?"duplicate":coords?"ready":"needs-location") as ImportCandidate["status"]};
      });
      let next=candidates;
      if(token){
        next=await geocodeMissing(candidates,token);
      }
      setRows(next);
    }catch(e:any){setError(e?.message||"Could not read that CSV.")}
    finally{setBusy(false)}
  }

  async function geocodeMissing(input:ImportCandidate[],mapboxToken:string){
    const output=[...input];
    for(let i=0;i<output.length;i++){
      const r=output[i];
      if(r.latitude!=null&&r.longitude!=null)continue;
      try{
        const q=encodeURIComponent(r.name);
        const response=await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${q}&country=US&limit=1&access_token=${mapboxToken}`);
        if(response.ok){
          const data=await response.json();const feature=data.features?.[0];const coords=feature?.geometry?.coordinates;
          if(Array.isArray(coords)&&coords.length===2){
            const context=feature.properties?.context||{};
            const area=context.place?.name||context.locality?.name||context.district?.name||"";
            output[i]={...r,latitude:Number(coords[1]),longitude:Number(coords[0]),area, status:"ready"};
          }
        }
      }catch{}
    }
    return output;
  }

  const update=(key:string,patch:Partial<ImportCandidate>)=>setRows(prev=>prev.map(r=>r.key===key?{...r,...patch}:r));
  const remove=(key:string)=>setRows(prev=>prev.filter(r=>r.key!==key));
  const selectedCount=rows.filter(r=>r.selected&&r.latitude!=null&&r.longitude!=null).length;
  const unresolved=rows.filter(r=>r.latitude==null||r.longitude==null).length;

  return <div className="modal-backdrop"><div className="modal importer-modal">
    <div className="modal-head"><div><span className="eyebrow">CAMPSITE IMPORTER</span><h2>Bring in your Google Maps saves.</h2><p className="muted">Export your Google Maps Saved list as a CSV, upload it here, review the places, then import only the campsites you want to keep.</p></div><button onClick={onClose}>×</button></div>
    {!rows.length&&<div className="import-drop"><div className="import-icon">↓</div><h3>Upload your Google Maps CSV</h3><p>Google Takeout → Saved → download the CSV files, then choose one or several here.</p><label className="upload-button">Choose CSV files<input type="file" multiple accept=".csv,text/csv" onChange={e=>{const files=Array.from(e.target.files||[]);if(files.length)handleFiles(files)}}/></label>{fileName&&<span className="muted">{fileName}</span>}{error&&<div className="warning-box">{error}</div>}</div>}
    {busy&&<div className="loading">Reading your saved places and locating anything that needs coordinates…</div>}
    {rows.length>0&&!busy&&<>
      <div className="import-summary"><div><strong>{rows.length}</strong><span>saved places found</span></div><div><strong>{selectedCount}</strong><span>ready to import</span></div><div><strong>{unresolved}</strong><span>need a location</span></div></div>
      <div className="import-note"><strong>Review before importing.</strong> Places that aren't campsites can be removed with <b>Skip</b>. You can also edit the name, area, type, or coordinates before importing.</div>
      <div className="import-list">{rows.map(r=><div className={`import-row ${r.selected?"":"skipped"}`} key={r.key}>
        <div className="import-check"><input type="checkbox" checked={r.selected} onChange={e=>update(r.key,{selected:e.target.checked})}/></div>
        <div className="import-fields">
          <div className="import-grid"><label>Name<input value={r.name} onChange={e=>update(r.key,{name:e.target.value})}/></label><label>Area<input value={r.area} onChange={e=>update(r.key,{area:e.target.value})}/></label><label>Type<select value={r.type} onChange={e=>update(r.key,{type:e.target.value})}><option>Other</option><option>Dispersed</option><option>Developed</option><option>Forest campground</option><option>Private campground</option></select></label><label>Latitude<input type="number" step="any" value={r.latitude??""} onChange={e=>update(r.key,{latitude:e.target.value===""?null:Number(e.target.value),status:e.target.value===""?"needs-location":"ready"})}/></label><label>Longitude<input type="number" step="any" value={r.longitude??""} onChange={e=>update(r.key,{longitude:e.target.value===""?null:Number(e.target.value),status:e.target.value===""?"needs-location":"ready"})}/></label></div>
          <div className="import-meta"><span className={r.latitude!=null&&r.longitude!=null?"ready-text":"needs-text"}>{r.latitude!=null&&r.longitude!=null?"Location ready":"Location needed"}</span>{r.source_url&&<a href={r.source_url} target="_blank" rel="noreferrer">Open Google Maps ↗</a>}</div>
        </div>
        <button className="skip-button" onClick={()=>remove(r.key)}>Skip</button>
      </div>)}</div>
      <div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="secondary" onClick={()=>setRows([])}>Choose a different CSV</button><button className="primary" disabled={!selectedCount} onClick={()=>onImport(rows)}>Import {selectedCount} campsite{selectedCount===1?"":"s"}</button></div>
    </>}
  </div></div>
}

function parseCsv(text:string):Record<string,string>[]{
  const rows:string[][]=[];let row:string[]=[];let cell="";let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted;
    }else if(ch===','&&!quoted){row.push(cell);cell=""}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell="";if(row.some(x=>x.trim()!==""))rows.push(row);row=[]}
    else cell+=ch;
  }
  if(cell!==""||row.length){row.push(cell);if(row.some(x=>x.trim()!==""))rows.push(row)}
  if(rows.length<2)return [];
  const headers=rows[0].map(h=>h.trim().toLowerCase().replace(/^"|"$/g,""));
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,(values[i]??"").trim()])));
}

function extractGoogleCoordinates(url:string){
  if(!url)return null;
  const patterns=[
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:query|q)=(-?\d+(?:\.\d+)?)[,%20]+(-?\d+(?:\.\d+)?)/
  ];
  for(const p of patterns){const m=url.match(p);if(m){const latitude=Number(m[1]),longitude=Number(m[2]);if(Math.abs(latitude)<=90&&Math.abs(longitude)<=180)return {latitude,longitude}}}
  return null;
}

function isDuplicate(name:string,coords:{latitude:number;longitude:number}|null,existing:Campsite[]){
  const normalized=name.trim().toLowerCase();
  return existing.some(c=>normalized&&c.name.trim().toLowerCase()===normalized||(coords&&haversineMiles([coords.longitude,coords.latitude],[c.longitude,c.latitude])<0.05));
}

function CampForm({initial,onClose,onSave,onDelete}:any){const blank={name:"",area:"",type:"Dispersed",latitude:"",longitude:"",cost:"",reservation:"",rating:"",favorite:false,notes:"",source:"",source_url:"",last_verified_at:""};const [f,setF]=useState<any>(initial?{...initial,latitude:String(initial.latitude),longitude:String(initial.longitude),cost:initial.cost==null?"":String(initial.cost),rating:initial.rating==null?"":String(initial.rating)}:blank);const set=(k:string,v:any)=>setF((p:any)=>({...p,[k]:v}));return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">CAMPSITE</span><h2>{initial?"Edit campsite":"Add campsite"}</h2></div><button onClick={onClose}>×</button></div><div className="form-grid">{[["name","Name"],["area","Area / region"],["latitude","Latitude"],["longitude","Longitude"],["cost","Cost / night"],["rating","Your rating 1–5"],["reservation","Reservation / access"],["source","Source"]].map(([k,l])=><label key={k}>{l}<input value={f[k]} onChange={e=>set(k,e.target.value)} /></label>)}</div><label>Type<select value={f.type} onChange={e=>set("type",e.target.value)}><option>Dispersed</option><option>Developed</option><option>Forest campground</option><option>Private campground</option><option>Other</option></select></label><label>Notes<textarea value={f.notes} onChange={e=>set("notes",e.target.value)} /></label><label>Source URL<input value={f.source_url} onChange={e=>set("source_url",e.target.value)} /></label><label>Last verified<input type="date" value={f.last_verified_at||""} onChange={e=>set("last_verified_at",e.target.value)}/></label><label className="check"><input type="checkbox" checked={f.favorite} onChange={e=>set("favorite",e.target.checked)}/><span>Favorite / preferred campsite</span></label><div className="modal-actions">{initial&&<button className="danger-button" onClick={()=>{onDelete(initial);onClose()}}>Delete campsite</button>}<button onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onSave({...f,latitude:Number(f.latitude),longitude:Number(f.longitude),cost:f.cost===""?null:Number(f.cost),rating:f.rating===""?null:Number(f.rating)})}>Save campsite</button></div></div></div>}
function AuthModal({email,password,setEmail,setPassword,busy,onClose,onSignIn,onSignUp}:any){return <div className="modal-backdrop"><div className="modal auth"><div className="modal-head"><div><span className="eyebrow">ACCOUNT</span><h2>Save your planner.</h2></div><button onClick={onClose}>×</button></div><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="modal-actions"><button disabled={busy} onClick={onSignIn}>Sign in</button><button className="primary" disabled={busy} onClick={onSignUp}>Create account</button></div></div></div>}
function Stat({n,label}:any){return <div className="stat"><strong>{n}</strong><span>{label}</span></div>};function Card({title,text}:any){return <div className="feature-card"><h3>{title}</h3><p>{text}</p></div>};function EmptyState({title,action}:any){return <div className="empty"><strong>{title}</strong><button onClick={action}>Sign in</button></div>}
function haversineMiles(a:[number,number],b:[number,number]){const r=3958.7613;const dLat=(b[1]-a[1])*Math.PI/180;const dLon=(b[0]-a[0])*Math.PI/180;const lat1=a[1]*Math.PI/180;const lat2=b[1]*Math.PI/180;const x=Math.sin(dLat/2)**2+Math.sin(dLon/2)**2*Math.cos(lat1)*Math.cos(lat2);return 2*r*Math.asin(Math.sqrt(x))}
function addRouteMiles(stations:any[],geometry:any){const coords=geometry?.coordinates||[];if(!coords.length)return stations;let cumulative=0;const distances:number[]=[0];for(let i=1;i<coords.length;i++){cumulative+=haversineMiles(coords[i-1],coords[i]);distances.push(cumulative)}return stations.map((station:any)=>{const point=station.geometry?.coordinates;if(!point)return station;let nearest=0;let best=Infinity;coords.forEach((c:number[],i:number)=>{const d=haversineMiles(point as [number,number],c as [number,number]);if(d<best){best=d;nearest=i}});return {...station,routeMiles:distances[nearest],routeOffsetMiles:best}}).sort((a:any,b:any)=>(a.routeMiles??Infinity)-(b.routeMiles??Infinity))}
function encodePolyline6(coords:number[][]){let lastLat=0,lastLng=0,out="";for(const [lng,lat] of coords){const lat6=Math.round(lat*1e6),lng6=Math.round(lng*1e6);out+=encodeSigned(lat6-lastLat)+encodeSigned(lng6-lastLng);lastLat=lat6;lastLng=lng6;}return out}
function encodeSigned(v:number){let n=v<0?~(v<<1):(v<<1);let s="";while(n>=0x20){s+=String.fromCharCode((0x20|(n&0x1f))+63);n>>=5}s+=String.fromCharCode(n+63);return s}
