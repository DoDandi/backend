// 외부 행사 → schedules (TourAPI 축제, KOPIS 공연). 사용자 요청 때는 외부 API를 부르지 않고 이 스크립트로 미리 넣는다.
//
// 실행
//   npm run sync-events                    축제·공연 둘 다, 오늘부터 30일
//   npm run sync-events -- --source kopis  한쪽만 (tour | kopis)
//   npm run sync-events -- --days 14       기간
//   npm run sync-events -- --dry-run       DB에 쓰지 않고 출력만
//
// 장소 연결: 이름이 같은 장소, 또는 공연은 100m 안의 공연장(show)·축제는 150m 안의 길잡이 장소(가게가 아닌 곳)에 붙이고,
//           없으면 행사장·공연장을 장소로 새로 만든다 (축제 → festival, 공연 → show).
// 필요 키: TOUR_API_KEY(공공데이터포털, 국문 관광정보 서비스_GW), KOPIS_API_KEY(kopis.or.kr)
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { CATEGORY_BASELINE, type Category } from '../lib/constants';
import { festivalDrafts, showDrafts, xmlBlocks, xmlTag, type EventDraft, type KopisVenue, type TourFestival } from '../lib/eventSources';
import { distanceM } from '../lib/geo';
import { toKSTISO } from '../lib/time';

config({ path: '.env.local', quiet: true });

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY_RUN = args.includes('--dry-run');
const SOURCE = opt('source') ?? 'all';
const DAYS = Number(opt('days') ?? 30);
const DAEGU_LDONG = '27'; // TourAPI 법정동 시도 코드
const DAEGU_KOPIS = '27'; // KOPIS 시도 코드
const MATCH_RADIUS_M = 150;
const SHOW_MATCH_RADIUS_M = 100;

const { TOUR_API_KEY, KOPIS_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('.env.local 에 Supabase 키가 필요합니다');
const db = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ymd = (d: Date) => toKSTISO(d).slice(0, 10);
const today = ymd(new Date());
const until = ymd(new Date(Date.now() + DAYS * 86_400_000));

async function tourFestivals(): Promise<EventDraft[]> {
  if (!TOUR_API_KEY) throw new Error('TOUR_API_KEY 가 없습니다');
  // 이미 시작해 진행 중인 축제도 잡도록 90일 전부터 시작한 것을 받고, 끝난 것은 거른다
  const since = ymd(new Date(Date.now() - 90 * 86_400_000)).replaceAll('-', '');
  const items: TourFestival[] = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({
      serviceKey: TOUR_API_KEY, MobileOS: 'ETC', MobileApp: 'yeolgi', _type: 'json',
      lDongRegnCd: DAEGU_LDONG, eventStartDate: since, numOfRows: '100', pageNo: String(page), arrange: 'A',
    });
    const res = await fetch(`https://apis.data.go.kr/B551011/KorService2/searchFestival2?${q}`);
    if (!res.ok) throw new Error(`TourAPI ${res.status}`);
    const body = (await res.json()).response?.body;
    const list = body?.items?.item ?? [];
    items.push(...list);
    if (items.length >= Number(body?.totalCount ?? 0) || list.length === 0) break;
  }
  return items.flatMap(f => festivalDrafts(f, today, until));
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** KOPIS는 연달아 부르면 400을 돌려줘서, 실패하면 1초·2초 쉬고 다시 시도한다 */
async function kopis(path: string, params: Record<string, string> = {}): Promise<string> {
  const q = new URLSearchParams({ service: KOPIS_API_KEY!, ...params });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`http://www.kopis.or.kr/openApi/restful/${path}?${q}`);
    if (res.ok) return res.text();
    if (attempt === 2) throw new Error(`KOPIS ${res.status} (${path} ${JSON.stringify(params)})`);
    await sleep(1000 * (attempt + 1));
  }
}

async function kopisShows(): Promise<EventDraft[]> {
  if (!KOPIS_API_KEY) throw new Error('KOPIS_API_KEY 가 없습니다');
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const xml = await kopis('pblprfr', {
      stdate: today.replaceAll('-', ''), eddate: until.replaceAll('-', ''), signgucode: DAEGU_KOPIS, cpage: String(page), rows: '100',
    });
    const blocks = xmlBlocks(xml, 'db');
    ids.push(...blocks.filter(b => xmlTag(b, 'prfstate') !== '공연완료').map(b => xmlTag(b, 'mt20id')));
    if (blocks.length < 100) break;
  }
  const venues = new Map<string, KopisVenue | null>();
  const drafts: EventDraft[] = [];
  let skipped = 0;
  for (const id of ids) {
    await sleep(300); // KOPIS에 연달아 몰아 부르지 않게
    const d = await kopis(`pblprfr/${id}`).catch(() => null);
    if (!d) {
      skipped++; // 상세 조회가 안 되는 공연은 건너뛴다
      continue;
    }
    const venueId = xmlTag(d, 'mt10id');
    if (!venues.has(venueId)) {
      const v = await kopis(`prfplc/${venueId}`).catch(() => '');
      const lat = Number(xmlTag(v, 'la'));
      const lng = Number(xmlTag(v, 'lo'));
      venues.set(venueId, lat && lng ? { name: xmlTag(v, 'fcltynm'), lat, lng, address: xmlTag(v, 'adres') || null } : null);
    }
    const venue = venues.get(venueId);
    if (!venue) continue;
    drafts.push(
      ...showDrafts(
        { id, title: xmlTag(d, 'prfnm'), from: xmlTag(d, 'prfpdfrom'), to: xmlTag(d, 'prfpdto'), guide: xmlTag(d, 'dtguidance'), runtime: xmlTag(d, 'prfruntime') },
        venue,
        today,
        until
      )
    );
  }
  if (skipped) console.warn(`KOPIS 상세 조회 실패로 ${skipped}건 건너뜀`);
  return drafts;
}

