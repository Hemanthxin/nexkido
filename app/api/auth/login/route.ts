import bcrypt from "bcryptjs";
import { db, log } from "@/lib/db";
import { createSession, publicUser } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password, as } = await req.json().catch(() => ({}));
  const id = String(email || "").trim().toLowerCase();
  const u = db().users.find((x) => x.email === id);
  if (!u || !bcrypt.compareSync(String(password || ""), u.passwordHash)) {
    log(null, "Failed sign-in", id.slice(0, 60));
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }
  // Each portal only accepts its own role. The super admin can sign in from any portal.
  if (u.role !== "superadmin" && as && u.role !== as)
    return Response.json({ error: `This account is a ${u.role} account. Use the ${u.role} portal.` }, { status: 403 });
  await createSession(u);
  log(u, "Signed in");
  return Response.json({ user: publicUser(u) });
}
