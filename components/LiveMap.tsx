"use client";
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import { STYLE_URL, guardStyle } from "@/lib/mapstyle";
import { haversineKm, type LL } from "@/lib/geo";
import { buildPath, lerpAngle, offset, pointAt, project, ringAround, sliceFrom, sliceTo, type Path } from "@/lib/path";
import { busEl, originEl, pinEl, stopEl } from "@/lib/mapicons";

if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

export type Bus = { lat: number; lng: number; heading: number | null; speed: number | null; accuracy: number | null; start?: LL | null; at: number }; // speed m/s, at = when this fix was current (client clock)
export type StopMark = { id: string; lat: number; lng: number; n: number; done?: boolean; label?: string };
export type RouteInfo = { remainingM: number; etaS: number; totalM: number; provider: string; onRoute: boolean };
export type Mode = "follow" | "overview" | "free";
type Pad = { top: number; bottom: number; left: number; right: number };

type Props = {
  bus: Bus | null;
  dest?: LL | null;                 // where the bus is heading now (home for a parent, the next stop for a driver): ETA and navigation
  plan?: LL[];                      // every stop in order: the blue line runs from the start through all of them (defaults to just dest)
  preview?: LL | null;              // no bus on the road yet: draw the planned route from here to the stops anyway
  stops?: StopMark[];               // other stops, shown as numbered dots
  mode: Mode;
  padding?: Pad;                    // screen area covered by sheets/cards, so the bus is centred in what's left
  showAccuracy?: boolean;
  onUserMove?: () => void;          // the person dragged/rotated/zoomed: stop following
  onInfo?: (i: RouteInfo | null) => void;
};

const SNAP_M = 35;                  // closer than this to the route and the bus is drawn on the road
const EMPTY = { type: "FeatureCollection" as const, features: [] };
const line = (c: [number, number][]) => ({ type: "FeatureCollection" as const, features: [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: c } }] });

