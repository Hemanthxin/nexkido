"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell, Map } from "@/components/Shell";
import Sheet from "@/components/Sheet";
import NotifyPrompt from "@/components/NotifyPrompt";
import { useToast } from "@/components/Toasts";
import { useStream } from "@/lib/useStream";
import { useNotifications } from "@/lib/useNotifications";

type U = { id: string; role: "driver" | "parent"; name: string; email: string; phone?: string; busNo?: string; childName?: string; driverId?: string; stop?: { name: string; lat: number; lng: number } };
type Trips = Record<string, { active: boolean; lat?: number; lng?: number; heading?: number; updatedAt: number }>;
type Sheeted = null | { kind: "driver" | "parent"; edit?: U } | { kind: "move"; from: U } | { kind: "delete"; u: U };

const chip = "rounded-full border border-ink/20 px-3.5 py-2 text-sm font-semibold transition hover:bg-ink/5 active:scale-[.97]";

async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

export default function AdminClient({ name }: { name: string }) {
  const toast = useToast();
  const notif = useNotifications();
  const [users, setUsers] = useState<U[]>([]);
  const [trips, setTrips] = useState<Trips>({});
  const [school, setSchool] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"driver" | "parent">("driver");
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<Sheeted>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/users", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setUsers(j.users); setTrips(j.trips); setSchool(j.school || ""); setLoaded(true);
    } catch { /* the next refresh catches up */ }
  }, []);
  useStream({ notice: (n: { title: string; body: string }) => { toast({ title: n.title, body: n.body, tone: "info" }); void load(); } }, load);
  useEffect(() => { void load(); const i = setInterval(load, 4000); return () => clearInterval(i); }, [load]);

  const drivers = useMemo(() => users.filter((u) => u.role === "driver"), [users]);
  const parents = useMemo(() => users.filter((u) => u.role === "parent"), [users]);
  const driverOf = (id?: string) => drivers.find((d) => d.id === id);
  const stopsOf = (id: string) => parents.filter((p) => p.driverId === id);
  const live = drivers.filter((d) => trips[d.id]?.active);

  const match = (u: U) => !q.trim() || [u.name, u.email, u.phone, u.busNo, u.childName, driverOf(u.driverId)?.name, driverOf(u.driverId)?.busNo].filter(Boolean).join(" ").toLowerCase().includes(q.trim().toLowerCase());
  const shownDrivers = drivers.filter(match), shownParents = parents.filter(match);

  const markers = useMemo(() => [
    ...parents.filter((p) => p.stop).map((p) => ({ id: p.id, lat: p.stop!.lat, lng: p.stop!.lng, label: `${p.childName || p.name} · ${p.stop!.name}` })),
    ...live.filter((d) => trips[d.id].lat != null).map((d) => ({ id: "b" + d.id, lat: trips[d.id].lat!, lng: trips[d.id].lng!, label: `Bus ${d.busNo || d.name}`, emoji: "bus", heading: trips[d.id].heading ?? null })),
  ], [parents, live, trips]);

  async function moveOne(p: U, driverId: string) {
    setBusy(p.id);
    const r = await api("PATCH", "/api/admin/users", { id: p.id, driverId });
    setBusy(null);
    if (!r.ok) return toast({ body: r.j.error || "Couldn't move this student.", tone: "error" });
    const d = driverOf(driverId);
    toast({ title: "Moved", body: `${p.childName || p.name} is now on bus ${d?.busNo || "—"} with ${d?.name}. They've been told.`, tone: "ok" });
    void load();
  }

  const add = tab === "driver" ? "Add driver" : "Add parent";
  const close = () => setSheet(null);

  return (
    <Shell title="School admin" name={name}>
      <div className="space-y-5 pb-24 md:pb-6">
        <div>
          <p className="text-sm font-medium text-ink/60">{school || "Your school"}</p>
          <h1 className="display text-3xl font-extrabold leading-tight md:text-5xl">Transport control</h1>
        </div>

        {notif.state === "default" && <NotifyPrompt {...notif} what="trip alerts" />}

        <dl className="grid grid-cols-3 gap-2.5 md:gap-4">
          {[["Drivers", drivers.length, false], ["Parents", parents.length, false], ["On a trip", live.length, live.length > 0]].map(([k, v, on]) => (
            <div key={k as string} className="panel p-3.5 md:p-5"><dd className="display flex items-center gap-2 text-3xl font-extrabold leading-none md:text-5xl">{v as number}{on && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-ok" />}</dd><dt className="mt-1.5 text-xs font-medium text-ink/60 md:text-sm">{k as string}</dt></div>
          ))}
        </dl>

        <section aria-label="Live fleet">
          <div className="mb-2 flex items-center justify-between"><h2 className="display text-xl font-extrabold md:text-2xl">Live fleet</h2><p className="text-sm text-ink/60">{live.length ? `${live.length} of ${drivers.length} buses on a trip` : "No bus on a trip"}</p></div>
          <div className="h-[250px] overflow-hidden rounded-xl border border-ink/15 md:h-[400px]"><Map fill markers={markers} follow locate /></div>
        </section>

        <section>
          <div className="flex flex-wrap items-center gap-3">
            <div role="tablist" className="flex gap-1 rounded-full bg-ink/6 p-1">
              {(["driver", "parent"] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === t ? "bg-ink text-paper shadow" : "text-ink/65 hover:text-ink"}`}>{t === "driver" ? `Drivers (${drivers.length})` : `Parents (${parents.length})`}</button>
              ))}
            </div>
            <input aria-label="Search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, bus or email" className="input order-last min-w-0 basis-full !py-2.5 md:order-none md:!w-auto md:max-w-xs md:flex-1 md:basis-auto" />
            <button onClick={() => setSheet({ kind: tab })} className="btn btn-solid !py-2.5 max-md:!hidden">+ {add}</button>
          </div>

          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {!loaded && [0, 1].map((i) => <li key={i} className="panel h-28 animate-pulse" />)}
            {loaded && tab === "driver" && shownDrivers.map((d) => {
              const n = stopsOf(d.id).length, on = trips[d.id]?.active;
              return (
                <li key={d.id} className="panel p-4">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sun text-lg font-extrabold">{d.name[0]}</span>
                    <div className="min-w-0 flex-1"><p className="truncate font-bold">{d.name}</p><p className="truncate text-sm text-ink/60">Bus {d.busNo || "—"} · {d.phone || d.email}</p></div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${on ? "bg-ok/15 text-ok" : "bg-ink/8 text-ink/60"}`}>{on ? "On a trip" : "Idle"}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-ink/60">{n} {n === 1 ? "stop" : "stops"}</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button className={chip} onClick={() => setSheet({ kind: "driver", edit: d })}>Edit</button>
                      {n > 0 && drivers.length > 1 && <button className={chip} onClick={() => setSheet({ kind: "move", from: d })}>Move stops</button>}
                      <button className={`${chip} !border-bad/40 text-bad`} onClick={() => setSheet({ kind: "delete", u: d })}>Delete</button>
                    </div>
                  </div>
                </li>
              );
            })}
            {loaded && tab === "parent" && shownParents.map((p) => (
              <li key={p.id} className="panel p-4">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-lg font-extrabold text-paper">{(p.childName || p.name)[0]}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-bold">{p.childName || "Student"}</p><p className="truncate text-sm text-ink/60">Parent {p.name} · stop: {p.stop?.name}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <span className="shrink-0 text-ink/60">Bus</span>
                    <select aria-label={`Driver for ${p.childName || p.name}`} disabled={busy === p.id || drivers.length < 2} value={p.driverId ?? ""} onChange={(e) => moveOne(p, e.target.value)} className="input !min-w-0 !flex-1 !py-2 text-sm disabled:opacity-60">
                      {drivers.map((d) => <option key={d.id} value={d.id}>{d.busNo ? `Bus ${d.busNo} · ` : ""}{d.name}</option>)}
                    </select>
                  </label>
                  <div className="flex gap-1.5">
                    <button className={chip} onClick={() => setSheet({ kind: "parent", edit: p })}>Edit</button>
                    <button className={`${chip} !border-bad/40 text-bad`} onClick={() => setSheet({ kind: "delete", u: p })}>Delete</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {loaded && ((tab === "driver" && !shownDrivers.length) || (tab === "parent" && !shownParents.length)) && (
            <div className="panel mt-4 p-6 text-center">
              <p className="font-semibold">{q ? "Nothing matches that search." : tab === "driver" ? "No drivers yet." : drivers.length ? "No parents yet." : "Add a driver first, then add parents."}</p>
              {!q && <button onClick={() => setSheet({ kind: tab === "parent" && !drivers.length ? "driver" : tab })} className="btn btn-solid mt-3">{tab === "parent" && !drivers.length ? "Add a driver" : add}</button>}
            </div>
          )}
        </section>
      </div>

      <button onClick={() => setSheet({ kind: tab })} className="btn btn-solid fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 !px-5 !py-3.5 shadow-[0_14px_30px_-8px_rgba(10,16,24,.6)] md:hidden">+ {add}</button>

      <Sheet open={!!sheet} onClose={close} title={sheet?.kind === "move" ? "Move stops" : sheet?.kind === "delete" ? "Delete account" : sheet ? `${"edit" in sheet && sheet.edit ? "Edit" : "Add"} ${sheet.kind}` : ""}
        footer={sheet && (sheet.kind === "driver" || sheet.kind === "parent") ? <button form="person-form" className="btn btn-solid w-full !py-3.5">{sheet.edit ? "Save changes" : `Create ${sheet.kind}`}</button> : undefined}>
        {sheet && (sheet.kind === "driver" || sheet.kind === "parent") && <PersonForm key={sheet.edit?.id ?? sheet.kind} kind={sheet.kind} edit={sheet.edit} drivers={drivers} stopsOf={stopsOf} onDone={() => { close(); void load(); }} />}
        {sheet?.kind === "move" && <MoveForm from={sheet.from} drivers={drivers.filter((d) => d.id !== sheet.from.id)} n={stopsOf(sheet.from.id).length} onDone={() => { close(); void load(); }} />}
        {sheet?.kind === "delete" && <DeleteForm u={sheet.u} drivers={drivers.filter((d) => d.id !== sheet.u.id)} n={sheet.u.role === "driver" ? stopsOf(sheet.u.id).length : 0} onDone={() => { close(); void load(); }} />}
      </Sheet>
    </Shell>
  );
}

function PersonForm({ kind, edit, drivers, stopsOf, onDone }: { kind: "driver" | "parent"; edit?: U; drivers: U[]; stopsOf: (id: string) => U[]; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: edit?.name ?? "", email: edit?.email ?? "", phone: edit?.phone ?? "", busNo: edit?.busNo ?? "", childName: edit?.childName ?? "", driverId: edit?.driverId ?? drivers[0]?.id ?? "", stopName: edit?.stop?.name ?? "Home", password: "" });
  const [pick, setPick] = useState<{ lat: number; lng: number } | null>(edit?.stop ? { lat: edit.stop.lat, lng: edit.stop.lng } : null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const me = kind === "driver" ? "driver" : "parent";

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (kind === "parent" && !pick) return setErr("Tap the map to pin the home stop.");
    if (kind === "parent" && !f.driverId) return setErr("Choose a driver for this student.");
    setSaving(true);
    const common = { name: f.name, email: f.email, phone: f.phone };
    const body = kind === "driver"
      ? { ...common, busNo: f.busNo }
      : { ...common, childName: f.childName, driverId: f.driverId, stop: { name: f.stopName, ...pick } };
    const r = edit
      ? await api("PATCH", "/api/admin/users", { id: edit.id, ...body, ...(f.password ? { password: f.password } : {}) })
      : await api("POST", "/api/admin/users", { role: kind, ...body, password: f.password });
    setSaving(false);
    if (!r.ok) return setErr(r.j.error || "That didn't save. Check the details and try again.");
    toast({ title: edit ? "Saved" : "Created", body: edit ? `${f.name}'s details are updated.` : `${f.name} can now sign in with ${f.email}.`, tone: "ok" });
    onDone();
  }

  return (
    <form id="person-form" onSubmit={submit} className="space-y-4">
      <div><label htmlFor="f-name" className="field-label">{kind === "parent" ? "Parent's name" : "Full name"}</label><input id="f-name" className="input" value={f.name} onChange={set("name")} required autoComplete="off" /></div>
      <div><label htmlFor="f-email" className="field-label">Login email</label><input id="f-email" className="input" type="email" value={f.email} onChange={set("email")} required autoComplete="off" /></div>
      <div><label htmlFor="f-phone" className="field-label">Phone {kind === "driver" ? "(parents see this to call the driver)" : "(optional)"}</label><input id="f-phone" className="input" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="off" /></div>
      {kind === "driver" ? (
        <div><label htmlFor="f-bus" className="field-label">Bus number or plate</label><input id="f-bus" className="input" value={f.busNo} onChange={set("busNo")} autoComplete="off" /></div>
      ) : (
        <>
          <div><label htmlFor="f-child" className="field-label">Child&rsquo;s name</label><input id="f-child" className="input" value={f.childName} onChange={set("childName")} required autoComplete="off" /></div>
          <div>
            <label htmlFor="f-driver" className="field-label">Driver and bus</label>
            <select id="f-driver" className="input" value={f.driverId} onChange={set("driverId")} required>
              <option value="">Choose a driver</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.busNo ? `Bus ${d.busNo} · ` : ""}{d.name} ({stopsOf(d.id).length} {stopsOf(d.id).length === 1 ? "stop" : "stops"})</option>)}
            </select>
            {!drivers.length && <p className="mt-1 text-xs text-bad">Add a driver first.</p>}
            {edit && f.driverId !== edit.driverId && <p className="mt-1 text-xs text-ink/60">The parent and both drivers are told about the change as soon as you save.</p>}
          </div>
          <div><label htmlFor="f-stop" className="field-label">Stop name</label><input id="f-stop" className="input" value={f.stopName} onChange={set("stopName")} autoComplete="off" /></div>
          <div>
            <p className="field-label">Home stop on the map</p>
            <p className="mb-2 text-xs text-ink/60">{pick ? <span className="font-semibold text-ok">Pinned at {pick.lat.toFixed(5)}, {pick.lng.toFixed(5)}. Tap the map to move it.</span> : "Tap the map to drop the pin."}</p>
            <div className="h-[240px] overflow-hidden rounded-xl border border-ink/15"><Map fill picked={pick} onPick={setPick} locate={!edit} center={edit?.stop} /></div>
          </div>
        </>
      )}
      <div>
        <label htmlFor="f-pw" className="field-label">{edit ? "New password" : "Temporary password"}</label>
        <input id="f-pw" className="input" type="text" autoComplete="new-password" value={f.password} onChange={set("password")} minLength={f.password ? 6 : undefined} required={!edit} placeholder={edit ? "Leave blank to keep the current one" : ""} />
        <p className="mt-1 text-xs text-ink/55">{edit ? "Only fill this in to reset it. " : "At least 6 characters. "}Share it with the {me} directly.</p>
      </div>
      {saving && <p className="text-sm text-ink/60" role="status">Saving…</p>}
      {err && <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm font-medium text-bad">{err}</p>}
    </form>
  );
}

