import { withDB, uid, log, Alert } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { haversineKm } from "@/lib/geo";

const THRESHOLDS: { km: number; kind: "2km" | "1km"; text: string }[] = [
  { km: 2, kind: "2km", text: "Your child's bus is approaching (about 2 km away)." },
  { km: 1, kind: "1km", text: "Your child's bus is approximately 1 km away. Please get ready." },
];

export async function GET() {
  const u = await requireRole("driver");
  if (!u) return Response.json({ error: "Forbidden" }, { status: 403 });
  return withDB((d) => Response.json({
    trip: d.trips[u.id] ?? null,
    stops: d.users.filter((p) => p.role === "parent" && p.driverId === u.id).map((p) => ({ id: p.id, child: p.childName, stop: p.stop })),
  }));
}

// action: start | location | end
export async function POST(req: Request) {
  const u = await requireRole("driver");
  if (!u) return Response.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  return withDB((d) => {
  const parents = d.users.filter((p) => p.role === "parent" && p.driverId === u.id && p.stop);
  const notify = (parentId: string, kind: Alert["kind"], message: string) => {
    d.alerts.push({ id: uid(), parentId, kind, message, ts: Date.now() });
    if (kind === "2km" || kind === "1km" || kind === "arrived") {
      const p = d.users.find((x) => x.id === parentId);
      log(d, u, `Alert sent: ${kind === "arrived" ? "arrived" : kind}`, `to ${p?.name ?? "parent"} (${p?.childName ?? "child"})`);
    }
  };

  if (b.action === "start") {
    d.trips[u.id] = { driverId: u.id, active: true, startedAt: Date.now(), updatedAt: Date.now(), trail: [] };
    d.alerts = d.alerts.filter((a) => !parents.some((p) => p.id === a.parentId)); // new trip -> fresh alert state
    parents.forEach((p) => notify(p.id, "started", "Your child's bus has started its journey."));
    log(d, u, "Started trip", `bus ${u.busNo ?? "-"}, ${parents.length} stops`);
  } else if (b.action === "location") {
    const t = d.trips[u.id];
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!t?.active) return Response.json({ error: "No active trip" }, { status: 409 });
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      return Response.json({ error: "Invalid coordinates" }, { status: 400 });
    const acc = Number(b.accuracy) || undefined;
    if (acc && acc > 150) return Response.json({ ok: false, skipped: "poor accuracy" }); // ignore wildly inaccurate fixes
    const prev = t.lat != null && t.lng != null ? { lat: t.lat, lng: t.lng } : null;
    const moved = prev ? haversineKm(prev, { lat, lng }) * 1000 : 0;
    const heading = Number.isFinite(Number(b.heading)) && b.heading !== null ? Number(b.heading) : (prev && moved > 3 ? (Math.atan2(lng - prev.lng, lat - prev.lat) * 180) / Math.PI : t.heading);
    const speed = Number.isFinite(Number(b.speed)) && b.speed !== null ? Number(b.speed) : undefined;
    t.trail = t.trail || [];
    if (!prev || moved > 6) { t.trail.push({ lat, lng }); if (t.trail.length > 80) t.trail.shift(); }
    Object.assign(t, { lat, lng, accuracy: acc, heading, speed, updatedAt: Date.now() });
    // Geofence engine, deduplicated per trip/threshold via existing alert kinds.
    for (const p of parents) {
      const km = haversineKm({ lat, lng }, p.stop!);
      const sent = (k: string) => d.alerts.some((a) => a.parentId === p.id && a.kind === k);
      if (km <= 0.1) {
        if (!sent("arrived")) notify(p.id, "arrived", "The bus has reached the designated drop-off point.");
      } else for (const th of THRESHOLDS) if (km <= th.km && !sent(th.kind)) notify(p.id, th.kind, th.text);
    }
  } else if (b.action === "end") {
    if (d.trips[u.id]) d.trips[u.id].active = false;
    parents.forEach((p) => notify(p.id, "ended", "Today's bus trip is marked complete."));
    log(d, u, "Ended trip", `bus ${u.busNo ?? "-"}`);
  } else return Response.json({ error: "Unknown action" }, { status: 400 });
  return Response.json({ trip: d.trips[u.id] });
  });
}
