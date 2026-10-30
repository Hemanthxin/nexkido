"use client";

const W = 520, H = 340, GAP = 82;
const HOME = { x: 400, y: 84 };
const ROUTE = "M36 296 C 120 296 110 170 214 190 S 330 260 372 150 S 392 100 400 84";

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));

function MapLayer() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      <rect width={W} height={H} fill="#f4f7fa" />
      <rect x="60" y="40" width="110" height="70" rx="6" fill="#dcebd9" />
      <path d="M0 230 C 120 200 260 260 520 210 L520 250 C 260 300 120 250 0 280Z" fill="#d6e6f4" />
      {[60, 130, 200, 270].map((y) => <line key={y} x1="0" x2={W} y1={y} y2={y + (y % 3 ? 14 : -10)} stroke="#dfe5ec" strokeWidth="9" />)}
      {[70, 160, 250, 340, 430].map((x) => <line key={x} y1="0" y2={H} x1={x} x2={x + (x % 3 ? 16 : -12)} stroke="#dfe5ec" strokeWidth="9" />)}
      {[60, 130, 200, 270].map((y) => <line key={`i${y}`} x1="0" x2={W} y1={y} y2={y + (y % 3 ? 14 : -10)} stroke="#fff" strokeWidth="5" />)}
      {[70, 160, 250, 340, 430].map((x) => <line key={`j${x}`} y1="0" y2={H} x1={x} x2={x + (x % 3 ? 16 : -12)} stroke="#fff" strokeWidth="5" />)}
    </svg>
  );
}

function RouteLayer() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      <path d={ROUTE} fill="none" stroke="#0F1D2E" strokeWidth="11" strokeLinecap="round" strokeOpacity=".9" />
      <path d={ROUTE} fill="none" stroke="#FFB81C" strokeWidth="6" strokeLinecap="round" />
      {[{ x: 214, y: 190 }, { x: 372, y: 150 }].map((s) => <circle key={s.x} cx={s.x} cy={s.y} r="9" fill="#fff" stroke="#0F1D2E" strokeWidth="4" />)}
      <g transform={`translate(${HOME.x} ${HOME.y})`}>
        <circle r="14" fill="#0F1D2E" /><circle r="5" fill="#FFB81C" />
      </g>
    </svg>
  );
}

function ZoneLayer() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {[{ r: 88, km: "1 km" }, { r: 176, km: "2 km" }].map((z) => (
        <g key={z.km}>
          <circle cx={HOME.x} cy={HOME.y} r={z.r} fill="#FFB81C" fillOpacity=".1" stroke="#0F1D2E" strokeWidth="2.5" strokeDasharray="4 9" />
          <text x={HOME.x - z.r * 0.7} y={HOME.y + z.r * 0.72} fontSize="17" fontWeight="700" fill="#0F1D2E">{z.km}</text>
        </g>
      ))}
    </svg>
  );
}

function BusLayer() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      <g transform="translate(300 232)">
        <circle r="30" fill="#FFB81C" fillOpacity=".3" /><circle r="15" fill="#FFB81C" stroke="#0F1D2E" strokeWidth="5" />
      </g>
    </svg>
  );
}

function AppLayer({ mins }: { mins: number }) {
  return (
    <div className="absolute bottom-4 left-4 w-[236px] rounded-2xl bg-paper p-4 shadow-xl">
      <p className="text-xs font-semibold text-ink/60">Kid&rsquo;s bus</p>
      <p className="display text-5xl font-extrabold leading-none">{mins > 0 ? mins : "–"}<span className="ml-1 text-lg font-bold">{mins > 0 ? "min" : ""}</span></p>
      <p className="mt-1 text-xs font-semibold text-ok">{mins > 0 ? "On the way" : "At your stop"}</p>
      <p className="mt-2 border-t border-ink/10 pt-2 text-[11px] leading-snug text-ink/75">Your child&rsquo;s bus is approximately 1 km away. Please get ready.</p>
    </div>
  );
}

/**
 * An exploded view of the product: the interface is a stack of layers that separate in isometric space,
 * each labelled. `e` is how far apart they are (0 = collapsed, 1 = fully exploded).
 */
export default function ExplodedUI({ e, mins, labels = true }: { e: number; mins: number; labels?: boolean }) {
  const layers = [
    { name: "Map", note: "Streets around the home stop", node: <MapLayer />, fill: "rgba(248,251,254,.97)" },
    { name: "Route and stops", note: "The bus's assigned route", node: <RouteLayer />, fill: "rgba(255,255,255,.3)" },
    { name: "Alert zones", note: "2 km and 1 km, sent once per trip", node: <ZoneLayer />, fill: "rgba(255,255,255,.3)" },
    { name: "Live bus", note: "Position refreshes every 4 seconds", node: <BusLayer />, fill: "rgba(255,255,255,.3)" },
    { name: "Parent app", note: "ETA, status and alerts", node: <AppLayer mins={mins} />, fill: "rgba(255,255,255,.3)" },
  ];
  const label = clamp((e - 0.55) / 0.4);
  const vis = clamp(e / 0.12);
  return (
    <div className="relative" style={{ width: W, height: H, opacity: vis }}>
      <div style={{ perspective: 2200 }} className="absolute inset-0">
        <div className="absolute inset-0" style={{ transformStyle: "preserve-3d", transform: `rotateX(${58 * e}deg) rotateZ(${-36 * e}deg)` }}>
          {layers.map((l, i) => (
            <div key={l.name} className="absolute inset-0 overflow-hidden rounded-2xl" style={{ transform: `translateZ(${i * GAP * e}px)`, background: l.fill, border: "2px solid rgba(255,255,255,.9)", boxShadow: "0 18px 40px rgba(10,6,2,.35)" }}>
              {l.node}
            </div>
          ))}
        </div>
      </div>
      {labels && layers.map((l, i) => {
        const y = -(i - 2) * GAP * 0.86 * e; // where this layer sits on screen once the stack is tilted
        return (
          <div key={l.name} className="pointer-events-none absolute left-1/2 top-1/2" style={{ transform: `translate(0, ${y}px)`, opacity: label }}>
            <div className="absolute h-px bg-paper/90" style={{ left: 262, top: 0, width: 84 }} />
            <div className="absolute rounded-full bg-sun ring-2 ring-ink" style={{ left: 258, top: -3, width: 7, height: 7 }} />
            <div className="absolute whitespace-nowrap rounded-lg bg-paper px-3 py-1.5 shadow-lg" style={{ left: 346, top: 0, transform: "translateY(-50%)" }}>
              <p className="text-sm font-bold leading-tight">{l.name}</p>
              <p className="text-xs leading-tight text-ink/65">{l.note}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
