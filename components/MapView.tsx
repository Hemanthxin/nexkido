"use client";
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import { STYLE_URL, guardStyle } from "@/lib/mapstyle";
import { busEl, dotEl } from "@/lib/mapicons";

if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

type Pt = { lat: number; lng: number };
export type MapMarker = Pt & { id: string; label?: string; emoji?: string; heading?: number | null };

/**
 * Overview map for the admin screens: pins, buses that glide to their newest position, click-to-pick a point, and
 * (with `locate`) opening on this device's own location. `fill` makes it take the height of its parent.
 */
export default function MapView({ markers, center, onPick, picked, follow, locate, fill, height = 420 }: {
  markers?: MapMarker[]; center?: Pt; onPick?: (p: Pt) => void; picked?: Pt | null; follow?: boolean; locate?: boolean; fill?: boolean; height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const mk = useRef<Record<string, { marker: maplibregl.Marker; cur: Pt; to: Pt; el: HTMLElement; bus: boolean }>>({});
  const pick = useRef<maplibregl.Marker | null>(null);
  const cb = useRef(onPick); cb.current = onPick;
  const touched = useRef(false), fitted = useRef(false);
  const latest = useRef({ markers, follow }); latest.current = { markers, follow };

  const frame = (ms: number) => {
    const m = map.current, list = latest.current.markers;
    if (!m || !list?.length) return;
    if (list.length === 1) { m.easeTo({ center: [list[0].lng, list[0].lat], zoom: 15, duration: ms }); fitted.current = true; return; }
    const b = new maplibregl.LngLatBounds();
    list.forEach((x) => b.extend([x.lng, x.lat]));
    m.fitBounds(b, { padding: 70, maxZoom: 16, duration: ms });
    fitted.current = true;
  };

  useEffect(() => {
    const c = center || { lat: 20.5937, lng: 78.9629 }; // India overview until a real position is known
    const m = new maplibregl.Map({ container: box.current!, style: STYLE_URL, center: [c.lng, c.lat], zoom: center ? 14 : 4, attributionControl: false });
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    guardStyle(m);
    m.on("click", (e) => cb.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    m.on("dragstart", () => { touched.current = true; });
    m.on("zoomstart", (e) => { if ((e as unknown as { originalEvent?: unknown }).originalEvent) touched.current = true; });
    if (onPick) m.getCanvas().style.cursor = "crosshair";
    const ro = new ResizeObserver(() => { m.resize(); if (!touched.current && latest.current.follow && !fitted.current) frame(0); });
    ro.observe(box.current!);
    m.on("load", () => { m.resize(); if (latest.current.follow) frame(0); });
    map.current = m;

    if (locate && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude };
        const dot = document.createElement("div");
        dot.style.cssText = "width:16px;height:16px;border-radius:50%;background:#2f7df6;border:3px solid #fff;box-shadow:0 0 0 8px rgba(47,125,246,.25)";
        new maplibregl.Marker({ element: dot }).setLngLat([here.lng, here.lat]).addTo(m);
        if (!center && !touched.current && !fitted.current && !latest.current.markers?.length) m.jumpTo({ center: [here.lng, here.lat], zoom: 15 });
      }, () => {}, { enableHighAccuracy: true, timeout: 10000 });
    }

    let raf = 0, last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000); last = t;
      const k = 1 - Math.exp(-dt / 0.45);
      for (const o of Object.values(mk.current)) { o.cur.lat += (o.to.lat - o.cur.lat) * k; o.cur.lng += (o.to.lng - o.cur.lng) * k; o.marker.setLngLat([o.cur.lng, o.cur.lat]); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); m.remove(); mk.current = {}; pick.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const ids = new Set((markers || []).map((x) => x.id));
    Object.keys(mk.current).forEach((id) => { if (!ids.has(id)) { mk.current[id].marker.remove(); delete mk.current[id]; } });
    (markers || []).forEach((x) => {
      const isBus = !!x.emoji, cur = mk.current[x.id];
      if (cur) {
        cur.to = { lat: x.lat, lng: x.lng };
        if (isBus && x.heading != null) cur.el.querySelector<HTMLElement>(".nk-rot")?.style.setProperty("transform", `rotate(${x.heading}deg)`);
        return;
      }
      const element = isBus ? busEl() : dotEl(x.label);
      if (isBus) { element.title = x.label || ""; if (x.heading != null) element.querySelector<HTMLElement>(".nk-rot")?.style.setProperty("transform", `rotate(${x.heading}deg)`); }
      const marker = new maplibregl.Marker({ element, rotationAlignment: "map" }).setLngLat([x.lng, x.lat]).addTo(m);
      mk.current[x.id] = { marker, cur: { lat: x.lat, lng: x.lng }, to: { lat: x.lat, lng: x.lng }, el: element, bus: isBus };
    });
    if (follow && markers?.length && !touched.current && m.loaded()) {
      const bus = markers.find((x) => x.emoji);
      if (!fitted.current) frame(0);
      else if (bus && !m.getBounds().contains([bus.lng, bus.lat])) m.easeTo({ center: [bus.lng, bus.lat], duration: 800 });
    }
  }, [markers, follow]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    pick.current?.remove(); pick.current = null;
    if (picked) { pick.current = new maplibregl.Marker({ color: "#FFB81C" }).setLngLat([picked.lng, picked.lat]).addTo(m); m.easeTo({ center: [picked.lng, picked.lat], duration: 400 }); }
  }, [picked]);

  return (
    <div className={fill ? "relative h-full" : "relative"}>
      <div ref={box} style={fill ? { height: "100%" } : { height }} className={fill ? "h-full w-full" : "w-full overflow-hidden rounded-xl border border-ink/15"} />
      {follow && (
        <button type="button" aria-label="Show everything on the map" onClick={() => { touched.current = false; frame(700); }} className="absolute left-3 top-3 rounded-full bg-paper px-3 py-1.5 text-xs font-semibold shadow-md hover:bg-sun">Show all</button>
      )}
    </div>
  );
}
