"use client";
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Opening view: all of North America (Alaska to Panama, west of Greenland).
// fitBounds-style framing adapts the zoom to the size of the map panel.
// Trips with a route or stops still zoom in to fit the trip once it loads.
const NORTH_AMERICA:[[number,number],[number,number]]=[[-170,7],[-52,72]];

export default function Map({campsites=[],route=null,stops=[],fuelStations=[],onSelect}:any){
 const ref=useRef<HTMLDivElement|null>(null); const mapRef=useRef<mapboxgl.Map|null>(null);
 useEffect(()=>{if(!ref.current)return;const token=process.env.NEXT_PUBLIC_MAPBOX_TOKEN;if(!token)return;mapboxgl.accessToken=token;const map=new mapboxgl.Map({container:ref.current,style:"mapbox://styles/mapbox/outdoors-v12",bounds:NORTH_AMERICA,fitBoundsOptions:{padding:16}});map.addControl(new mapboxgl.NavigationControl(),"top-right");mapRef.current=map;
 map.on("load",()=>{campsites.forEach((c:any)=>{const el=document.createElement("button");el.className="map-pin";el.textContent="⌂";el.title=c.name;el.onclick=()=>onSelect?.(c);new mapboxgl.Marker(el).setLngLat([c.longitude,c.latitude]).setPopup(new mapboxgl.Popup({offset:18}).setHTML(`<strong>${escapeHtml(c.name)}</strong><br/><span>${escapeHtml(c.area||"")}</span>`)).addTo(map)});
 if(route?.geometry){map.addSource("route",{type:"geojson",data:{type:"Feature",geometry:route.geometry,properties:{}}});map.addLayer({id:"route",type:"line",source:"route",paint:{"line-color":"#111827","line-width":4,"line-opacity":0.8}});}
 stops.forEach((s:any,i:number)=>new mapboxgl.Marker({color:"#111827"}).setLngLat([s.longitude,s.latitude]).setPopup(new mapboxgl.Popup().setText(`${i+1}. ${s.name}`)).addTo(map));
 fuelStations.forEach((s:any)=>{if(typeof s.lng!=="number"||typeof s.lat!=="number")return;new mapboxgl.Marker({color:s.planned?"#16a34a":"#d97706",scale:s.planned?1:0.6}).setLngLat([s.lng,s.lat]).setPopup(new mapboxgl.Popup().setText(`${s.planned?"Planned fuel stop: ":""}${s.name||"Gas station"}`)).addTo(map)});
 const points=[...campsites.map((c:any)=>[c.longitude,c.latitude]),...stops.map((s:any)=>[s.longitude,s.latitude]),...fuelStations.filter((s:any)=>s.planned).map((s:any)=>[s.lng,s.lat])];if(points.length&&(route?.geometry||stops.length)){const b=new mapboxgl.LngLatBounds();points.forEach((p:any)=>b.extend(p as [number,number]));map.fitBounds(b,{padding:60,maxZoom:11});}
 });return()=>{map.remove();mapRef.current=null}},[campsites,route,stops,fuelStations,onSelect]);
 return <div className="map-wrap">{!process.env.NEXT_PUBLIC_MAPBOX_TOKEN?<div className="map-placeholder"><strong>Mapbox is not connected.</strong><span>Add NEXT_PUBLIC_MAPBOX_TOKEN to Vercel, then redeploy.</span></div>:<div ref={ref} className="map-canvas"/>}</div>
}
function escapeHtml(v:string){return String(v).replace(/[&<>'"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]||c))}
