export type LatLng = { lat: number; lng: number };

const R_EARTH_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** 하버사인 거리 (미터) */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.sqrt(h));
}
