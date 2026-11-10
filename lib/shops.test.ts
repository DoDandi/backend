import { describe, expect, it } from 'vitest';
import { gridCells, shopCategory } from './shops';

describe('shopCategory', () => {
  it('음식점은 food, 음식점 > 카페는 cafe', () => {
    expect(shopCategory({ category_group_code: 'FD6', category_name: '음식점 > 한식' })).toBe('food');
    expect(shopCategory({ category_group_code: 'CE7', category_name: '음식점 > 카페 > 커피전문점' })).toBe('cafe');
  });
  it('보드게임·만화카페와 다른 분류는 뺀다', () => {
    expect(shopCategory({ category_group_code: 'CE7', category_name: '가정,생활 > 여가시설 > 만화카페' })).toBeNull();
    expect(shopCategory({ category_group_code: 'CS2', category_name: '가정,생활 > 편의점' })).toBeNull();
  });
});

describe('gridCells', () => {
  it('격자에 맞춘 범위를 0.005° 칸으로 나눈다 (소수점 오차로 칸이 늘지 않음)', () => {
    const cells = gridCells({ minLng: 128.585, minLat: 35.86, maxLng: 128.6, maxLat: 35.87 });
    expect(cells).toHaveLength(3 * 2);
    expect(cells![0]).toEqual({ minLng: 128.585, minLat: 35.86, maxLng: 128.59, maxLat: 35.865 });
  });
  it('칸이 너무 많으면(멀리서 봄) null', () => {
    expect(gridCells({ minLng: 128.5, minLat: 35.8, maxLng: 128.7, maxLat: 35.9 })).toBeNull();
  });
});
