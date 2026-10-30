"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/Shell";
import { go } from "@/lib/transition";

const ROLES = {
  parent: {
    label: "Parent", title: "Your child's bus, live.", sub: "See where it is, when it arrives, and get a heads-up before it reaches your gate.",
    img: "/images/story-gate.jpg", pos: "40% 50%", hint: "parent@email.com",
    chips: ["Alert at 2 km", "Alert at 1 km", "Arrived at your stop"],
  },
  driver: {
    label: "Driver", title: "One button starts the day.", sub: "Start your trip, share the bus location and see your stops in order.",
    img: "/images/story-cabin.jpg", pos: "50% 55%", hint: "driver@school.com",
    chips: ["Start trip", "Live GPS", "Stops in order"],
  },
  admin: {
    label: "School admin", title: "Every route, in your hands.", sub: "Create driver and parent accounts, assign buses and pin each child's home stop.",
    img: "/images/bus-hero.jpg", pos: "62% 50%", hint: "admin@school.com",
    chips: ["Create accounts", "Assign buses", "Pin home stops"],
  },
} as const;
type RoleKey = keyof typeof ROLES;
const ORDER: RoleKey[] = ["parent", "driver", "admin"];

function Form() {
  const q = useSearchParams().get("as") as RoleKey | null;
  const role: RoleKey = q && q in ROLES ? q : "parent";
  const R = ROLES[role];
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, as: role }) });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(j.error || "Couldn't sign you in. Check your email and password, then try again.");
    go(`/${j.user.role}`);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink text-paper">
      {/* full-bleed photo for the chosen role, drifting slowly */}
      {ORDER.map((k) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={k} src={ROLES[k].img} alt="" className="login-photo absolute inset-0 h-full w-full object-cover transition-opacity duration-700" style={{ objectPosition: ROLES[k].pos, opacity: k === role ? 1 : 0 }} />
      ))}
      <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(100deg, rgba(8,14,24,.9) 0%, rgba(8,14,24,.55) 48%, rgba(8,14,24,.25) 100%), linear-gradient(to top, rgba(8,14,24,.7), rgba(8,14,24,0) 45%)" }} />
      <div aria-hidden className="grain absolute inset-0" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-5 md:px-10 md:py-8">
        <div className="text-paper"><Wordmark /></div>

        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1.15fr_.85fr] lg:gap-16">
          <div key={role} className="login-in">
            <h1 className="display text-5xl font-extrabold leading-[.98] sm:text-6xl lg:text-7xl xl:text-8xl" style={{ fontVariationSettings: '"wdth" 75' }}>{R.title}</h1>
            <p className="mt-4 max-w-md text-base text-paper/80 sm:text-lg">{R.sub}</p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {R.chips.map((c, i) => (
                <li key={c} className="rounded-full border border-paper/30 bg-paper/10 px-4 py-1.5 text-sm font-semibold backdrop-blur" style={{ animation: `seqIn .6s ${0.15 + i * 0.1}s both cubic-bezier(.2,.8,.2,1)` }}>{c}</li>
              ))}
            </ul>
          </div>

          <form onSubmit={submit} className="w-full rounded-3xl bg-paper p-6 text-ink shadow-[0_40px_90px_-20px_rgba(0,0,0,.6)] sm:p-8 lg:ml-auto lg:max-w-md">
            <div role="tablist" className="grid grid-cols-3 gap-1 rounded-full bg-ink/8 p-1">
              {ORDER.map((k) => (
                <a key={k} role="tab" aria-selected={k === role} href={`/login?as=${k}`} className={`whitespace-nowrap rounded-full px-1 py-2 text-center text-[13px] font-semibold transition sm:px-2 sm:text-sm ${k === role ? "bg-ink text-paper shadow" : "text-ink/60 hover:text-ink"}`}>{ROLES[k].label}</a>
              ))}
            </div>
            <h2 className="display mt-6 text-3xl font-extrabold">Welcome back</h2>
            <p className="mt-1 text-sm text-ink/60">Sign in to the {R.label.toLowerCase()} portal.</p>

            <div className="mt-6">
              <label htmlFor="email" className="field-label">Email or username</label>
              <input id="email" className="input !py-3" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" placeholder={R.hint} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="mt-4">
              <label htmlFor="pw" className="field-label">Password</label>
              <div className="relative">
                <input id="pw" className="input !py-3 !pr-16" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-ink/60 hover:text-ink" aria-pressed={show}>{show ? "Hide" : "Show"}</button>
              </div>
            </div>
            {err && <p role="alert" className="mt-4 rounded-lg bg-bad/10 px-3 py-2 text-sm font-medium text-bad">{err}</p>}
            <button className="btn btn-sun mt-6 w-full !py-3.5 text-base" disabled={busy}>{busy ? "Signing in…" : "Sign in"}{!busy && <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-ink text-sun">↗</span>}</button>
            <p className="mt-5 text-center text-xs text-ink/50">Your school admin creates your account. There is no public sign-up.</p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  return <Suspense><Form /></Suspense>;
}
