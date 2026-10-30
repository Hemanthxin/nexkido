import bcrypt from "bcryptjs";
import { withDB, uid, log, ownerOf, User } from "@/lib/db";
import { requireRole, publicUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Everything the super admin watches: all school admins, drivers, parents, live trips and the activity feed. */
export async function GET() {
  const s = await requireRole("superadmin");
  if (!s) return Response.json({ error: "Forbidden" }, { status: 403 });
  return withDB((d) => {
    const admins = d.users.filter((u) => u.role === "admin");
    return Response.json({
      admins: admins.map((a) => ({
        ...publicUser(a),
        drivers: d.users.filter((u) => u.role === "driver" && ownerOf(u) === a.id).length,
        parents: d.users.filter((u) => u.role === "parent" && ownerOf(u) === a.id).length,
      })),
      drivers: d.users.filter((u) => u.role === "driver").map((u) => ({ ...publicUser(u), schoolAdminId: ownerOf(u) })),
      parents: d.users.filter((u) => u.role === "parent").map((u) => ({ ...publicUser(u), schoolAdminId: ownerOf(u) })),
      trips: d.trips,
      activity: [...d.activity].reverse().slice(0, 150),
      alertsToday: d.alerts.filter((a) => Date.now() - a.ts < 864e5).length,
    });
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
  return withDB((d) => {
    if (d.users.some((u) => u.email === email)) return Response.json({ error: "Email already in use" }, { status: 409 });
    const user: User = { id: uid(), role: "admin", name, school, email, passwordHash: bcrypt.hashSync(password, 10), createdBy: s.id, createdAt: Date.now() };
    d.users.push(user);
    log(d, s, "Created school admin", `${name} · ${school}`);
    return Response.json({ user: publicUser(user) }, { status: 201 });
  });
}

export async function DELETE(req: Request) {
  const s = await requireRole("superadmin");
  if (!s) return Response.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  return withDB((d) => {
    const admin = d.users.find((u) => u.id === id && u.role === "admin");
    if (!admin) return Response.json({ error: "Not found" }, { status: 404 });
    const theirs = d.users.filter((u) => (u.role === "driver" || u.role === "parent") && ownerOf(u) === admin.id).map((u) => u.id);
    d.users = d.users.filter((u) => u.id !== admin.id && !theirs.includes(u.id));
    theirs.forEach((t) => delete d.trips[t]);
    log(d, s, "Deleted school admin", `${admin.name} · ${admin.school ?? ""} (and ${theirs.length} accounts)`);
    return Response.json({ ok: true });
  });
}