function MoveForm({ from, drivers, n, onDone }: { from: U; drivers: U[]; n: number; onDone: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState(drivers[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await api("POST", "/api/admin/reassign", { from: from.id, to });
    setBusy(false);
    if (!r.ok) return toast({ body: r.j.error || "Couldn't move the stops.", tone: "error" });
    toast({ title: "Stops moved", body: `${r.j.moved} ${r.j.moved === 1 ? "stop" : "stops"} moved. Parents and drivers have been told.`, tone: "ok" });
    onDone();
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/70">Use this when a driver is absent. All <b>{n}</b> {n === 1 ? "stop" : "stops"} on <b>{from.name}</b>&rsquo;s route move to the driver you choose. Each parent gets a notification with the new bus.</p>
      <div><label htmlFor="mv" className="field-label">Move to</label>
        <select id="mv" className="input" value={to} onChange={(e) => setTo(e.target.value)}>{drivers.map((d) => <option key={d.id} value={d.id}>{d.busNo ? `Bus ${d.busNo} · ` : ""}{d.name}</option>)}</select></div>
      <button onClick={go} disabled={busy || !to} className="btn btn-solid w-full !py-3.5">{busy ? "Moving…" : `Move ${n} ${n === 1 ? "stop" : "stops"}`}</button>
    </div>
  );
}

function DeleteForm({ u, drivers, n, onDone }: { u: U; drivers: U[]; n: number; onDone: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState(drivers[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  async function del(qs: string) {
    setBusy(true);
    const r = await api("DELETE", `/api/admin/users?id=${u.id}${qs}`);
    setBusy(false);
    if (!r.ok) return toast({ body: r.j.error || "Couldn't delete this account.", tone: "error" });
    toast({ title: "Deleted", body: `${u.name}'s account was removed.`, tone: "ok" });
    onDone();
  }
  const label = u.role === "parent" ? `${u.name} (${u.childName || "student"})` : u.name;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/70">Delete <b>{label}</b>? They will no longer be able to sign in. This can&rsquo;t be undone.</p>
      {u.role === "driver" && n > 0 && (
        <div className="space-y-3 rounded-xl bg-sun/25 p-3.5">
          <p className="text-sm font-medium">This driver has {n} {n === 1 ? "stop" : "stops"}. Move them first so those children stay covered.</p>
          {drivers.length > 0 && (
            <>
              <select aria-label="Move stops to" className="input" value={to} onChange={(e) => setTo(e.target.value)}>{drivers.map((d) => <option key={d.id} value={d.id}>{d.busNo ? `Bus ${d.busNo} · ` : ""}{d.name}</option>)}</select>
              <button disabled={busy} onClick={() => del(`&moveTo=${to}`)} className="btn btn-solid w-full">{busy ? "Working…" : `Move ${n} ${n === 1 ? "stop" : "stops"} and delete driver`}</button>
            </>
          )}
          <button disabled={busy} onClick={() => del("&cascade=1")} className="w-full text-center text-sm font-semibold text-bad underline-offset-2 hover:underline">Delete the driver and their {n} {n === 1 ? "parent" : "parents"} too</button>
        </div>
      )}
      {!(u.role === "driver" && n > 0) && <button disabled={busy} onClick={() => del("")} className="btn w-full !border-bad !bg-bad !py-3.5 text-white">{busy ? "Deleting…" : "Delete account"}</button>}
    </div>
  );
}
