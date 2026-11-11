import { currentUser } from "@/lib/auth";
import { removePushSub, savePushSub } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return Response.json({ error: "Forbidden" }, { status: 403 });
  const s = await req.json().catch(() => null);
  if (!s || typeof s.endpoint !== "string" || !/^https:\/\//.test(s.endpoint) || typeof s.keys?.p256dh !== "string" || typeof s.keys?.auth !== "string")
    return Response.json({ error: "Not a push subscription" }, { status: 400 });
  await savePushSub(u.id, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return Response.json({ error: "Forbidden" }, { status: 403 });
  const s = await req.json().catch(() => null);
  if (s && typeof s.endpoint === "string") await removePushSub(s.endpoint);
  return Response.json({ ok: true });
}
