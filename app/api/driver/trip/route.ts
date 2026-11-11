import { requireRole } from "@/lib/auth";
import { endTrip, getTrip, ping, reachedIds, roster, startTrip } from "@/lib/live";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireRole("driver");
  if (!u) return Response.json({ error: "Forbidden" }, { status: 403 });
  const [trip, parents] = await Promise.all([getTrip(u.id), roster(u.id)]);
  return Response.json({
    trip: trip ? { active: trip.active, startedAt: trip.startedAt } : null,
    stops: parents.map((p) => ({ id: p.id, child: p.childName, stop: p.stop })),
    reached: reachedIds(trip),
  });
}

// action: start | location | end
export async function POST(req: Request) {
  const u = await requireRole("driver");
  if (!u) return Response.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (b.action === "start") { const t = await startTrip(u); return Response.json({ trip: { active: true, startedAt: t.startedAt } }); }
  if (b.action === "end") { await endTrip(u); return Response.json({ trip: { active: false } }); }
  if (b.action === "location") { const r = await ping(u, b); return Response.json(r.body, { status: r.status }); }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}
