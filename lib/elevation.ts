// Client helper for the /api/elevation route.

export type ElevationQuery = { id: string; latitude: number; longitude: number };

/** Elevations in feet keyed by id. Ids the lookup could not answer are left out. */
export async function fetchElevations(items: ElevationQuery[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < items.length; i += 40) {
    const chunk = items.slice(i, i + 40);
    try {
      const points = chunk.map((c) => `${c.latitude},${c.longitude}`).join(";");
      const res = await fetch(`/api/elevation?points=${encodeURIComponent(points)}`);
      if (!res.ok) continue;
      const data = await res.json();
      (data.elevations || []).forEach((v: number | null, j: number) => {
        if (typeof v === "number" && Number.isFinite(v)) out[chunk[j].id] = v;
      });
    } catch {
      /* leave these blank; they are retried next time the app loads */
    }
  }
  return out;
}
