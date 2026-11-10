// data/zones.csv + data/places.csv → 카카오 로컬 검색 → zones·places 테이블
// 실행: npx tsx scripts/seed-places.ts
//   1. zones.csv의 구역을 이름 기준으로 넣거나 갱신
//   2. places.csv의 장소를 키워드 검색해 좌표를 채우고 카카오 장소 ID 기준으로 넣거나 갱신
//   3. 구역 중심·반경을 소속 장소로부터 계산
//   4. 구역마다 auto_food·auto_cafe 개수만큼 카카오 카테고리 검색(음식점·카페)으로 매장을 자동 수집
//      (한 번에 15곳씩 최대 3페이지 = 45곳. search_radius_m을 주면 그 반경에서 찾는다)
//   이미 있는 장소는 baseline(수동 조정값)을 건드리지 않는다.
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { CATEGORIES, CATEGORY_BASELINE, ZONE_BASELINE, type Category } from '../lib/constants';
import { distanceM, type LatLng } from '../lib/geo';

config({ path: '.env.local' });

const { KAKAO_REST_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!KAKAO_REST_API_KEY || !NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('.env.local 에 KAKAO_REST_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다');
  process.exit(1);
}
const db = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 키워드 검색 범위: 대구시 전체 사각형 (군위군 제외). 다른 도시의 같은 이름 장소가 잡히지 않게.
// 카카오 키워드 검색 반경은 최대 20km라 팔공산·현풍 같은 외곽이 빠져서 사각형(rect)으로 찾는다
const DAEGU_RECT = '128.35,35.60,128.80,36.02';
const ZONE_MIN_RADIUS_M = 150;
const ZONE_MARGIN_M = 60;
// 원도심 구역끼리 원이 크게 겹치지 않도록 반경 상한 (자동 매장 수집도 이 반경 안에서만)
const ZONE_MAX_RADIUS_M = 280;

/** 큰따옴표로 감싼 필드(쉼표 포함)를 지원하는 최소 CSV 파서 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(f => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f.trim())) rows.push(row);
  const [header, ...body] = rows;
  return body.map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

type KakaoDoc = {
  id: string;
  place_name: string;
  category_name: string;
  x: string;
  y: string;
  address_name: string;
  road_address_name: string;
};

async function kakaoPage(path: string, params: Record<string, string | number>): Promise<{ docs: KakaoDoc[]; isEnd: boolean }> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/${path}.json?${qs}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
  });
  if (!res.ok) throw new Error(`카카오 검색 실패 ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { documents: KakaoDoc[]; meta: { is_end: boolean } };
  return { docs: body.documents, isEnd: body.meta.is_end };
}

async function kakao(path: string, params: Record<string, string | number>): Promise<KakaoDoc[]> {
  return (await kakaoPage(path, params)).docs;
}

/** 카카오 카테고리 검색은 페이지당 15곳, 최대 3페이지(45곳)까지 */
const KAKAO_MAX_PAGES = 3;

type PlaceRecord = {
  kakao_id: string;
  zone_id: string;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  address: string;
  description: string | null;
  event_active: boolean;
};

const fromDoc = (d: KakaoDoc) => ({
  kakao_id: d.id,
  lat: Number(d.y),
  lng: Number(d.x),
  address: d.road_address_name || d.address_name,
});

/** 카카오 장소 ID 기준으로 넣거나 갱신 (기존 행의 baseline은 유지) */
async function upsertPlace(r: PlaceRecord): Promise<'inserted' | 'updated'> {
  const { data: existing } = await db.from('places').select('id').eq('kakao_id', r.kakao_id).maybeSingle();
  const { error } = existing
    ? await db.from('places').update(r).eq('id', existing.id)
    : await db.from('places').insert({ ...r, baseline: CATEGORY_BASELINE[r.category] });
  if (error) throw new Error(`DB 오류 (${r.name}): ${error.message}`);
  return existing ? 'updated' : 'inserted';
}

function centroid(points: LatLng[]): LatLng {
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
  };
}

const read = (f: string) => parseCsv(readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));

