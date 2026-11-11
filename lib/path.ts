import type { LL } from "./geo";

/** A road route as a measured polyline, so a bus can be placed and moved *along* it. */
export type Path = { pts: [number, number][]; cum: number[]; total: number; k: number };
const M = 111320; // metres per degree of latitude

export function buildPath(coords: [number, number][]): Path {
  const k = Math.cos((coords[0][1] * Math.PI) / 180);
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + Math.hypot((coords[i][0] - coords[i - 1][0]) * M * k, (coords[i][1] - coords[i - 1][1]) * M));
  return { pts: coords, cum, total: cum[cum.length - 1], k };
}

/** Nearest point on the route to p: distance along it, distance away from it, and the point itself. */
export function project(path: Path, p: LL, lo = -Infinity, hi = Infinity) {
  const { pts, cum, k } = path;
  let best = { s: 0, dist: Infinity, lng: pts[0][0], lat: pts[0][1] };
  for (let i = 0; i < pts.length - 1; i++) {
    if (cum[i + 1] < lo || cum[i] > hi) continue; // only look near where the bus was, so a route that doubles back can't make it jump
    const ax = (pts[i][0] - p.lng) * M * k, ay = (pts[i][1] - p.lat) * M;
    const dx = (pts[i + 1][0] - pts[i][0]) * M * k, dy = (pts[i + 1][1] - pts[i][1]) * M;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.dist) best = { dist: d, s: cum[i] + t * (cum[i + 1] - cum[i]), lng: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, lat: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t };
  }
  return best;
}

/** The point s metres along the route, with the direction of travel there. */
export function pointAt(path: Path, s: number) {
  const { pts, cum } = path;
  const x = Math.max(0, Math.min(path.total, s));
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= x) lo = mid; else hi = mid; }
  const seg = cum[hi] - cum[lo], t = seg > 0 ? (x - cum[lo]) / seg : 0;
  const lng = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, lat = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t;
  const dy = pts[hi][1] - pts[lo][1], dx = (pts[hi][0] - pts[lo][0]) * path.k;
  return { lng, lat, bearing: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 };
}

/** The part of the route still ahead, starting exactly at the bus. */
export function sliceFrom(path: Path, s: number): [number, number][] {
  const p = pointAt(path, s);
  const out: [number, number][] = [[p.lng, p.lat]];
  for (let i = 0; i < path.pts.length; i++) if (path.cum[i] > s) out.push(path.pts[i]);
  return out.length > 1 ? out : [out[0], out[0]];
}

export const lerpAngle = (a: number, b: number, t: number) => (a + ((((b - a + 540) % 360) - 180) * t) + 360) % 360;

/** Move a point m metres along a compass bearing. */
export function offset(p: LL, bearing: number, m: number): LL {
  const r = (bearing * Math.PI) / 180;
  return { lat: p.lat + (Math.cos(r) * m) / M, lng: p.lng + (Math.sin(r) * m) / (M * Math.cos((p.lat * Math.PI) / 180)) };
}

export function ringAround(c: LL, m: number, n = 40): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; const q = offset(c, (a * 180) / Math.PI, m); return [q.lng, q.lat] as [number, number]; });
}

/** The part of the route already driven, from its start up to s. */
export function sliceTo(path: Path, s: number): [number, number][] {
  const p = pointAt(path, s);
  const out: [number, number][] = [];
  for (let i = 0; i < path.pts.length; i++) if (path.cum[i] < s) out.push(path.pts[i]);
  out.push([p.lng, p.lat]);
  return out.length > 1 ? out : [out[0], out[0]];
}
