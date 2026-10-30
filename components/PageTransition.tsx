"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Mark } from "./Logo";

const EASE = "cubic-bezier(.7,0,.15,1)";
const CLOSE = 560, OPEN = 640, RIM = 110; // ms; the yellow rim leads on the way in and lingers on the way out
type Phase = "idle" | "close" | "open";

/**
 * Route changes iris open from the exact point you clicked: a navy disc with a sun-yellow rim swallows the old page,
 * the mark draws itself, then the disc shrinks back onto the new page. A one-time intro (per session) irises shut
 * on the mark at the centre of the screen.
 */
export default function PageTransition() {
  const router = useRouter();
  const path = usePathname();
  const [intro, setIntro] = useState<"cover" | "open" | "done">("cover"); // starts covered, so no flash before the intro
  const [phase, setPhase] = useState<Phase>("idle");
  const [at, setAt] = useState({ x: 0, y: 0, r: 0 });
  const phaseRef = useRef<Phase>("idle");
  const waiting = useRef(false);
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  const set = useCallback((p: Phase) => { phaseRef.current = p; setPhase(p); }, []);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("nk-intro") === "1"; } catch {}
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setIntro("done"); return; }
    try { sessionStorage.setItem("nk-intro", "1"); } catch {}
    document.documentElement.dataset.intro = "1";
    later(() => setIntro("open"), 1300);
    later(() => setIntro("done"), 1300 + 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The new route has rendered: open the iris onto it.
  useEffect(() => {
    if (!waiting.current || phaseRef.current !== "close") return;
    waiting.current = false;
    later(() => set("open"), 140);
    later(() => set("idle"), 140 + OPEN + RIM + 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const go = useCallback((href: string, x?: number, y?: number) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { router.push(href); return; }
    if (phaseRef.current !== "idle") return;
    const px = x ?? innerWidth / 2, py = y ?? innerHeight / 2;
    // set the centre while the discs are idle (no transition), then start closing on the next frames
    setAt({ x: px, y: py, r: Math.hypot(Math.max(px, innerWidth - px), Math.max(py, innerHeight - py)) + 24 });
    waiting.current = true;
    phaseRef.current = "close"; // lock out further clicks right away
    requestAnimationFrame(() => requestAnimationFrame(() => setPhase("close")));
    later(() => router.push(href), 40 + CLOSE + RIM + 30);
    later(() => { if (phaseRef.current === "close") { waiting.current = false; set("open"); later(() => set("idle"), OPEN + RIM + 80); } }, 7000); // safety net
  }, [router, later, set]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      e.preventDefault();
      go(url.pathname + url.search, e.clientX, e.clientY);
    };
    const onGo = (e: Event) => { const d = (e as CustomEvent<{ href: string; x?: number; y?: number }>).detail; go(d.href, d.x, d.y); };
    document.addEventListener("click", onClick, true);
    window.addEventListener("nk:go", onGo);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("nk:go", onGo); };
  }, [go]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const covered = phase === "close";
  const disc = (delayIn: number, delayOut: number) => ({
    clipPath: `circle(${covered ? at.r : 0}px at ${at.x}px ${at.y}px)`,
    transition: phase === "idle" ? "none" : `clip-path ${covered ? CLOSE : OPEN}ms ${EASE} ${covered ? delayIn : delayOut}ms`,
  });
  const showing = phase !== "idle" || waiting.current;

  return (
    <>
      <noscript><style>{".nk-intro{display:none}"}</style></noscript>
      {intro !== "done" && (
        <div aria-hidden className="nk-intro fixed inset-0 z-[200] grid place-items-center bg-ink text-paper" style={{ clipPath: intro === "open" ? "circle(0% at 50% 50%)" : "circle(150% at 50% 50%)", transition: `clip-path 950ms ${EASE}`, pointerEvents: "auto" }}>
          <Mark size={110} animate />
        </div>
      )}
      <div aria-hidden className="fixed inset-0 z-[190]" style={{ visibility: showing ? "visible" : "hidden", pointerEvents: showing ? "auto" : "none" }}>
        <div className="absolute inset-0" style={{ background: "#FFB81C", ...disc(0, RIM) }} />
        <div className="absolute inset-0 grid place-items-center bg-ink text-paper" style={disc(RIM, 0)}>
          {covered && <Mark key={at.x + ":" + at.y} size={110} animate />}
        </div>
      </div>
    </>
  );
}
