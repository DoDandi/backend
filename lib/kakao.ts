import 'server-only';
import type { Bbox } from './geo';
import { shopCategory } from './shops';

// 카카오 로컬 검색 (주변 가게 표시·첫 열기 때 가게 확인용). 결과를 DB에 쌓지 않는다
export type KakaoDoc = {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  x: string;
  y: string;
  address_name: string;
  road_address_name: string;
};

async function search(path: 'category' | 'keyword', params: Record<string, string | number>, revalidate: number): Promise<KakaoDoc[]> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error('KAKAO_REST_API_KEY 가 설정되지 않았습니다');
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/${path}.json?${qs}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`카카오 검색 실패 ${res.status}`);
  return ((await res.json()) as { documents: KakaoDoc[] }).documents;
}

/** 한 칸 안의 음식점·카페 (각 15곳, 카카오 정확도순). 하루 캐시 */
export async function shopsInCell(c: Bbox): Promise<KakaoDoc[]> {
  const rect = [c.minLng, c.minLat, c.maxLng, c.maxLat].join(',');
  const lists = await Promise.all(
    ['FD6', 'CE7'].map(code => search('category', { category_group_code: code, rect, sort: 'accuracy', size: 15 }, 86_400))
  );
  return lists.flat();
}

/**
 * 첫 열기 때 가게 확인: 내 위치 주변에서 이름으로 찾아 같은 카카오 ID인 음식점·카페를 돌려준다.
 * 클라이언트가 보낸 이름·좌표는 검색어로만 쓰고, 저장하는 값은 카카오 결과를 쓴다
 */
export async function findShopNear(kakaoId: string, name: string, at: { lat: number; lng: number }, radiusM: number): Promise<KakaoDoc | null> {
  const docs = await search('keyword', { query: name, x: at.lng, y: at.lat, radius: Math.round(radiusM), sort: 'distance', size: 15 }, 0);
  return docs.find(d => d.id === kakaoId && shopCategory(d)) ?? null;
}
