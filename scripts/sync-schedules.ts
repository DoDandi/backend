// 일정 → schedules 테이블 (노션 「현재 진행 상황 공유」 5)
// 사용자 요청 때는 외부 API를 부르지 않고, 이 스크립트로 미리 넣어 둔다.
//
// 실행
//   npm run sync-schedules                       data/schedules-manual.csv 반영 (버스킹·축제 등 수동 입력)
//   npm run sync-schedules -- --dry-run          DB에 쓰지 않고 읽은 일정만 출력
//   npm run sync-schedules -- --demo-today 삼성라이온즈파크 [--time 18:30] [--title "삼성 vs LG"] [--kind baseball]
//                                                데모용: 오늘 그 장소에 일정 1건 (시즌이 끝나 실제 경기가 없을 때)
//   npm run sync-schedules -- --reset-demo       데모 일정(source=demo) 전부 삭제
//   npm run sync-schedules -- --kbl [--days 60]  KBL 경기 (오늘부터 N일). venues.csv에 'KBL:<경기장>'이 있는 경기장만
//
// 장소 연결: venue는 data/venues.csv(external_name → place_name)로 바꾼 뒤 places.name과 맞춘다.
// KBO·K리그 자동 수집은 아직 없음 (KBO 비공식 API, K리그 인증키 확인 중).
// KBL은 공식 웹사이트가 쓰는 비공식 JSON(api.kbl.or.kr)이라 바뀌거나 막힐 수 있다.
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SCHEDULE_KINDS, type ScheduleKind } from '../lib/constants';
import { parseCsv } from '../lib/csv';
import { kblGameToDraft, kst, manualRowToDraft, resolveVenue, type KblGame, type ScheduleDraft } from '../lib/scheduleImport';
import { defaultEnd } from '../lib/schedules';
import { toKSTISO } from '../lib/time';

config({ path: '.env.local' });

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const read = (f: string) => parseCsv(readFileSync(f, 'utf8'));

function todayKST(): string {
  return toKSTISO(new Date()).slice(0, 10);
}

function demoDraft(placeName: string): ScheduleDraft {
  const kind = (opt('kind') ?? 'baseball') as ScheduleKind;
  if (!(SCHEDULE_KINDS as readonly string[]).includes(kind)) throw new Error(`알 수 없는 kind: ${kind}`);
  const date = todayKST();
  const startsAt = kst(date, opt('time') ?? '18:30');
  return {
    venue: placeName,
    title: opt('title') ?? '삼성 라이온즈 홈 경기 (데모)',
    kind,
    source: 'demo',
    externalId: `demo|${placeName}|${date}`,
    startsAt,
    endsAt: defaultEnd(kind, startsAt),
  };
}

const KBL_URL = 'https://api.kbl.or.kr/match/list';

/** 오늘부터 days일 동안의 KBL 1군 경기 중 venues.csv에 매핑된 경기장 것만 */
async function kblDrafts(venues: Record<string, string>[], days: number): Promise<ScheduleDraft[]> {
  const ymd = (d: Date) => toKSTISO(d).slice(0, 10).replace(/-/g, '');
  const now = new Date();
  const url = `${KBL_URL}?fromDate=${ymd(now)}&toDate=${ymd(new Date(now.getTime() + days * 86_400_000))}&seasonGrade=1`;
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest', channel: 'WEB', teamcode: 'XX', lang: 'ko' },
  });
  if (!res.ok) throw new Error(`KBL ${res.status}`);
  const games = (await res.json()) as KblGame[];
  const mapped = new Set(venues.map(v => v.external_name?.trim()));
  return games.map(kblGameToDraft).filter((d): d is ScheduleDraft => d !== null && mapped.has(d.venue));
}

function print(drafts: ScheduleDraft[]) {
  for (const d of drafts) {
    console.log(`  [${d.source}] ${d.venue} · ${d.title} (${d.kind}) ${toKSTISO(d.startsAt)} ~ ${toKSTISO(d.endsAt)}`);
  }
}

async function main() {
  const demoPlace = opt('demo-today');
  const venues = read('data/venues.csv');
  const drafts: ScheduleDraft[] = demoPlace
    ? [demoDraft(demoPlace)]
    : flag('kbl')
      ? await kblDrafts(venues, Number(opt('days') ?? 60))
      : read('data/schedules-manual.csv').map(manualRowToDraft);
  for (const d of drafts) d.venue = resolveVenue(d.venue, venues);

  if (flag('dry-run')) {
    console.log(`일정 ${drafts.length}건 (dry-run, DB에 쓰지 않음)`);
    print(drafts);
    return;
  }

  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다');
    process.exit(1);
  }
  const db = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  if (flag('reset-demo')) {
    const { error, count } = await db.from('schedules').delete({ count: 'exact' }).eq('source', 'demo');
    if (error) throw error;
    console.log(`데모 일정 ${count ?? 0}건 삭제`);
    return;
  }

  const { data: places, error } = await db.from('places').select('id, name');
  if (error) throw error;
  const idByName = new Map((places as { id: string; name: string }[]).map(p => [p.name, p.id]));

  const rows = [];
  const missing = new Set<string>();
  for (const d of drafts) {
    const placeId = idByName.get(d.venue);
    if (!placeId) {
      missing.add(d.venue);
      continue;
    }
    rows.push({
      place_id: placeId,
      title: d.title,
      kind: d.kind,
      source: d.source,
      external_id: d.externalId,
      starts_at: d.startsAt.toISOString(),
      ends_at: d.endsAt.toISOString(),
    });
  }
  if (missing.size) console.warn(`장소를 찾지 못해 건너뜀 (places.name 또는 data/venues.csv 확인): ${[...missing].join(', ')}`);

  if (rows.length) {
    const { error: upErr } = await db.from('schedules').upsert(rows, { onConflict: 'source,external_id' });
    if (upErr) throw upErr;
  }
  console.log(`일정 ${rows.length}건 반영`);
  print(drafts.filter(d => idByName.has(d.venue)));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
