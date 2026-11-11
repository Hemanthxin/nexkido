"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell, Map, Banner } from "@/components/Shell";

type P = { id: string; name: string; email: string; role: string; school?: string; busNo?: string; childName?: string; driverId?: string; schoolAdminId?: string; stop?: { name: string; lat: number; lng: number } };
type Admin = P & { drivers: number; parents: number };
type Act = { id: string; ts: number; actorName: string; role: string; action: string; detail?: string };
type Data = { admins: Admin[]; drivers: P[]; parents: P[]; trips: Record<string, { active: boolean; lat?: number; lng?: number; heading?: number; updatedAt: number; startedAt: number }>; activity: Act[]; alertsToday: number };

const ROLE_STYLE: Record<string, string> = {
  superadmin: "bg-ink text-paper", admin: "bg-sky text-ink", driver: "bg-sun/40 text-ink", parent: "bg-ok/15 text-ok", unknown: "bg-bad/10 text-bad",
};
const ROLE_LABEL: Record<string, string> = { superadmin: "Super admin", admin: "School admin", driver: "Driver", parent: "Parent", unknown: "Unknown" };

const ago = (ts: number, now: number) => {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
};

export default function SuperClient({ name }: { name: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState("all");
  const [f, setF] = useState({ name: "", school: "", email: "", password: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/superadmin", { cache: "no-store" });
    if (r.ok) { setD(await r.json()); setNow(Date.now()); }
  }, []);
  useEffect(() => { load(); const i = setInterval(load, 4000); return () => clearInterval(i); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const r = await fetch("/api/superadmin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json();
    if (!r.ok) return setMsg({ ok: false, t: j.error });
    setMsg({ ok: true, t: `Created school admin ${j.user.name} for ${j.user.school}.` });
    setF({ name: "", school: "", email: "", password: "" }); load();
  }
  async function remove(a: Admin) {
    if (!confirm(`Delete ${a.name} (${a.school})? This also deletes their ${a.drivers} drivers and ${a.parents} parents.`)) return;
    await fetch(`/api/superadmin?id=${a.id}`, { method: "DELETE" }); load();
  }

  const liveBuses = useMemo(() => d ? d.drivers.filter((x) => d.trips[x.id]?.active && d.trips[x.id].lat != null) : [], [d]);
  const markers = useMemo(() => d ? [
    ...d.parents.filter((p) => p.stop).map((p) => ({ id: p.id, lat: p.stop!.lat, lng: p.stop!.lng, label: `${p.childName || p.name} – ${p.stop!.name}` })),
    ...liveBuses.map((x) => ({ id: "b" + x.id, lat: d.trips[x.id].lat!, lng: d.trips[x.id].lng!, label: `Bus ${x.busNo || x.name}`, emoji: "bus", heading: d.trips[x.id].heading ?? null })),
  ] : [], [d, liveBuses]);

  if (!d) return <Shell title="Super admin" name={name}><div className="panel h-96 animate-pulse" /></Shell>;
  const adminName = (id?: string) => d.admins.find((a) => a.id === id)?.school || "—";
  const feed = d.activity.filter((a) => filter === "all" || a.role === filter);
  const liveCount = d.drivers.filter((x) => d.trips[x.id]?.active).length;

  return (
    <Shell title="Super admin" name={name}>
      <Banner img="/images/road.jpg" pos="50% 55%" title="Everything, in one place" sub="Create school admins and watch every driver, parent and school admin as it happens.">
        <dl className="flex w-full flex-wrap justify-between gap-x-6 gap-y-3 sm:w-auto sm:gap-8">
          {[["School admins", d.admins.length], ["Drivers", d.drivers.length], ["Parents", d.parents.length], ["Buses live", liveCount], ["Alerts today", d.alertsToday]].map(([k, v]) => (
            <div key={k as string}><dd className="display text-4xl font-extrabold leading-none text-sun md:text-5xl">{v}</dd><dt className="mt-1 text-xs text-paper/75 sm:text-sm">{k}</dt></div>
          ))}
        </dl>
      </Banner>

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        <div className="space-y-8 lg:col-span-2">
          <form onSubmit={create} className="panel space-y-4 p-5">
            <h2 className="display text-2xl font-extrabold">New school admin</h2>
            <div><label htmlFor="sn" className="field-label">Full name</label><input id="sn" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
            <div><label htmlFor="ss" className="field-label">School</label><input id="ss" className="input" value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} required /></div>
            <div><label htmlFor="se" className="field-label">Login email</label><input id="se" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
            <div><label htmlFor="sp" className="field-label">Temporary password</label><input id="sp" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={6} required /><p className="mt-1 text-xs text-ink/55">At least 6 characters. Share it with them directly.</p></div>
            {msg && <p role="status" className={`text-sm font-medium ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.t}</p>}
            <button className="btn btn-solid w-full">Create school admin</button>
          </form>

          <section>
            <h2 className="display border-b border-ink/20 pb-2 text-2xl font-extrabold">School admins ({d.admins.length})</h2>
            {d.admins.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 border-b border-ink/10 py-3 text-sm">
                <div className="min-w-0"><b>{a.school || "School"}</b><div className="truncate text-ink/60">{a.name} · {a.email}</div><div className="text-xs text-ink/50">{a.drivers} drivers · {a.parents} parents</div></div>
                <button onClick={() => remove(a)} className="shrink-0 font-semibold text-bad underline-offset-2 hover:underline">Delete</button>
              </div>
            ))}
          </section>
        </div>

        <div className="space-y-8 lg:col-span-3">
          <div>
            <h2 className="display mb-3 text-2xl font-extrabold">Live map · all schools</h2>
            <div className="h-[250px] overflow-hidden rounded-xl border border-ink/15 md:h-[320px]"><Map fill markers={markers} follow /></div>
            {liveBuses.length === 0 && <p className="mt-2 text-sm text-ink/55">No bus is on a trip right now. Buses appear here while a driver&rsquo;s trip is live.</p>}
          </div>

          <section>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/20 pb-2">
              <h2 className="display text-2xl font-extrabold">Activity</h2>
              <div role="tablist" className="flex flex-wrap gap-1">
                {["all", "admin", "driver", "parent"].map((k) => (
                  <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === k ? "bg-ink text-paper" : "bg-ink/8 text-ink/70 hover:bg-ink/15"}`}>{k === "all" ? "Everyone" : ROLE_LABEL[k]}</button>
                ))}
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto" data-lenis-prevent>
              {feed.length === 0 && <p className="py-4 text-sm text-ink/55">Nothing yet. Sign-ins, trips, alerts and account changes show up here.</p>}
              {feed.map((a) => (
                <div key={a.id} className="flex items-start gap-3 border-b border-ink/10 py-2.5 text-sm">
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_STYLE[a.role] || ROLE_STYLE.unknown}`}>{ROLE_LABEL[a.role] || a.role}</span>
                  <div className="min-w-0 flex-1"><span className="font-semibold">{a.actorName}</span> · {a.action}{a.detail && <span className="text-ink/60"> — {a.detail}</span>}</div>
                  <span className="shrink-0 text-xs text-ink/50">{ago(a.ts, now)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="display border-b border-ink/20 pb-2 text-2xl font-extrabold">Drivers ({d.drivers.length})</h2>
            {d.drivers.length === 0 && <p className="py-4 text-sm text-ink/55">No drivers yet.</p>}
            {d.drivers.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-3 border-b border-ink/10 py-2.5 text-sm">
                <div className="min-w-0"><b>{x.name}</b> <span className="text-ink/60">{x.busNo ? `bus ${x.busNo} · ` : ""}{adminName(x.schoolAdminId)}</span></div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${d.trips[x.id]?.active ? "bg-ok/15 text-ok" : "bg-ink/8 text-ink/60"}`}>{d.trips[x.id]?.active ? `Live · ${ago(d.trips[x.id].updatedAt, now)}` : "Idle"}</span>
              </div>
            ))}
          </section>

          <section>
            <h2 className="display border-b border-ink/20 pb-2 text-2xl font-extrabold">Parents ({d.parents.length})</h2>
            {d.parents.length === 0 && <p className="py-4 text-sm text-ink/55">No parents yet.</p>}
            {d.parents.map((x) => (
              <div key={x.id} className="border-b border-ink/10 py-2.5 text-sm"><b>{x.name}</b> <span className="text-ink/60">{x.childName} · {x.stop?.name} · {adminName(x.schoolAdminId)}</span></div>
            ))}
          </section>
        </div>
      </div>
    </Shell>
  );
}
