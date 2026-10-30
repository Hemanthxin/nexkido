import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { haversineKm, etaMinutes } from "@/lib/geo";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireRole("parent");
  if (!u) return Response.json({ error: "Forbidden" }, { status: 403 });
  const d = db();
  const driver = d.users.find((x) => x.id === u.driverId);
  const trip = u.driverId ? d.trips[u.driverId] : undefined;
  const has = !!trip?.active && trip.lat != null;
  const km = has ? haversineKm({ lat: trip!.lat!, lng: trip!.lng! }, u.stop!) : null;
  const age = trip ? Date.now() - trip.updatedAt : null;
  return Response.json({
    child: u.childName, stop: u.stop, busNo: driver?.busNo, driverName: driver?.name,
    active: !!trip?.active,
    bus: has ? { lat: trip!.lat, lng: trip!.lng, updatedAt: trip!.updatedAt, heading: trip!.heading ?? null, speedKmh: trip!.speed != null ? Math.round(trip!.speed * 3.6) : null, accuracy: trip!.accuracy ?? null } : null,
    trail: has ? trip!.trail ?? [] : [],
    stale: age != null && trip?.active ? age > 15_000 : false, // explicit stale-GPS warning
    distanceKm: km, etaMin: km != null ? etaMinutes(km, trip!.speed != null && trip!.speed * 3.6 >= 8 ? trip!.speed * 3.6 : 25) : null,
    alerts: d.alerts.filter((a) => a.parentId === u.id).sort((a, b) => b.ts - a.ts).slice(0, 20),
  });
}
