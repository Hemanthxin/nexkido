import { haversineKm, type LL } from "./geo";

export type Route = {
  coords: [number, number][]; // [lng, lat] along the road
  distanceM: number; durationS: number;
  provider: "google" | "osrm" | "straight";
};

/*
 * Road routing for the live map. Order of preference:
 *   1. Google Routes API (traffic-aware ETA) when GOOGLE_MAPS_API_KEY is set,
 *   2. OSRM over OpenStreetMap roads (free, no key),
 *   3. a straight line, so the screen never breaks if both are unreachable.
 * Results are cached for a few seconds because every parent on a bus asks for nearly the same route.
 */
const cache = new Map<string, { at: number; r: Route }>();
const TTL = 12_000;
const BUS_FACTOR = 1.3; // OSRM times a car; a loaded school bus is slower

function thin(c: [number, number][], max = 500): [number, number][] {
  if (c.length <= max) return c;
  const step = (c.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => c[Math.round(i * step)]);
}

function decodePolyline(s: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < s.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do { b = s.charCodeAt(i++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d; else lng += d;
    }
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}

async function google(from: LL, to: LL): Promise<Route> {
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST", signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline" },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE",
    }),
  });
  if (!res.ok) throw new Error("google " + res.status);
  const r = (await res.json()).routes?.[0];
  if (!r) throw new Error("google: no route");
  return { coords: thin(decodePolyline(r.polyline.encodedPolyline)), distanceM: r.distanceMeters, durationS: parseInt(r.duration, 10), provider: "google" };
}

async function osrm(from: LL, to: LL): Promise<Route> {
  const base = process.env.OSRM_URL || "https://router.project-osrm.org";
  const res = await fetch(`${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`, { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "NexKido/1.0 (school bus tracking)" } });
  if (!res.ok) throw new Error("osrm " + res.status);
  const r = (await res.json()).routes?.[0];
  if (!r) throw new Error("osrm: no route");
  return { coords: thin(r.geometry.coordinates), distanceM: r.distance, durationS: r.duration * BUS_FACTOR, provider: "osrm" };
}

function straight(from: LL, to: LL): Route {
  const m = haversineKm(from, to) * 1000;
  return { coords: [[from.lng, from.lat], [to.lng, to.lat]], distanceM: m, durationS: m / 5.5, provider: "straight" };
}

export async function getRoute(from: LL, to: LL): Promise<Route> {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.r;
  let r: Route;
  try {
    r = process.env.GOOGLE_MAPS_API_KEY ? await google(from, to) : await osrm(from, to);
  } catch (e) {
    console.error("[route]", (e as Error).message);
    try { r = process.env.GOOGLE_MAPS_API_KEY ? await osrm(from, to) : straight(from, to); } catch { r = straight(from, to); }
  }
  cache.set(key, { at: Date.now(), r });
  if (cache.size > 400) for (const k of [...cache.keys()].slice(0, 100)) cache.delete(k);
  return r;
}
