import bcrypt from "bcryptjs";
import { withDB, uid, log, ownerOf, User } from "@/lib/db";
import { requireRole, publicUser } from "@/lib/auth";

// A school admin only ever sees and manages the drivers and parents they created.
const mine = (a: User) => (u: User) => (u.role === "driver" || u.role === "parent") && ownerOf(u) === a.id;

export async function GET() {
  const a = await requireRole("admin");
  if (!a) return Response.json({ error: "Forbidden" }, { status: 403 });
  return withDB((d) => {
    const users = d.users.filter(mine(a));
    const trips: typeof d.trips = {};
    users.forEach((u) => { if (d.trips[u.id]) trips[u.id] = d.trips[u.id]; });
    return Response.json({ users: users.map(publicUser), trips, school: a.school });
  });
}

// Only school admins create drivers and parents.
export async function POST(req: Request) {
  const a = await requireRole("admin");
  if (!a) return Response.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const role = b.role;
  if (role !== "driver" && role !== "parent") return Response.json({ error: "Role must be driver or parent" }, { status: 400 });
  const name = String(b.name || "").trim(), email = String(b.email || "").trim().toLowerCase(), password = String(b.password || "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6)
    return Response.json({ error: "Name, valid email and a password of 6+ chars are required" }, { status: 400 });
  return withDB((d) => {
    if (d.users.some((u) => u.email === email)) return Response.json({ error: "Email already in use" }, { status: 409 });
    const user: User = { id: uid(), role, name, email, phone: b.phone ? String(b.phone) : undefined, passwordHash: bcrypt.hashSync(password, 10), createdBy: a.id, createdAt: Date.now() };
    if (role === "driver") user.busNo = String(b.busNo || "").trim() || undefined;
    else {
      const lat = Number(b.stop?.lat), lng = Number(b.stop?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
        return Response.json({ error: "A valid home stop location is required for parents" }, { status: 400 });
      if (!d.users.some((u) => u.id === b.driverId && u.role === "driver" && ownerOf(u) === a.id))
        return Response.json({ error: "Assign the parent to one of your drivers" }, { status: 400 });
      user.childName = String(b.childName || "").trim() || undefined;
      user.driverId = b.driverId;
      user.stop = { name: String(b.stop?.name || "Home").trim() || "Home", lat, lng };
    }
    d.users.push(user);
    log(d, a, `Created ${role} account`, `${name}${user.busNo ? ` (bus ${user.busNo})` : ""}`);
    return Response.json({ user: publicUser(user) }, { status: 201 });
  });
}

export async function DELETE(req: Request) {
  const a = await requireRole("admin");
  if (!a) return Response.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  return withDB((d) => {
    const target = d.users.find((u) => u.id === id && mine(a)(u));
    if (!target) return Response.json({ error: "Not found" }, { status: 404 });
    d.users = d.users.filter((u) => u.id !== target.id && !(u.role === "parent" && u.driverId === target.id));
    delete d.trips[target.id];
    log(d, a, `Deleted ${target.role} account`, target.name);
    return Response.json({ ok: true });
  });
}
