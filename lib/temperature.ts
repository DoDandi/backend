import * as C from './constants';

export type HeatEvent = { deviceId: string; score: number; createdAt: Date };
/** popularity: 인기 보너스 P(°). popularityBonus()로 구한다 */
export type PlaceInput = { baseline: number; eventActive: boolean; popularity?: number };

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
  const bonus = (place.eventActive ? C.EVENT_BONUS : 0) + (place.popularity ?? 0); // 검색 급증 보너스는 11/1 결정으로 삭제
  return Math.round((C.BASE_TEMP + C.TEMP_PER_RATIO * ratio + bonus) * 10) / 10;
}

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3600_000;

/** 오늘 하루가 시작된 시각 (가장 최근의 새벽 5시 KST) */
export function dayStart(now: Date): Date {
  const shift = KST_OFFSET_MS - C.DAY_START_HOUR_KST * 3600_000;
  return new Date(Math.floor((now.getTime() + shift) / DAY_MS) * DAY_MS - shift);
}

/** 지난 7일 인기 점수: 어제 점수 × 1 + 그제 × 0.5 + … (오늘 반응은 빼고) */
export function popularityScore(events: Pick<HeatEvent, 'score' | 'createdAt'>[], now: Date): number {
  const today = dayStart(now).getTime();
  let s = 0;
  for (const e of events) {
    const t = e.createdAt.getTime();
    if (t >= today) continue;
    const daysAgo = Math.floor((today - t) / DAY_MS) + 1; // 어제 = 1
    if (daysAgo > C.POPULAR_DAYS) continue;
    s += e.score * C.POPULAR_DAY_DECAY ** (daysAgo - 1);
  }
  return s;
}

/** 인기 보너스 P (0 ~ 5°, 소수 첫째 자리) */
export function popularityBonus(score: number, baseline: number): number {
  const p = C.POPULAR_BONUS_MAX * Math.min(score / (C.POPULAR_FULL_RATIO * baseline), 1);
  return Math.round(p * 10) / 10;
}

export type Band = 'mild' | 'warm' | 'hot' | 'daefrica';
export function band(temp: number): Band {
  if (temp >= 40) return 'daefrica';
  if (temp >= 30) return 'hot';
  if (temp >= 20) return 'warm';
  return 'mild';
}

export const BAND_LABEL: Record<Band, string> = {
  mild: '서늘',
  warm: '따뜻',
  hot: '폭염',
  daefrica: '대프리카',
};
