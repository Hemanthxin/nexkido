import type { Map as MLMap, StyleSpecification } from "maplibre-gl";

/**
 * Basemap. Default is OpenFreeMap "Liberty": free, no key, vector tiles with 3D buildings. Set NEXT_PUBLIC_MAP_STYLE_URL
 * to any MapLibre style JSON (MapTiler, Stadia, a Mappls style...) to change it without touching code.
 */
export const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";

export const RASTER: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.35 } }],
};

/** If the vector style can't be fetched (offline, blocked), swap to plain OpenStreetMap tiles so the map is never blank. */
export function guardStyle(map: MLMap) {
  let ok = false, fell = false;
  const fall = () => { if (ok || fell) return; fell = true; map.setStyle(RASTER); };
  map.once("styledata", () => { ok = true; });
  map.on("error", () => { if (!ok && !map.isStyleLoaded()) fall(); });
  setTimeout(fall, 8000);
}
