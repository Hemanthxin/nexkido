import { currentUser, destroySession } from "@/lib/auth";
import { log } from "@/lib/db";

export async function POST() {
  const u = await currentUser();
  if (u) log(u, "Signed out");
  await destroySession();
  return Response.json({ ok: true });
}
