import { currentUser, destroySession } from "@/lib/auth";
import { log, withDB } from "@/lib/db";

export async function POST() {
  const u = await currentUser();
  if (u) await withDB((d) => log(d, u, "Signed out"));
  await destroySession();
  return Response.json({ ok: true });
}