async function main() {
  const zoneRows = read('data/zones.csv');
  const placeRows = read('data/places.csv');
  const counts = { inserted: 0, updated: 0, failed: 0 };

  // 1. 구역
  const zoneId = new Map<string, string>();
  for (const z of zoneRows) {
    const record = { name: z.name, description: z.description || null, baseline: Number(z.baseline) || ZONE_BASELINE };
    const { data, error } = await db.from('zones').upsert(record, { onConflict: 'name' }).select('id').single();
    if (error) throw new Error(`구역 DB 오류 (${z.name}): ${error.message}`);
    zoneId.set(z.name, data.id);
  }
  console.log(`구역 ${zoneId.size}곳\n`);

  // 2. CSV 장소
  const seen = new Set<string>();
  const zonePoints = new Map<string, LatLng[]>();
  for (const r of placeRows) {
    const category = r.category as Category;
    const zid = zoneId.get(r.zone);
    if (!r.name || !(CATEGORIES as readonly string[]).includes(category) || !zid) {
      console.warn(`✗ 잘못된 행 (카테고리·구역 확인): ${JSON.stringify(r)}`);
      counts.failed++;
      continue;
    }
    const [doc] = await kakao('keyword', {
      query: r.search_keyword || r.name,
      rect: DAEGU_RECT,
      size: 1,
    });
    if (!doc) {
      console.warn(`✗ 검색 결과 없음: ${r.name} (키워드: ${r.search_keyword})`);
      counts.failed++;
      continue;
    }
    if (seen.has(doc.id)) {
      console.warn(`✗ 다른 행과 같은 장소로 검색됨: ${r.name} ← "${doc.place_name}" (키워드를 바꿔 주세요)`);
      counts.failed++;
      continue;
    }
    seen.add(doc.id);
    const rec: PlaceRecord = {
      ...fromDoc(doc),
      zone_id: zid,
      name: r.name,
      category,
      description: r.description || null,
      event_active: r.event_active?.toLowerCase() === 'true',
    };
    counts[await upsertPlace(rec)]++;
    zonePoints.set(r.zone, [...(zonePoints.get(r.zone) ?? []), rec]);
    // 검색된 실제 장소명을 함께 찍어 엉뚱한 매칭을 확인할 수 있게 한다
    console.log(`✓ [${r.zone}] ${r.name} ← "${doc.place_name}" ${rec.address}`);
  }

  // 3~4. 구역 중심·반경, 자동 매장 수집
  for (const z of zoneRows) {
    const zid = zoneId.get(z.name)!;
    const points = zonePoints.get(z.name) ?? [];
    if (points.length === 0) {
      console.warn(`✗ 구역에 장소가 없어 중심을 정할 수 없음: ${z.name}`);
      continue;
    }
    const center = centroid(points);
    // 대학가·역세권처럼 앵커 장소가 하나뿐인 구역은 search_radius_m으로 넓게 찾는다
    const searchRadius = Number(z.search_radius_m) || 0;
    const zoneRadius = (pts: LatLng[]) =>
      Math.round(
        Math.min(Math.max(ZONE_MAX_RADIUS_M, searchRadius), Math.max(ZONE_MIN_RADIUS_M, ...pts.map(p => distanceM(center, p) + ZONE_MARGIN_M)))
      );
    const baseRadius = searchRadius || zoneRadius(points);

    for (const [code, category, n] of [
      ['FD6', 'food', Number(z.auto_food) || 0],
      ['CE7', 'cafe', Number(z.auto_cafe) || 0],
    ] as const) {
      if (n <= 0) continue;
      const docs: KakaoDoc[] = [];
      for (let page = 1; page <= KAKAO_MAX_PAGES; page++) {
        const r = await kakaoPage('category', {
          category_group_code: code,
          x: center.lng,
          y: center.lat,
          radius: baseRadius,
          sort: 'accuracy',
          size: 15,
          page,
        });
        docs.push(...r.docs);
        if (r.isEnd || docs.length >= n * 2) break; // 카페 거르기·중복을 감안해 넉넉히
      }
      let added = 0;
      for (const d of docs) {
        if (added >= n) break;
        if (seen.has(d.id)) continue;
        // CE7(카페) 결과에는 보드게임·만화카페가 섞여 있어 '음식점 > 카페'만 쓴다
        if (category === 'cafe' && !d.category_name.startsWith('음식점 > 카페')) continue;
        seen.add(d.id);
        const rec: PlaceRecord = {
          ...fromDoc(d),
          zone_id: zid,
          name: d.place_name,
          category,
          description: d.category_name.split(' > ').slice(1).join(' > ') || null,
          event_active: false,
        };
        counts[await upsertPlace(rec)]++;
        points.push(rec);
        added++;
        console.log(`  + [${z.name}] ${d.place_name} (${rec.description})`);
      }
    }

    const radius = zoneRadius(points);
    const { error } = await db.from('zones').update({ lat: center.lat, lng: center.lng, radius_m: radius }).eq('id', zid);
    if (error) throw new Error(`구역 갱신 오류 (${z.name}): ${error.message}`);
  }

  console.log(`\n장소 추가 ${counts.inserted} · 갱신 ${counts.updated} · 실패 ${counts.failed}`);
}

main().catch(e => {
  console.error(e.message ?? e);
  process.exit(1);
});