export default function LiveMap(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const P = useRef(props); P.current = props;
  const modeFlag = useRef(0);
  const prevMode = useRef(props.mode);
  if (prevMode.current !== props.mode) { prevMode.current = props.mode; modeFlag.current++; }

  const stopsRef = useRef<{ sync: () => void }>({ sync: () => {} });
  useEffect(() => stopsRef.current.sync(), [props.stops]);

  useEffect(() => {
    const first = P.current.dest ?? P.current.bus ?? { lat: 20.5937, lng: 78.9629 };
    const map = new maplibregl.Map({
      container: box.current!, style: STYLE_URL, center: [first.lng, first.lat], zoom: P.current.dest || P.current.bus ? 15.5 : 4,
      attributionControl: false, pitchWithRotate: true, maxPitch: 70, cooperativeGestures: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    guardStyle(map);

    const busMarker = new maplibregl.Marker({ element: busEl(), rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([first.lng, first.lat]);
    busMarker.getElement().style.display = "none";
    busMarker.addTo(map);
    const rot = busMarker.getElement().querySelector<HTMLElement>(".nk-rot")!;
    const pinNode = pinEl();
    const destMarker = new maplibregl.Marker({ element: pinNode, anchor: "bottom" });
    const bubble = pinNode.querySelector<HTMLElement>(".nk-bubble")!;
    let destOn = false;
    const originMarker = new maplibregl.Marker({ element: originEl() });
    let originOn = false;
    const stopMarkers = new Map<string, maplibregl.Marker>();

    // everything the animation loop needs between frames
    const S = {
      path: null as Path | null, dur: 0, dist: 0, provider: "", routeAt: 0, routeTry: 0, fetching: false, destKey: "",
      origin: null as LL | null, full: null as Path | null, fullTry: 0, fullFetching: false, gen: 0, fullS: -1, fullOff: 0, preLen: 0, planKey: "", trail: [] as [number, number][], previewFit: false,
      s: -1, cur: null as LL | null, disp: null as LL | null, heading: 0, camB: 0, vEma: 0, off: 0,
      srcAt: 0, infoAt: 0, camAt: 0, last: performance.now(), loaded: false, fitted: false, seenFlag: modeFlag.current,
    };

    const overlays = () => {
      if (!map.getSource("route")) {
        const round = { "line-cap": "round" as const, "line-join": "round" as const };
        map.addSource("done", { type: "geojson", data: EMPTY });
        map.addSource("route", { type: "geojson", data: EMPTY });
        map.addLayer({ id: "done-casing", type: "line", source: "done", layout: round, paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.9 } });
        map.addLayer({ id: "done-line", type: "line", source: "done", layout: round, paint: { "line-color": "#9AA0A6", "line-width": 5.5 } });
        map.addLayer({ id: "route-casing", type: "line", source: "route", layout: round, paint: { "line-color": "#ffffff", "line-width": 12, "line-opacity": 0.95 } });
        map.addLayer({ id: "route-line", type: "line", source: "route", layout: round, paint: { "line-color": "#1A73E8", "line-width": 7 } });
        map.addSource("acc", { type: "geojson", data: EMPTY });
        map.addLayer({ id: "acc-fill", type: "fill", source: "acc", paint: { "fill-color": "#FFB81C", "fill-opacity": 0.2 } }, "route-casing");
      }
    };
    map.on("style.load", overlays);
    map.on("load", () => { S.loaded = true; overlays(); });

    const touch = (e: { originalEvent?: unknown }) => { if (e.originalEvent) P.current.onUserMove?.(); };
    map.on("dragstart", touch); map.on("rotatestart", touch); map.on("pitchstart", touch); map.on("zoomstart", touch);
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current!);

    stopsRef.current.sync = () => {
      const want = new Map((P.current.stops ?? []).map((s) => [s.id, s]));
      stopMarkers.forEach((m, id) => { if (!want.has(id)) { m.remove(); stopMarkers.delete(id); } });
      want.forEach((s, id) => {
        const old = stopMarkers.get(id);
        if (old) old.remove();
        stopMarkers.set(id, new maplibregl.Marker({ element: stopEl(s.n, s.done, s.label) }).setLngLat([s.lng, s.lat]).addTo(map));
      });
    };
    stopsRef.current.sync();

    async function fetchRoute(from: LL, to: LL) {
      S.fetching = true; S.routeTry = Date.now();
      try {
        const r = await fetch(`/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (Array.isArray(j.coords) && j.coords.length > 1) { S.path = buildPath(j.coords); S.dur = j.durationS; S.dist = j.distanceM; S.provider = j.provider; S.s = -1; S.routeAt = Date.now(); S.off = 0; }
      } catch { /* try again after a pause; the bus still moves in a straight line meanwhile */ }
      S.fetching = false;
    }

    /** The whole trip from where it began to the destination, fetched once, so the line reads start to finish like Google. */
    async function fetchFull(from: LL, pts: LL[]) {
      S.fullFetching = true; S.fullTry = Date.now();
      const gen = ++S.gen;
      const to = pts[pts.length - 1], via = pts.slice(0, -1).slice(0, 12);
      try {
        const q = `from=${from.lat},${from.lng}&to=${to.lat},${to.lng}${via.length ? "&via=" + via.map((v) => `${v.lat},${v.lng}`).join(";") : ""}`;
        const r = await fetch(`/api/route?${q}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (gen === S.gen && Array.isArray(j.coords) && j.coords.length > 1) { S.full = buildPath(j.coords); S.fullS = -1; S.fullOff = 0; if (j.provider === "straight") S.fullTry = Date.now() - 3000; /* retry soon: that was only a straight line */ }
      } catch { /* the grey trail and the live route still draw; try again later */ }
      S.fullFetching = false;
    }

    const fit = (disp: LL | null, dest: LL | null, ms: number, pad: Pad) => {
      const pts: LL[] = [];
      if (disp) pts.push(disp);
      if (dest) pts.push(dest);
      if (S.origin) pts.push(S.origin);
      const whole: [number, number][] | null = S.full ? S.full.pts : S.path && S.s >= 0 ? sliceFrom(S.path, S.s) : null;
      if (whole) { const n = Math.max(1, Math.floor(whole.length / 40)); for (let i = 0; i < whole.length; i += n) pts.push({ lat: whole[i][1], lng: whole[i][0] }); }
      if (!pts.length) return;
      if (pts.length === 1) { map.easeTo({ center: [pts[0].lng, pts[0].lat], zoom: 15.5, bearing: 0, pitch: 0, padding: pad, duration: ms }); return; }
      const b = new maplibregl.LngLatBounds();
      pts.forEach((p) => b.extend([p.lng, p.lat]));
      const cam = map.cameraForBounds(b, { padding: { top: pad.top + 50, bottom: pad.bottom + 50, left: pad.left + 40, right: pad.right + 40 }, maxZoom: 17 });
      if (cam) map.easeTo({ center: cam.center as [number, number], zoom: cam.zoom, bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: ms });
    };

    let raf = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (!S.loaded) return;
      const dt = Math.min(0.1, (t - S.last) / 1000); S.last = t;
      const { bus, dest, mode, padding, showAccuracy, onInfo } = P.current;
      const pad = padding ?? { top: 0, bottom: 0, left: 0, right: 0 };
      const now = Date.now();
      const modeChanged = S.seenFlag !== modeFlag.current; S.seenFlag = modeFlag.current;

      // destination pin
      if (dest) { destMarker.setLngLat([dest.lng, dest.lat]); if (!destOn) { destMarker.addTo(map); destOn = true; } } else if (destOn) { destMarker.remove(); destOn = false; }
      const dKey = dest ? `${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}` : "";
      const planPts = (P.current.plan && P.current.plan.length ? P.current.plan : dest ? [dest] : []);
      const planKey = planPts.map((q) => `${q.lat.toFixed(5)},${q.lng.toFixed(5)}`).join("|");
      const clearLines = () => { (map.getSource("route") as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY); (map.getSource("done") as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY); };
      const resetLeg = () => { S.gen++; S.origin = null; S.full = null; S.fullS = -1; S.fullOff = 0; S.preLen = 0; S.trail = []; S.fullTry = 0; S.fullFetching = false; S.previewFit = false; if (originOn) { originMarker.remove(); originOn = false; } };
      if (dKey !== S.destKey) { S.destKey = dKey; S.path = null; S.s = -1; S.fitted = false; clearLines(); }
      if (planKey !== S.planKey) { S.planKey = planKey; resetLeg(); clearLines(); }

      if (!bus) {
        busMarker.getElement().style.display = "none"; S.cur = null; S.disp = null; S.path = null;
        const pv = P.current.preview;
        if (pv && planPts.length) {
          // the bus hasn't left: show where it will go, from where it started last time
          if (!S.origin || S.origin.lat !== pv.lat || S.origin.lng !== pv.lng) { resetLeg(); S.origin = { lat: pv.lat, lng: pv.lng }; }
          originMarker.setLngLat([pv.lng, pv.lat]); if (!originOn) { originMarker.addTo(map); originOn = true; }
          if (!S.full && !S.fullFetching && now - S.fullTry > 6000) void fetchFull(S.origin, planPts);
          if (S.full) {
            (map.getSource("route") as maplibregl.GeoJSONSource | undefined)?.setData(line(S.full.pts));
            (map.getSource("done") as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY);
            if (!S.previewFit || modeChanged) { S.previewFit = true; fit(null, dest ?? null, 800, pad); }
          }
        } else { resetLeg(); clearLines(); }
        (map.getSource("acc") as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY);
        bubble.style.display = "none"; onInfo?.(null);
        if (dest && !(pv && planPts.length) && (!S.fitted || modeChanged)) { S.fitted = true; map.easeTo({ center: [dest.lng, dest.lat], zoom: 15.5, bearing: 0, pitch: 0, padding: pad, duration: 700 }); }
        return;
      }
      busMarker.getElement().style.display = "block";

      // where the bus is *now*: the last fix, pushed forward along the road by its speed since the fix arrived
      const age = Math.min(3, Math.max(0, (now - bus.at) / 1000));
      const v = bus.speed != null && bus.speed > 0.7 ? bus.speed : 0;
      S.vEma += ((bus.speed ?? 0) - S.vEma) * (1 - Math.exp(-dt / 20));
      const hd = bus.heading ?? S.heading;
      let tgt: LL = { lat: bus.lat, lng: bus.lng }, on = false;
      if (S.path) {
        const pr = project(S.path, tgt);
        if (pr.dist <= SNAP_M) { on = true; const q = pointAt(S.path, Math.min(S.path.total, pr.s + v * age)); tgt = { lat: q.lat, lng: q.lng }; }
      }
      if (!on && v > 0) tgt = offset(tgt, hd, v * age);
      if (!S.cur || haversineKm(S.cur, tgt) * 1000 > 80) S.cur = { ...tgt };
      else { const k = 1 - Math.exp(-dt / 0.4); S.cur.lat += (tgt.lat - S.cur.lat) * k; S.cur.lng += (tgt.lng - S.cur.lng) * k; }

      // draw on the road: progress along the route only ever moves forward
      let disp: LL = S.cur, aim = hd;
      let onRoute = false;
      if (S.path) {
        const pc = project(S.path, S.cur);
        if (pc.dist <= SNAP_M) {
          onRoute = true; S.off = 0;
          S.s = S.s < 0 || pc.s < S.s - 40 ? pc.s : Math.max(S.s, pc.s);
          const q = pointAt(S.path, S.s); disp = { lat: q.lat, lng: q.lng };
          aim = pointAt(S.path, Math.min(S.path.total, S.s + 25)).bearing;
        } else S.off += dt;
      }
      S.heading = lerpAngle(S.heading || aim, aim, 1 - Math.exp(-dt / 0.3));
      S.disp = disp;
      busMarker.setLngLat([disp.lng, disp.lat]);
      rot.style.transform = `rotate(${S.heading}deg)`;

      // road route to the destination: fetch, and refetch when stale or when the bus leaves it
      if (dest && !S.fetching && now - S.routeTry > 3000 && (!S.path || now - S.routeAt > 20000 || (S.off > 3 && now - S.routeAt > 5000))) void fetchRoute(disp, dest);

      // where this leg began: the trip's first fix (sent by the server), or, on the driver's own screen, where the bus was when the leg started
      if (!S.origin && planPts.length) { S.origin = bus.start ?? { lat: disp.lat, lng: disp.lng }; S.trail = [[S.origin.lng, S.origin.lat]]; }
      if (S.origin && planPts.length) {
        originMarker.setLngLat([S.origin.lng, S.origin.lat]);
        if (!originOn) { originMarker.addTo(map); originOn = true; }
        if (!S.full && !S.fullFetching && now - S.fullTry > 6000) void fetchFull(S.origin, planPts);
      }
      const last = S.trail[S.trail.length - 1];
      if (last && haversineKm({ lat: last[1], lng: last[0] }, disp) * 1000 > 12) { S.trail.push([disp.lng, disp.lat]); if (S.trail.length > 3000) S.trail.shift(); }

      if (now - S.srcAt > 250 && (S.path ? S.s >= 0 : !!S.full)) {
        S.srcAt = now;
        let pf = S.full ? (S.fullS >= 0 ? project(S.full, disp, S.fullS - 60, S.fullS + 900) : project(S.full, disp)) : null;
        if (S.full && pf && pf.dist > 80 && S.fullS >= 0) pf = project(S.full, disp);
        const onFull = !!(pf && S.full && pf.dist <= 80); // on the planned road: draw one clean line, grey behind the bus and blue ahead
        if (onFull) { S.fullS = pf!.s; S.fullOff = 0; } else if (S.full) S.fullOff += 0.25;
        // left the planned road for good: plan again from here, keeping the grey trail behind
        if (S.full && S.fullOff > 8 && !S.fullFetching && now - S.fullTry > 6000) { S.preLen = S.trail.length; void fetchFull(disp, planPts); }
        const before = S.trail.slice(0, S.preLen);
        const rest = onFull ? sliceFrom(S.full!, pf!.s) : S.path && S.s >= 0 ? sliceFrom(S.path, S.s) : null;
        const done = onFull ? (before.length ? [...before, ...sliceTo(S.full!, pf!.s)] : sliceTo(S.full!, pf!.s)) : S.trail.length > 1 ? [...S.trail, [disp.lng, disp.lat] as [number, number]] : null;
        if (rest) (map.getSource("route") as maplibregl.GeoJSONSource | undefined)?.setData(line(rest));
        (map.getSource("done") as maplibregl.GeoJSONSource | undefined)?.setData(done ? line(done) : EMPTY);
      }

      // numbers for the screen, once a second
      if (now - S.infoAt > 1000) {
        S.infoAt = now;
        const remaining = dest ? (S.path && S.s >= 0 ? Math.max(0, S.path.total - S.s) : haversineKm(disp, dest) * 1300) : 0;
        const avg = S.path ? S.path.total / Math.max(30, S.dur) : 5.5;
        const speed = S.vEma > 2.5 ? 0.5 * avg + 0.5 * S.vEma : avg;
        const etaS = remaining / Math.max(2, speed);
        if (dest) {
          bubble.style.display = "block";
          bubble.textContent = remaining < 60 ? "Here" : etaS < 90 ? "1 min" : `${Math.round(etaS / 60)} min`;
        }
        onInfo?.(dest ? { remainingM: remaining, etaS, totalM: S.path?.total ?? remaining, provider: S.path ? S.provider : "straight", onRoute } : null);
        const accSrc = map.getSource("acc") as maplibregl.GeoJSONSource | undefined;
        accSrc?.setData(showAccuracy && bus.accuracy && bus.accuracy > 12 ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ringAround(disp, Math.min(bus.accuracy, 300))] } }] } : EMPTY);
      }

      // camera
      if (mode === "follow" && (modeChanged || now - S.camAt > 700)) {
        S.camAt = now;
        S.camB = lerpAngle(S.camB || S.heading, S.heading, modeChanged ? 1 : 0.6);
        const sp = Math.max(S.vEma, v);
        map.easeTo({ center: [disp.lng, disp.lat], bearing: S.camB, pitch: 58, zoom: 17.6 - Math.min(1, sp / 15) * 1.6, padding: pad, duration: modeChanged ? 1400 : 900, easing: modeChanged ? undefined : (x) => x, essential: true });
      } else if (mode === "overview" && (modeChanged || !S.fitted || now - S.camAt > 5000)) {
        S.camAt = now; S.fitted = true;
        fit(disp, dest ?? null, 1000, pad);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); stopMarkers.forEach((m) => m.remove()); originMarker.remove(); map.remove(); };
  }, []);

  return <div ref={box} className="h-full w-full" />;
}
