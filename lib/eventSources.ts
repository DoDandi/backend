// 외부 행사 데이터(TourAPI 축제, KOPIS 공연) 응답 → 일정 초안. 네트워크·DB와 무관한 부분만 (단위 테스트용)
import { kst } from './scheduleImport';

/** 'YYYYMMDD' 또는 'YYYY.MM.DD' → 'YYYY-MM-DD' */
export function isoDate(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** from~to(포함) 날짜 중 [winFrom, winTo] 창 안의 날짜들 ('YYYY-MM-DD') */
export function datesInWindow(from: string, to: string, winFrom: string, winTo: string): string[] {
  const start = from > winFrom ? from : winFrom;
  const end = to < winTo ? to : winTo;
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const DAY = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

/**
 * KOPIS 공연 시간 안내 → 요일별 시작 시각.
 * 예: "화요일 ~ 금요일(20:00), 토요일 ~ 일요일(15:00,18:00)", "수요일(19:30)". HOL(공휴일)은 무시
 */
export function parseKopisTimes(guide: string): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (const [, days, times] of guide.matchAll(/([^(),]+)\(([^)]*)\)/g)) {
    const ts = times.split(',').map(t => t.trim()).filter(t => /^\d{1,2}:\d{2}$/.test(t));
    const range = days.split('~').map(d => DAY.indexOf(d.trim()));
    if (range.some(i => i < 0) || !ts.length) continue;
    const [a, b = a] = range;
    for (let i = a; ; i = (i + 1) % 7) {
      m.set(i, [...(m.get(i) ?? []), ...ts]);
      if (i === b) break;
    }
  }
  return m;
}

/** "1시간 30분", "90분", "2시간" → 분. 못 읽으면 null */
export function parseRuntimeMin(raw: string): number | null {
  const h = Number(raw.match(/(\d+)\s*시간/)?.[1] ?? 0);
  const mi = Number(raw.match(/(\d+)\s*분/)?.[1] ?? 0);
  return h * 60 + mi || null;
}

export type EventDraft = {
  source: 'festival' | 'kopis';
  kind: 'festival' | 'show';
  externalId: string;
  title: string;
  venueName: string;
  lat: number;
  lng: number;
  address: string | null;
  startsAt: Date;
  endsAt: Date;
};

export type TourFestival = {
  contentid: string;
  title: string;
  addr1: string;
  addr2?: string;
  mapx: string;
  mapy: string;
  eventstartdate: string;
  eventenddate: string;
};

/** TourAPI 축제 1건 → 창 안의 날마다 10:00–22:00 일정 */
export function festivalDrafts(f: TourFestival, winFrom: string, winTo: string): EventDraft[] {
  const lat = Number(f.mapy);
  const lng = Number(f.mapx);
  if (!lat || !lng) return [];
  return datesInWindow(isoDate(f.eventstartdate), isoDate(f.eventenddate), winFrom, winTo).map(date => ({
    source: 'festival',
    kind: 'festival',
    externalId: `${f.contentid}|${date}`,
    title: f.title,
    venueName: f.addr2?.trim() || f.title,
    lat,
    lng,
    address: f.addr1 || null,
    startsAt: kst(date, '10:00'),
    endsAt: kst(date, '22:00'),
  }));
}

export type KopisShow = { id: string; title: string; from: string; to: string; guide: string; runtime: string };
export type KopisVenue = { name: string; lat: number; lng: number; address: string | null };

/** KOPIS 공연 1건 → 창 안의 공연 날짜·시각마다 일정 (끝 = 시작 + 러닝타임, 모르면 2시간 30분) */
export function showDrafts(s: KopisShow, venue: KopisVenue, winFrom: string, winTo: string): EventDraft[] {
  const times = parseKopisTimes(s.guide);
  const runMin = parseRuntimeMin(s.runtime) ?? 150;
  const out: EventDraft[] = [];
  for (const date of datesInWindow(isoDate(s.from), isoDate(s.to), winFrom, winTo)) {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const t of times.get(dow) ?? []) {
      const startsAt = kst(date, t);
      out.push({
        source: 'kopis',
        kind: 'show',
        externalId: `${s.id}|${date}|${t}`,
        title: s.title,
        venueName: venue.name,
        lat: venue.lat,
        lng: venue.lng,
        address: venue.address,
        startsAt,
        endsAt: new Date(startsAt.getTime() + runMin * 60_000),
      });
    }
  }
  return out;
}

/** 아주 단순한 XML 태그 값 읽기 (KOPIS 응답용) */
export const xmlTag = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? '';
export const xmlBlocks = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map(m => m[1]);
