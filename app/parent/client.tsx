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
import { chime } from "@/lib/sound";

type Alert = { id: string; kind: string; message: string; ts: number };
type BusP = { lat: number; lng: number; heading: number | null; speedKmh: number | null; accuracy: number | null; start?: { lat: number; lng: number } | null; ageMs: number };
type Snap = {
  child?: string; stop: { name: string; lat: number; lng: number }; busNo?: string; driverName?: string; driverPhone: string | null;
  active: boolean; startedAt: number | null; depot?: { lat: number; lng: number } | null; bus: BusP | null; alerts: Alert[];
};

const TITLE: Record<string, string> = { started: "Bus has left", "2km": "Bus is 2 km away", "1km": "Bus is 1 km away", arrived: "Bus has arrived", ended: "Trip complete", changed: "Bus changed" };
const toBus = (p: BusP): Bus => ({ lat: p.lat, lng: p.lng, heading: p.heading, speed: p.speedKmh != null ? p.speedKmh / 3.6 : null, accuracy: p.accuracy, start: p.start ?? null, at: Date.now() - p.ageMs });
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dist = (m: number) => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);

export default function ParentClient({ name }: { name: string }) {
  const toast = useToast();
  const notif = useNotifications();
  const wide = useMedia("(min-width: 768px)");
  const [snap, setSnap] = useState<Snap | null>(null);
  const [bus, setBus] = useState<Bus | null>(null);
  const [info, setInfo] = useState<RouteInfo | null>(null);
  const [mode, setMode] = useState<Mode>("overview");
  const [open, setOpen] = useState(false);
  const [sheetH, setSheetH] = useState(150);
  const [now, setNow] = useState(Date.now());
  const seen = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/parent/bus", { cache: "no-store" });
      if (!r.ok) return;
      const j: Snap = await r.json();
      j.alerts.forEach((a) => seen.current.add(a.id));
      setSnap(j);
      setBus(j.bus ? toBus(j.bus) : null);
    } catch { /* the next poll or reconnect catches up */ }
  }, []);

  const { online } = useStream({
    bus: (p: BusP) => setBus(toBus(p)),
    trip: (t: { active: boolean }) => {
      if (t.active) { seen.current.clear(); setSnap((s) => (s ? { ...s, active: true, alerts: [] } : s)); void load(); }
      else { setBus(null); setInfo(null); setSnap((s) => (s ? { ...s, active: false, bus: null } : s)); setMode("overview"); void load(); /* picks up where this run started, so the next one's route can be shown */ }
    },
    alert: (a: Alert) => {
      if (seen.current.has(a.id)) return;
      seen.current.add(a.id);
      setSnap((s) => (s ? { ...s, alerts: [a, ...s.alerts].slice(0, 20) } : s));
      toast({ title: TITLE[a.kind] ?? "NexKido", body: a.message, tone: "alert" });
      chime();
      if (document.visibilityState === "hidden") void systemNotify(TITLE[a.kind] ?? "NexKido", a.message, `${a.kind}-live`, "/parent");
    },
    roster: () => void load(),
  }, load);

  useEffect(() => { void load(); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [load]);
  // Safety net: if the live connection is down, poll.
  useEffect(() => { if (online) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [online, load]);

  const dest = useMemo(() => (snap ? { lat: snap.stop.lat, lng: snap.stop.lng } : null), [snap?.stop.lat, snap?.stop.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const padding = useMemo(() => (wide ? { top: 110, bottom: 50, left: 450, right: 50 } : { top: 100, bottom: sheetH + 24, left: 16, right: 16 }), [wide, sheetH]);

  if (!snap) return <Shell title="Parent" name={name} bare><div className="h-[calc(100dvh-57px)] animate-pulse bg-ink/5" /></Shell>;

  const age = bus ? Math.max(0, Math.round((now - bus.at) / 1000)) : null;
  const stale = snap.active && age != null && age > 15;
  const live = snap.active && !!bus && !stale;
  const etaMin = info ? Math.max(1, Math.round(info.etaS / 60)) : null;
  const here = !!info && info.remainingM < 60;
  const status = !snap.active ? "Hasn't left yet" : !bus ? "Starting up…" : stale ? "Signal lost" : "On the way";
  const km = info ? info.remainingM / 1000 : null;

  return (
    <Shell title="Parent" name={name} bare>
      <div className="relative h-[calc(100dvh-57px)] min-h-[520px] overflow-hidden bg-ink/5">
        <div className="absolute inset-0">
          <LiveMap bus={snap.active ? bus : null} dest={dest} preview={snap.active ? null : snap.depot ?? null} mode={mode} padding={padding} showAccuracy onInfo={setInfo} onUserMove={() => setMode("free")} />
        </div>

        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2 md:inset-x-6 md:top-5">
          <div className="pointer-events-auto min-w-0 rounded-2xl bg-paper px-4 py-2.5 shadow-lg">
            <p className="display truncate text-lg font-extrabold leading-tight md:text-2xl">{snap.child ? `${snap.child}’s bus` : "Your child’s bus"}</p>
            <p className="truncate text-xs text-ink/65 md:text-sm">Bus {snap.busNo || "not assigned"} · {snap.driverName || "no driver yet"}</p>
          </div>
          <div className={`pointer-events-auto flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold shadow-lg ${live ? "bg-ok text-white" : snap.active ? "bg-sun text-ink" : "bg-paper text-ink"}`}>
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${live ? "animate-pulse bg-white" : "bg-ink/40"}`} />{live ? "Live" : status}
          </div>
        </div>

        {stale && <div role="alert" className="absolute inset-x-3 top-[76px] z-10 rounded-xl border border-ink/20 bg-sun px-4 py-2.5 text-sm font-medium shadow-lg md:inset-x-auto md:right-6 md:top-[84px] md:max-w-sm">GPS is stale: the last update was {age}s ago, so this may not be where the bus is now.</div>}
        {!online && <div className="absolute left-1/2 top-[76px] z-10 -translate-x-1/2 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-paper shadow-lg">Reconnecting…</div>}

        <div className="absolute right-3 z-10 flex flex-col gap-2 md:right-6" style={{ bottom: wide ? 24 : sheetH + 14 }}>
          {([["follow", "Follow"], ["overview", "Route"]] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg transition ${mode === m ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-sun"}`}>{label}</button>
          ))}
        </div>

        <BottomSheet open={open} onOpenChange={setOpen} onHeight={setSheetH}
          peek={
            <div className="space-y-3">
              {notif.state === "default" && <NotifyPrompt {...notif} what="bus alerts" />}
              {snap.active && bus ? (
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-ink/55">{here ? "Status" : "Arrives in"}</p>
                    {here ? <p className="display text-4xl font-extrabold leading-none">At your stop</p>
                      : <p className="display text-5xl font-extrabold leading-none">{etaMin ?? "–"}<span className="ml-1 text-xl font-bold">min</span></p>}
                    {etaMin != null && !here && <p className="mt-1 text-xs text-ink/60">About {clock(now + (info?.etaS ?? 0) * 1000)} · {info?.provider === "straight" ? "estimated" : "by road"}</p>}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-5 text-right text-sm">
                    <div><dt className="text-[11px] text-ink/55">Distance</dt><dd className="font-bold">{info ? dist(info.remainingM) : "—"}</dd></div>
                    <div><dt className="text-[11px] text-ink/55">Speed</dt><dd className="font-bold">{bus.speed != null ? `${Math.round(bus.speed * 3.6)} km/h` : "—"}</dd></div>
                  </dl>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-ink/55">Status</p>
                  <p className="display text-3xl font-extrabold leading-tight">{status}</p>
                  <p className="mt-0.5 text-sm text-ink/65">{snap.active ? "Waiting for the first location from the driver." : `You'll get an alert the moment the bus leaves. Drop-off: ${snap.stop.name}.`}</p>
                </div>
              )}
            </div>
          }>
          <div className="space-y-4 pt-3">
            <Rail km={km} active={live} />
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-ink/5 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{snap.driverName || "No driver assigned"}</p>
                <p className="text-xs text-ink/60">Bus {snap.busNo || "—"} · drop-off at {snap.stop.name}</p>
              </div>
              {snap.driverPhone && <a href={`tel:${snap.driverPhone}`} className="btn btn-solid shrink-0 !px-4 !py-2 text-sm">Call</a>}
            </div>
            <section>
              <h2 className="text-sm font-bold">Alerts ({snap.alerts.length})</h2>
              {snap.alerts.length === 0 && <p className="py-2 text-sm text-ink/55">Nothing yet. You&rsquo;ll see alerts here when the trip starts.</p>}
              {snap.alerts.map((a) => <div key={a.id} className="border-t border-ink/10 py-2 text-sm">{a.message}<span className="ml-2 text-xs text-ink/45">{new Date(a.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>)}
            </section>
            {notif.state !== "default" && <NotifyPrompt {...notif} what="bus alerts" />}
            <p className="pb-1 text-[11px] text-ink/45">The bus reaching the stop doesn&rsquo;t confirm your child has left the bus.</p>
          </div>
        </BottomSheet>
      </div>
    </Shell>
  );
}

/** The bus's progress toward home, with the 2 km and 1 km alert points marked on the way. */
function Rail({ km, active }: { km: number | null; active: boolean }) {
  const MAX = 5;
  const pos = km == null ? 0 : Math.min(1, Math.max(0, 1 - km / MAX));
  const marks = [{ at: 1 - 2 / MAX, label: "2 km" }, { at: 1 - 1 / MAX, label: "1 km" }, { at: 1, label: "Home" }];
  return (
    <div className="pb-5 pt-1">
      <div className="relative h-2 rounded-full bg-ink/10">
        <div className="absolute inset-y-0 left-0 rounded-full bg-sun transition-all duration-1000" style={{ width: `${pos * 100}%` }} />
        {marks.map((m) => (
          <div key={m.label} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${m.at * 100}%` }}>
            <span className={`block h-3.5 w-3.5 rounded-full border-[3px] border-ink ${pos >= m.at ? "bg-ink" : "bg-white"}`} />
            <span className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-ink/65">{m.label}</span>
          </div>
        ))}
        {active && km != null && <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-1000" style={{ left: `${pos * 100}%` }}><span className="block h-6 w-6 rounded-full border-4 border-ink bg-sun shadow-[0_0_0_5px_rgba(255,184,28,.35)]" /></div>}
      </div>
    </div>
  );
}
