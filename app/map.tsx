"use client";
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export default function Map({campsites=[],route=null,stops=[],fuelStations=[],onSelect}:any){
 const ref=useRef<HTMLDivElement|null>(null); const mapRef=useRef<mapboxgl.Map|null>(null);
 useEffect(()=>{if(!ref.current)return;const token=process.env.NEXT_PUBLIC_MAPBOX_TOKEN;if(!token)return;mapboxgl.accessToken=token;const map=new mapboxgl.Map({container:ref.current,style:"mapbox://styles/mapbox/outdoors-v12",center:[-104,43],zoom:4});map.addControl(new mapboxgl.NavigationControl(),"top-right");mapRef.current=map;
 map.on("load",()=>{campsites.forEach((c:any)=>{const el=document.createElement("button");el.className="map-pin";el.textContent="⌂";el.title=c.name;el.onclick=()=>onSelect?.(c);new mapboxgl.Marker(el).setLngLat([c.longitude,c.latitude]).setPopup(new mapboxgl.Popup({offset:18}).setHTML(`<strong>${escapeHtml(c.name)}</strong><br/><span>${escapeHtml(c.area||"")}</span>`)).addTo(map)});
 if(route?.geometry){map.addSource("route",{type:"geojson",data:{type:"Feature",geometry:route.geometry,properties:{}}});map.addLayer({id:"route",type:"line",source:"route",paint:{"line-color":"#111827","line-width":4,"line-opacity":0.8}});}
 stops.forEach((s:any,i:number)=>new mapboxgl.Marker({color:"#111827"}).setLngLat([s.longitude,s.latitude]).setPopup(new mapboxgl.Popup().setText(`${i+1}. ${s.name}`)).addTo(map));
 fuelStations.slice(0,12).forEach((s:any)=>{const c=s.geometry?.coordinates;if(c)new mapboxgl.Marker({color:"#d97706"}).setLngLat(c).setPopup(new mapboxgl.Popup().setText(s.properties?.name||s.text||"Gas station")).addTo(map)});
 const points=[...campsites.map((c:any)=>[c.longitude,c.latitude]),...stops.map((s:any)=>[s.longitude,s.latitude]),...fuelStations.map((s:any)=>s.geometry?.coordinates).filter(Boolean)];if(points.length){const b=new mapboxgl.LngLatBounds();points.forEach((p:any)=>b.extend(p as [number,number]));map.fitBounds(b,{padding:60,maxZoom:11});}
 });return()=>{map.remove();mapRef.current=null}},[campsites,route,stops,fuelStations,onSelect]);
 return <div className="map-wrap">{!process.env.NEXT_PUBLIC_MAPBOX_TOKEN?<div className="map-placeholder"><strong>Mapbox is not connected.</strong><span>Add NEXT_PUBLIC_MAPBOX_TOKEN to Vercel, then redeploy.</span></div>:<div ref={ref} className="map-canvas"/>}</div>
}
function escapeHtml(v:string){return String(v).replace(/[&<>'"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]||c))}
