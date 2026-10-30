"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell, Map, Banner } from "@/components/Shell";

type U = { id: string; role: "driver" | "parent"; name: string; email: string; phone?: string; busNo?: string; childName?: string; driverId?: string; stop?: { name: string; lat: number; lng: number } };
type Trips = Record<string, { active: boolean; lat?: number; lng?: number; updatedAt: number }>;

export default function AdminClient({ name }: { name: string }) {
  const [users, setUsers] = useState<U[]>([]);
  const [trips, setTrips] = useState<Trips>({});
  const [tab, setTab] = useState<"driver" | "parent">("driver");
  const [f, setF] = useState({ name: "", email: "", password: "", phone: "", busNo: "", childName: "", driverId: "", stopName: "Home" });
  const [pick, setPick] = useState<{ lat: number; lng: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/users");
    if (r.ok) { const j = await r.json(); setUsers(j.users); setTrips(j.trips); }
  }, []);
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [load]);

  const drivers = users.filter((u) => u.role === "driver");
  const parents = users.filter((u) => u.role === "parent");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function create(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (tab === "parent" && !pick) return setMsg({ ok: false, t: "Click the map to set the home stop." });
    const body = tab === "driver"
      ? { role: "driver", name: f.name, email: f.email, password: f.password, phone: f.phone, busNo: f.busNo }
      : { role: "parent", name: f.name, email: f.email, password: f.password, phone: f.phone, childName: f.childName, driverId: f.driverId, stop: { name: f.stopName, ...pick } };
    const r = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return setMsg({ ok: false, t: j.error });
    setMsg({ ok: true, t: `Created ${tab} account for ${j.user.name}.` });
    setF({ ...f, name: "", email: "", password: "", phone: "", busNo: "", childName: "" }); setPick(null); load();
  }
  async function remove(id: string, label: string) {
    if (!confirm(`Delete ${label}? Deleting a driver also deletes the parents assigned to them.`)) return;
    await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" }); load();
  }

  const markers = useMemo(() => [
    ...parents.filter((p) => p.stop).map((p) => ({ id: p.id, lat: p.stop!.lat, lng: p.stop!.lng, label: `${p.childName || p.name} – ${p.stop!.name}` })),
    ...drivers.filter((d) => trips[d.id]?.active && trips[d.id].lat != null).map((d) => ({ id: "b" + d.id, lat: trips[d.id].lat!, lng: trips[d.id].lng!, label: `Bus ${d.busNo || d.name}`, emoji: "bus" })),
  ], [users, trips]);

  return (
    <Shell title="School admin" name={name}>
      <Banner img="/images/bus-hero.jpg" pos="62% 45%" title="Transport control" sub="Create driver and parent accounts, and pin each parent's home stop.">
        <dl className="flex w-full justify-between gap-4 sm:w-auto sm:justify-start sm:gap-8">
          {[
            { k: "Drivers", v: drivers.length },
            { k: "Parents", v: parents.length },
            { k: "On a trip", v: drivers.filter((d) => trips[d.id]?.active).length },
          ].map((s) => (
            <div key={s.k}><dd className="display text-5xl font-extrabold leading-none text-sun md:text-6xl">{s.v}</dd><dt className="mt-1 text-sm text-paper/75">{s.k}</dt></div>
          ))}
        </dl>
      </Banner>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-2xl font-extrabold">Live fleet</h2>
          <p className="flex items-center gap-2 text-sm font-semibold"><span className={`inline-block h-2.5 w-2.5 rounded-full ${drivers.some((d) => trips[d.id]?.active) ? "animate-pulse bg-ok" : "bg-ink/30"}`} />{drivers.filter((d) => trips[d.id]?.active).length} of {drivers.length} buses on a trip</p>
        </div>
        <Map height={420} markers={markers} follow locate />
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        <form onSubmit={create} className="panel h-fit space-y-4 p-5 lg:col-span-2">
          <div role="tablist" className="flex gap-6 border-b border-ink/15">
            {(["driver", "parent"] as const).map((t) => (
              <button type="button" role="tab" aria-selected={tab === t} key={t} onClick={() => { setTab(t); setMsg(null); }} className={`-mb-px border-b-[3px] pb-2 text-sm font-semibold ${tab === t ? "border-ink" : "border-transparent text-ink/55 hover:text-ink"}`}>New {t}</button>
            ))}
          </div>
          <div><label htmlFor="n" className="field-label">Full name</label><input id="n" className="input" value={f.name} onChange={set("name")} required /></div>
          <div><label htmlFor="e" className="field-label">Login email</label><input id="e" className="input" type="email" value={f.email} onChange={set("email")} required /></div>
          <div><label htmlFor="pw" className="field-label">Temporary password</label><input id="pw" className="input" value={f.password} onChange={set("password")} minLength={6} required /><p className="mt-1 text-xs text-ink/55">At least 6 characters. Share it with them directly.</p></div>
          <div><label htmlFor="ph" className="field-label">Phone (optional)</label><input id="ph" className="input" value={f.phone} onChange={set("phone")} /></div>
          {tab === "driver" ? (
            <div><label htmlFor="b" className="field-label">Bus number or plate</label><input id="b" className="input" value={f.busNo} onChange={set("busNo")} /></div>
          ) : (
            <>
              <div><label htmlFor="c" className="field-label">Child&rsquo;s name</label><input id="c" className="input" value={f.childName} onChange={set("childName")} required /></div>
              <div>
                <label htmlFor="d" className="field-label">Driver and bus</label>
                <select id="d" className="input" value={f.driverId} onChange={set("driverId")} required>
                  <option value="">Choose a driver</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.busNo ? ` (bus ${d.busNo})` : ""}</option>)}
                </select>
                {drivers.length === 0 && <p className="mt-1 text-xs text-ink/55">Create a driver first.</p>}
              </div>
              <div><label htmlFor="s" className="field-label">Stop name</label><input id="s" className="input" value={f.stopName} onChange={set("stopName")} /></div>
              <div>
                <p className="field-label">Home stop on the map</p>
                <p className="mb-2 text-xs text-ink/60">{pick ? <span className="font-semibold text-ok">Pinned at {pick.lat.toFixed(5)}, {pick.lng.toFixed(5)}</span> : "Click the map to drop the pin."}</p>
                <Map height={240} picked={pick} onPick={setPick} locate markers={markers.filter((m) => !m.id.startsWith("b"))} />
              </div>
            </>
          )}
          {msg && <p role="status" className={`text-sm font-medium ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.t}</p>}
          <button className="btn btn-solid w-full">Create {tab}</button>
        </form>

        <div className="space-y-8 lg:col-span-3">
          <section>
            <h2 className="display border-b border-ink/20 pb-2 text-2xl font-extrabold">Drivers ({drivers.length})</h2>
            {drivers.length === 0 && <p className="py-4 text-sm text-ink/55">No drivers yet. Create one to get started.</p>}
            {drivers.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 border-b border-ink/10 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-3"><span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sun font-extrabold">{d.name[0]}</span><div className="min-w-0"><b>{d.name}</b><div className="truncate text-ink/60">{d.email}{d.busNo && ` · bus ${d.busNo}`}</div></div></div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${trips[d.id]?.active ? "bg-ok/15 text-ok" : "bg-ink/8 text-ink/60"}`}>{trips[d.id]?.active ? "On a trip" : "Idle"}</span>
                  <button onClick={() => remove(d.id, d.name)} className="font-semibold text-bad underline-offset-2 hover:underline">Delete</button>
                </div>
              </div>
            ))}
          </section>
          <section>
            <h2 className="display border-b border-ink/20 pb-2 text-2xl font-extrabold">Parents ({parents.length})</h2>
            {parents.length === 0 && <p className="py-4 text-sm text-ink/55">No parents yet.</p>}
            {parents.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-b border-ink/10 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-3"><span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink font-extrabold text-paper">{p.name[0]}</span><div className="min-w-0"><b>{p.name}</b><div className="truncate text-ink/60">{p.childName} · {p.stop?.name} · driver {drivers.find((d) => d.id === p.driverId)?.name ?? "none"}</div></div></div>
                <button onClick={() => remove(p.id, p.name)} className="font-semibold text-bad underline-offset-2 hover:underline">Delete</button>
              </div>
            ))}
          </section>
        </div>
      </div>
    </Shell>
  );
}
