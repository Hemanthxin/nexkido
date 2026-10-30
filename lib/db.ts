import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Pool, type PoolClient } from "pg";

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
  lat?: number; lng?: number; accuracy?: number; heading?: number; speed?: number;
  trail?: { lat: number; lng: number }[];
};
export type Alert = { id: string; parentId: string; kind: "started" | "2km" | "1km" | "arrived" | "ended"; message: string; ts: number };
export type Activity = { id: string; ts: number; actorId?: string; actorName: string; role: Role | "unknown"; action: string; detail?: string };
export type DB = { users: User[]; trips: Record<string, Trip>; alerts: Alert[]; activity: Activity[] };

const emptyDB = (): DB => ({ users: [], trips: {}, alerts: [], activity: [] });
const g = globalThis as typeof globalThis & { __nexkidoPool?: Pool; __nexkidoInit?: Promise<void> };
const pool = () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to connect to Neon PostgreSQL");
  return g.__nexkidoPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: { rejectUnauthorized: true } });
};

export const SUPER_USER = (process.env.SUPERADMIN_USER || "nexkido").toLowerCase();

async function loadState(client: Pool | PoolClient): Promise<DB> {
  const users = await client.query<{ data: User }>("SELECT data FROM nexkido_users ORDER BY id");
  const trips = await client.query<{ driver_id: string; data: Trip }>("SELECT driver_id, data FROM nexkido_trips");
  const alerts = await client.query<{ data: Alert }>("SELECT data FROM nexkido_alerts ORDER BY ts");
  const activity = await client.query<{ data: Activity }>("SELECT data FROM nexkido_activity ORDER BY ts");
  return {
    users: users.rows.map((r) => r.data),
    trips: Object.fromEntries(trips.rows.map((r) => [r.driver_id, r.data])),
    alerts: alerts.rows.map((r) => r.data),
    activity: activity.rows.map((r) => r.data),
  };
}

async function storeState(client: PoolClient, d: DB) {
  await client.query("DELETE FROM nexkido_users");
  await client.query("DELETE FROM nexkido_trips");
  await client.query("DELETE FROM nexkido_alerts");
  await client.query("DELETE FROM nexkido_activity");
  for (const user of d.users) await client.query(
    "INSERT INTO nexkido_users (id, email, role, data) VALUES ($1, $2, $3, $4::jsonb)",
    [user.id, user.email.toLowerCase(), user.role, JSON.stringify(user)],
  );
  for (const [driverId, trip] of Object.entries(d.trips)) await client.query(
    "INSERT INTO nexkido_trips (driver_id, data) VALUES ($1, $2::jsonb)", [driverId, JSON.stringify(trip)],
  );
  for (const alert of d.alerts) await client.query(
    "INSERT INTO nexkido_alerts (id, parent_id, ts, data) VALUES ($1, $2, $3, $4::jsonb)",
    [alert.id, alert.parentId, alert.ts, JSON.stringify(alert)],
  );
  for (const item of d.activity) await client.query(
    "INSERT INTO nexkido_activity (id, ts, data) VALUES ($1, $2, $3::jsonb)",
    [item.id, item.ts, JSON.stringify(item)],
  );
}

async function migrateLocalJSON(client: PoolClient, d: DB) {
  const file = path.join(process.cwd(), "data", "db.json");
  try {
    const legacy = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<DB>;
    if (Array.isArray(legacy.users)) d.users = legacy.users;
    if (legacy.trips && typeof legacy.trips === "object") d.trips = legacy.trips;
    if (Array.isArray(legacy.alerts)) d.alerts = legacy.alerts;
    if (Array.isArray(legacy.activity)) d.activity = legacy.activity;
    if (d.users.length || Object.keys(d.trips).length || d.alerts.length || d.activity.length) {
      await storeState(client, d);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function addDefaultUsers(d: DB) {
  if (!d.users.some((u) => u.role === "superadmin")) d.users.push({
    id: "super-1", role: "superadmin", name: "NexKido Super Admin", email: SUPER_USER,
    passwordHash: bcrypt.hashSync(process.env.SUPERADMIN_PASSWORD || "nexkido123", 10), createdAt: Date.now(),
  });
  if (!d.users.some((u) => u.role === "admin")) d.users.push({
    id: "admin-1", role: "admin", name: "School Admin", school: "Demo School", createdBy: "super-1",
    email: (process.env.ADMIN_EMAIL || "admin@schoolride.local").toLowerCase(),
    passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || "admin123", 10), createdAt: Date.now(),
  });
  const legacyAdmin = d.users.find((u) => u.role === "admin" && !u.school);
  if (legacyAdmin) { legacyAdmin.school = "Demo School"; legacyAdmin.createdBy ||= "super-1"; }
  d.activity ||= [];
}

async function initialize() {
  const p = pool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS nexkido_users (
      id text PRIMARY KEY, email text NOT NULL UNIQUE, role text NOT NULL,
      data jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nexkido_trips (
      driver_id text PRIMARY KEY, data jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nexkido_alerts (
      id text PRIMARY KEY, parent_id text NOT NULL, ts bigint NOT NULL, data jsonb NOT NULL
    );
    CREATE INDEX IF NOT EXISTS nexkido_alerts_parent_ts ON nexkido_alerts(parent_id, ts DESC);
    CREATE TABLE IF NOT EXISTS nexkido_activity (
      id text PRIMARY KEY, ts bigint NOT NULL, data jsonb NOT NULL
    );
  `);
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(76194021)");
    const d = await loadState(client);
    if (!d.users.length && !Object.keys(d.trips).length && !d.alerts.length && !d.activity.length) await migrateLocalJSON(client, d);
    const before = JSON.stringify(d);
    addDefaultUsers(d);
    if (JSON.stringify(d) !== before) await storeState(client, d);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function ensureReady() {
  if (!g.__nexkidoInit) g.__nexkidoInit = initialize().catch((error) => { g.__nexkidoInit = undefined; throw error; });
  await g.__nexkidoInit;
}

/** Run an atomic read/update against the shared application state in PostgreSQL. */
export async function withDB<T>(work: (d: DB) => T | Promise<T>): Promise<T> {
  await ensureReady();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(76194021)");
    const d = await loadState(client);
    const snapshot = JSON.stringify(d);
    const result = await work(d);
    if (JSON.stringify(d) !== snapshot) await storeState(client, d);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function findUserById(id: string) {
  await ensureReady();
  const result = await pool().query<{ data: User }>("SELECT data FROM nexkido_users WHERE id = $1", [id]);
  return result.rows[0]?.data ?? null;
}

export async function findUserByEmail(email: string) {
  await ensureReady();
  const result = await pool().query<{ data: User }>("SELECT data FROM nexkido_users WHERE email = $1", [email.toLowerCase()]);
  return result.rows[0]?.data ?? null;
}

export const uid = () => Math.random().toString(36).slice(2, 10);
export const ownerOf = (u: User) => u.createdBy || "admin-1";

/** Record an event in the current transaction. Location pings are not logged. */
export function log(d: DB, actor: Pick<User, "id" | "name" | "role"> | null, action: string, detail?: string) {
  d.activity.push({ id: uid(), ts: Date.now(), actorId: actor?.id, actorName: actor?.name || "Unknown", role: actor?.role || "unknown", action, detail });
  if (d.activity.length > 600) d.activity.splice(0, d.activity.length - 600);
}
