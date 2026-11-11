import bcrypt from "bcryptjs";
import { alertsSince, findUserById, insertUser, listUsers, log, ownerOf, purgeUsers, recentActivity, uid, type User } from "@/lib/db";
import { requireRole, publicUser } from "@/lib/auth";
import { allTrips, dropTrips, invalidateRoster } from "@/lib/live";

export const dynamic = "force-dynamic";

/** Everything the super admin watches: all school admins, drivers, parents, live trips and the activity feed. */
export async function GET() {
  const s = await requireRole("superadmin");
  if (!s) return Response.json({ error: "Forbidden" }, { status: 403 });
  const [people, activity, alertsToday, all] = await Promise.all([listUsers({ roles: ["admin", "driver", "parent"] }), recentActivity(150), alertsSince(864e5), allTrips()]);
  const admins = people.filter((u) => u.role === "admin"), drivers = people.filter((u) => u.role === "driver"), parents = people.filter((u) => u.role === "parent");
  const trips: Record<string, { active: boolean; lat?: number; lng?: number; heading?: number; updatedAt: number; startedAt: number }> = {};
  for (const d of drivers) { const t = all[d.id]; if (t) trips[d.id] = { active: t.active, lat: t.lat, lng: t.lng, heading: t.heading, updatedAt: t.updatedAt, startedAt: t.startedAt }; }
  return Response.json({
    admins: admins.map((a) => ({ ...publicUser(a), drivers: drivers.filter((u) => ownerOf(u) === a.id).length, parents: parents.filter((u) => ownerOf(u) === a.id).length })),
    drivers: drivers.map((u) => ({ ...publicUser(u), schoolAdminId: ownerOf(u) })),
    parents: parents.map((u) => ({ ...publicUser(u), schoolAdminId: ownerOf(u) })),
    trips, activity, alertsToday,
  });
}

// The super admin creates school admins.
export async function POST(req: Request) {
  const s = await requireRole("superadmin");
  if (!s) return Response.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim(), school = String(b.school || "").trim(), email = String(b.email || "").trim().toLowerCase(), password = String(b.password || "");
  if (!name || !school || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6)
    return Response.json({ error: "Name, school, a valid email and a password of 6+ characters are required" }, { status: 400 });
  const user: User = { id: uid(), role: "admin", name, school, email, passwordHash: bcrypt.hashSync(password, 10), createdBy: s.id, createdAt: Date.now() };
  if ((await insertUser(user)) === "duplicate") return Response.json({ error: "Email already in use" }, { status: 409 });
  log(s, "Created school admin", `${name} · ${school}`);
  return Response.json({ user: publicUser(user) }, { status: 201 });
}

export async function DELETE(req: Request) {
  const s = await requireRole("superadmin");
  if (!s) return Response.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  const admin = id ? await findUserById(id) : null;
  if (!admin || admin.role !== "admin") return Response.json({ error: "Not found" }, { status: 404 });
  const theirs = await listUsers({ roles: ["driver", "parent"], owner: admin.id });
  await purgeUsers([admin.id, ...theirs.map((u) => u.id)]);
  dropTrips(theirs.map((u) => u.id));
  invalidateRoster();
  log(s, "Deleted school admin", `${admin.name} · ${admin.school ?? ""} (and ${theirs.length} accounts)`);
  return Response.json({ ok: true });
}