type PlaceLite = { id: string; name: string; category: Category; lat: number; lng: number };
type ZoneLite = { id: string; lat: number; lng: number; radius_m: number };

async function main() {
  const drafts = [
    ...(SOURCE === 'all' || SOURCE === 'tour' ? await tourFestivals() : []),
    ...(SOURCE === 'all' || SOURCE === 'kopis' ? await kopisShows() : []),
  ];
  console.log(`${today} ~ ${until} 일정 ${drafts.length}건${DRY_RUN ? ' (dry-run, DB에 쓰지 않음)' : ''}`);

  const [{ data: places, error: pe }, { data: zones, error: ze }] = await Promise.all([
    db.from('places').select('id, name, category, lat, lng'),
    db.from('zones').select('id, lat, lng, radius_m').not('lat', 'is', null),
  ]);
  if (pe || ze) throw pe ?? ze;
  const pool = places as PlaceLite[];

  // 행사장 → 장소 (같은 행사장은 한 번만 정한다)
  const placeFor = new Map<string, PlaceLite | { new: true; name: string; category: Category; lat: number; lng: number; address: string | null }>();
  for (const d of drafts) {
    const key = `${d.venueName}|${d.lat.toFixed(4)}|${d.lng.toFixed(4)}`;
    if (placeFor.has(key)) continue;
    // 공연은 공연장(show) 장소에만 붙인다 (근처 골목·시장에 붙지 않게). 축제는 근처 길잡이 장소(공원·거리 등)에 붙인다
    const canMatch = (p: PlaceLite) =>
      d.kind === 'show'
        ? p.category === 'show' && distanceM(p, d) <= SHOW_MATCH_RADIUS_M
        : p.category !== 'food' && p.category !== 'cafe' && distanceM(p, d) <= MATCH_RADIUS_M;
    const near = pool
      .filter(p => p.name === d.venueName || canMatch(p))
      .sort((a, b) => distanceM(a, d) - distanceM(b, d))[0];
    if (near) console.log(`  = 기존 장소에 연결: ${d.venueName} → ${near.name} (${Math.round(distanceM(near, d))}m)`);
    placeFor.set(key, near ?? { new: true, name: d.venueName, category: d.kind, lat: d.lat, lng: d.lng, address: d.address });
  }

  let created = 0;
  for (const [key, p] of placeFor) {
    if (!('new' in p)) continue;
    const zone = (zones as ZoneLite[])
      .map(z => ({ z, d: distanceM(p, z) }))
      .filter(x => x.d <= x.z.radius_m)
      .sort((a, b) => a.d - b.d)[0]?.z;
    console.log(`  + 새 장소 [${p.category}] ${p.name} ${p.address ?? ''}`);
    created++;
    if (DRY_RUN) continue;
    const { data, error } = await db
      .from('places')
      .insert({ name: p.name, category: p.category, lat: p.lat, lng: p.lng, address: p.address, baseline: CATEGORY_BASELINE[p.category], zone_id: zone?.id ?? null })
      .select('id, name, category, lat, lng')
      .single();
    if (error) throw new Error(`장소 저장 오류 (${p.name}): ${error.message}`);
    placeFor.set(key, data as PlaceLite);
  }

  const rows = drafts.flatMap(d => {
    const p = placeFor.get(`${d.venueName}|${d.lat.toFixed(4)}|${d.lng.toFixed(4)}`);
    if (!p || 'new' in p) return [];
    return [{ place_id: p.id, title: d.title, kind: d.kind, source: d.source, external_id: d.externalId, starts_at: d.startsAt.toISOString(), ends_at: d.endsAt.toISOString() }];
  });
  for (const d of drafts.slice(0, 15)) console.log(`  [${d.source}] ${toKSTISO(d.startsAt).slice(0, 16)} ${d.title} @ ${d.venueName}`);
  if (drafts.length > 15) console.log(`  … 외 ${drafts.length - 15}건`);

  if (!DRY_RUN && rows.length) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('schedules').upsert(rows.slice(i, i + 500), { onConflict: 'source,external_id' });
      if (error) throw new Error(`일정 저장 오류: ${error.message}`);
    }
  }
  console.log(`새 장소 ${created}곳 · 일정 ${DRY_RUN ? drafts.length : rows.length}건 ${DRY_RUN ? '예정' : '반영'}`);
}

main().catch(e => {
  console.error(e.message ?? e);
  process.exit(1);
});
