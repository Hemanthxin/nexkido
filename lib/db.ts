import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Pool, type QueryResultRow } from "pg";

export type Role = "superadmin" | "admin" | "driver" | "parent";
export type User = {
  id: string; role: Role; name: string; email: string; phone?: string; passwordHash: string;
  school?: string;
  createdBy?: string;
  busNo?: string;
  childName?: string; driverId?: string;
  stop?: { name: string; lat: number; lng: number };
  createdAt: number;
};
export type Trip = {
  driverId: string; active: boolean; startedAt: number; updatedAt: number;
  start?: { lat: number; lng: number }; // where the bus first reported from on this trip
  lat?: number; lng?: number; accuracy?: number; heading?: number; speed?: number; // speed in m/s, heading in degrees
  sent?: Record<string, string[]>; // parentId -> alert kinds already sent on this trip
};
export type AlertKind = "started" | "2km" | "1km" | "arrived" | "ended" | "changed";
export type Alert = { id: string; parentId: string; kind: AlertKind; message: string; ts: number };
export type Activity = { id: string; ts: number; actorId?: string; actorName: string; role: Role | "unknown"; action: string; detail?: string };
export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

/*
 * Data layer for Neon PostgreSQL.
 *
 * Every query here is a single statement that touches only the rows it needs. Neon is a network round trip away
 * (~250 ms from India), so the hot path must not do more than a handful of queries; the live bus position never
 * touches this file at all (see lib/live.ts).
 */
const g = globalThis as typeof globalThis & { __nkPool?: Pool; __nkInit?: Promise<void>; __nkUsers?: Map<string, { at: number; u: User | null }> };

const pool = () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to connect to Neon PostgreSQL");
  if (!g.__nkPool) {
    const p = new Pool({ connectionString: process.env.DATABASE_URL, max: 6, ssl: { rejectUnauthorized: true }, keepAlive: true, idleTimeoutMillis: 120_000, connectionTimeoutMillis: 20_000 });
    p.on("error", (e) => console.error("[db] idle client error", e.message)); // Neon drops idle sockets; the pool reconnects on demand
    g.__nkPool = p;
  }
  return g.__nkPool;
};

export const SUPER_USER = (process.env.SUPERADMIN_USER || "nexkido").toLowerCase();
export const uid = () => crypto.randomBytes(6).toString("base64url");
export const ownerOf = (u: User) => u.createdBy || "admin-1";

async function migrateLocalJSON(p: Pool) {
  try {
    const legacy = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "db.json"), "utf8"));
    for (const u of legacy.users ?? []) await p.query("INSERT INTO nexkido_users (id,email,role,data) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING", [u.id, String(u.email).toLowerCase(), u.role, JSON.stringify(u)]);
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error("[db] legacy import skipped", (e as Error).message); }
}

