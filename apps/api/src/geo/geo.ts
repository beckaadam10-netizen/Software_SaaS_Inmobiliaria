/** Ubicación aproximada para el portal público: nunca se publica el punto exacto de una propiedad. */
export const APPROX_RADIUS_M = 300;

/** Desplaza el punto hasta ~250 m en una dirección fija para cada propiedad y redondea. Siempre da el mismo resultado. */
export function approxLocation(lat: number | null, lng: number | null, seed: string): { lat: number; lng: number; radius: number } | null {
  if (lat == null || lng == null) return null;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const angle = ((h >>> 0) % 360) * (Math.PI / 180);
  const dist = 120 + (((h >>> 9) % 1000) / 1000) * 130; // entre 120 y 250 m
  const dLat = (dist * Math.cos(angle)) / 111320;
  const dLng = (dist * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: Math.round((lat + dLat) * 10000) / 10000, lng: Math.round((lng + dLng) * 10000) / 10000, radius: APPROX_RADIUS_M };
}

/** Distancia en metros entre dos puntos. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
