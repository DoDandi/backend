import { describe, expect, it } from 'vitest';
import { band, eventScore, reactionScore, temperature, type HeatEvent } from './temperature';

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
