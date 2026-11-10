import { describe, expect, it } from 'vitest';
import { band, dayStart, eventScore, popularityBonus, popularityScore, reactionScore, temperature, type HeatEvent } from './temperature';

const now = new Date('2026-11-07T12:00:00Z');
const at = (secAgo: number) => new Date(now.getTime() - secAgo * 1000);

describe('temperature', () => {
  it('반응 0건이면 10° (서늘)', () => {
    expect(temperature({ baseline: 10, eventActive: false }, [], now)).toBe(10);
    expect(band(10)).toBe('mild');
  });

  it('예시: B=10, R=25, 행사 진행 중 → 10 + 25 + 5 = 40° (대프리카)', () => {
    // 같은 기기, 방금 올린 점수 1짜리 25건 → 감쇠 1, 동시성 1 → R = 25
    const events: HeatEvent[] = Array.from({ length: 25 }, () => ({ deviceId: 'a', score: 1, createdAt: now }));
    expect(reactionScore(events, now)).toBeCloseTo(25);
    const t = temperature({ baseline: 10, eventActive: true }, events, now);
    expect(t).toBe(40);
    expect(band(t)).toBe('daefrica');
  });

  it('같은 기기만 반복하면 동시성 배수 1', () => {
    const events: HeatEvent[] = [0, 10, 20, 30].map(s => ({ deviceId: 'same', score: 0.5, createdAt: at(s) }));
    const windowSec = 30 * 60;
    const expected = [0, 10, 20, 30].reduce((sum, s) => sum + 0.5 * (1 - s / windowSec), 0);
    expect(reactionScore(events, now)).toBeCloseTo(expected);
  });

  it('서로 다른 기기 3대가 60초 안에 올리면 배수 1.2', () => {
    const events: HeatEvent[] = ['a', 'b', 'c'].map(d => ({ deviceId: d, score: 1, createdAt: now }));
    expect(reactionScore(events, now)).toBeCloseTo(3 * 1.2);
  });

  it('30분 지난 반응은 0', () => {
    const events: HeatEvent[] = [{ deviceId: 'a', score: 1, createdAt: at(30 * 60) }];
    expect(reactionScore(events, now)).toBe(0);
  });

  it('비율은 3배에서 상한 (10 + 30 = 40°)', () => {
    const events: HeatEvent[] = Array.from({ length: 100 }, () => ({ deviceId: 'a', score: 1, createdAt: now }));
    expect(temperature({ baseline: 10, eventActive: false }, events, now)).toBe(40);
  });

  it('평소 수준(R = B)이면 20° (따뜻 시작)', () => {
    const events: HeatEvent[] = Array.from({ length: 10 }, () => ({ deviceId: 'a', score: 1, createdAt: now }));
    expect(temperature({ baseline: 10, eventActive: false }, events, now)).toBe(20);
    expect(band(20)).toBe('warm');
    expect(band(29.9)).toBe('warm');
    expect(band(30)).toBe('hot');
    expect(band(19.9)).toBe('mild');
  });
});

describe('eventScore', () => {
  it('연타 40회·흔들기 1에서 상한 1', () => {
    expect(eventScore(200, 5)).toBe(1);
    expect(eventScore(40, 1)).toBe(1);
  });
  it('연타 20회·흔들기 0 → 0.35', () => {
    expect(eventScore(20, 0)).toBeCloseTo(0.35);
  });
  it('흔들기 센서 없음(null)이면 연타만으로 최대 1점', () => {
    expect(eventScore(20, null)).toBeCloseTo(0.5);
    expect(eventScore(40, null)).toBe(1);
  });
});

describe('인기 보너스 P', () => {
  // 2026-11-10 12:00 KST. 오늘 하루는 11/10 05:00 KST(= 11/9 20:00Z)부터
  const noon = new Date('2026-11-10T03:00:00Z');
  const ev = (iso: string, score = 1) => ({ score, createdAt: new Date(iso) });

  it('하루 경계는 새벽 5시 KST', () => {
    expect(dayStart(noon).toISOString()).toBe('2026-11-09T20:00:00.000Z');
    expect(dayStart(new Date('2026-11-09T19:59:00Z')).toISOString()).toBe('2026-11-08T20:00:00.000Z'); // 04:59 KST는 전날
  });

  it('오늘 반응은 빼고, 어제 1 · 그제 0.5 · … 7일 넘으면 0', () => {
    const events = [
      ev('2026-11-10T01:00:00Z', 9), // 오늘 10:00 KST → 제외
      ev('2026-11-09T19:00:00Z'), // 오늘 04:00 KST = 어제 → 1
      ev('2026-11-08T12:00:00Z'), // 그제 → 0.5
      ev('2026-11-03T12:00:00Z'), // 7일 전 → 1/64
      ev('2026-11-02T12:00:00Z'), // 8일 전 → 제외
    ];
    expect(popularityScore(events, noon)).toBeCloseTo(1 + 0.5 + 1 / 64);
  });

  it('보너스: 인기 점수가 평소값의 10배면 +5°, 넘어도 +5°', () => {
    expect(popularityBonus(0, 10)).toBe(0);
    expect(popularityBonus(50, 10)).toBe(2.5);
    expect(popularityBonus(100, 10)).toBe(5);
    expect(popularityBonus(500, 10)).toBe(5);
  });

  it('T = 10 + 10 × min(R/B, 3) + E + P: 최대 50°', () => {
    const events: HeatEvent[] = Array.from({ length: 30 }, () => ({ deviceId: 'a', score: 1, createdAt: now }));
    expect(temperature({ baseline: 10, eventActive: true, popularity: 5 }, events, now)).toBe(50);
    expect(temperature({ baseline: 10, eventActive: false, popularity: 2.5 }, [], now)).toBe(12.5);
  });
});
