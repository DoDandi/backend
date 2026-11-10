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

export type OnSite = { ok: true; distanceM: number } | { ok: false; reason: 'LOW_ACCURACY' | 'TOO_FAR'; distanceM: number };

/**
 * 현장 인증. 위치 오차가 maxAccuracy를 넘으면 LOW_ACCURACY.
 * 그 밖에는 "측정 거리 − 오차"가 반경 안이면 인증한다 (GPS가 바깥으로 튄 경우를 살린다).
 */
export function checkOnSite(distance: number, accuracy: number, radius: number, maxAccuracy: number): OnSite {
  const distanceM = Math.round(distance);
  if (!(accuracy >= 0) || accuracy > maxAccuracy) return { ok: false, reason: 'LOW_ACCURACY', distanceM };
  return distance - accuracy <= radius ? { ok: true, distanceM } : { ok: false, reason: 'TOO_FAR', distanceM };
}

export type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** "서,남,동,북" (경도,위도,경도,위도) → Bbox. 형식이 틀리거나 범위를 벗어나면 null */
export function parseBbox(raw: string | null): Bbox | null {
  if (!raw) return null;
  const n = raw.split(',').map(Number);
  if (n.length !== 4 || n.some(v => !Number.isFinite(v))) return null;
  const [minLng, minLat, maxLng, maxLat] = n;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  return { minLng, minLat, maxLng, maxLat };
}
