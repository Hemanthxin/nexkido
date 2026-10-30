import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db, Role, User } from "./db";

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");
const COOKIE = "sr_session";

export async function createSession(user: User) {
  const token = await new SignJWT({ role: user.role }).setSubject(user.id).setExpirationTime("7d").setProtectedHeader({ alg: "HS256" }).sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7, secure: process.env.NODE_ENV === "production" });
}
export async function destroySession() { (await cookies()).delete(COOKIE); }

export async function currentUser(): Promise<User | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret());
    return db().users.find((u) => u.id === payload.sub) ?? null;
  } catch { return null; }
}
/** Server-side role guard for API routes. */
export async function requireRole(role: Role) {
  const u = await currentUser();
  return u && u.role === role ? u : null;
}
export const publicUser = ({ passwordHash, ...rest }: User) => rest;
