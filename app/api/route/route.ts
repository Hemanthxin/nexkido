import { currentUser } from "@/lib/auth";
import { getRoute } from "@/lib/routing";

export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();
const point = (s: string | null) => {
  const [lat, lng] = (s ?? "").split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

/** Road route and ETA between two points, for signed-in users only (so it can't be used as an open proxy). */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return Response.json({ error: "Forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const from = point(q.get("from")), to = point(q.get("to"));
  if (!from || !to) return Response.json({ error: "from and to must be lat,lng" }, { status: 400 });
  const now = Date.now(), recent = (hits.get(u.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 30) return Response.json({ error: "Too many route requests" }, { status: 429 });
  hits.set(u.id, [...recent, now]);
  return Response.json(await getRoute(from, to));
}
