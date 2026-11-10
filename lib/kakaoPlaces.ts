import 'server-only';
import { CATEGORY_BASELINE, KAKAO_VERIFY_RADIUS_M } from './constants';
import type { LatLng } from './geo';
import { findShopNear } from './kakao';
import { shopCategory } from './shops';
import { supabase, zoneAt, type PlaceRow } from './supabase';

/** 아직 DB에 없는 카카오 가게 (저장 직전) */
export type NewShop = Omit<PlaceRow, 'id' | 'zone_id'> & { kakao_id: string };

/**
 * 카카오에서 가게를 확인한다: at 주변(100m)을 이름으로 찾아 같은 카카오 ID인 음식점·카페.
 * 클라이언트가 보낸 이름·좌표는 검색어로만 쓰고, 저장 값은 카카오 결과를 쓴다. 없으면 null
 */
export async function findKakaoShop(kakaoId: string, name: string, at: LatLng): Promise<NewShop | null> {
  const doc = await findShopNear(kakaoId, name, at, KAKAO_VERIFY_RADIUS_M);
  if (!doc) return null;
  const category = shopCategory(doc)!;
  return {
    kakao_id: doc.id,
    name: doc.place_name,
    category,
    lat: Number(doc.y),
    lng: Number(doc.x),
    address: doc.road_address_name || doc.address_name || null,
    description: doc.category_name.split(' > ').slice(1).join(' > ') || null,
    baseline: CATEGORY_BASELINE[category],
    event_active: false,
    trend_surge: false,
  };
}

/** 가게를 places에 저장하고 그 행을 돌려준다 (동시에 두 번 저장해도 kakao_id가 같아 한 줄만 생긴다) */
export async function saveKakaoShop(shop: NewShop): Promise<PlaceRow> {
  const db = supabase();
  const zoneId = await zoneAt(shop);
  const { error } = await db.from('places').upsert({ ...shop, zone_id: zoneId }, { onConflict: 'kakao_id', ignoreDuplicates: true });
  if (error) throw error;
  const { data, error: e2 } = await db.from('places').select('*').eq('kakao_id', shop.kakao_id).single<PlaceRow>();
  if (e2) throw e2;
  return data;
}
