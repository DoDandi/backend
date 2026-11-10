import { SCHEDULE_KINDS, type ScheduleKind } from './constants';
import { defaultEnd } from './schedules';

/** DB에 넣기 직전의 일정 (장소는 아직 이름) */
export type ScheduleDraft = {
  venue: string;
  title: string;
  kind: ScheduleKind;
  source: 'kbo' | 'kleague' | 'kbl' | 'festival' | 'kopis' | 'exhibition' | 'manual' | 'demo';
  externalId: string;
  startsAt: Date;
  endsAt: Date;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

/** 'YYYY-MM-DD' + 'HH:MM'(KST) → Date */
export function kst(date: string, time: string): Date {
  const [h, m] = time.split(':');
  return new Date(`${date}T${h.padStart(2, '0')}:${m}:00+09:00`);
}

/**
 * data/schedules-manual.csv 한 줄 → 일정.
 * 열: venue,title,kind,date,start,end  (start·end는 KST HH:MM, end는 비워도 됨)
 * 축제처럼 시각이 없으면 그날 10:00–22:00. end가 비면 종류별 기본 길이.
 */
export function manualRowToDraft(r: Record<string, string>): ScheduleDraft {
  const venue = r.venue?.trim();
  const title = r.title?.trim();
  const kind = (r.kind?.trim() || 'etc') as ScheduleKind;
  const date = r.date?.trim();
  if (!venue || !title) throw new Error('venue, title이 비어 있습니다');
  if (!(SCHEDULE_KINDS as readonly string[]).includes(kind)) throw new Error(`알 수 없는 kind: ${kind}`);
  if (!date || !DATE_RE.test(date)) throw new Error(`date는 YYYY-MM-DD: ${date}`);
  const start = r.start?.trim() || (kind === 'festival' ? '10:00' : '');
  if (!TIME_RE.test(start)) throw new Error(`start는 HH:MM: ${r.start}`);
  const startsAt = kst(date, start);
  let endsAt: Date;
  if (r.end?.trim()) {
    if (!TIME_RE.test(r.end.trim())) throw new Error(`end는 HH:MM: ${r.end}`);
    endsAt = kst(date, r.end.trim());
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 3600_000); // 자정을 넘기는 일정
  } else {
    endsAt = kind === 'festival' && !r.start?.trim() ? kst(date, '22:00') : defaultEnd(kind, startsAt);
  }
  return { venue, title, kind, source: 'manual', externalId: `${venue}|${date}|${start}|${title}`, startsAt, endsAt };
}

/** venues.csv(external_name → place_name)로 외부 장소 이름을 우리 장소 이름으로 */
export function resolveVenue(venue: string, venues: Record<string, string>[]): string {
  const hit = venues.find(v => v.external_name?.trim() === venue);
  return hit?.place_name?.trim() || venue;
}

/** KBL api.kbl.or.kr/match/list 응답 1건 (쓰는 필드만) */
export type KblGame = {
  gmkey: string;
  gameDate: string; // YYYYMMDD
  gameStart: string | null; // HHMM, 미정이면 비어 있음
  stadiumname: string; // 예: '대구' — 야구 '대구'와 겹치므로 venue는 'KBL:대구'로 둔다
  tnameH: string;
  tnameA: string;
};

/** KBL 경기 1건 → 일정. 시작 시각이 미정이면 null */
export function kblGameToDraft(g: KblGame): ScheduleDraft | null {
  if (!/^\d{4}$/.test(g.gameStart ?? '') || !/^\d{8}$/.test(g.gameDate)) return null;
  const date = `${g.gameDate.slice(0, 4)}-${g.gameDate.slice(4, 6)}-${g.gameDate.slice(6, 8)}`;
  const startsAt = kst(date, `${g.gameStart!.slice(0, 2)}:${g.gameStart!.slice(2)}`);
  return {
    venue: `KBL:${g.stadiumname}`,
    title: `${g.tnameH} vs ${g.tnameA}`,
    kind: 'basketball',
    source: 'kbl',
    externalId: g.gmkey,
    startsAt,
    endsAt: defaultEnd('basketball', startsAt),
  };
}
