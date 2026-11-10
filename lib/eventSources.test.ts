import { describe, expect, it } from 'vitest';
import { datesInWindow, festivalDrafts, parseKopisTimes, parseRuntimeMin, showDrafts, xmlBlocks, xmlTag } from './eventSources';

describe('parseKopisTimes', () => {
  it('요일 범위와 여러 시각', () => {
    const m = parseKopisTimes('화요일 ~ 금요일(20:00), 토요일 ~ 일요일(15:00,18:00)');
    expect(m.get(2)).toEqual(['20:00']);
    expect(m.get(5)).toEqual(['20:00']);
    expect(m.get(6)).toEqual(['15:00', '18:00']);
    expect(m.get(0)).toEqual(['15:00', '18:00']);
    expect(m.has(1)).toBe(false);
  });
  it('하루, 공휴일(HOL)은 무시', () => {
    const m = parseKopisTimes('수요일(19:30), HOL(14:00)');
    expect([...m.entries()]).toEqual([[3, ['19:30']]]);
  });
});

describe('parseRuntimeMin', () => {
  it('시간·분', () => {
    expect(parseRuntimeMin('1시간 30분')).toBe(90);
    expect(parseRuntimeMin('100분')).toBe(100);
    expect(parseRuntimeMin(' ')).toBeNull();
  });
});

describe('datesInWindow', () => {
  it('행사 기간과 창의 겹침만', () => {
    expect(datesInWindow('2026-11-08', '2026-11-12', '2026-11-10', '2026-12-10')).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    expect(datesInWindow('2026-10-01', '2026-10-02', '2026-11-10', '2026-12-10')).toEqual([]);
  });
});

describe('festivalDrafts', () => {
  it('날마다 10:00–22:00 (KST)', () => {
    const d = festivalDrafts(
      { contentid: '1', title: '축제', addr1: '대구', addr2: '광장', mapx: '128.5', mapy: '35.8', eventstartdate: '20261114', eventenddate: '20261115' },
      '2026-11-10',
      '2026-12-10'
    );
    expect(d).toHaveLength(2);
    expect(d[0].startsAt.toISOString()).toBe('2026-11-14T01:00:00.000Z');
    expect(d[0].endsAt.toISOString()).toBe('2026-11-14T13:00:00.000Z');
    expect(d[0].venueName).toBe('광장');
  });
});

describe('showDrafts', () => {
  it('공연 날짜의 요일·시각마다, 끝은 러닝타임만큼', () => {
    const d = showDrafts(
      { id: 'PF1', title: '독주회', from: '2026.11.18', to: '2026.11.18', guide: '수요일(19:30)', runtime: '1시간 30분' },
      { name: '대구콘서트하우스', lat: 35.87, lng: 128.59, address: null },
      '2026-11-10',
      '2026-12-10'
    );
    expect(d).toHaveLength(1);
    expect(d[0].startsAt.toISOString()).toBe('2026-11-18T10:30:00.000Z');
    expect(d[0].endsAt.toISOString()).toBe('2026-11-18T12:00:00.000Z');
  });
});

describe('xml', () => {
  it('태그 값과 반복 블록', () => {
    const x = '<dbs><db><a>1</a></db><db><a> 2 </a></db></dbs>';
    expect(xmlBlocks(x, 'db').map(b => xmlTag(b, 'a'))).toEqual(['1', '2']);
  });
});
