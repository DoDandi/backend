// TourAPI(한국관광공사 국문 관광정보) 대구 음식점 → places (대표 맛집). 공공데이터라 저장해도 된다.
// 실행: npx tsx scripts/import-tour-food.ts [--dry-run]
//   - 대구(법정동 27) 음식점(contentTypeId 39) 전부. 카페·전통찻집(FD05)은 cafe, 나머지는 food
//   - 카카오에서 같은 가게(좌표 150m 안, 이름 검색)를 찾아 kakao_id를 붙인다 → 지도 주변 가게 점과 겹치지 않음
//   - 이미 있는 장소(같은 kakao_id, 또는 50m 안 같은 이름)는 건너뛴다. 구역은 반경 안 가장 가까운 구역
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { CATEGORY_BASELINE } from '../lib/constants';
import { distanceM } from '../lib/geo';
import { shopCategory } from '../lib/shops';

config({ path: '.env.local', quiet: true });
const { TOUR_API_KEY, KAKAO_REST_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!TOUR_API_KEY || !KAKAO_REST_API_KEY || !NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('.env.local 에 TOUR_API_KEY, KAKAO_REST_API_KEY, Supabase 키가 필요합니다');
const db = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const DRY_RUN = process.argv.includes('--dry-run');

type TourItem = { contentid: string; title: string; addr1: string; mapx: string; mapy: string; lclsSystm2: string };
type KakaoDoc = { id: string; place_name: string; category_group_code: string; category_name: string };

async function tourFood(): Promise<TourItem[]> {
  const q = new URLSearchParams({ serviceKey: TOUR_API_KEY!, MobileOS: 'ETC', MobileApp: 'yeolgi', _type: 'json', lDongRegnCd: '27', contentTypeId: '39', numOfRows: '1000', pageNo: '1', arrange: 'Q' });
  const res = await fetch(`https://apis.data.go.kr/B551011/KorService2/areaBasedList2?${q}`);
  if (!res.ok) throw new Error(`TourAPI ${res.status}`);
  return (await res.json()).response?.body?.items?.item ?? [];
}

/** TourAPI 좌표 150m 안에서 이름으로 찾은 첫 음식점·카페 */
async function kakaoMatch(t: TourItem): Promise<KakaoDoc | null> {
  const q = new URLSearchParams({ query: t.title, x: t.mapx, y: t.mapy, radius: '150', sort: 'distance', size: '5' });
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${q}`, { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } });
  if (!res.ok) return null;
  const docs: KakaoDoc[] = (await res.json()).documents ?? [];
  return docs.find(d => shopCategory(d)) ?? null;
}

async function main() {
  const items = await tourFood();
  const [{ data: places, error: pe }, { data: zones, error: ze }] = await Promise.all([
    db.from('places').select('name, lat, lng, kakao_id'),
    db.from('zones').select('id, lat, lng, radius_m').not('lat', 'is', null),
  ]);
  if (pe || ze) throw pe ?? ze;
  const kakaoIds = new Set(places!.map(p => p.kakao_id).filter(Boolean));
  const counts = { inserted: 0, skipped: 0, noKakao: 0 };

  for (const t of items) {
    const lat = Number(t.mapy);
    const lng = Number(t.mapx);
    if (!lat || !lng) continue;
    const doc = await kakaoMatch(t);
    if (!doc) counts.noKakao++;
    if ((doc && kakaoIds.has(doc.id)) || places!.some(p => p.name === t.title && distanceM(p, { lat, lng }) < 50)) {
      counts.skipped++;
      continue;
    }
    const category = t.lclsSystm2 === 'FD05' ? 'cafe' : 'food';
    const zone = zones!
      .map(z => ({ z, d: distanceM({ lat, lng }, z) }))
      .filter(x => x.d <= x.z.radius_m)
      .sort((a, b) => a.d - b.d)[0]?.z;
    const row = {
      name: t.title,
      category,
      lat,
      lng,
      address: t.addr1 || null,
      description: '한국관광공사 추천 맛집',
      baseline: CATEGORY_BASELINE[category],
      kakao_id: doc?.id ?? null,
      zone_id: zone?.id ?? null,
    };
    if (doc) kakaoIds.add(doc.id);
    counts.inserted++;
    console.log(`  + [${category}] ${t.title}${doc ? ` ← 카카오 "${doc.place_name}"` : ' (카카오 매칭 없음)'}`);
    if (DRY_RUN) continue;
    const { error } = await db.from('places').insert(row);
    if (error) throw new Error(`저장 오류 (${t.title}): ${error.message}`);
  }
  console.log(`\nTourAPI ${items.length}곳 → 추가 ${counts.inserted}${DRY_RUN ? '(예정)' : ''} · 이미 있음 ${counts.skipped} · 카카오 매칭 없음 ${counts.noKakao}`);
}

main().catch(e => {
  console.error(e.message ?? e);
  process.exit(1);
});
