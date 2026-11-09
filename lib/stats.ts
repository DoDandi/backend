import { PEERS_RECENT_MIN, USUAL_TEMP } from './constants';
import type { HeatEvent } from './temperature';

/** 평소 대비 온도 차 (현재 열기 − 평소 수준). 소수 첫째 자리 */
export function vsBaseline(temp: number): number {
  return Math.round((temp - USUAL_TEMP) * 10) / 10;
}

/** now 기준 최근 minutes분 안에 열기를 올린 서로 다른 기기 수 */
export function distinctDevicesSince(events: HeatEvent[], now: Date, minutes = PEERS_RECENT_MIN): number {
  const since = now.getTime() - minutes * 60_000;
  return new Set(
    events.filter(e => e.createdAt.getTime() >= since && e.createdAt.getTime() <= now.getTime()).map(e => e.deviceId)
  ).size;
}
