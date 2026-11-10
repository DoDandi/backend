import * as C from './constants';

export type HeatEvent = { deviceId: string; score: number; createdAt: Date };
export type PlaceInput = { baseline: number; eventActive: boolean };

/** 1회 점수. 흔들기 센서가 없으면(shake = null) 연타만으로 최대 1점 */
export function eventScore(taps: number, shake: number | null): number {
  const t = Math.min(Math.max(taps, 0) / C.MAX_TAPS, 1);
  if (shake == null) return t;
  const s = Math.min(Math.max(shake, 0), 1);
  return 0.7 * t + 0.3 * s;
}

export function reactionScore(events: HeatEvent[], now: Date): number {
  const windowMs = C.WINDOW_MIN * 60_000;
  const recent = events.filter(e => {
    const age = now.getTime() - e.createdAt.getTime();
    return age >= 0 && age < windowMs;
  });
  let r = 0;
  for (const e of recent) {
    const age = now.getTime() - e.createdAt.getTime();
    const decay = 1 - age / windowMs;
    const peers = new Set(
      recent
        .filter(o => Math.abs(o.createdAt.getTime() - e.createdAt.getTime()) <= C.SYNC_WINDOW_SEC * 1000)
        .map(o => o.deviceId)
    ).size;
    const mult = Math.min(1 + 0.1 * (peers - 1), 2);
    r += e.score * decay * mult;
  }
  return r;
}

export function temperature(place: PlaceInput, events: HeatEvent[], now = new Date()): number {
  const ratio = Math.min(reactionScore(events, now) / place.baseline, C.MAX_RATIO);
  const bonus = place.eventActive ? C.EVENT_BONUS : 0; // 검색 급증 보너스는 11/1 결정으로 삭제
  return Math.round((C.BASE_TEMP + C.TEMP_PER_RATIO * ratio + bonus) * 10) / 10;
}

export type Band = 'mild' | 'warm' | 'hot' | 'daefrica';
export function band(temp: number): Band {
  if (temp >= 40) return 'daefrica';
  if (temp >= 30) return 'hot';
  if (temp >= 20) return 'warm';
  return 'mild';
}

export const BAND_LABEL: Record<Band, string> = {
  mild: '미지근',
  warm: '따뜻',
  hot: '뜨거움',
  daefrica: '대프리카',
};
