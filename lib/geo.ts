// Geo helpers shared by the campsite importer and route planner.

export const STATE_NAMES: Record<string, string> = {
  Alabama:"AL", Alaska:"AK", Arizona:"AZ", Arkansas:"AR", California:"CA", Colorado:"CO", Connecticut:"CT", Delaware:"DE", Florida:"FL", Georgia:"GA", Hawaii:"HI", Idaho:"ID", Illinois:"IL", Indiana:"IN", Iowa:"IA", Kansas:"KS", Kentucky:"KY", Louisiana:"LA", Maine:"ME", Maryland:"MD", Massachusetts:"MA", Michigan:"MI", Minnesota:"MN", Mississippi:"MS", Missouri:"MO", Montana:"MT", Nebraska:"NE", Nevada:"NV", "New Hampshire":"NH", "New Jersey":"NJ", "New Mexico":"NM", "New York":"NY", "North Carolina":"NC", "North Dakota":"ND", Ohio:"OH", Oklahoma:"OK", Oregon:"OR", Pennsylvania:"PA", "Rhode Island":"RI", "South Carolina":"SC", "South Dakota":"SD", Tennessee:"TN", Texas:"TX", Utah:"UT", Vermont:"VT", Virginia:"VA", Washington:"WA", "West Virginia":"WV", Wisconsin:"WI", Wyoming:"WY", "District of Columbia":"DC"
};

const NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([name, code]) => [code, name])
);

export type LatLon = { latitude: number; longitude: number };

function validLatLon(latitude: number, longitude: number): LatLon | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

const NUM = String.raw`(\d{1,3}(?:\.\d+)?)`;
const DEG = String.raw`\s*[°º˚]\s*`;
const MIN = String.raw`\s*['′’‘]\s*`;
const SEC = String.raw`\s*(?:["″”“]|''|′′|’’)?\s*`;

// 35°44'17.3"N 93°05'40.2"W  (Google Maps' format for a dropped pin)
const DMS = new RegExp(
  `${NUM}${DEG}(\\d{1,2})${MIN}(\\d{1,2}(?:\\.\\d+)?)${SEC}([NS])[\\s,;+]*` +
  `${NUM}${DEG}(\\d{1,2})${MIN}(\\d{1,2}(?:\\.\\d+)?)${SEC}([EW])`,
  "i"
);
// 35°44.288'N 93°05.670'W
const DDM = new RegExp(
  `${NUM}${DEG}(\\d{1,2}(?:\\.\\d+)?)${MIN}([NS])[\\s,;+]*` +
  `${NUM}${DEG}(\\d{1,2}(?:\\.\\d+)?)${MIN}([EW])`,
  "i"
);
// 35.7381°N 93.0945°W
const DEG_HEMI = new RegExp(
  `(\\d{1,3}\\.\\d+)${DEG}?([NS])[\\s,;+]*(\\d{1,3}\\.\\d+)${DEG}?([EW])`,
  "i"
);
// 35.7381, -93.0945
const DECIMAL = /(-?\d{1,2}\.\d{3,})\s*[,;\s+]\s*(-?\d{1,3}\.\d{3,})/;

