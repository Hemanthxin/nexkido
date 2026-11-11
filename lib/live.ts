import { addAlert, clearAlerts, listUsers, log, ownerOf, recentAlerts, sql, uid, type Alert, type AlertKind, type Trip, type User } from "./db";
import { bearingDeg, haversineKm } from "./geo";
import { sendPush, type PushPayload } from "./push";

/*
 * Live trips, in memory.
 *
 * A bus position changes every second; Neon is ~250 ms away per query. So the position lives here, is pushed straight to
 * the parents' open streams, and is saved to the database in the background at most every few seconds. A ping costs no
 * database round trip. Needs one long-running Node process (next start, a VPS, Render, Railway); on serverless the
 * clients fall back to polling the saved row.
 */
type Fn = (event: string, data: unknown) => void;
type Live = {
  trips: Map<string, Trip>; subs: Map<string, Set<Fn>>;
  roster: Map<string, { at: number; list: User[] }>; alerts: Map<string, Alert[]>;
  saved: Map<string, number>; ready?: Promise<void>;
};
const G = globalThis as typeof globalThis & { __nkLive?: Live };
const L: Live = (G.__nkLive ??= { trips: new Map(), subs: new Map(), roster: new Map(), alerts: new Map(), saved: new Map() });

export function liveReady() {
  return (L.ready ??= (async () => {
    const r = await sql<{ driver_id: string; data: Trip }>("SELECT driver_id, data FROM nexkido_trips");
    for (const row of r.rows) if (!L.trips.has(row.driver_id)) L.trips.set(row.driver_id, row.data);
  })().catch((e) => { L.ready = undefined; throw e; }));
}

/* ------------------------------- pub / sub ------------------------------- */

export function subscribe(userId: string, fn: Fn) {
  let s = L.subs.get(userId);
  if (!s) L.subs.set(userId, (s = new Set()));
  s.add(fn);
  return () => { s!.delete(fn); if (!s!.size) L.subs.delete(userId); };
}
export function publish(userId: string, event: string, data: unknown) {
  L.subs.get(userId)?.forEach((fn) => { try { fn(event, data); } catch { /* a closed stream cleans itself up */ } });
}

/** A short message for someone's screen and, if they allowed it, their lock screen. */
export function notice(userId: string, title: string, body: string, url: string, tag?: string) {
  publish(userId, "notice", { id: uid(), title, body, ts: Date.now() });
  return sendPush(userId, { title, body, url, tag });
}

/* ------------------------------ roster & alerts ------------------------------ */

export async function roster(driverId: string): Promise<User[]> {
  const hit = L.roster.get(driverId);
  if (hit && Date.now() - hit.at < 20_000) return hit.list;
  const list = (await listUsers({ roles: ["parent"], driverId })).filter((p) => p.stop);
  L.roster.set(driverId, { at: Date.now(), list });
  return list;
}
export const invalidateRoster = () => L.roster.clear();

export async function alertsFor(parentId: string): Promise<Alert[]> {
  let a = L.alerts.get(parentId);
  if (!a) { a = await recentAlerts(parentId); L.alerts.set(parentId, a); }
  return a;
}

const MSG: Record<string, string> = {
  started: "Your child's bus has started its journey.",
  "2km": "Your child's bus is approaching (about 2 km away).",
  "1km": "Your child's bus is approximately 1 km away. Please get ready.",
  arrived: "The bus has reached the designated drop-off point.",
  ended: "Today's bus trip is marked complete.",
};
const PUSH_TITLE: Record<string, string> = { started: "Bus has left", "2km": "Bus is 2 km away", "1km": "Bus is 1 km away", arrived: "Bus has arrived", ended: "Trip complete", changed: "Bus changed" };

