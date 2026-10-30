"use client";
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";

type Pt = { lat: number; lng: number };
export type MapMarker = Pt & { id: string; label?: string; emoji?: string; heading?: number | null };

// Vector layers (the route trail, accuracy ring) are built in a worker; host it ourselves so the bundler need not.
if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.45, "raster-contrast": 0.05 } }],
};

/** Bus = a big yellow disc with a heading arrow; stops = small navy dots with a white ring. */
function el(m: MapMarker) {
  const d = document.createElement("div");
  d.title = m.label || "";
  if (m.emoji) {
    d.style.cssText = "width:34px;height:34px;position:relative";
    d.innerHTML = `<div class="nk-halo"></div><div class="nk-arrow" style="position:absolute;inset:0;transition:transform .6s linear"><svg viewBox="0 0 34 34" width="34" height="34"><path d="M17 1 L28 27 L17 21 L6 27Z" fill="#FFB81C" stroke="#0F1D2E" stroke-width="3" stroke-linejoin="round"/></svg></div>`;
  } else {
    d.style.cssText = "width:16px;height:16px;border-radius:50%;background:#0F1D2E;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)";
  }
  return d;
}

function circle(c: Pt, m: number, n = 48): { type: "Feature"; properties: Record<string, never>; geometry: { type: "Polygon"; coordinates: [number, number][][] } } {
  const R = 6371000, ring: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dLat = (m * Math.cos(a)) / R, dLng = (m * Math.sin(a)) / (R * Math.cos((c.lat * Math.PI) / 180));
    ring.push([c.lng + (dLng * 180) / Math.PI, c.lat + (dLat * 180) / Math.PI]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

/**
 * Shared map. Markers glide to new positions instead of jumping. `trail` draws the path travelled, `accuracy` draws the GPS
 * error ring, `locate` shows this device's own location (and starts there). `onPick` lets the user click to choose a point.
 */
export default function MapView({ markers, center, onPick, picked, follow, trail, accuracy, locate, fill, height = 420 }: {
  markers?: MapMarker[]; center?: Pt; onPick?: (p: Pt) => void; picked?: Pt | null; follow?: boolean;
  trail?: Pt[]; accuracy?: { lat: number; lng: number; m: number } | null; locate?: boolean; fill?: boolean; height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const mk = useRef<Record<string, { marker: maplibregl.Marker; cur: Pt; to: Pt; el: HTMLElement }>>({});
  const pick = useRef<maplibregl.Marker | null>(null);
  const me = useRef<maplibregl.Marker | null>(null);
  const cb = useRef(onPick); cb.current = onPick;
  const touched = useRef(false);
  const frameRef = useRef<(ms: number) => void>(() => {});
  const fitted = useRef(false);
  const latest = useRef({ trail, accuracy });
  latest.current = { trail, accuracy };
  const mkRef = useRef<{ markers?: MapMarker[]; follow?: boolean }>({});
  mkRef.current = { markers, follow };

  useEffect(() => {
    const c = center || { lat: 20.5937, lng: 78.9629 }; // India overview until a real position is known
    const m = new maplibregl.Map({ container: box.current!, style: STYLE, center: [c.lng, c.lat], zoom: center ? 14 : 4 });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("click", (e) => cb.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    m.on("dragstart", () => { touched.current = true; });
    m.on("zoomstart", (e) => { if ((e as unknown as { originalEvent?: unknown }).originalEvent) touched.current = true; });
    if (onPick) m.getCanvas().style.cursor = "crosshair";
    const frame = (ms: number) => {
      const list = mkRef.current.markers;
      if (!list?.length) return;
      const b = new maplibregl.LngLatBounds();
      list.forEach((x) => b.extend([x.lng, x.lat]));
      m.fitBounds(b, { padding: 80, maxZoom: 17, duration: ms });
      fitted.current = true;
    };
    frameRef.current = frame;
    const ro = new ResizeObserver(() => { m.resize(); if (!touched.current && mkRef.current.follow && !fitted.current) frame(0); });
    ro.observe(box.current!);
    m.on("load", () => {
      m.resize();
      if (mkRef.current.follow) frame(0);
      m.addSource("trail", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "trail-casing", type: "line", source: "trail", paint: { "line-color": "#0F1D2E", "line-width": 8, "line-opacity": 0.85 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "trail-line", type: "line", source: "trail", paint: { "line-color": "#FFB81C", "line-width": 4.5 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addSource("acc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "acc-fill", type: "fill", source: "acc", paint: { "fill-color": "#FFB81C", "fill-opacity": 0.18 } });
      m.addLayer({ id: "acc-line", type: "line", source: "acc", paint: { "line-color": "#0F1D2E", "line-width": 1.2, "line-opacity": 0.5 } });
      ready.current = true;
      push();
    });
    map.current = m;

    if (locate && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude };
        const dot = document.createElement("div");
        dot.style.cssText = "width:16px;height:16px;border-radius:50%;background:#2f7df6;border:3px solid #fff;box-shadow:0 0 0 8px rgba(47,125,246,.25)";
        me.current = new maplibregl.Marker({ element: dot }).setLngLat([here.lng, here.lat]).addTo(m);
        if (!center && !touched.current && !fitted.current) m.jumpTo({ center: [here.lng, here.lat], zoom: 15 });
      }, () => {}, { enableHighAccuracy: true, timeout: 10000 });
    }

    // glide markers toward their latest target
    let raf = 0, last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000); last = t;
      const k = 1 - Math.pow(0.001, dt); // ~1 s to settle
      for (const o of Object.values(mk.current)) {
        o.cur.lat += (o.to.lat - o.cur.lat) * k; o.cur.lng += (o.to.lng - o.cur.lng) * k;
        o.marker.setLngLat([o.cur.lng, o.cur.lat]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); m.remove(); mk.current = {}; pick.current = null; me.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function push() {
    const m = map.current; if (!m || !ready.current) return;
    const { trail: tr, accuracy: ac } = latest.current;
    (m.getSource("trail") as maplibregl.GeoJSONSource)?.setData({ type: "FeatureCollection", features: tr && tr.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: tr.map((p) => [p.lng, p.lat]) } }] : [] });
    (m.getSource("acc") as maplibregl.GeoJSONSource)?.setData({ type: "FeatureCollection", features: ac && ac.m > 0 ? [circle(ac, Math.min(ac.m, 400))] : [] });
  }
  useEffect(push, [trail, accuracy]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const ids = new Set((markers || []).map((x) => x.id));
    Object.keys(mk.current).forEach((id) => { if (!ids.has(id)) { mk.current[id].marker.remove(); delete mk.current[id]; } });
    (markers || []).forEach((x) => {
      const cur = mk.current[x.id];
      if (cur) {
        cur.to = { lat: x.lat, lng: x.lng };
        const a = cur.el.querySelector<HTMLElement>(".nk-arrow");
        if (a && x.heading != null) a.style.transform = `rotate(${x.heading}deg)`;
      } else {
        const element = el(x);
        const marker = new maplibregl.Marker({ element, rotationAlignment: "map" }).setLngLat([x.lng, x.lat]).addTo(m);
        mk.current[x.id] = { marker, cur: { lat: x.lat, lng: x.lng }, to: { lat: x.lat, lng: x.lng }, el: element };
        const a = element.querySelector<HTMLElement>(".nk-arrow");
        if (a && x.heading != null) a.style.transform = `rotate(${x.heading}deg)`;
      }
    });
    if (follow && markers?.length && !touched.current && ready.current) {
      // frame everything once; afterwards keep the moving bus in view without fighting the user
      const bus = markers.find((x) => x.emoji);
      if (!fitted.current) frameRef.current(0);
      else if (bus && !m.getBounds().contains([bus.lng, bus.lat])) m.easeTo({ center: [bus.lng, bus.lat], duration: 800 });
    }
  }, [markers, follow]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    pick.current?.remove(); pick.current = null;
    if (picked) pick.current = new maplibregl.Marker({ color: "#FFB81C" }).setLngLat([picked.lng, picked.lat]).addTo(m);
  }, [picked]);

  return (
    <div className={fill ? "relative h-full" : "relative"}>
      <div ref={box} style={fill ? { height: "100%" } : { height }} className={fill ? "h-full w-full" : "w-full overflow-hidden rounded-[10px] border border-ink/15"} />
      {follow && (
        <button type="button" aria-label="Show everything on the map" onClick={() => { touched.current = false; fitted.current = false; const m = map.current; if (m && markers?.length) { const b = new maplibregl.LngLatBounds(); markers.forEach((x) => b.extend([x.lng, x.lat])); m.fitBounds(b, { padding: 80, maxZoom: 17, duration: 700 }); fitted.current = true; } }} className="absolute bottom-3 left-3 rounded-full bg-paper px-3 py-1.5 text-xs font-semibold shadow-md hover:bg-sun">Re-centre</button>
      )}
    </div>
  );
}
