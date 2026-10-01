"use client";
import { useState } from "react";
import { STATE_NAMES, CA_REGIONS, extractPlaceCoordinates, regionFromFeature } from "@/lib/geo";

// Google Maps Saved (Takeout CSV) importer: parse, locate, de-duplicate, review.

export type ImportCandidate = {
  key: string;
  name: string;
  area: string;
  state: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  source_url: string;
  notes: string;
  selected: boolean;
  status: "ready" | "needs-location" | "duplicate";
  duplicateOf: string;
};

type Campsite = { id: string; name: string; latitude: number; longitude: number };

export default function CampsiteImporter({existing,onClose,onImport}:{existing:Campsite[];onClose:()=>void;onImport:(rows:ImportCandidate[])=>void}){
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
        const coords=extractPlaceCoordinates(name,url);
        return {key:`${i}-${name}-${url}`,name,area:"",state:"",type:"Other",latitude:coords?.latitude??null,longitude:coords?.longitude??null,source_url:url,notes:note,selected:true,status:(coords?"ready":"needs-location") as ImportCandidate["status"],duplicateOf:""};
      });
      let next=candidates;
      if(token){
        // Resolve missing coordinates first. State is derived only from the
        // final coordinates. Area is intentionally left blank for you to enter
        // later because geocoded city/place names are not reliable enough for
        // the personal area label we want in the campsite library.
        next=await geocodeMissing(next,token);
        next=await reverseGeocodeStates(next,token);
      }
      // Duplicates are checked last, once every row has its final coordinates.
      next=markDuplicates(next,existing);
      setRows(next);
    }catch(e:any){setError(e?.message||"Could not read that CSV.")}
    finally{setBusy(false)}
  }

  async function geocodeMissing(input:ImportCandidate[],mapboxToken:string){
    // Search Box (not the v6 geocoder) is the API that knows about points of
    // interest such as campgrounds and recreation areas.
    const output=[...input];
    const todo=output.map((r,i)=>({r,i})).filter(x=>x.r.latitude==null||x.r.longitude==null);
    let cursor=0;
    async function worker(){
      while(cursor<todo.length){
        const {r,i}=todo[cursor++];
        try{
          const q=encodeURIComponent(r.name.slice(0,250));
          const response=await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?q=${q}&limit=1&types=poi,address,place,locality&access_token=${mapboxToken}`);
          if(!response.ok)continue;
          const data=await response.json();const coords=data.features?.[0]?.geometry?.coordinates;
          if(Array.isArray(coords)&&coords.length===2&&Number.isFinite(coords[0])&&Number.isFinite(coords[1])){
            output[i]={...r,latitude:Number(coords[1]),longitude:Number(coords[0]),status:"ready"};
          }
        }catch{}
      }
    }
    await Promise.all(Array.from({length:Math.min(5,todo.length)},worker));
    return output;
  }

  async function reverseGeocodeStates(input:ImportCandidate[],mapboxToken:string){
    // State always comes from the final coordinates. Mapbox batch requests are
    // capped at 50 queries. Reverse lookups take one type when limit is used, so
    // try the state/province polygon first, then county/district and place (both carry the region).
    const output=[...input];
    for(const type of ["region","district","place"]){
      const targets=output.map((r,index)=>({r,index})).filter(x=>x.r.latitude!=null&&x.r.longitude!=null&&!x.r.state);
      for(let start=0;start<targets.length;start+=50){
        const chunk=targets.slice(start,start+50);
        try{
          const body=chunk.map(({r})=>({types:[type],longitude:r.longitude,latitude:r.latitude,limit:1}));
          const response=await fetch(`https://api.mapbox.com/search/geocode/v6/batch?access_token=${mapboxToken}`,{
            method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
          });
          if(!response.ok)continue;
          const data=await response.json();
          (Array.isArray(data.batch)?data.batch:[]).forEach((result:any,j:number)=>{
            const target=chunk[j];if(!target)return;
            const state=regionFromFeature(result?.features?.[0]).region;
            if(state)output[target.index]={...output[target.index],state};
          });
        }catch{}
      }
    }
    return output;
  }

  const update=(key:string,patch:Partial<ImportCandidate>)=>setRows(prev=>{
    const next=prev.map(r=>r.key===key?{...r,...patch}:r);
    if(!("name" in patch||"latitude" in patch||"longitude" in patch))return next;
    const i=next.findIndex(r=>r.key===key);
    // Label only; the checkbox stays wherever the user put it.
    next[i]={...next[i],duplicateOf:findDuplicate(next[i],existing,next.slice(0,i))};
    return next;
  });
  const remove=(key:string)=>setRows(prev=>prev.filter(r=>r.key!==key));
  const selectedCount=rows.filter(r=>r.selected&&r.latitude!=null&&r.longitude!=null).length;
  const duplicates=rows.filter(r=>r.duplicateOf).length;
  const unresolved=rows.filter(r=>r.latitude==null||r.longitude==null).length;

  return <div className="modal-backdrop"><div className="modal importer-modal">
    <div className="modal-head"><div><span className="eyebrow">CAMPSITE IMPORTER</span><h2>Bring in your Google Maps saves.</h2><p className="muted">Export your Google Maps Saved list as a CSV, upload it here, review the places, then import only the campsites you want to keep.</p></div><button onClick={onClose}>×</button></div>
    {!rows.length&&<div className="import-drop"><div className="import-icon">↓</div><h3>Upload your Google Maps CSV</h3><p>Google Takeout → Saved → download the CSV files, then choose one or several here.</p><label className="upload-button">Choose CSV files<input type="file" multiple accept=".csv,text/csv" onChange={e=>{const files=Array.from(e.target.files||[]) as File[];if(files.length)handleFiles(files)}}/></label>{fileName&&<span className="muted">{fileName}</span>}{error&&<div className="warning-box">{error}</div>}</div>}
    {busy&&<div className="loading">Reading your saved places and locating anything that needs coordinates…</div>}
    {rows.length>0&&!busy&&<>
      <div className="import-summary"><div><strong>{rows.length}</strong><span>saved places found</span></div><div><strong>{selectedCount}</strong><span>ready to import</span></div><div><strong>{duplicates}</strong><span>possible duplicates</span></div><div><strong>{unresolved}</strong><span>need a location</span></div></div>
      <div className="import-note"><strong>Review before importing.</strong> State, province or territory is calculated from the campsite coordinates (worldwide). Area is intentionally left blank for you to fill in later. Places that aren't campsites can be removed with <b>Skip</b>. You can also edit the name, area, state, type, or coordinates before importing.</div>
      <datalist id="region-options">{[...Object.keys(STATE_NAMES),...CA_REGIONS].map(n=><option key={n} value={n}/>)}</datalist>
      <div className="import-list">{rows.map(r=><div className={`import-row ${r.selected?"":"skipped"}`} key={r.key}>
        <div className="import-check"><input type="checkbox" checked={r.selected} onChange={e=>update(r.key,{selected:e.target.checked})}/></div>
        <div className="import-fields">
          <div className="import-grid"><label>Name<input value={r.name} onChange={e=>update(r.key,{name:e.target.value})}/></label><label>Area / region<input value={r.area} onChange={e=>update(r.key,{area:e.target.value})}/></label><label>State / province<input list="region-options" value={r.state} placeholder="Auto from coordinates" onChange={e=>update(r.key,{state:e.target.value})}/></label><label>Type<select value={r.type} onChange={e=>update(r.key,{type:e.target.value})}><option>Other</option><option>Dispersed</option><option>Developed</option><option>Forest campground</option><option>Private campground</option></select></label><label>Latitude<input type="number" step="any" value={r.latitude??""} onChange={e=>update(r.key,{latitude:e.target.value===""?null:Number(e.target.value),status:e.target.value===""?"needs-location":"ready"})}/></label><label>Longitude<input type="number" step="any" value={r.longitude??""} onChange={e=>update(r.key,{longitude:e.target.value===""?null:Number(e.target.value),status:e.target.value===""?"needs-location":"ready"})}/></label></div>
          <div className="import-meta"><span className={r.latitude!=null&&r.longitude!=null?"ready-text":"needs-text"}>{r.latitude!=null&&r.longitude!=null?"Location ready":"Location needed"}</span>{r.duplicateOf&&<span className="dup-text">Possible duplicate of {r.duplicateOf}</span>}{r.source_url&&<a href={r.source_url} target="_blank" rel="noreferrer">Open Google Maps ↗</a>}</div>
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

const DUP_MILES=0.05; // about 80 m

/**
 * Describes what a row duplicates, or "" if nothing. Checks the saved library
 * (same name or same spot) and rows earlier in this import (same spot, or the
 * same name when either row has no coordinates), so the first copy is kept.
 */
function findDuplicate(row:ImportCandidate,existing:Campsite[],earlier:ImportCandidate[]):string{
  const name=row.name.trim().toLowerCase();
  const hasCoords=row.latitude!=null&&row.longitude!=null&&Number.isFinite(row.latitude)&&Number.isFinite(row.longitude);
  const here:[number,number]|null=hasCoords?[row.longitude as number,row.latitude as number]:null;
  for(const c of existing){
    if(here&&haversineMiles(here,[c.longitude,c.latitude])<DUP_MILES)return `${c.name} (already in your library)`;
    if(name&&c.name.trim().toLowerCase()===name)return `${c.name} (same name in your library)`;
  }
  for(const o of earlier){
    if(o.key===row.key)continue;
    const oHas=o.latitude!=null&&o.longitude!=null;
    if(here&&oHas&&haversineMiles(here,[o.longitude as number,o.latitude as number])<DUP_MILES)return `${o.name} (earlier in this import)`;
    if(name&&(!here||!oHas)&&o.name.trim().toLowerCase()===name)return `${o.name} (earlier in this import)`;
  }
  return "";
}

function markDuplicates(rows:ImportCandidate[],existing:Campsite[]):ImportCandidate[]{
  return rows.map((r,i)=>{
    const duplicateOf=findDuplicate(r,existing,rows.slice(0,i));
    return duplicateOf?{...r,duplicateOf,selected:false,status:"duplicate" as const}:{...r,duplicateOf:""};
  });
}

function haversineMiles(a:[number,number],b:[number,number]){const r=3958.7613;const dLat=(b[1]-a[1])*Math.PI/180;const dLon=(b[0]-a[0])*Math.PI/180;const lat1=a[1]*Math.PI/180;const lat2=b[1]*Math.PI/180;const x=Math.sin(dLat/2)**2+Math.sin(dLon/2)**2*Math.cos(lat1)*Math.cos(lat2);return 2*r*Math.asin(Math.sqrt(x))}