async function initialize() {
  const p = pool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS nexkido_users (id text PRIMARY KEY, email text NOT NULL UNIQUE, role text NOT NULL, data jsonb NOT NULL);
    CREATE TABLE IF NOT EXISTS nexkido_trips (driver_id text PRIMARY KEY, data jsonb NOT NULL);
    CREATE TABLE IF NOT EXISTS nexkido_alerts (id text PRIMARY KEY, parent_id text NOT NULL, ts bigint NOT NULL, data jsonb NOT NULL);
    CREATE INDEX IF NOT EXISTS nexkido_alerts_parent_ts ON nexkido_alerts(parent_id, ts DESC);
    CREATE TABLE IF NOT EXISTS nexkido_activity (id text PRIMARY KEY, ts bigint NOT NULL, data jsonb NOT NULL);
    CREATE TABLE IF NOT EXISTS nexkido_push (endpoint text PRIMARY KEY, user_id text NOT NULL, data jsonb NOT NULL);
    CREATE INDEX IF NOT EXISTS nexkido_push_user ON nexkido_push(user_id);
  `);
  const have = await p.query<{ role: string }>("SELECT DISTINCT role FROM nexkido_users");
  if (!have.rowCount) await migrateLocalJSON(p);
  const roles = new Set((await p.query<{ role: string }>("SELECT DISTINCT role FROM nexkido_users")).rows.map((r) => r.role));
  const seed = async (u: User) => p.query("INSERT INTO nexkido_users (id,email,role,data) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING", [u.id, u.email, u.role, JSON.stringify(u)]);
  if (!roles.has("superadmin")) await seed({ id: "super-1", role: "superadmin", name: "NexKido Super Admin", email: SUPER_USER, passwordHash: bcrypt.hashSync(process.env.SUPERADMIN_PASSWORD || "nexkido123", 10), createdAt: Date.now() });
  if (!roles.has("admin")) await seed({ id: "admin-1", role: "admin", name: "School Admin", school: "Demo School", createdBy: "super-1", email: (process.env.ADMIN_EMAIL || "admin@schoolride.local").toLowerCase(), passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || "admin123", 10), createdAt: Date.now() });
  await p.query(`UPDATE nexkido_users SET data = data || '{"school":"Demo School","createdBy":"super-1"}'::jsonb WHERE role='admin' AND NOT (data ? 'school')`);
}

async function ready() {
  if (!g.__nkInit) g.__nkInit = initialize().catch((e) => { g.__nkInit = undefined; throw e; });
  await g.__nkInit;
}

/** Run one query against the shared database. */
export async function sql<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  await ready();
  return pool().query<T>(text, params);
}

/* ---------------------------------- users ---------------------------------- */

const cache = () => (g.__nkUsers ??= new Map());
const TTL = 15_000;
export const invalidateUser = (id?: string) => (id ? cache().delete(id) : cache().clear());

/** Cached for a few seconds: every authenticated request looks the user up, and a ping should not wait on the network for it. */
export async function findUserById(id: string): Promise<User | null> {
  const hit = cache().get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.u;
  const r = await sql<{ data: User }>("SELECT data FROM nexkido_users WHERE id = $1", [id]);
  const u = r.rows[0]?.data ?? null;
  cache().set(id, { at: Date.now(), u });
  return u;
}
export async function findUserByEmail(email: string) {
  return (await sql<{ data: User }>("SELECT data FROM nexkido_users WHERE email = $1", [email.toLowerCase()])).rows[0]?.data ?? null;
}

export type UserFilter = { roles?: Role[]; owner?: string; driverId?: string; ids?: string[] };
export async function listUsers(f: UserFilter = {}): Promise<User[]> {
  const r = await sql<{ data: User }>(
    `SELECT data FROM nexkido_users
     WHERE ($1::text[] IS NULL OR role = ANY($1))
       AND ($2::text IS NULL OR COALESCE(data->>'createdBy','admin-1') = $2)
       AND ($3::text IS NULL OR data->>'driverId' = $3)
       AND ($4::text[] IS NULL OR id = ANY($4))
     ORDER BY (data->>'createdAt')::bigint NULLS FIRST`,
    [f.roles ?? null, f.owner ?? null, f.driverId ?? null, f.ids ?? null],
  );
  return r.rows.map((x) => x.data);
}

const isDup = (e: unknown) => (e as { code?: string }).code === "23505";

export async function insertUser(u: User): Promise<"ok" | "duplicate"> {
  try { await sql("INSERT INTO nexkido_users (id,email,role,data) VALUES ($1,$2,$3,$4::jsonb)", [u.id, u.email.toLowerCase(), u.role, JSON.stringify(u)]); invalidateUser(u.id); return "ok"; }
  catch (e) { if (isDup(e)) return "duplicate"; throw e; }
}
export async function saveUser(u: User): Promise<"ok" | "duplicate" | "missing"> {
  try {
    const r = await sql("UPDATE nexkido_users SET email=$2, role=$3, data=$4::jsonb WHERE id=$1", [u.id, u.email.toLowerCase(), u.role, JSON.stringify(u)]);
    invalidateUser(u.id);
    return r.rowCount ? "ok" : "missing";
  } catch (e) { if (isDup(e)) return "duplicate"; throw e; }
}
/** Remove users and everything that belongs to them (alerts and push subscriptions). */
export async function purgeUsers(ids: string[]) {
  if (!ids.length) return;
  await Promise.all([
    sql("DELETE FROM nexkido_users WHERE id = ANY($1)", [ids]),
    sql("DELETE FROM nexkido_alerts WHERE parent_id = ANY($1)", [ids]),
    sql("DELETE FROM nexkido_push WHERE user_id = ANY($1)", [ids]),
    sql("DELETE FROM nexkido_trips WHERE driver_id = ANY($1)", [ids]),
  ]);
  ids.forEach((i) => invalidateUser(i));
}

/* ---------------------------------- alerts ---------------------------------- */

export const addAlert = (a: Alert) => sql("INSERT INTO nexkido_alerts (id,parent_id,ts,data) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING", [a.id, a.parentId, a.ts, JSON.stringify(a)]);
export const clearAlerts = (parentIds: string[]) => (parentIds.length ? sql("DELETE FROM nexkido_alerts WHERE parent_id = ANY($1)", [parentIds]) : Promise.resolve());
export async function recentAlerts(parentId: string, limit = 20): Promise<Alert[]> {
  return (await sql<{ data: Alert }>("SELECT data FROM nexkido_alerts WHERE parent_id = $1 ORDER BY ts DESC LIMIT $2", [parentId, limit])).rows.map((r) => r.data);
}
export async function alertsSince(ms: number) {
  return Number((await sql<{ n: string }>("SELECT count(*) n FROM nexkido_alerts WHERE ts > $1", [Date.now() - ms])).rows[0].n);
}

/* --------------------------------- activity --------------------------------- */

let logged = 0;
/** Record something that happened. Never blocks the caller; location pings are not logged. */
export function log(actor: Pick<User, "id" | "name" | "role"> | null, action: string, detail?: string) {
  const a: Activity = { id: uid(), ts: Date.now(), actorId: actor?.id, actorName: actor?.name || "Unknown", role: actor?.role || "unknown", action, detail };
  sql("INSERT INTO nexkido_activity (id,ts,data) VALUES ($1,$2,$3::jsonb)", [a.id, a.ts, JSON.stringify(a)])
    .then(() => (++logged % 40 === 0 ? sql("DELETE FROM nexkido_activity WHERE id IN (SELECT id FROM nexkido_activity ORDER BY ts DESC OFFSET 600)") : null))
    .catch((e) => console.error("[db] activity log failed", e.message));
}
export async function recentActivity(limit = 150): Promise<Activity[]> {
  return (await sql<{ data: Activity }>("SELECT data FROM nexkido_activity ORDER BY ts DESC LIMIT $1", [limit])).rows.map((r) => r.data);
}

/* ------------------------------ push subscriptions ------------------------------ */

export const savePushSub = (userId: string, s: PushSub) =>
  sql("INSERT INTO nexkido_push (endpoint,user_id,data) VALUES ($1,$2,$3::jsonb) ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, data=EXCLUDED.data", [s.endpoint, userId, JSON.stringify(s)]);
export const removePushSub = (endpoint: string) => sql("DELETE FROM nexkido_push WHERE endpoint = $1", [endpoint]);
export async function pushSubsFor(userId: string): Promise<PushSub[]> {
  return (await sql<{ data: PushSub }>("SELECT data FROM nexkido_push WHERE user_id = $1", [userId])).rows.map((r) => r.data);
}
