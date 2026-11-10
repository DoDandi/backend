import { describe, expect, it } from 'vitest';
import { defaultEnd, hasActiveSchedule, isBonusActive, todaySchedules, type Schedule } from './schedules';

// 2026-11-09 18:30 KST 시작 야구 경기
const start = new Date('2026-11-09T09:30:00Z');
const game: Schedule = {
  id: 's1',
  placeId: 'p1',
  title: '삼성 vs LG',
  kind: 'baseball',
  startsAt: start,
  endsAt: defaultEnd('baseball', start),
};
const at = (iso: string) => new Date(iso);

describe('isBonusActive', () => {
  it('시작 1시간 전부터 켜진다', () => {
    expect(isBonusActive(game, at('2026-11-09T08:29:59Z'))).toBe(false);
    expect(isBonusActive(game, at('2026-11-09T08:30:00Z'))).toBe(true);
  });

  it('야구는 시작 후 3시간 30분까지', () => {
    expect(game.endsAt.toISOString()).toBe('2026-11-09T13:00:00.000Z');
    expect(isBonusActive(game, at('2026-11-09T12:59:59Z'))).toBe(true);
    expect(isBonusActive(game, at('2026-11-09T13:00:00Z'))).toBe(false);
  });

  it('여러 일정 중 하나라도 켜져 있으면 true', () => {
    expect(hasActiveSchedule([], at('2026-11-09T10:00:00Z'))).toBe(false);
    expect(hasActiveSchedule([game], at('2026-11-09T10:00:00Z'))).toBe(true);
  });
});

describe('todaySchedules', () => {
  it('오늘(KST)과 겹치는 일정만, KST 시각으로', () => {
    const tomorrow: Schedule = { ...game, id: 's2', startsAt: at('2026-11-10T09:30:00Z'), endsAt: at('2026-11-10T13:00:00Z') };
    const list = todaySchedules([tomorrow, game], at('2026-11-09T03:00:00Z')); // 11/9 12:00 KST
    expect(list).toEqual([
      {
        id: 's1',
        title: '삼성 vs LG',
        kind: 'baseball',
        startsAt: '2026-11-09T18:30:00+09:00',
        endsAt: '2026-11-09T22:00:00+09:00',
        bonusActive: false,
      },
    ]);
  });

  it('지금 진행 중이면 bonusActive', () => {
    expect(todaySchedules([game], at('2026-11-09T10:00:00Z'))[0].bonusActive).toBe(true);
  });
});
