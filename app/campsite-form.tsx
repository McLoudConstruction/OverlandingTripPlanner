"use client";
import { useState } from "react";

// Add / edit a campsite. Elevation is looked up automatically when left blank,
// and can be overridden by hand here.

export default function CampForm({ initial, onClose, onSave, onDelete }: any) {
  const blank = {
    name: "", area: "", state: "", type: "Dispersed", latitude: "", longitude: "", elevation_ft: "", cost: "",
    reservation: "", rating: "", favorite: false, notes: "", source: "", source_url: "", last_verified_at: "",
  };
  const [f, setF] = useState<any>(
    initial
      ? {
          ...initial,
          latitude: String(initial.latitude),
          longitude: String(initial.longitude),
          elevation_ft: initial.elevation_ft == null ? "" : String(Math.round(initial.elevation_ft)),
          cost: initial.cost == null ? "" : String(initial.cost),
          rating: initial.rating == null ? "" : String(initial.rating),
        }
      : blank
  );
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const fields: [string, string][] = [
    ["name", "Name"], ["area", "Area / region"], ["state", "State / province"], ["latitude", "Latitude"],
    ["longitude", "Longitude"], ["elevation_ft", "Elevation (ft) — blank to look up"], ["cost", "Cost / night"],
    ["rating", "Your rating 1–5"], ["reservation", "Reservation / access"], ["source", "Source"],
  ];
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-head">
          <div><span className="eyebrow">CAMPSITE</span><h2>{initial ? "Edit campsite" : "Add campsite"}</h2></div>
          <button onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          {fields.map(([k, l]) => (
            <label key={k}>
              {l}
              <input value={f[k] ?? ""} readOnly={k === "state"} onChange={(e) => set(k, e.target.value)} />
            </label>
          ))}
        </div>
        <label>
          Type
          <select value={f.type} onChange={(e) => set("type", e.target.value)}>
            <option>Dispersed</option><option>Developed</option><option>Forest campground</option>
            <option>Private campground</option><option>Other</option>
          </select>
        </label>
        <label>Notes<textarea value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></label>
        <label>Source URL<input value={f.source_url ?? ""} onChange={(e) => set("source_url", e.target.value)} /></label>
        <label>Last verified<input type="date" value={f.last_verified_at || ""} onChange={(e) => set("last_verified_at", e.target.value)} /></label>
        <label className="check">
          <input type="checkbox" checked={!!f.favorite} onChange={(e) => set("favorite", e.target.checked)} />
          <span>Favorite / preferred campsite</span>
        </label>
        <div className="modal-actions">
          {initial && <button className="danger-button" onClick={() => { onDelete(initial); onClose(); }}>Delete campsite</button>}
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={() =>
              onSave({
                ...f,
                latitude: Number(f.latitude),
                longitude: Number(f.longitude),
                elevation_ft: f.elevation_ft === "" || f.elevation_ft == null ? null : Number(f.elevation_ft),
                cost: f.cost === "" ? null : Number(f.cost),
                rating: f.rating === "" ? null : Number(f.rating),
              })
            }
          >
            Save campsite
          </button>
        </div>
      </div>
    </div>
  );
}
