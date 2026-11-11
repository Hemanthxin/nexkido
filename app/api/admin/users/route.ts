import bcrypt from "bcryptjs";
import { findUserById, insertUser, listUsers, log, ownerOf, purgeUsers, saveUser, uid, type User } from "@/lib/db";
import { requireRole, publicUser } from "@/lib/auth";
import { allTrips, dropTrips, invalidateRoster, parentMoved } from "@/lib/live";
import { moveParents, ownDriver, parentsOf } from "@/lib/admin";

const EMAIL = /^\S+@\S+\.\S+$/;
const validStop = (s: { lat?: unknown; lng?: unknown } | undefined) => {
  const lat = Number(s?.lat), lng = Number(s?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};
const mine = async (admin: User, id: string | null) => {
  const u = id ? await findUserById(id) : null;
  return u && (u.role === "driver" || u.role === "parent") && ownerOf(u) === admin.id ? u : null;
};

// A school admin only ever sees and manages the drivers and parents they created.
export async function GET() {
  const a = await requireRole("admin");
  if (!a) return Response.json({ error: "Forbidden" }, { status: 403 });
  const [users, all] = await Promise.all([listUsers({ roles: ["driver", "parent"], owner: a.id }), allTrips()]);
  const trips: Record<string, { active: boolean; lat?: number; lng?: number; heading?: number; updatedAt: number }> = {};
  for (const u of users) { const t = all[u.id]; if (t) trips[u.id] = { active: t.active, lat: t.lat, lng: t.lng, heading: t.heading, updatedAt: t.updatedAt }; }
  return Response.json({ users: users.map(publicUser), trips, school: a.school });
}

// Only school admins create drivers and parents.
export async function POST(req: Request) {
  const a = await requireRole("admin");
  if (!a) return Response.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const role = b.role;
  if (role !== "driver" && role !== "parent") return Response.json({ error: "Role must be driver or parent" }, { status: 400 });
  const name = String(b.name || "").trim(), email = String(b.email || "").trim().toLowerCase(), password = String(b.password || "");
  if (!name || !EMAIL.test(email) || password.length < 6)
    return Response.json({ error: "Name, valid email and a password of 6+ chars are required" }, { status: 400 });

  const user: User = { id: uid(), role, name, email, phone: b.phone ? String(b.phone).trim() : undefined, passwordHash: bcrypt.hashSync(password, 10), createdBy: a.id, createdAt: Date.now() };
  let driver: User | null = null;
  if (role === "driver") user.busNo = String(b.busNo || "").trim() || undefined;
  else {
    const pos = validStop(b.stop);
    if (!pos) return Response.json({ error: "A valid home stop location is required for parents" }, { status: 400 });
    driver = await ownDriver(a, b.driverId);
    if (!driver) return Response.json({ error: "Assign the parent to one of your drivers" }, { status: 400 });
    user.childName = String(b.childName || "").trim() || undefined;
    user.driverId = driver.id;
    user.stop = { name: String(b.stop?.name || "Home").trim() || "Home", ...pos };
  }
  if ((await insertUser(user)) === "duplicate") return Response.json({ error: "Email already in use" }, { status: 409 });
  log(a, `Created ${role} account`, `${name}${user.busNo ? ` (bus ${user.busNo})` : ""}`);
  if (role === "parent") await parentMoved(user, null, driver);
  return Response.json({ user: publicUser(user) }, { status: 201 });
}

// Edit a driver or parent, including moving a parent to a different driver.
export async function PATCH(req: Request) {
  const a = await requireRole("admin");
  if (!a) return Response.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const t = await mine(a, typeof b.id === "string" ? b.id : null);
  if (!t) return Response.json({ error: "Not found" }, { status: 404 });
  const next: User = { ...t };

  if (b.name !== undefined) { next.name = String(b.name).trim(); if (!next.name) return Response.json({ error: "Name can't be empty" }, { status: 400 }); }
  if (b.email !== undefined) { next.email = String(b.email).trim().toLowerCase(); if (!EMAIL.test(next.email)) return Response.json({ error: "Enter a valid email" }, { status: 400 }); }
  if (b.phone !== undefined) next.phone = String(b.phone).trim() || undefined;
  if (b.password) { if (String(b.password).length < 6) return Response.json({ error: "The new password needs 6 or more characters" }, { status: 400 }); next.passwordHash = bcrypt.hashSync(String(b.password), 10); }
  let from: User | null = null, to: User | null = null;
  if (t.role === "driver" && b.busNo !== undefined) next.busNo = String(b.busNo).trim() || undefined;
  if (t.role === "parent") {
    if (b.childName !== undefined) next.childName = String(b.childName).trim() || undefined;
    if (b.stop !== undefined) {
      const pos = validStop(b.stop);
      if (!pos) return Response.json({ error: "Pin the home stop on the map" }, { status: 400 });
      next.stop = { name: String(b.stop?.name || next.stop?.name || "Home").trim() || "Home", ...pos };
    }
    from = t.driverId ? await findUserById(t.driverId) : null;
    to = from;
    if (b.driverId !== undefined && b.driverId !== t.driverId) {
      to = await ownDriver(a, b.driverId);
      if (!to) return Response.json({ error: "Choose one of your drivers" }, { status: 400 });
      next.driverId = to.id;
    }
  }
  const r = await saveUser(next);
  if (r === "duplicate") return Response.json({ error: "That email is already in use" }, { status: 409 });
  if (r === "missing") return Response.json({ error: "Not found" }, { status: 404 });
  log(a, `Edited ${t.role}`, `${next.name}${to && to.id !== from?.id ? ` → bus ${to.busNo ?? "-"} (${to.name})` : ""}`);
  if (t.role === "parent") await parentMoved(next, from, to);
  return Response.json({ user: publicUser(next) });
}

export async function DELETE(req: Request) {
  const a = await requireRole("admin");
  if (!a) return Response.json({ error: "Forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const t = await mine(a, q.get("id"));
  if (!t) return Response.json({ error: "Not found" }, { status: 404 });
  const gone = [t.id];
  if (t.role === "driver") {
    const parents = await parentsOf(t.id);
    if (parents.length) {
      const moveTo = q.get("moveTo");
      if (moveTo) {
        const to = await ownDriver(a, moveTo);
        if (!to || to.id === t.id) return Response.json({ error: "Choose another of your drivers" }, { status: 400 });
        await moveParents(a, parents, to);
      } else if (q.get("cascade") === "1") gone.push(...parents.map((p) => p.id));
      else return Response.json({ error: `This driver has ${parents.length} ${parents.length === 1 ? "stop" : "stops"}. Move them to another driver, or delete them too.`, stops: parents.length }, { status: 409 });
    }
  }
  await purgeUsers(gone);
  dropTrips(gone);
  invalidateRoster();
  log(a, `Deleted ${t.role} account`, t.name);
  return Response.json({ ok: true });
}
