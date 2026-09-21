import { NextRequest, NextResponse } from "next/server";

const EIA_BASE = "https://api.eia.gov/v2/seriesid";

// EIA publishes weekly state averages for a limited set of states and PADD
// regional averages for the broader U.S. We use a state series when available
// and otherwise fall back to the PADD containing the state.
const STATE_SERIES: Record<string, { series: string; name: string }> = {
  CA: { series: "EMM_EPMR_PTE_SCA_DPG", name: "California" },
  CO: { series: "EMM_EPMR_PTE_SCO_DPG", name: "Colorado" },
  FL: { series: "EMM_EPMR_PTE_SFL_DPG", name: "Florida" },
  MA: { series: "EMM_EPMR_PTE_SMA_DPG", name: "Massachusetts" },
  MN: { series: "EMM_EPMR_PTE_SMN_DPG", name: "Minnesota" },
  NY: { series: "EMM_EPMR_PTE_SNY_DPG", name: "New York" },
  OH: { series: "EMM_EPMR_PTE_SOH_DPG", name: "Ohio" },
  TX: { series: "EMM_EPMR_PTE_STX_DPG", name: "Texas" },
  WA: { series: "EMM_EPMR_PTE_SWA_DPG", name: "Washington" },
};

const PADD_SERIES: Record<string, { series: string; name: string }> = {
  PADD1: { series: "EMM_EPMR_PTE_R10_DPG", name: "East Coast" },
  PADD2: { series: "EMM_EPMR_PTE_R20_DPG", name: "Midwest" },
  PADD3: { series: "EMM_EPMR_PTE_R30_DPG", name: "Gulf Coast" },
  PADD4: { series: "EMM_EPMR_PTE_R40_DPG", name: "Rocky Mountain" },
  PADD5: { series: "EMM_EPMR_PTE_R50_DPG", name: "West Coast" },
};

const PADD_BY_STATE: Record<string, string> = {
  ME: "PADD1", NH: "PADD1", VT: "PADD1", MA: "PADD1", RI: "PADD1", CT: "PADD1",
  NY: "PADD1", NJ: "PADD1", PA: "PADD1", DE: "PADD1", MD: "PADD1", DC: "PADD1",
  VA: "PADD1", WV: "PADD1", NC: "PADD1", SC: "PADD1", GA: "PADD1", FL: "PADD1",
  AL: "PADD3", MS: "PADD3", LA: "PADD3", AR: "PADD3", TX: "PADD3", NM: "PADD3",
  OK: "PADD2", KS: "PADD2", NE: "PADD2", SD: "PADD2", ND: "PADD2", MN: "PADD2",
  IA: "PADD2", MO: "PADD2", WI: "PADD2", IL: "PADD2", IN: "PADD2", MI: "PADD2", OH: "PADD2", KY: "PADD2", TN: "PADD2",
  MT: "PADD4", ID: "PADD4", WY: "PADD4", UT: "PADD4", CO: "PADD4",
  WA: "PADD5", OR: "PADD5", CA: "PADD5", AK: "PADD5", HI: "PADD5", AZ: "PADD5", NV: "PADD5",
};

async function getSeries(series: string, apiKey: string) {
  const url = new URL(`${EIA_BASE}/${series}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("data[0]", "value");
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.set("length", "1");

  const response = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  if (!response.ok) throw new Error(`EIA returned ${response.status}`);
  const json = await response.json();
  const row = json?.response?.data?.[0];
  if (!row?.value || !row?.period) throw new Error("No EIA price returned");
  return { price: Number(row.value), period: row.period };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: "EIA_API_KEY is not configured.",
      setup: "Register for a free EIA API key and add EIA_API_KEY to Vercel environment variables."
    }, { status: 503 });
  }

  const states = (request.nextUrl.searchParams.get("states") || "")
    .split(",")
    .map((state) => state.trim().toUpperCase())
    .filter(Boolean);

  if (!states.length) {
    return NextResponse.json({ error: "Provide at least one state abbreviation." }, { status: 400 });
  }

  const uniqueStates = [...new Set(states)];
  const results = await Promise.all(uniqueStates.map(async (state: string) => {
    const stateSeries = STATE_SERIES[state];
    const regionKey = PADD_BY_STATE[state] || "PADD2";
    const regionalSeries = PADD_SERIES[regionKey];

    if (!regionalSeries) return { state, price: null, source: null, period: null };

    if (stateSeries) {
      try {
        const data = await getSeries(stateSeries.series, apiKey);
        return {
          state,
          price: data.price,
          period: data.period,
          source: "EIA state average",
          geography: stateSeries.name,
        };
      } catch {
        // Fall through to the PADD if a state series is temporarily unavailable.
      }
    }

    try {
      const data = await getSeries(regionalSeries.series, apiKey);
      return {
        state,
        price: data.price,
        period: data.period,
        source: "EIA PADD regional average",
        geography: regionalSeries.name,
      };
    } catch {
      return { state, price: null, source: null, period: null, geography: null };
    }
  }));

  return NextResponse.json({ results });
}
