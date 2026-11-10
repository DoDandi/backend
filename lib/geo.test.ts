import { describe, expect, it } from 'vitest';
import { checkOnSite, parseBbox } from './geo';

describe('checkOnSite', () => {
  it('반경 안이고 오차가 작으면 인증', () => {
    expect(checkOnSite(20, 10, 30, 30)).toEqual({ ok: true, distanceM: 20 });
  });

  it('측정 거리가 반경 밖이어도 오차만큼 빼서 안이면 인증 (45m, 오차 20m, 반경 30m)', () => {
    expect(checkOnSite(45, 20, 30, 30).ok).toBe(true);
  });

  it('오차를 빼도 반경 밖이면 TOO_FAR', () => {
    expect(checkOnSite(70, 20, 30, 30)).toEqual({ ok: false, reason: 'TOO_FAR', distanceM: 70 });
  });

  it('오차가 기준(30m)을 넘으면 거리와 상관없이 LOW_ACCURACY', () => {
    expect(checkOnSite(5, 45, 30, 30)).toEqual({ ok: false, reason: 'LOW_ACCURACY', distanceM: 5 });
  });

  it('오차 값이 이상하면(음수·NaN) LOW_ACCURACY', () => {
    expect(checkOnSite(5, -1, 30, 30).ok).toBe(false);
    expect(checkOnSite(5, Number.NaN, 30, 30).ok).toBe(false);
  });
});

describe('parseBbox', () => {
  it('서,남,동,북을 읽는다', () => {
    expect(parseBbox('128.58,35.86,128.61,35.88')).toEqual({ minLng: 128.58, minLat: 35.86, maxLng: 128.61, maxLat: 35.88 });
  });
  it('없거나 틀리면 null', () => {
    expect(parseBbox(null)).toBeNull();
    expect(parseBbox('1,2,3')).toBeNull();
    expect(parseBbox('a,b,c,d')).toBeNull();
    expect(parseBbox('128.61,35.86,128.58,35.88')).toBeNull(); // 서 > 동
    expect(parseBbox('128,95,129,96')).toBeNull(); // 위도 범위 밖
  });
});
