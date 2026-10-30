"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shell, Map } from "@/components/Shell";

type Stop = { id: string; child?: string; stop?: { name: string; lat: number; lng: number } };
type Fix = { lat: number; lng: number; accuracy: number; heading: number | null; speed: number | null };

const SEND_EVERY = 1500; // ms between location updates while the trip is live

export default function DriverClient({ name, busNo }: { name: string; busNo?: string }) {
  const [active, setActive] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [fix, setFix] = useState<Fix | null>(null);
  const [trail, setTrail] = useState<{ lat: number; lng: number }[]>([]);
  const [sent, setSent] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Date.now());
  const watch = useRef<number | null>(null);
  const last = useRef(0);
  const prev = useRef<{ lat: number; lng: number } | null>(null);
  const wake = useRef<{ release?: () => void } | null>(null);

  useEffect(() => {
    fetch("/api/driver/trip").then((r) => r.json()).then((j) => { setStops(j.stops || []); setActive(!!j.trip?.active); });
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(c);
  }, []);

  const send = useCallback((body: object) =>
    fetch("/api/driver/trip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), []);

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) return setErr("This device can't share its location.");
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        const c: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: p.coords.heading, speed: p.coords.speed };
        setFix(c); setErr("");
        const pv = prev.current;
        if (!pv || Math.hypot((c.lat - pv.lat) * 111000, (c.lng - pv.lng) * 111000 * Math.cos((c.lat * Math.PI) / 180)) > 6) {
          prev.current = { lat: c.lat, lng: c.lng };
          setTrail((t) => [...t.slice(-60), { lat: c.lat, lng: c.lng }]);
        }
        if (Date.now() - last.current >= SEND_EVERY) {
          last.current = Date.now();
          send({ action: "location", lat: c.lat, lng: c.lng, accuracy: c.accuracy, heading: c.heading, speed: c.speed })
            .then((r) => r.ok && setSent(Date.now())).catch(() => {});
        }
      },
      (e) => setErr(e.code === 1 ? "Location is blocked. Allow location for this site in your browser settings, then start the trip again." : e.code === 2 ? "No GPS signal. Move to an open area." : "Couldn't read the GPS: " + e.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }, // maximumAge 0: never reuse a cached position
    );
    (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release?: () => void }> } }).wakeLock?.request("screen").then((w) => (wake.current = w)).catch(() => {});
  }, [send]);
  const stopWatch = useCallback(() => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null; wake.current?.release?.(); wake.current = null;
  }, []);

  // Resume sharing if the page reloads mid-trip, and re-grab the screen lock when the tab comes back to the front.
  useEffect(() => { if (active && watch.current == null) startWatch(); return () => { if (!active) stopWatch(); }; }, [active, startWatch, stopWatch]);
  useEffect(() => {
    const vis = () => { if (document.visibilityState === "visible" && active) (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release?: () => void }> } }).wakeLock?.request("screen").then((w) => (wake.current = w)).catch(() => {}); };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [active]);
  useEffect(() => () => stopWatch(), [stopWatch]);

  async function toggle() {
    setErr("");
    if (!active) { setTrail([]); prev.current = null; await send({ action: "start" }); setActive(true); }
    else { stopWatch(); await send({ action: "end" }); setActive(false); setFix(null); setSent(null); }
  }

  const markers = useMemo(() => [
    ...stops.filter((s) => s.stop).map((s) => ({ id: s.id, lat: s.stop!.lat, lng: s.stop!.lng, label: s.child })),
    ...(fix ? [{ id: "bus", lat: fix.lat, lng: fix.lng, emoji: "bus", heading: fix.heading }] : []),
  ], [stops, fix]);

  const q = fix == null ? null : fix.accuracy <= 20 ? "Excellent" : fix.accuracy <= 50 ? "Good" : fix.accuracy <= 150 ? "Weak" : "Poor";
  const sentAgo = sent ? Math.round((now - sent) / 1000) : null;

  return (
    <Shell title="Driver" name={name} bare>
      <div className="relative h-[calc(100svh-57px)] min-h-[560px] overflow-hidden">
        <div className="absolute inset-0"><Map height={9999} fill markers={markers} follow trail={trail} accuracy={fix ? { lat: fix.lat, lng: fix.lng, m: fix.accuracy } : null} locate={!active} /></div>

        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2 md:inset-x-6 md:top-5">
          <div className="pointer-events-auto rounded-2xl bg-paper px-4 py-3 shadow-lg">
            <p className="display text-xl font-extrabold leading-tight md:text-2xl">Good morning, {name.split(" ")[0]}</p>
            <p className="text-xs text-ink/65 md:text-sm">Bus {busNo || "not assigned"} · {stops.length} {stops.length === 1 ? "stop" : "stops"} today</p>
          </div>
          <div className={`pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${active ? "bg-ok text-white" : "bg-paper text-ink"}`}>
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${active ? "animate-pulse bg-white" : "bg-ink/40"}`} />{active ? "Live" : "Not started"}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 p-3 md:inset-x-auto md:bottom-6 md:left-6 md:w-[400px] md:p-0">
          <div className="rounded-3xl bg-paper p-4 shadow-[0_20px_60px_-10px_rgba(10,16,24,.5)] md:p-5">
            <button onClick={toggle} className={`display h-24 w-full rounded-2xl border-[1.5px] border-ink text-3xl font-extrabold transition active:scale-[.98] md:h-28 ${active ? "bg-bad text-white" : "bg-sun text-ink"}`}>{active ? "End trip" : "Start trip"}</button>
            {active && (
              <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-xl bg-ink/5 p-2"><dt className="text-[11px] text-ink/55">GPS signal</dt><dd className={`font-bold ${q === "Excellent" || q === "Good" ? "text-ok" : q ? "text-bad" : ""}`}>{q ?? "Searching…"}</dd></div>
                <div className="rounded-xl bg-ink/5 p-2"><dt className="text-[11px] text-ink/55">Accuracy</dt><dd className="font-bold">{fix ? `±${Math.round(fix.accuracy)} m` : "—"}</dd></div>
                <div className="rounded-xl bg-ink/5 p-2"><dt className="text-[11px] text-ink/55">Sent</dt><dd className="font-bold">{sentAgo != null ? `${sentAgo}s ago` : "—"}</dd></div>
              </dl>
            )}
            {err && <p role="alert" className="mt-3 text-sm font-medium text-bad">{err}</p>}
            {active && fix && fix.accuracy > 50 && !err && <p className="mt-3 text-sm text-ink/70">The signal is weak, so parents may see the bus slightly off the road. It improves in the open.</p>}
            <p className="mt-3 text-[11px] text-ink/50">Keep this screen open. Phones may pause GPS when locked.</p>
            <details className="mt-3 border-t border-ink/10 pt-3">
              <summary className="cursor-pointer text-sm font-semibold">Stops ({stops.length})</summary>
              {stops.length === 0 && <p className="py-2 text-sm text-ink/55">No students are assigned to this bus yet.</p>}
              {stops.map((s, i) => <div key={s.id} className="flex items-baseline gap-3 border-t border-ink/10 py-2 text-sm"><span className="display w-5 font-extrabold text-ink/40">{i + 1}</span><span><b>{s.child || "Student"}</b> <span className="text-ink/60">{s.stop?.name}</span></span></div>)}
            </details>
          </div>
        </div>
      </div>
    </Shell>
  );
}