/** Create an alert and show it instantly; saving it and the lock-screen push follow in the background. */
function mkAlert(p: User, kind: AlertKind, message = MSG[kind]) {
  const a: Alert = { id: uid(), parentId: p.id, kind, message, ts: Date.now() };
  L.alerts.set(p.id, [a, ...(L.alerts.get(p.id) ?? [])].slice(0, 20));
  publish(p.id, "alert", a);
  const push: PushPayload = { title: PUSH_TITLE[kind] ?? "NexKido", body: message, tag: `${kind}-${p.id}`, url: "/parent" };
  return { a, push };
}
const settle = (items: { a: Alert; push: PushPayload }[], parents: User[], withInsert = true) =>
  Promise.allSettled(items.flatMap(({ a, push }, i) => [withInsert ? addAlert(a) : Promise.resolve(), sendPush(parents[i].id, push)])).then((r) => r.forEach((x) => x.status === "rejected" && console.error("[live]", x.reason?.message)));

/* ---------------------------------- trips ---------------------------------- */

const persist = (t: Trip, force = false) => {
  if (!force && Date.now() - (L.saved.get(t.driverId) ?? 0) < 5000) return;
  L.saved.set(t.driverId, Date.now());
  sql("INSERT INTO nexkido_trips (driver_id,data) VALUES ($1,$2::jsonb) ON CONFLICT (driver_id) DO UPDATE SET data=EXCLUDED.data", [t.driverId, JSON.stringify(t)])
    .catch((e) => console.error("[live] trip save failed", e.message));
};

export async function getTrip(driverId: string) { await liveReady(); return L.trips.get(driverId); }
export async function allTrips(): Promise<Record<string, Trip>> { await liveReady(); return Object.fromEntries(L.trips); }
export function dropTrips(ids: string[]) { ids.forEach((i) => { L.trips.delete(i); L.roster.delete(i); L.saved.delete(i); }); }
export const reachedIds = (t?: Trip) => Object.entries(t?.sent ?? {}).filter(([, k]) => k.includes("arrived")).map(([id]) => id);
export const busPayload = (t: Trip) => ({ lat: t.lat!, lng: t.lng!, heading: t.heading ?? null, speedKmh: t.speed != null ? Math.round(t.speed * 3.6) : null, accuracy: t.accuracy ?? null, start: t.start ?? null, ageMs: Math.max(0, Date.now() - t.updatedAt) });

export async function startTrip(driver: User) {
  await liveReady();
  const parents = await roster(driver.id);
  const t: Trip = { driverId: driver.id, active: true, startedAt: Date.now(), updatedAt: Date.now(), sent: {}, depot: L.trips.get(driver.id)?.depot };
  L.trips.set(driver.id, t);
  parents.forEach((p) => L.alerts.set(p.id, []));
  persist(t, true);
  for (const id of [driver.id, ...parents.map((p) => p.id)]) publish(id, "trip", { active: true, startedAt: t.startedAt });
  const made = parents.map((p) => mkAlert(p, "started"));
  clearAlerts(parents.map((p) => p.id)).catch((e) => console.error("[live]", e.message)).then(() => settle(made, parents));
  void notice(ownerOf(driver), "Trip started", `Bus ${driver.busNo ?? driver.name} left with ${parents.length} ${parents.length === 1 ? "stop" : "stops"}.`, "/admin", `trip-${driver.id}`);
  log(driver, "Started trip", `bus ${driver.busNo ?? "-"}, ${parents.length} stops`);
  return t;
}

export async function endTrip(driver: User) {
  await liveReady();
  const t = L.trips.get(driver.id);
  if (t) { t.active = false; t.updatedAt = Date.now(); persist(t, true); }
  const parents = await roster(driver.id);
  for (const id of [driver.id, ...parents.map((p) => p.id)]) publish(id, "trip", { active: false });
  const made = parents.map((p) => mkAlert(p, "ended"));
  void settle(made, parents);
  void notice(ownerOf(driver), "Trip ended", `Bus ${driver.busNo ?? driver.name} finished its trip.`, "/admin", `trip-${driver.id}`);
  log(driver, "Ended trip", `bus ${driver.busNo ?? "-"}`);
}

const ORDER: AlertKind[] = ["2km", "1km", "arrived"];
function dueAlert(km: number, sent: string[]): AlertKind | null {
  const k: AlertKind | null = km <= 0.1 ? "arrived" : km <= 1 ? "1km" : km <= 2 ? "2km" : null;
  return k && !sent.includes(k) ? k : null;
}

