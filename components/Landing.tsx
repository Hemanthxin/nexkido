"use client";
import dynamic from "next/dynamic";
import { Fragment, useEffect, useRef, useState } from "react";
import { Wordmark } from "./Shell";
import { Logo } from "./Logo";
import { explodeAt } from "@/lib/explode";

const DepthHero = dynamic(() => import("./DepthHero"), { ssr: false });
const RoadPhoto = dynamic(() => import("./RoadPhoto"), { ssr: false });
const ExplodedUI = dynamic(() => import("./ExplodedUI"), { ssr: false });

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));

/** Each letter flies in from its own scattered position and snaps into place. */
function Assemble({ text }: { text: string }) {
  const rnd = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  let n = 0;
  return (
    // letters are grouped per word, so a line can only break between words, never inside one
    <span aria-hidden className="assemble">
      {text.split(" ").map((word, wi) => (
        <Fragment key={wi}>
          {wi > 0 ? " " : ""}
          <span className="inline-block whitespace-nowrap">
          {[...word].map((ch) => {
            const i = n++;
            return <span key={i} className="l" style={{ "--i": i, "--dx": `${(rnd(i, 1) - 0.5) * 70}vw`, "--dy": `${(rnd(i, 2) - 0.5) * 60}vh`, "--r": `${(rnd(i, 3) - 0.5) * 140}deg` } as React.CSSProperties}>{ch}</span>;
          })}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

const stages = [
  { at: "2 km", text: "Your phone buzzes. The bus is a few minutes out." },
  { at: "1 km", text: "Shoes on, bag by the door." },
  { at: "your stop", text: "The bus is at your gate. Go." },
];
// The same messages the alert engine sends.
const alerts = [
  "Your child's bus is approaching (about 2 km away).",
  "Your child's bus is approximately 1 km away. Please get ready.",
  "The bus has reached the designated drop-off point.",
];

function Phone({ stage, p }: { stage: number; p: number }) {
  const mins = Math.round(12 * (1 - p));
  const t = 7 * 60 + 30 + Math.round(p * 14);
  const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  return (
    <div className="relative h-[548px] w-[272px] rounded-[44px] border-[10px] border-[#0b1119] bg-ink shadow-[0_40px_90px_rgba(10,6,2,.55)]" style={{ backgroundImage: "linear-gradient(rgba(15,29,46,.55), rgba(15,29,46,.8)), url(/images/road.jpg)", backgroundSize: "cover", backgroundPosition: "62% 50%" }}>
      <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-[#0b1119]" />
      <div className="px-4 pt-12 text-center text-paper">
        <p className="text-xs font-medium opacity-80">Tuesday</p>
        <p className="display text-6xl font-extrabold leading-none tabular-nums">{clock}</p>
        <p className="mt-3 inline-block rounded-full bg-paper/15 px-3 py-1 text-xs font-semibold backdrop-blur">{mins > 0 ? `Arrives in ${mins} min` : "At your stop"}</p>
      </div>
      <div className="absolute inset-x-3 bottom-4 space-y-2">
        {[2, 1, 0].map((i) => (
          <div key={i} className="rounded-2xl bg-paper/90 p-3 text-left shadow-lg backdrop-blur transition-all duration-500" style={{ opacity: stage >= i ? 1 : 0, transform: stage >= i ? "none" : "translateY(24px) scale(.96)" }}>
            <div className="flex items-center justify-between text-[10px] font-semibold text-ink/60">
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[4px] bg-sun" />NexKido</span>
              <span>{stage === i ? "now" : "earlier"}</span>
            </div>
            <p className="mt-1 text-[13px] font-medium leading-snug text-ink">{alerts[i]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The road ahead. Scrolling drives the camera down the road while the alerts arrive on a phone. */
function Road() {
  const sec = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [p, setP] = useState(0);
  const [vw, setVw] = useState(1440);
  const stage = Math.min(2, Math.floor(p * 3));
  useEffect(() => {
    const tick = () => {
      const r = sec.current!.getBoundingClientRect();
      progress.current = clamp(-r.top / (r.height - innerHeight));
      setP(progress.current);
    };
    const size = () => setVw(innerWidth);
    size();
    tick();
    addEventListener("scroll", tick, { passive: true });
    addEventListener("resize", tick);
    addEventListener("resize", size);
    return () => { removeEventListener("scroll", tick); removeEventListener("resize", tick); removeEventListener("resize", size); };
  }, []);

  return (
    <section ref={sec} id="how" style={{ height: "360vh" }} className="relative bg-paper" aria-label="How the alerts work">
      <div className="sticky top-0 h-screen overflow-hidden bg-[#2a2622]">
        <div className="absolute inset-0" style={{ filter: `blur(${explodeAt(p) * 7}px) brightness(${1 - explodeAt(p) * 0.5})` }}><RoadPhoto progress={progress} /></div>
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(20,14,8,.4) 100%)" }} />
        <div aria-hidden className="grain pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute bottom-8 left-4 right-4 md:left-10 md:right-auto md:max-w-md">
          <div className="rounded-xl bg-paper p-5 shadow-[0_10px_40px_rgba(30,20,10,.25)]">
            <p className="text-sm font-semibold text-ink/60" aria-live="polite">Alert at {stages[stage].at}</p>
            <p className="display mt-1 text-3xl font-extrabold leading-tight md:text-4xl">{stages[stage].text}</p>
            <p className="mt-3 text-xs text-ink/55">Each alert goes out once per trip, and only to the parent of that stop.</p>
          </div>
        </div>
        <div aria-hidden className="pointer-events-none absolute right-[7vw] top-1/2 hidden -translate-y-1/2 rotate-[-3deg] transition-all duration-700 lg:block" style={{ opacity: 1 - explodeAt(p), transform: `translateY(calc(-50% + ${explodeAt(p) * 40}px)) rotate(-3deg) scale(${1 - explodeAt(p) * 0.08})` }}><Phone stage={stage} p={p} /></div>
        <div aria-hidden className="pointer-events-none absolute" style={{ left: vw >= 1024 ? "42%" : "50%", top: vw >= 1024 ? "46%" : "36%", width: 520, height: 340, marginLeft: -260, marginTop: -150, transform: `scale(${vw >= 1024 ? 0.88 : Math.min(0.88, (vw * 0.8) / 520)})` }}><ExplodedUI e={explodeAt(p)} mins={Math.round(12 * (1 - p))} labels={vw >= 768} /></div>
        <p className="pointer-events-none absolute left-4 top-[72px] rounded-full bg-paper px-4 py-2 text-sm font-semibold shadow-lg transition-opacity duration-500 md:left-auto md:right-10 md:top-20" style={{ opacity: explodeAt(p) > 0.6 ? 1 : 0 }}>What happens inside the phone</p>
      </div>
    </section>
  );
}

const frames = [
  { img: "/images/story-cabin.jpg", alt: "A driver's hands on the wheel of a school bus, a phone mounted on the dashboard", pos: "50% 55%", title: "One button starts the day.", text: "The driver starts the trip and the bus location is shared while it's live.", stat: "4 s", statNote: "between location updates" },
  { img: "/images/road.jpg", alt: "An empty tree-lined road at golden hour with a yellow gantry sign", pos: "50% 50%", title: "Two kilometres out.", text: "The parent's phone buzzes. The bus is a few minutes away.", stat: "2 km", statNote: "first alert" },
  { img: "/images/story-gate.jpg", alt: "A mother tying her son's shoelace outside their gate as the school bus approaches", pos: "40% 50%", title: "Shoes on, with time to spare.", text: "At one kilometre the phone says so. No more guessing at the window.", stat: "1 km", statNote: "second alert" },
  { img: "/images/story-arrival.jpg", alt: "A schoolgirl steps off the school bus into her father's arms", pos: "55% 50%", title: "Right at the gate.", text: "The bus reaches the stop you chose, and you're already there.", stat: "Here", statNote: "arrival alert" },
];
const marks = [{ at: 0, label: "Depot" }, { at: 1 / 3, label: "2 km" }, { at: 2 / 3, label: "1 km" }, { at: 1, label: "Home" }];

/** One school morning as a pinned film sequence: photographs dissolve into each other under slow camera drift, while the bus travels the route below. */
function Sequence() {
  const sec = useRef<HTMLElement>(null);
  const plates = useRef<(HTMLDivElement | null)[]>([]);
  const dot = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const [front, setFront] = useState(0);

  useEffect(() => {
    let last = -1;
    const tick = () => {
      const r = sec.current!.getBoundingClientRect();
      const p = clamp(-r.top / (r.height - innerHeight));
      const pos = p * (frames.length - 1);
      plates.current.forEach((el, i) => {
        if (!el) return;
        const d = pos - i;
        el.style.opacity = String(i === 0 ? 1 : clamp((pos - (i - 0.7)) / 0.7)); // each plate dissolves in over the previous one
        el.style.transform = `translate3d(${d * -3.2}%, ${d * -1.2}%, 0) scale(${1.1 - clamp((d + 1) / 2) * 0.07})`; // slow push-in with parallax
      });
      if (dot.current) dot.current.style.left = `${p * 100}%`;
      if (fill.current) fill.current.style.transform = `scaleX(${p})`;
      if (clock.current) {
        const t = 7 * 60 + 30 + Math.round(p * 14);
        clock.current.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      }
      const f = Math.round(pos);
      if (f !== last) { last = f; setFront(f); }
    };
    tick();
    addEventListener("scroll", tick, { passive: true });
    addEventListener("resize", tick);
    return () => { removeEventListener("scroll", tick); removeEventListener("resize", tick); };
  }, []);

  const c = frames[front];
  return (
    <section ref={sec} id="morning" style={{ height: "460vh" }} className="relative bg-ink" aria-label="A morning with NexKido">
      <div className="sticky top-0 h-screen overflow-hidden bg-black text-paper">
        {frames.map((f, i) => (
          <div key={f.img} ref={(el) => { plates.current[i] = el; }} className="absolute inset-0 will-change-transform" style={{ opacity: i === 0 ? 1 : 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.img} alt={f.alt} className="h-full w-full object-cover" style={{ objectPosition: f.pos, filter: "saturate(.92) contrast(1.06)" }} draggable={false} />
          </div>
        ))}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,.55) 100%), linear-gradient(to top, rgba(4,8,14,.88) 0%, rgba(4,8,14,.25) 42%, rgba(4,8,14,.35) 100%)" }} />
        <div aria-hidden className="grain pointer-events-none absolute inset-0" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-[7vh] bg-black" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[7vh] bg-black" />

        <p className="absolute left-4 top-[calc(7vh+1.25rem)] text-sm font-semibold tracking-wide text-paper/80 md:left-10">One school morning</p>
        <p className="absolute right-4 top-[calc(7vh+1rem)] md:right-10"><span ref={clock} className="display text-4xl font-extrabold tabular-nums sm:text-5xl md:text-7xl" style={{ fontVariationSettings: '"wdth" 75' }}>7:30</span></p>

        <div className="absolute inset-x-4 bottom-[calc(7vh+4.2rem)] flex items-end justify-between gap-6 md:inset-x-10">
          <div className="max-w-xl" aria-live="polite">
            <h2 key={front} className="display text-3xl font-extrabold leading-[1.04] sm:text-4xl md:text-6xl" style={{ animation: "seqIn .7s cubic-bezier(.2,.8,.2,1) both" }}>{c.title}</h2>
            <p key={"t" + front} className="mt-3 max-w-md text-base text-paper/80 md:text-lg" style={{ animation: "seqIn .7s .08s cubic-bezier(.2,.8,.2,1) both" }}>{c.text}</p>
          </div>
          <div key={"s" + front} className="hidden text-right md:block" style={{ animation: "seqIn .7s .15s cubic-bezier(.2,.8,.2,1) both" }}>
            <p className="display text-7xl font-extrabold leading-none text-sun" style={{ fontVariationSettings: '"wdth" 75' }}>{c.stat}</p>
            <p className="mt-1 text-sm text-paper/70">{c.statNote}</p>
          </div>
        </div>

        <div className="absolute inset-x-4 bottom-[calc(7vh+1.2rem)] md:inset-x-10" aria-hidden>
          <div className="relative h-px bg-paper/30">
            <div ref={fill} className="absolute inset-y-0 left-0 h-[2px] w-full origin-left -translate-y-[0.5px] bg-sun" style={{ transform: "scaleX(0)" }} />
            {marks.map((m) => (
              <div key={m.label} className="absolute top-0" style={{ left: `${m.at * 100}%` }}>
                <span className="absolute -top-[5px] block h-[11px] w-px -translate-x-1/2 bg-paper/70" />
                <span className={`absolute top-3 whitespace-nowrap text-xs text-paper/70 ${m.at === 0 ? "left-0" : m.at === 1 ? "right-0" : "-translate-x-1/2"}`}>{m.label}</span>
              </div>
            ))}
            <div ref={dot} className="absolute top-0 -translate-x-1/2 -translate-y-1/2" style={{ left: "0%" }}>
              <span className="block h-3.5 w-3.5 rounded-full bg-sun shadow-[0_0_0_6px_rgba(255,184,28,.28)]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const portals = [
  { href: "/login?as=parent", who: "Parents", what: "See the bus on a map, get the arrival time and a heads-up before it reaches your gate.", cta: "Follow my child's bus", img: "/images/story-gate.jpg", pos: "50% 40%" },
  { href: "/login?as=driver", who: "Drivers", what: "One big button starts the trip and shares the bus location. Your stops are listed in order.", cta: "Start a route", img: "/images/story-cabin.jpg", pos: "50% 50%" },
  { href: "/login?as=admin", who: "School admin", what: "Create driver and parent accounts, assign buses and pin each child's home stop.", cta: "Open admin", img: "/images/bus-hero.jpg", pos: "62% 50%" },
];

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const f = () => setScrolled(scrollY > innerHeight * 0.6);
    f();
    addEventListener("scroll", f, { passive: true });
    return () => removeEventListener("scroll", f);
  }, []);
  return (
    <div className="relative">
      <DepthHero
        headline={
          <h1 aria-label="Where's the bus?" className="display hero-title absolute left-[2.5vw] right-[2.5vw] font-extrabold uppercase leading-[.9] text-ink" style={{ fontSize: "var(--hs)", letterSpacing: "-0.012em", fontVariationSettings: '"wdth" 75' }}>
            <Assemble text={"Where’s the bus?"} />
          </h1>
        }
      />

      <nav className={`fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3 transition-colors md:px-10 ${scrolled ? "border-b border-ink/10 bg-paper/90 backdrop-blur" : ""}`}>
        <Wordmark />
        <div className="flex items-center gap-1 text-sm font-semibold">
          <a href="/login?as=parent" className="hidden rounded-lg px-3 py-2 hover:bg-ink/10 sm:block">Parents</a>
          <a href="/login?as=driver" className="hidden rounded-lg px-3 py-2 hover:bg-ink/10 sm:block">Drivers</a>
          <a href="/login?as=admin" className="btn btn-solid whitespace-nowrap !px-4 !py-2">School admin</a>
        </div>
      </nav>

      <main className="relative z-10">
        <section className="flex min-h-screen items-end px-4 pb-8 md:px-10 md:pb-12">
          <div className="max-w-md" data-hero-cta>
            <p className="hero-lede text-base font-medium sm:text-lg md:text-xl">Live location, arrival time and a heads-up before the bus reaches your gate.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/login?as=parent" className="btn btn-sun !px-4 sm:!px-6">Follow my child&rsquo;s bus</a>
              <a href="/login?as=driver" className="btn btn-line bg-paper/70 !px-4 sm:!px-6">Start a route</a>
            </div>
          </div>
        </section>

        <Road />
        <Sequence />

        <section className="bg-paper px-4 py-20 md:px-10 md:py-28" id="portals">
          <h2 className="display max-w-3xl text-4xl font-extrabold leading-[1.02] md:text-6xl">Everyone gets their own door.</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {portals.map((p) => (
              <a key={p.who} href={p.href} className="group relative block h-[480px] overflow-hidden rounded-2xl bg-ink text-paper shadow-[0_1px_0_rgba(15,29,46,.08)] ring-1 ring-ink/10 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_30px_60px_-20px_rgba(15,29,46,.55)] md:h-[560px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.img} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.07]" style={{ objectPosition: p.pos }} />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(10,16,24,.92), rgba(10,16,24,.2) 62%, rgba(10,16,24,.1))" }} />
                <div className="absolute inset-x-0 bottom-0 p-6 md:p-7">
                  <h3 className="display text-4xl font-extrabold md:text-5xl">{p.who}</h3>
                  <p className="mt-2 max-w-xs text-paper/85">{p.what}</p>
                  <span className="btn btn-sun mt-5">{p.cta}<span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-ink text-sun transition-transform duration-300 group-hover:rotate-45">↗</span></span>
                </div>
              </a>
            ))}
          </div>
        </section>

        <footer className="relative overflow-hidden bg-ink text-paper">
          <div className="relative px-4 pb-14 pt-20 md:px-10 md:pb-20 md:pt-28">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/story-arrival.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, #0F1D2E 8%, rgba(15,29,46,.55) 55%, rgba(15,29,46,.85))" }} />
            <div className="relative max-w-3xl">
              <p className="display text-5xl font-extrabold leading-[1.04] md:text-7xl" style={{ fontVariationSettings: '"wdth" 75' }}>The bus is on its way. Are you at the gate?</p>
              <p className="mt-5 max-w-md text-lg text-paper/80">Parents see the bus live. Drivers share it with one button. The school stays in control.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="/login?as=parent" className="btn btn-sun">Follow my child&rsquo;s bus</a>
                <a href="/login?as=driver" className="btn btn-line !border-paper/60 !text-paper hover:!bg-paper/10">Start a route</a>
              </div>
            </div>
          </div>
          <div className="px-4 md:px-10">
            <div className="grid gap-10 border-t border-paper/15 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <div>
                <Logo size={34} className="text-paper" />
                <p className="mt-4 max-w-xs text-sm text-paper/65">Live school bus tracking for parents, drivers and school transport teams.</p>
              </div>
              {[
                { h: "Sign in", l: [["Parents", "/login?as=parent"], ["Drivers", "/login?as=driver"], ["School admin", "/login?as=admin"]] },
                { h: "How it works", l: [["The road ahead", "#how"], ["One school morning", "#morning"], ["Portals", "#portals"]] },
                { h: "Good to know", l: [["Accounts are created by the school admin", ""], ["No public sign-up", ""], ["Arrival at a stop is not a drop-off check", ""]] },
              ].map((c) => (
                <div key={c.h}>
                  <p className="text-sm font-semibold text-paper">{c.h}</p>
                  <ul className="mt-4 space-y-2 text-sm text-paper/65">
                    {c.l.map(([t, h]) => <li key={t}>{h ? <a href={h} className="transition-colors hover:text-sun">{t}</a> : t}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div aria-hidden className="select-none overflow-hidden px-2 text-center">
            <p className="display font-extrabold leading-[.8] text-paper/[.07]" style={{ fontSize: "clamp(4rem, 21vw, 26rem)", letterSpacing: "0.02em", fontVariationSettings: '"wdth" 75' }}>NEXKIDO</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-paper/15 px-4 py-5 text-xs text-paper/55 md:px-10">
            <p>&copy; {new Date().getFullYear()} NexKido</p>
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="font-semibold text-paper/80 hover:text-sun">Back to top</button>
          </div>
        </footer>
      </main>
    </div>
  );
}
