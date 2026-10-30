"use client";
import { useEffect, useMemo, useState } from "react";
import { Shell, Map } from "@/components/Shell";

type Data = {
  child?: string; stop: { name: string; lat: number; lng: number }; busNo?: string; driverName?: string;
  active: boolean; stale: boolean; distanceKm: number | null; etaMin: number | null;
  bus: { lat: number; lng: number; updatedAt: number; heading: number | null; speedKmh: number | null; accuracy: number | null } | null;
  trail: { lat: number; lng: number }[];
  alerts: { id: string; kind: string; message: string; ts: number }[];
};

export default function ParentClient({ name }: { name: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let seen = new Set<string>(), first = true, stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/parent/bus", { cache: "no-store" });
        if (!r.ok || stop) return;
        const j: Data = await r.json(); setD(j); setNow(Date.now());
        if (!first && typeof Notification !== "undefined" && Notification.permission === "granted")
          j.alerts.filter((a) => !seen.has(a.id)).forEach((a) => new Notification("NexKido", { body: a.message }));
        seen = new Set(j.alerts.map((a) => a.id)); first = false;
      } catch { /* a missed poll just means the next one catches up */ }
    };
    tick(); const i = setInterval(tick, 1500); const c = setInterval(() => setNow(Date.now()), 1000);
    return () => { stop = true; clearInterval(i); clearInterval(c); };
  }, []);

  const markers = useMemo(() => d ? [
    { id: "home", lat: d.stop.lat, lng: d.stop.lng, label: d.stop.name },
    ...(d.bus ? [{ id: "bus", lat: d.bus.lat, lng: d.bus.lng, emoji: "bus", heading: d.bus.heading, label: `Bus ${d.busNo ?? ""}` }] : []),
  ] : [], [d]);
  const acc = d?.bus && d.bus.accuracy ? { lat: d.bus.lat, lng: d.bus.lng, m: d.bus.accuracy } : null;

  if (!d) return <Shell title="Parent" name={name}><div className="panel h-[70vh] animate-pulse" /></Shell>;
  const age = d.bus ? Math.max(0, Math.round((now - d.bus.updatedAt) / 1000)) : null;
  const live = d.active && !d.stale && d.bus;
  const status = !d.active ? "Hasn't left yet" : d.stale ? "Signal lost" : "On the way";
  const dist = d.distanceKm != null ? (d.distanceKm < 1 ? `${Math.round(d.distanceKm * 1000)} m` : `${d.distanceKm.toFixed(1)} km`) : "—";

  return (
    <Shell title="Parent" name={name} bare>
      <div className="relative h-[calc(100svh-57px)] min-h-[560px] overflow-hidden">
        <div className="absolute inset-0"><Map height={9999} fill markers={markers} follow trail={d.trail} accuracy={acc} locate={false} /></div>

        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2 md:inset-x-6 md:top-5">
          <div className="pointer-events-auto rounded-2xl bg-paper px-4 py-3 shadow-lg">
            <p className="display text-xl font-extrabold leading-tight md:text-2xl">{d.child ? `${d.child}’s bus` : "Your child’s bus"}</p>
            <p className="text-xs text-ink/65 md:text-sm">Bus {d.busNo || "not assigned"} · {d.driverName || "no driver"} · stop: {d.stop.name}</p>
          </div>
          <div className={`pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${live ? "bg-ok text-white" : d.active ? "bg-sun text-ink" : "bg-paper text-ink"}`}>
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${live ? "animate-pulse bg-white" : "bg-ink/40"}`} />{live ? "Live" : status}
          </div>
        </div>

        {d.stale && <div role="alert" className="absolute inset-x-3 top-[84px] z-10 rounded-xl border border-ink/30 bg-sun px-4 py-3 text-sm font-medium shadow-lg md:inset-x-auto md:right-6 md:top-[84px] md:max-w-sm">GPS is stale: the last update was {age}s ago, so this may not be where the bus is now.</div>}

        <div className="absolute inset-x-0 bottom-0 z-10 p-3 md:inset-x-auto md:bottom-6 md:left-6 md:w-[400px] md:p-0">
          <div className="rounded-3xl bg-paper p-4 shadow-[0_20px_60px_-10px_rgba(10,16,24,.5)] md:p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-ink/55">{d.active ? "Arrives in" : "Status"}</p>
                {d.etaMin != null ? <p className="display text-6xl font-extrabold leading-none">{d.etaMin}<span className="ml-1 text-2xl font-bold">min</span></p> : <p className="display text-3xl font-extrabold leading-tight">{status}</p>}
              </div>
              <dl className="grid grid-cols-3 gap-4 text-right text-sm">
                <div><dt className="text-[11px] text-ink/55">Distance</dt><dd className="font-bold">{dist}</dd></div>
                <div><dt className="text-[11px] text-ink/55">Speed</dt><dd className="font-bold">{d.bus?.speedKmh != null ? `${d.bus.speedKmh} km/h` : "—"}</dd></div>
                <div><dt className="text-[11px] text-ink/55">Updated</dt><dd className="font-bold">{age != null ? `${age}s ago` : "—"}</dd></div>
              </dl>
            </div>
            <Rail km={d.distanceKm} active={!!live} />
            {d.bus?.accuracy != null && <p className="mt-1 text-[11px] text-ink/50">GPS accuracy about ±{Math.round(d.bus.accuracy)} m</p>}
            <button onClick={() => setOpen((o) => !o)} className="mt-3 flex w-full items-center justify-between border-t border-ink/10 pt-3 text-sm font-semibold" aria-expanded={open}>
              Alerts ({d.alerts.length})<span aria-hidden>{open ? "–" : "+"}</span>
            </button>
            {open && (
              <div className="mt-1 max-h-40 overflow-y-auto">
                {d.alerts.length === 0 && <p className="py-2 text-sm text-ink/55">Nothing yet. You&rsquo;ll see alerts here when the trip starts.</p>}
                {d.alerts.map((a) => <div key={a.id} className="border-t border-ink/10 py-2 text-sm">{a.message}<span className="ml-2 text-xs text-ink/45">{new Date(a.ts).toLocaleTimeString()}</span></div>)}
              </div>
            )}
            <p className="mt-2 text-[11px] text-ink/45">The bus reaching the stop doesn&rsquo;t confirm your child has left the bus.</p>
            {typeof Notification !== "undefined" && Notification.permission === "default" && (
              <button className="btn btn-sun mt-3 w-full !py-2.5" onClick={() => Notification.requestPermission()}>Turn on alerts</button>
            )}
          </div>
        </div>
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
    <div className="mt-4 pb-5">
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
