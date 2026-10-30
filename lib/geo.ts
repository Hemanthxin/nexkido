export type Stop = { name: string; lat: number; lng: number };

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough ETA assuming an average school-bus speed in city traffic. */
export function etaMinutes(km: number, kmh = 25) {
  return Math.max(1, Math.round((km / kmh) * 60));
}
