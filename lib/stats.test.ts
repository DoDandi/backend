import { describe, expect, it } from 'vitest';
import { USUAL_TEMP } from './constants';
import { distinctDevicesSince, vsBaseline } from './stats';
import type { HeatEvent } from './temperature';

const now = new Date('2026-11-09T12:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);

describe('vsBaseline', () => {
  it('평소 수준이면 0', () => expect(vsBaseline(USUAL_TEMP)).toBe(0));
  it('평소보다 높으면 양수, 소수 첫째 자리', () => expect(vsBaseline(USUAL_TEMP + 12.34)).toBe(12.3));
  it('평소보다 낮으면 음수', () => expect(vsBaseline(USUAL_TEMP - 5)).toBe(-5));
});

describe('distinctDevicesSince', () => {
  const ev = (deviceId: string, min: number): HeatEvent => ({ deviceId, score: 1, createdAt: ago(min) });

  it('30분 안의 서로 다른 기기만 센다', () => {
    const events = [ev('a', 1), ev('a', 5), ev('b', 29), ev('c', 31)];
    expect(distinctDevicesSince(events, now, 30)).toBe(2);
  });

  it('기록이 없으면 0', () => expect(distinctDevicesSince([], now, 30)).toBe(0));
});
