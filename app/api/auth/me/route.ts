import { currentUser, publicUser } from "@/lib/auth";

export async function GET() {
  const u = await currentUser();
  return u ? Response.json({ user: publicUser(u) }) : Response.json({ user: null }, { status: 401 });
}
