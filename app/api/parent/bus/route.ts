import { findUserById } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { alertsFor, busPayload, getTrip } from "@/lib/live";

export const dynamic = "force-dynamic";

/** A snapshot of the parent's bus. Live changes arrive on /api/stream; this is the starting point and the fallback. */
export async function GET() {
  const u = await requireRole("parent");
  if (!u) return Response.json({ error: "Forbidden" }, { status: 403 });
  const driver = u.driverId ? await findUserById(u.driverId) : null;
  const [trip, alerts] = await Promise.all([driver ? getTrip(driver.id) : undefined, alertsFor(u.id)]);
  const live = !!trip?.active && trip.lat != null && trip.lng != null;
  return Response.json({
    child: u.childName, stop: u.stop, busNo: driver?.busNo, driverName: driver?.name, driverPhone: driver?.phone ?? null,
    active: !!trip?.active, startedAt: trip?.startedAt ?? null,
    bus: live ? busPayload(trip!) : null, // ageMs is measured on the server, so the browser's clock never matters
    alerts,
  });
}
