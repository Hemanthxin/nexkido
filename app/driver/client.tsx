"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shell, LiveMap } from "@/components/Shell";
import BottomSheet from "@/components/BottomSheet";
import NotifyPrompt from "@/components/NotifyPrompt";
import { useToast } from "@/components/Toasts";
import type { Bus, Mode, RouteInfo } from "@/components/LiveMap";
import { useStream } from "@/lib/useStream";
import { systemNotify, useNotifications } from "@/lib/useNotifications";
import { useMedia } from "@/lib/useMedia";
import { haversineKm } from "@/lib/geo";
import { chime } from "@/lib/sound";

type Stop = { id: string; child?: string; stop: { name: string; lat: number; lng: number } };
type Fix = { lat: number; lng: number; accuracy: number; heading: number | null; speed: number | null; at: number };

const SEND_EVERY = 1000; // ms between location updates while the trip is live
const dist = (m: number) => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);

export default function DriverClient({ name, busNo }: { name: string; busNo?: string }) {
  const toast = useToast();
  const notif = useNotifications();
  const wide = useMedia("(min-width: 768px)");
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [reached, setReached] = useState<Set<string>>(new Set());
  const [fix, setFix] = useState<Fix | null>(null);
  const [info, setInfo] = useState<RouteInfo | null>(null);
  const [mode, setMode] = useState<Mode>("overview");
  const [sent, setSent] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [sheetH, setSheetH] = useState(160);
  const [now, setNow] = useState(Date.now());
  const [confirmEnd, setConfirmEnd] = useState(false);
  const activeRef = useRef(false); activeRef.current = active;
  const watch = useRef<number | null>(null);
  const lastSend = useRef(0);
  const wake = useRef<{ release?: () => void } | null>(null);

  const post = useCallback((body: object) => fetch("/api/driver/trip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/driver/trip", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setStops(j.stops || []);
      setReached(new Set(j.reached || []));
      if (j.trip?.active && !activeRef.current) { setActive(true); setMode("follow"); }
    } catch { /* retried on reconnect */ }
  }, []);

  useStream({
    roster: () => void load(),
    reached: (e: { parentId: string; child?: string; stop: string }) => {
      setReached((s) => new Set(s).add(e.parentId));
      toast({ title: "Stop reached", body: `${e.child ?? "Student"} · ${e.stop}`, tone: "ok" });
    },
    notice: (n: { title: string; body: string }) => {
      toast({ title: n.title, body: n.body, tone: "alert" });
      chime();
      if (document.visibilityState === "hidden") void systemNotify(n.title, n.body, "route", "/driver");
    },
  }, load);

  useEffect(() => { void load(); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [load]);

  // One GPS watch for the life of the page: shows the signal before the trip, and feeds the server during it.
  useEffect(() => {
    if (!navigator.geolocation) { setErr("This device can't share its location."); return; }
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        const c: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: p.coords.heading, speed: p.coords.speed, at: Date.now() };
        setFix(c); setErr("");
        if (activeRef.current && c.at - lastSend.current >= SEND_EVERY) {
          lastSend.current = c.at;
          post({ action: "location", lat: c.lat, lng: c.lng, accuracy: c.accuracy, heading: c.heading, speed: c.speed }).then((r) => r.ok && setSent(Date.now())).catch(() => {});
        }
      },
      (e) => setErr(e.code === 1 ? "Location is blocked. Allow location for this site in your browser settings, then reload." : e.code === 2 ? "No GPS signal. Move to an open area." : "Couldn't read the GPS: " + e.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }, // maximumAge 0: never reuse a cached position
    );
    return () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); };
  }, [post]);

  // Keep the screen awake during a trip, and take the lock back when the tab returns to the front.
  useEffect(() => {
    const lock = () => (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release?: () => void }> } }).wakeLock?.request("screen").then((w) => (wake.current = w)).catch(() => {});
    if (active) lock();
    const vis = () => { if (document.visibilityState === "visible" && active) lock(); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); wake.current?.release?.(); wake.current = null; };
  }, [active]);

  // A stop counts as reached within 80 m, without waiting for the server to say so.
  useEffect(() => {
    if (!active || !fix) return;
    for (const s of stops) if (!reached.has(s.id) && haversineKm(fix, s.stop) * 1000 < 80) setReached((r) => new Set(r).add(s.id));
  }, [fix, active, stops, reached]);

  async function start() {
    setErr(""); setStarting(true);
    try {
      const r = await post({ action: "start" });
      if (!r.ok) throw new Error();
      setReached(new Set()); lastSend.current = 0; setSent(null); firstFix.current = fix ? { lat: fix.lat, lng: fix.lng } : firstFix.current;
      setActive(true); setMode("follow"); setOpen(false);
      void load();
    } catch { setErr("Couldn't start the trip. Check your connection and try again."); }
    setStarting(false);
  }
  async function end() {
    if (!confirmEnd) { setConfirmEnd(true); setTimeout(() => setConfirmEnd(false), 4000); return; }
    setConfirmEnd(false);
    await post({ action: "end" }).catch(() => {});
    setActive(false); setSent(null); setInfo(null); setMode("overview");
  }

  const bus: Bus | null = fix ? { lat: fix.lat, lng: fix.lng, heading: fix.heading, speed: fix.speed, accuracy: fix.accuracy, at: fix.at } : null;
  const todo = stops.filter((s) => !reached.has(s.id));
  const next = useMemo(() => {
    if (!todo.length) return null;
    if (!fix) return todo[0];
    return todo.reduce((a, b) => (haversineKm(fix, a.stop) <= haversineKm(fix, b.stop) ? a : b));
  }, [todo, fix]);
  // the whole run, in the order a driver would naturally take it: nearest stop first from where the trip began, then the nearest to that, and so on
  const firstFix = useRef<{ lat: number; lng: number } | null>(null);
  if (fix && !firstFix.current) firstFix.current = { lat: fix.lat, lng: fix.lng };
  const plan = useMemo(() => {
    const left = stops.map((s) => ({ lat: s.stop.lat, lng: s.stop.lng })), out: { lat: number; lng: number }[] = [];
    let at = firstFix.current;
    while (left.length) {
      const i = at ? left.reduce((b, c, k) => (haversineKm(at!, c) < haversineKm(at!, left[b]) ? k : b), 0) : 0;
      at = left[i]; out.push(left.splice(i, 1)[0]);
    }
    return out;
  }, [stops, !!fix]); // eslint-disable-line react-hooks/exhaustive-deps
  const dest = useMemo(() => (next ? { lat: next.stop.lat, lng: next.stop.lng } : null), [next?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const marks = useMemo(() => stops.filter((s) => s.id !== next?.id).map((s, i) => ({ id: s.id, lat: s.stop.lat, lng: s.stop.lng, n: stops.indexOf(s) + 1, done: reached.has(s.id), label: s.child })), [stops, next?.id, reached]);
  const padding = useMemo(() => (wide ? { top: 120, bottom: 60, left: 450, right: 60 } : { top: active ? 150 : 100, bottom: sheetH + 24, left: 16, right: 16 }), [wide, sheetH, active]);

  const q = fix == null ? null : fix.accuracy <= 20 ? "Excellent" : fix.accuracy <= 50 ? "Good" : fix.accuracy <= 150 ? "Weak" : "Poor";
  const good = q === "Excellent" || q === "Good";
  const sentAgo = sent ? Math.round((now - sent) / 1000) : null;
  const kmh = fix?.speed != null && fix.speed > 0.5 ? Math.round(fix.speed * 3.6) : 0;

  return (
    <Shell title="Driver" name={name} bare>
      <div className="relative h-[calc(100dvh-57px)] min-h-[520px] overflow-hidden bg-ink/5">
        <div className="absolute inset-0">
          <LiveMap bus={bus} dest={dest} plan={plan} stops={marks} mode={mode} padding={padding} showAccuracy={!active} onInfo={setInfo} onUserMove={() => setMode("free")} />
        </div>

        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 md:inset-x-6 md:top-5">
          {active ? (
            <div className="pointer-events-auto rounded-2xl bg-ink p-3.5 text-paper shadow-[0_14px_36px_-10px_rgba(0,0,0,.6)] md:max-w-[400px]">
              {next ? (
                <>
                  <div className="flex items-center justify-between text-xs font-semibold text-paper/65"><span>Next stop</span><span>{stops.length - todo.length} of {stops.length} done</span></div>
                  <div className="mt-0.5 flex items-end justify-between gap-3">
                    <div className="min-w-0"><p className="display truncate text-2xl font-extrabold leading-tight">{next.child || "Student"}</p><p className="truncate text-sm text-paper/75">{next.stop.name}</p></div>
                    <div className="shrink-0 text-right"><p className="display text-3xl font-extrabold leading-none text-sun">{info ? dist(info.remainingM) : "—"}</p><p className="text-xs text-paper/65">{info ? `${Math.max(1, Math.round(info.etaS / 60))} min` : "finding route"}</p></div>
                  </div>
                </>
              ) : (
                <><p className="display text-2xl font-extrabold">{stops.length ? "All stops done" : "No stops on this route"}</p><p className="text-sm text-paper/75">{stops.length ? "End the trip when you're finished." : "Your school admin hasn't assigned any students yet."}</p></>
              )}
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="pointer-events-auto rounded-2xl bg-paper px-4 py-2.5 shadow-lg">
                <p className="display text-lg font-extrabold leading-tight md:text-2xl">Good morning, {name.split(" ")[0]}</p>
                <p className="text-xs text-ink/65 md:text-sm">Bus {busNo || "not assigned"} · {stops.length} {stops.length === 1 ? "stop" : "stops"} today</p>
              </div>
              <div className={`pointer-events-auto flex items-center gap-2 rounded-full bg-paper px-3.5 py-2 text-sm font-semibold shadow-lg ${good ? "text-ok" : q ? "text-bad" : ""}`}>
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${good ? "bg-ok" : q ? "bg-bad" : "animate-pulse bg-ink/40"}`} />GPS {q ?? "searching"}
              </div>
            </div>
          )}
        </div>

        <div className="absolute right-3 z-10 flex flex-col gap-2 md:right-6" style={{ bottom: wide ? 24 : sheetH + 14 }}>
          {([["follow", "Follow"], ["overview", "Route"]] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg transition ${mode === m ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-sun"}`}>{label}</button>
          ))}
        </div>

        <BottomSheet open={open} onOpenChange={setOpen} onHeight={setSheetH}
          peek={
            active ? (
              <div className="flex items-center gap-3">
                <div className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-2xl bg-ink/6 text-center"><div><p className="display text-4xl font-extrabold leading-none">{kmh}</p><p className="text-[11px] font-semibold text-ink/55">km/h</p></div></div>
                <button onClick={end} className={`display h-[76px] flex-1 rounded-2xl border-[1.5px] border-ink text-2xl font-extrabold transition active:scale-[.98] ${confirmEnd ? "bg-bad text-white" : "bg-paper text-ink"}`}>{confirmEnd ? "Tap again to end" : "End trip"}</button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {notif.state === "default" && <NotifyPrompt {...notif} what="route changes" />}
                <button onClick={start} disabled={starting || !fix} className="display h-24 w-full rounded-2xl border-[1.5px] border-ink bg-sun text-3xl font-extrabold transition active:scale-[.98] disabled:opacity-60">{starting ? "Starting…" : !fix ? "Waiting for GPS…" : "Start trip"}</button>
                {err && <p role="alert" className="text-sm font-medium text-bad">{err}</p>}
              </div>
            )
          }>
          <div className="space-y-4 pt-3">
            <dl className="grid grid-cols-3 gap-2.5 text-center text-sm">
              <div className="rounded-xl bg-ink/5 p-2"><dt className="text-[11px] text-ink/55">GPS signal</dt><dd className={`font-bold ${good ? "text-ok" : q ? "text-bad" : ""}`}>{q ?? "Searching…"}</dd></div>
              <div className="rounded-xl bg-ink/5 p-2"><dt className="text-[11px] text-ink/55">Accuracy</dt><dd className="font-bold">{fix ? `±${Math.round(fix.accuracy)} m` : "—"}</dd></div>
              <div className="rounded-xl bg-ink/5 p-2"><dt className="text-[11px] text-ink/55">Sent</dt><dd className="font-bold">{active ? (sentAgo != null ? `${sentAgo}s ago` : "—") : "Not live"}</dd></div>
            </dl>
            {active && err && <p role="alert" className="text-sm font-medium text-bad">{err}</p>}
            {fix && fix.accuracy > 50 && <p className="text-sm text-ink/70">The signal is weak, so parents may see the bus slightly off the road. It improves in the open.</p>}
            {notif.state !== "default" && <NotifyPrompt {...notif} what="route changes" />}
            <section>
              <h2 className="text-sm font-bold">Stops ({stops.length})</h2>
              {stops.length === 0 && <p className="py-2 text-sm text-ink/55">No students are assigned to this bus yet.</p>}
              {stops.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 border-t border-ink/10 py-2.5 text-sm">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white ${reached.has(s.id) ? "bg-ok" : next?.id === s.id ? "bg-sun !text-ink" : "bg-ink"}`}>{reached.has(s.id) ? "✓" : i + 1}</span>
                  <span className="min-w-0"><b>{s.child || "Student"}</b> <span className="text-ink/60">{s.stop.name}</span></span>
                </div>
              ))}
            </section>
            <p className="pb-1 text-[11px] text-ink/45">Keep this screen open. Phones may pause GPS when locked.</p>
          </div>
        </BottomSheet>
      </div>
    </Shell>
  );
}
