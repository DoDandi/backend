import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import { manualRowToDraft, resolveVenue } from './scheduleImport';

describe('manualRowToDraft', () => {
  it('경기: end가 없으면 종류별 기본 길이 (야구 3시간 30분)', () => {
    const d = manualRowToDraft({ venue: '삼성라이온즈파크', title: '삼성 vs LG', kind: 'baseball', date: '2026-11-09', start: '18:30', end: '' });
    expect(d.startsAt.toISOString()).toBe('2026-11-09T09:30:00.000Z');
    expect(d.endsAt.toISOString()).toBe('2026-11-09T13:00:00.000Z');
    expect(d.source).toBe('manual');
  });

  it('축제: 시각이 없으면 10:00–22:00', () => {
    const d = manualRowToDraft({ venue: '2.28기념중앙공원', title: '동성로 축제', kind: 'festival', date: '2026-11-14', start: '', end: '' });
    expect(d.startsAt.toISOString()).toBe('2026-11-14T01:00:00.000Z');
    expect(d.endsAt.toISOString()).toBe('2026-11-14T13:00:00.000Z');
  });

  it('자정을 넘기는 버스킹', () => {
    const d = manualRowToDraft({ venue: '김광석다시그리기길', title: '심야 버스킹', kind: 'busking', date: '2026-11-09', start: '23:00', end: '00:30' });
    expect(d.endsAt.getTime() - d.startsAt.getTime()).toBe(90 * 60_000);
  });

  it('잘못된 값은 에러', () => {
    expect(() => manualRowToDraft({ venue: 'x', title: 'y', kind: 'party', date: '2026-11-09', start: '18:00' })).toThrow();
    expect(() => manualRowToDraft({ venue: 'x', title: 'y', kind: 'etc', date: '11/9', start: '18:00' })).toThrow();
  });
});

describe('resolveVenue', () => {
  const venues = parseCsv('external_name,place_name\n대구,삼성라이온즈파크\n');
  it('매핑이 있으면 우리 장소 이름', () => expect(resolveVenue('대구', venues)).toBe('삼성라이온즈파크'));
  it('없으면 그대로', () => expect(resolveVenue('엑스코', venues)).toBe('엑스코'));
});
