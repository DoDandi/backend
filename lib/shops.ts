import type { Bbox } from './geo';

// 주변 가게(카카오) 처리 중 DB·네트워크와 무관한 부분 (단위 테스트용으로 분리)

/** 음식점(FD6)·카페(CE7)만 다룬다. 카페 결과의 보드게임·만화카페는 뺀다 (시드와 같은 규칙) */
export function shopCategory(d: { category_group_code: string; category_name: string }): 'food' | 'cafe' | null {
  if (d.category_group_code === 'FD6') return 'food';
  if (d.category_group_code === 'CE7' && d.category_name.startsWith('음식점 > 카페')) return 'cafe';
  return null;
}

/** 칸 하나 크기 (프론트 requestBbox 격자와 같다) */
export const NEARBY_CELL_DEG = 0.005;
/** 칸이 이보다 많으면(너무 멀리서 봄) 부르지 않는다 */
export const NEARBY_MAX_CELLS = 25;

/** 범위를 격자 칸으로 나눈다. 칸이 너무 많으면 null */
export function gridCells(b: Bbox, step = NEARBY_CELL_DEG, max = NEARBY_MAX_CELLS): Bbox[] | null {
  // 128.6 / 0.005 = 25720.000000000004 같은 소수점 오차로 칸이 하나 더 생기지 않게 조금 깎는다
  const lo = (v: number) => Math.floor(v / step + 1e-9);
  const hi = (v: number) => Math.ceil(v / step - 1e-9);
  const [x0, x1, y0, y1] = [lo(b.minLng), hi(b.maxLng), lo(b.minLat), hi(b.maxLat)];
  if ((x1 - x0) * (y1 - y0) > max) return null;
  const cells: Bbox[] = [];
  for (let x = x0; x < x1; x++)
    for (let y = y0; y < y1; y++) {
      const f = (n: number) => Number((n * step).toFixed(3));
      cells.push({ minLng: f(x), minLat: f(y), maxLng: f(x + 1), maxLat: f(y + 1) });
    }
  return cells;
}