export type PingResult = { status: number; body: Record<string, unknown> };
export async function ping(driver: User, b: Record<string, unknown>): Promise<PingResult> {
  await liveReady();
  const t = L.trips.get(driver.id);
  if (!t?.active) return { status: 409, body: { error: "No active trip" } };
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { status: 400, body: { error: "Invalid coordinates" } };
  const acc = Number(b.accuracy) || undefined;
  if (acc && acc > 150) return { status: 200, body: { ok: false, skipped: "poor accuracy" } }; // a 150 m+ fix is a guess, not a position

  const now = Date.now();
  const prev = t.lat != null && t.lng != null ? { lat: t.lat, lng: t.lng } : null;
  const movedM = prev ? haversineKm(prev, { lat, lng }) * 1000 : 0;
  const dt = (now - t.updatedAt) / 1000;
  const reported = b.speed === null || b.speed === undefined || b.speed === "" ? NaN : Number(b.speed);
  const derived = prev && dt > 0.3 ? movedM / dt : NaN;
  const raw = Number.isFinite(reported) ? reported : derived;
  const speed = Number.isFinite(raw) ? (t.speed != null ? 0.55 * t.speed + 0.45 * raw : raw) : t.speed;
  const still = prev != null && (speed ?? 0) < 0.8 && movedM < Math.max(acc ?? 0, 8); // standing at a light: don't let GPS noise move the dot
  const rep = b.heading === null || b.heading === undefined || b.heading === "" ? NaN : Number(b.heading);
  const heading = Number.isFinite(rep) && (speed ?? 0) > 0.5 ? rep : prev && movedM > 4 && !still ? bearingDeg(prev, { lat, lng }) : t.heading;

  if (!still) { t.lat = lat; t.lng = lng; }
  if (!t.start) { t.start = { lat: t.lat ?? lat, lng: t.lng ?? lng }; t.depot = t.start; }
  Object.assign(t, { accuracy: acc, heading, speed: still ? 0 : speed, updatedAt: now });
  persist(t);

  const parents = await roster(driver.id);
  const pos = { lat: t.lat!, lng: t.lng! };
  const payload = busPayload(t);
  const fired: { a: Alert; push: PushPayload }[] = [], firedFor: User[] = [];
  t.sent ??= {};
  for (const p of parents) {
    publish(p.id, "bus", payload);
    const sent = (t.sent[p.id] ??= []);
    const k = dueAlert(haversineKm(pos, p.stop!), sent);
    if (!k) continue;
    sent.push(...ORDER.slice(0, ORDER.indexOf(k) + 1).filter((x) => !sent.includes(x))); // arriving implies the farther alerts are moot
    fired.push(mkAlert(p, k)); firedFor.push(p);
    log(driver, `Alert sent: ${k}`, `to ${p.name} (${p.childName ?? "child"})`);
    if (k === "arrived") publish(driver.id, "reached", { parentId: p.id, child: p.childName, stop: p.stop!.name });
  }
  if (fired.length) { persist(t, true); void settle(fired, firedFor); }
  return { status: 200, body: { ok: true } };
}

/* --------------------------- admin changes, live --------------------------- */

/** A parent was moved to another driver (or edited): refresh the screens that care, and tell the people affected. */
export async function parentMoved(parent: User, from: User | null, to: User | null) {
  invalidateRoster();
  const send = (id: string) => publish(id, "roster", {});
  send(parent.id);
  if (from) send(from.id);
  if (to) send(to.id);
  const who = parent.childName || parent.name;
  if (to && to.id !== from?.id) {
    const msg = `${who}'s bus is now Bus ${to.busNo ?? "-"} with ${to.name}.`;
    const { a, push } = mkAlert(parent, "changed", msg);
    void Promise.allSettled([addAlert(a), sendPush(parent.id, { ...push, title: "Bus changed" })]);
    void notice(to.id, "New stop on your route", `${who} · ${parent.stop?.name ?? "stop"}`, "/driver", `route-${to.id}`);
  }
  if (from && from.id !== to?.id) void notice(from.id, "Stop removed from your route", `${who} is now on another bus.`, "/driver", `route-${from.id}`);
}
