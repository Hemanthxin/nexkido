import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

export type Role = "superadmin" | "admin" | "driver" | "parent";
export type User = {
  id: string; role: Role; name: string; email: string; phone?: string; passwordHash: string;
  school?: string;        // admin: the school they run
  createdBy?: string;     // driver/parent: the school admin who created them; admin: the super admin
  // driver
  busNo?: string;
  // parent
  childName?: string; driverId?: string;
  stop?: { name: string; lat: number; lng: number };
  createdAt: number;
};
export type Trip = {
  driverId: string; active: boolean; startedAt: number; updatedAt: number;
  lat?: number; lng?: number; accuracy?: number; heading?: number; speed?: number; // speed in m/s
  trail?: { lat: number; lng: number }[];
};
export type Alert = { id: string; parentId: string; kind: "started" | "2km" | "1km" | "arrived" | "ended"; message: string; ts: number };
export type Activity = { id: string; ts: number; actorId?: string; actorName: string; role: Role | "unknown"; action: string; detail?: string };
type DB = { users: User[]; trips: Record<string, Trip>; alerts: Alert[]; activity: Activity[] };

const FILE = path.join(process.cwd(), "data", "db.json");
const g = globalThis as unknown as { __db?: DB };

export const SUPER_USER = (process.env.SUPERADMIN_USER || "nexkido").toLowerCase();

function load(): DB {
  let db: DB;
  if (g.__db) db = g.__db;
  else { try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { db = { users: [], trips: {}, alerts: [], activity: [] }; } }
  db.activity ||= [];
  const had = db.users.length;
  if (!db.users.some((u) => u.role === "superadmin")) {
    db.users.push({
      id: "super-1", role: "superadmin", name: "NexKido Super Admin", email: SUPER_USER,
      passwordHash: bcrypt.hashSync(process.env.SUPERADMIN_PASSWORD || "nexkido123", 10), createdAt: Date.now(),
    });
  }
  if (!db.users.some((u) => u.role === "admin")) {
    db.users.push({
      id: "admin-1", role: "admin", name: "School Admin", school: "Demo School", createdBy: "super-1",
      email: (process.env.ADMIN_EMAIL || "admin@schoolride.local").toLowerCase(),
      passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || "admin123", 10), createdAt: Date.now(),
    });
  }
  const legacy = db.users.find((u) => u.role === "admin" && !u.school);
  if (legacy) { legacy.school = "Demo School"; legacy.createdBy ||= "super-1"; }
  if (g.__db !== db) { g.__db = db; save(); }
  else if (db.users.length !== had || legacy) save();
  return db;
}
export function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(g.__db, null, 2));
}
export const db = () => load();
export const uid = () => Math.random().toString(36).slice(2, 10);

/** The school admin a driver or parent belongs to. Accounts made before schools existed belong to the first admin. */
export const ownerOf = (u: User) => u.createdBy || "admin-1";

/** Record something that happened, for the super admin's activity feed. Location pings are not logged. */
export function log(actor: Pick<User, "id" | "name" | "role"> | null, action: string, detail?: string) {
  const d = load();
  d.activity.push({ id: uid(), ts: Date.now(), actorId: actor?.id, actorName: actor?.name || "Unknown", role: actor?.role || "unknown", action, detail });
  if (d.activity.length > 600) d.activity.splice(0, d.activity.length - 600);
  save();
}