/** Find a coordinate pair written as text (DMS, decimal, etc.). */
export function parseCoordinateText(input: string): LatLon | null {
  if (!input) return null;
  let text = input;
  try { text = decodeURIComponent(input.replace(/\+/g, " ")); } catch { /* keep raw */ }
  text = text.replace(/\s+/g, " ");

  let m = text.match(DMS);
  if (m) {
    const lat = (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * (/s/i.test(m[4]) ? -1 : 1);
    const lon = (Number(m[5]) + Number(m[6]) / 60 + Number(m[7]) / 3600) * (/w/i.test(m[8]) ? -1 : 1);
    return validLatLon(lat, lon);
  }
  m = text.match(DDM);
  if (m) {
    const lat = (Number(m[1]) + Number(m[2]) / 60) * (/s/i.test(m[3]) ? -1 : 1);
    const lon = (Number(m[4]) + Number(m[5]) / 60) * (/w/i.test(m[6]) ? -1 : 1);
    return validLatLon(lat, lon);
  }
  m = text.match(DEG_HEMI);
  if (m) {
    const lat = Number(m[1]) * (/s/i.test(m[2]) ? -1 : 1);
    const lon = Number(m[3]) * (/w/i.test(m[4]) ? -1 : 1);
    return validLatLon(lat, lon);
  }
  m = text.match(DECIMAL);
  if (m) return validLatLon(Number(m[1]), Number(m[2]));
  return null;
}

/** True when a place title is really just a coordinate pair. */
export function isCoordinateName(name: string): boolean {
  return parseCoordinateText(name) !== null && !/[a-z]{3,}/i.test(name.replace(/[NSEW]/g, ""));
}

/**
 * Coordinates for a saved place: the title first (dropped pins are titled
 * with their coordinates), then whatever the Google Maps URL carries.
 */
export function extractPlaceCoordinates(name: string, url: string): LatLon | null {
  const fromName = parseCoordinateText(name);
  if (fromName && isCoordinateName(name)) return fromName;

  if (url) {
    // Exact place coordinates embedded in the data blob win over the map viewport (@lat,lon).
    const exact = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (exact) { const c = validLatLon(Number(exact[1]), Number(exact[2])); if (c) return c; }
    const fromUrlText = parseCoordinateText(url);
    if (fromUrlText) return fromUrlText;
    const view = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (view) { const c = validLatLon(Number(view[1]), Number(view[2])); if (c) return c; }
    const q = url.match(/[?&](?:query|q|ll)=(-?\d+(?:\.\d+)?)(?:,|%2C|%20|\+)+(-?\d+(?:\.\d+)?)/i);
    if (q) { const c = validLatLon(Number(q[1]), Number(q[2])); if (c) return c; }
  }
  return null;
}

// Province/territory codes, used only when Mapbox returns a code but no name.
const CA_NAME_BY_CODE: Record<string, string> = {
  AB:"Alberta", BC:"British Columbia", MB:"Manitoba", NB:"New Brunswick", NL:"Newfoundland and Labrador",
  NS:"Nova Scotia", NT:"Northwest Territories", NU:"Nunavut", ON:"Ontario", PE:"Prince Edward Island",
  QC:"Quebec", SK:"Saskatchewan", YT:"Yukon"
};

export const CA_REGIONS = Object.values(CA_NAME_BY_CODE).sort();

export type RegionInfo = { region: string; country: string; countryCode: string };

/**
 * First-level administrative region (US state, Canadian province or
 * territory, or the equivalent anywhere else) plus the country, from a
 * Mapbox v6 Geocoding or Search Box feature. Empty strings when unknown.
 */
export function regionFromFeature(feature: any): RegionInfo {
  const none = { region: "", country: "", countryCode: "" };
  if (!feature) return none;
  const props = feature.properties || {};
  const ctx = props.context || {};
  const countryCode = String(ctx.country?.country_code || props.country_code || "").toUpperCase();
  const country = String(ctx.country?.name || (props.feature_type === "country" ? props.name : "") || "");

  const clean = (n: unknown) => (typeof n === "string" ? n.trim() : "");
  const fromCode = (c: unknown) => {
    const code = String(c || "").toUpperCase().split("-").pop() || "";
    if (countryCode === "CA") return CA_NAME_BY_CODE[code] || "";
    if (countryCode === "US" || !countryCode) return NAME_BY_CODE[code] || "";
    return "";
  };

  // A region feature is the region itself; otherwise it lives in context.region.
  let region = "";
  if (props.feature_type === "region") {
    region = clean(props.name_preferred) || clean(props.name) || fromCode(props.region_code_full) || fromCode(props.region_code);
  }
  if (!region) {
    region = clean(ctx.region?.name) || fromCode(ctx.region?.region_code_full) || fromCode(ctx.region?.region_code);
  }
  return { region, country, countryCode };
}

/** US state abbreviation (EIA fuel prices are US-only); "" for anywhere else. */
export function usStateCode(feature: any): string {
  const { region, countryCode } = regionFromFeature(feature);
  if (countryCode && countryCode !== "US") return "";
  return STATE_NAMES[region] || "";
}
