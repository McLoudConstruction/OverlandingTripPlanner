"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FuelStopPlan } from "@/lib/fuel";
import { searchPlaces, type PathPoint, type PlaceResult } from "@/lib/tripOrder";
import {
  M_PER_MI, MAX_NIGHTS, backupsAt, campAt, dayDate, dayStopsOf, dateRangeLabel, fmtFt, fmtHrs, fmtMi, fuelStopsForDay,
  nightsBetween, nightsOfCampsite,
  type DayInfo, type DayRun, type Leg, type PlanStop, type Preview, type TripCampsite, type TripMeta,
} from "@/lib/tripPlan";

export const withPlace = (p: PlaceResult) =>
  p.subtitle && !p.name.toLowerCase().includes(p.subtitle.toLowerCase()) ? `${p.name}, ${p.subtitle}` : p.name;

// ---------------------------------------------------------------------------
// Place search: Mapbox places, plus (optionally) the person's saved campsites.

export function PlaceSearch({
  token, placeholder, proximity, campsites, defaultText, clearOnPick, onPickPlace, onPickCampsite, onClear,
}: {
  token: string | undefined; placeholder: string; proximity: PathPoint | null; campsites: TripCampsite[];
  defaultText?: string; clearOnPick?: boolean;
  onPickPlace: (p: PlaceResult) => void; onPickCampsite?: (c: TripCampsite) => void; onClear?: () => void;
}) {
  const [text, setText] = useState(defaultText || "");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const lastDefault = useRef(defaultText || "");

  // Reflect an externally changed value (e.g. a restored or chosen start).
  useEffect(() => {
    if ((defaultText || "") !== lastDefault.current) { lastDefault.current = defaultText || ""; setText(defaultText || ""); }
  }, [defaultText]);

  const q = text.trim().toLowerCase();
  const campMatches = useMemo(
    () => (!onPickCampsite || q.length < 2 ? [] : campsites.filter((c) => `${c.name} ${c.area || ""}`.toLowerCase().includes(q)).slice(0, 4)),
    [campsites, q, onPickCampsite]
  );

  useEffect(() => {
    if (!token || q.length < 2 || text === lastDefault.current) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const r = await searchPlaces(text, token, proximity, ctrl.signal);
      if (!ctrl.signal.aborted) { setResults(r); setActive(0); }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, token]);

  const items: { key: string; label: string; sub: string; pick: () => void }[] = [
    ...campMatches.map((c) => ({ key: `c-${c.id}`, label: `⌂ ${c.name}`, sub: `Saved campsite${c.area ? ` · ${c.area}` : ""}`, pick: () => onPickCampsite!(c) })),
    ...results.map((p) => ({ key: `p-${p.id}`, label: p.name, sub: p.subtitle, pick: () => onPickPlace(p) })),
  ];

  function choose(i: number) {
    const it = items[i];
    if (!it) return;
    it.pick();
    setOpen(false);
    if (clearOnPick) { setText(""); setResults([]); }
  }

  if (!token) return <div className="warning-box">Add NEXT_PUBLIC_MAPBOX_TOKEN to enable place search.</div>;
  return (
    <div className="place-search">
      <input
        value={text} placeholder={placeholder} autoComplete="off"
        onChange={(e) => { setText(e.target.value); setOpen(true); if (!e.target.value && onClear) onClear(); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); choose(active); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && items.length > 0 && (
        <ul className="suggestions">
          {items.map((it, i) => (
            <li key={it.key} className={i === active ? "active" : ""} onMouseDown={(e) => { e.preventDefault(); choose(i); }} onMouseEnter={() => setActive(i)}>
              <strong>{it.label}</strong><small>{it.sub}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trip setup: the name and dates come first; nights follow from the dates.

export function TripSetup({
  trip, token, startText, firstTime, onPickStart, onClearStart, onSave, onCancel,
}: {
  trip: TripMeta; token: string | undefined; startText: string; firstTime: boolean;
  onPickStart: (text: string, p: PlaceResult) => void; onClearStart: () => void;
  onSave: (patch: { name: string; start_date: string; end_date: string; end_location: string | null; daily_driving_hours: number | null }) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(trip.name);
  const [startDate, setStartDate] = useState(trip.start_date || "");
  const [endDate, setEndDate] = useState(trip.end_date || "");
  const [sameEnd, setSameEnd] = useState(!trip.end_location);
  const [endText, setEndText] = useState(trip.end_location || "");
  const [cap, setCap] = useState(trip.daily_driving_hours ? String(trip.daily_driving_hours) : "");
  const nights = nightsBetween(startDate, endDate);
  const problem =
    !startDate || !endDate ? "Choose a start and end date." :
    nights < 1 ? "The end date must be after the start date." :
    nights > MAX_NIGHTS ? `Trips are limited to ${MAX_NIGHTS} nights.` :
    !name.trim() ? "Give the trip a name." : "";

  return (
    <div className="trip-setup">
      <div className="form-card">
        <h3>{firstTime ? "Set up this trip" : "Trip details"}</h3>
        <label>Trip name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="date-pair">
          <label>Start date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label>End date<input type="date" min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        </div>
        <div className="night-count">
          {nights > 0
            ? <><b>{nights}</b> night{nights === 1 ? "" : "s"} <span className="muted">· {nights + 1} days · {dateRangeLabel(startDate, endDate)}</span></>
            : <span className="muted">Nights are counted from the dates you pick.</span>}
        </div>

        <h4>Starting location</h4>
        <PlaceSearch
          token={token} placeholder="Where does the trip start?" proximity={null} campsites={[]} defaultText={startText}
          onPickPlace={(p) => onPickStart(withPlace(p), p)} onClear={onClearStart}
        />
        <h4>Ending location</h4>
        <label className="check">
          <input type="checkbox" checked={sameEnd} onChange={(e) => setSameEnd(e.target.checked)} />
          Return to the starting location
        </label>
        {!sameEnd && (
          <PlaceSearch
            token={token} placeholder="Where does the trip end?" proximity={null} campsites={[]} defaultText={endText}
            onPickPlace={(p) => setEndText(withPlace(p))} onClear={() => setEndText("")}
          />
        )}
        <h4>Daily drive cap <span className="muted">(optional)</span></h4>
        <label className="inline-field">
          <input type="number" min="0" step="0.5" value={cap} placeholder="No limit" onChange={(e) => setCap(e.target.value)} />
          <span className="muted">hours per day. Each day can override this.</span>
        </label>

        {problem && <small className="muted">{problem}</small>}
        <div className="modal-actions">
          {onCancel && <button onClick={onCancel}>Cancel</button>}
          <button
            className="primary" disabled={!!problem || (!sameEnd && !endText.trim())}
            onClick={() => onSave({
              name: name.trim(), start_date: startDate, end_date: endDate,
              end_location: sameEnd ? null : endText.trim(),
              daily_driving_hours: cap && Number(cap) > 0 ? Number(cap) : null,
            })}
          >
            {firstTime ? "Start planning →" : "Save trip details"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Night rail: one bubble per night, plus the drive home.

export function NightRail({
  nights, startDate, stops, activeDay, overCap, onPick,
}: {
  nights: number; startDate: string | null; stops: PlanStop[]; activeDay: number | null; overCap: Set<number>;
  onPick: (day: number) => void;
}) {
  const days = Array.from({ length: nights }, (_, i) => i + 1);
  return (
    <div className="night-rail" role="tablist" aria-label="Nights">
      {days.map((n) => {
        const camp = campAt(stops, n);
        const backups = backupsAt(stops, n).length;
        return (
          <button
            key={n} role="tab" aria-selected={activeDay === n}
            className={`nr-item${activeDay === n ? " active" : ""}${camp ? " filled" : ""}`} onClick={() => onPick(n)}
          >
            <span className="nr-num">{n}</span>
            <span className="nr-text">
              <small>{dayDate(startDate, n)}</small>
              <strong>{camp ? camp.name : "Choose a camp"}</strong>
            </span>
            {backups > 0 && <span className="nr-badge" title={`${backups} backup${backups === 1 ? "" : "s"}`}>+{backups}</span>}
            {overCap.has(n) && <span className="nr-warn" title="Drive is over your daily cap">!</span>}
          </button>
        );
      })}
      <button
        role="tab" aria-selected={activeDay === nights + 1}
        className={`nr-item home${activeDay === nights + 1 ? " active" : ""}`} onClick={() => onPick(nights + 1)}
      >
        <span className="nr-num">⌂</span>
        <span className="nr-text"><small>{dayDate(startDate, nights + 1)}</small><strong>Drive home</strong></span>
        {overCap.has(nights + 1) && <span className="nr-warn" title="Drive is over your daily cap">!</span>}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card shown on the map for a clicked campsite.

export function CampsiteCard({
  c, nights, startDate, stops, night, setNight, preview, cap, onMakeCamp, onRemoveCamp, onAddBackup, onRemoveBackup,
  onStart, onEdit, onClose,
}: {
  c: TripCampsite; nights: number; startDate: string | null; stops: PlanStop[]; night: number; setNight: (n: number) => void;
  preview: Preview; cap: number | null;
  onMakeCamp: () => void; onRemoveCamp: () => void; onAddBackup: () => void; onRemoveBackup: () => void;
  onStart: () => void; onEdit: () => void; onClose: () => void;
}) {
  const mine = nightsOfCampsite(stops, c.id);
  const isCamp = mine.camp.includes(night);
  const isBackup = mine.backup.includes(night);
  const occupant = campAt(stops, night);
  const replacing = !!occupant && !isCamp && occupant.campsite_id !== c.id;
  const maps = `https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`;
  const hours = preview.duration != null ? preview.duration / 3600 : null;
  const tripLine = [
    mine.camp.length ? `Camp: Night ${mine.camp.join(", ")}` : "",
    mine.backup.length ? `Backup: Night ${mine.backup.join(", ")}` : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="camp-card">
      <div className="cc-head">
        <div>
          <span className="eyebrow">{c.type || "CAMPSITE"}{c.area ? ` · ${c.area}` : ""}</span>
          <h3>{c.favorite ? "★ " : ""}{c.name}</h3>
        </div>
        <button className="icon" aria-label="Close" onClick={onClose}>×</button>
      </div>

      <dl className="cc-stats">
        <dt>Elevation</dt><dd>{fmtFt(c.elevation_ft)}</dd>
        <dt>{preview.status === "nostart" ? "From start" : `From ${preview.fromLabel}`}</dt>
        <dd>
          {preview.status === "nostart" ? <span className="muted">Set a start location to see this</span>
            : preview.status === "loading" ? <span className="muted">Calculating…</span>
            : preview.status === "error" ? <span className="muted">Unavailable</span>
            : preview.distance != null ? `${fmtMi(preview.distance / M_PER_MI)} mi` : "—"}
        </dd>
        <dt>Drive time</dt>
        <dd>
          {preview.status === "ready" && preview.duration != null ? fmtHrs(preview.duration) : "—"}
          {hours != null && cap != null && hours > cap && <span className="over-cap"> · over your {cap} h cap</span>}
        </dd>
        {preview.status === "ready" && preview.next && (
          <><dt>Then to {preview.next.label}</dt><dd>{fmtMi(preview.next.distance / M_PER_MI)} mi · {fmtHrs(preview.next.duration)}</dd></>
        )}
        {c.cost != null && <><dt>Cost</dt><dd>{c.cost === 0 ? "Free" : `$${c.cost}/night`}</dd></>}
        {c.reservation && <><dt>Access</dt><dd>{c.reservation}</dd></>}
      </dl>

      <div className="cc-label">Use for</div>
      <div className="night-picker">
        {Array.from({ length: nights }, (_, i) => i + 1).map((n) => {
          const taken = campAt(stops, n);
          const cls = [
            "nb", n === night ? "sel" : "", taken ? "taken" : "", mine.camp.includes(n) ? "mine" : "", mine.backup.includes(n) ? "bk" : "",
          ].filter(Boolean).join(" ");
          return (
            <button key={n} className={cls} onClick={() => setNight(n)} title={taken ? `Night ${n}: ${taken.name}` : `Night ${n} is open`}>{n}</button>
          );
        })}
      </div>
      <small className="muted">Night {night}{startDate ? ` · ${dayDate(startDate, night)}` : ""}{occupant && !isCamp ? ` · currently ${occupant.name}` : ""}</small>

      <div className="cc-actions">
        {isCamp
          ? <button className="secondary" onClick={onRemoveCamp}>✓ Camp for Night {night} · Remove</button>
          : <button className="primary" onClick={onMakeCamp}>{replacing ? `Replace Night ${night} camp` : `Use as Night ${night} camp`}</button>}
        {!isCamp && (isBackup
          ? <button className="secondary" onClick={onRemoveBackup}>✓ Backup · Remove</button>
          : <button className="secondary" onClick={onAddBackup}>Add as backup</button>)}
      </div>
      {replacing && !isCamp && <small className="muted">{occupant!.name} stays on Night {night} as a backup.</small>}
      {tripLine && <small className="cc-trip">{tripLine}</small>}

      <div className="cc-links">
        <button className="linklike" onClick={onStart}>Use as start</button>
        <a href={maps} target="_blank" rel="noreferrer">Google Maps</a>
        <button className="linklike" onClick={onEdit}>Edit details</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Everything about one day: the drive, the night's camp and backups, day-stops,
// fuel stops, the drive cap and notes.

export function DayPanel({
  day, nights, startDate, dayInfo, setDayInfo, stops, campsites, leg, run, routeBusy, tripCap, fuelPlan,
  proximity, token, onResetRoute, onPromote, onRemove, onAddDayStop, onMoveDayStop, onFocus,
}: {
  day: number; nights: number; startDate: string | null; dayInfo: DayInfo; setDayInfo: (patch: Partial<DayInfo>) => void;
  stops: PlanStop[]; campsites: TripCampsite[]; leg: Leg | undefined; run: DayRun | undefined; routeBusy: boolean;
  tripCap: number | null; fuelPlan: FuelStopPlan | null; proximity: PathPoint | null; token: string | undefined;
  onResetRoute: () => void; onPromote: (s: PlanStop) => void; onRemove: (s: PlanStop) => void;
  onAddDayStop: (p: { name: string; latitude: number; longitude: number; campsite_id?: string }) => void;
  onMoveDayStop: (s: PlanStop, dir: -1 | 1) => void; onFocus: (s: PlanStop) => void;
}) {
  const isHome = day === nights + 1;
  const camp = isHome ? undefined : campAt(stops, day);
  const backups = isHome ? [] : backupsAt(stops, day);
  const dStops = dayStopsOf(stops, day);
  const cap = dayInfo.max_hours ?? tripCap;
  const hours = run ? run.duration / 3600 : null;
  const over = hours != null && cap != null && hours > cap;
  const fuel = fuelStopsForDay(fuelPlan, run);
  const siteOf = (s: PlanStop) => campsites.find((x) => x.id === s.campsite_id);
  const campSite = camp ? siteOf(camp) : undefined;

  return (
    <div className="day-panel">
      <div className="dp-head">
        <span className="eyebrow">DAY {day}{startDate ? ` · ${dayDate(startDate, day).toUpperCase()}` : ""}</span>
        <h3>{isHome ? "Drive home" : `Night ${day}`}</h3>
      </div>

      <div className="dp-block">
        {leg && run ? (
          <>
            <div className="dp-route">
              <b>{fmtMi(run.distance / M_PER_MI)} mi</b> · {fmtHrs(run.duration)}
              {over && <span className="over-cap"> · over your {cap} h cap</span>}
            </div>
            <small className="muted">{leg.fromName} → {leg.toName}</small>
          </>
        ) : leg ? (
          <small className="muted">{routeBusy ? "Calculating this day's drive…" : "Route unavailable for this day."}</small>
        ) : (
          <small className="muted">
            {isHome ? "Choose at least one camp to see the drive home."
              : camp ? "Set your start location to see this drive."
              : "No camp yet. Click a pin on the map and use it for this night. Until then this day's drive is folded into the next camp."}
          </small>
        )}
        <label className="inline-field">
          <span>Drive cap</span>
          <input
            type="number" min="0" step="0.5" value={dayInfo.max_hours ?? ""} placeholder={tripCap ? String(tripCap) : "No limit"}
            onChange={(e) => setDayInfo({ max_hours: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
          />
          <span className="muted">hours</span>
        </label>
        {dayInfo.via.length > 0 && (
          <div className="dp-shaped">
            <small className="muted">Route shaped with {dayInfo.via.length} point{dayInfo.via.length === 1 ? "" : "s"}.</small>
            <button className="linklike" onClick={onResetRoute}>Reset to fastest route</button>
          </div>
        )}
        {leg && !dayInfo.via.length && <small className="muted">Tip: drag the line on the map to take a different road.</small>}
      </div>

      {!isHome && (
        <div className="dp-block">
          <h4>Camp</h4>
          {camp ? (
            <div className="dp-camp">
              <div className="dp-camp-main">
                <button className="linklike strong" onClick={() => onFocus(camp)}>{camp.name}</button>
                <small className="muted">
                  {[campSite?.elevation_ft != null ? fmtFt(campSite.elevation_ft) : "", campSite?.cost != null ? (campSite.cost === 0 ? "Free" : `$${campSite.cost}/night`) : "", campSite?.reservation || ""].filter(Boolean).join(" · ") || "Saved campsite"}
                </small>
              </div>
              <button aria-label="Remove camp" onClick={() => onRemove(camp)}>×</button>
            </div>
          ) : <small className="muted">Nothing chosen yet.</small>}
          <h4>Backups</h4>
          {backups.length ? backups.map((b, i) => (
            <div className="dp-camp backup" key={`${b.campsite_id}-${i}`}>
              <div className="dp-camp-main">
                <button className="linklike strong" onClick={() => onFocus(b)}>{b.name}</button>
                <small className="muted">{[siteOf(b)?.elevation_ft != null ? fmtFt(siteOf(b)!.elevation_ft) : "", siteOf(b)?.type || ""].filter(Boolean).join(" · ")}</small>
              </div>
              <button className="mini" onClick={() => onPromote(b)}>Make camp</button>
              <button aria-label="Remove backup" onClick={() => onRemove(b)}>×</button>
            </div>
          )) : <small className="muted">None yet. Open a pin and choose “Add as backup.” You can add as many as you like.</small>}
        </div>
      )}

      <div className="dp-block">
        <h4>Stops along the way</h4>
        {dStops.map((s, i) => (
          <div className="dp-camp" key={`${s.name}-${i}`}>
            <div className="dp-camp-main"><button className="linklike strong" onClick={() => onFocus(s)}>◆ {s.name}</button></div>
            <button aria-label="Move up" disabled={i === 0} onClick={() => onMoveDayStop(s, -1)}>▲</button>
            <button aria-label="Move down" disabled={i === dStops.length - 1} onClick={() => onMoveDayStop(s, 1)}>▼</button>
            <button aria-label={`Remove ${s.name}`} onClick={() => onRemove(s)}>×</button>
          </div>
        ))}
        <PlaceSearch
          token={token} placeholder="Add a town, trailhead, park or saved campsite" proximity={proximity} campsites={campsites} clearOnPick
          onPickPlace={(p) => onAddDayStop({ name: p.name, latitude: p.latitude, longitude: p.longitude })}
          onPickCampsite={(c) => onAddDayStop({ name: c.name, latitude: c.latitude, longitude: c.longitude, campsite_id: c.id })}
        />
      </div>

      <div className="dp-block">
        <h4>Fuel stops</h4>
        {fuel.length ? fuel.map((f) => (
          <div className="dp-fuel" key={f.station.id}>
            <strong>{f.station.name}</strong>
            <small className="muted">mile {fmtMi(f.mile)} of the trip · {fmtMi(Math.max(0, f.rangeOnArrival))} mi of range left on arrival</small>
          </div>
        )) : (
          <small className="muted">
            {!fuelPlan ? "Calculate the fuel plan (below the map) to see fuel stops for this day."
              : fuelPlan.problem ? "The fuel plan needs attention. See the Fuel tab."
              : "No fuel stop needed on this day."}
          </small>
        )}
      </div>

      <div className="dp-block">
        <h4>Notes</h4>
        <textarea
          value={dayInfo.notes} rows={3} placeholder="Reservations, trail ideas, things to remember…"
          onChange={(e) => setDayInfo({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}
