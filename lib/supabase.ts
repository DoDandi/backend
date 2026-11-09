import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CATEGORY_GROUP, FEED_LIMIT, POST_IMAGE_BUCKET, SCHEDULE_LEAD_MIN, WINDOW_MIN, type Category, type ScheduleKind } from './constants';
import { toPost, type Post, type PostRow } from './posts';
import { groupSchedulesByPlace, hasActiveSchedule, type Schedule } from './schedules';
import { band, temperature, type HeatEvent } from './temperature';

let client: SupabaseClient | null = null;

/** 서버 전용 클라이언트 (service role 키) */
export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export type PlaceRow = {
  id: string;
  zone_id: string | null;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  address: string | null;
  description: string | null;
  baseline: number;
  event_active: boolean;
  trend_surge: boolean;
};

type EventRow = { place_id: string; device_id: string; score: number; created_at: string };

const PAGE = 1000; // Supabase 기본 최대 행 수

/** 기준 시각 이후 heat_events를 페이지 단위로 모두 가져온다 */
export async function fetchEventsSince(since: Date, placeId?: string): Promise<EventRow[]> {
  const rows: EventRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase()
      .from('heat_events')
      .select('place_id, device_id, score, created_at')
      .gte('created_at', since.toISOString())
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (placeId) q = q.eq('place_id', placeId);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data as EventRow[]));
    if (data.length < PAGE) return rows;
  }
}

export function toHeatEvent(r: EventRow): HeatEvent {
  return { deviceId: r.device_id, score: Number(r.score), createdAt: new Date(r.created_at) };
}

export function groupByPlace(rows: EventRow[]): Map<string, HeatEvent[]> {
  const m = new Map<string, HeatEvent[]>();
  for (const r of rows) {
    const list = m.get(r.place_id) ?? [];
    list.push(toHeatEvent(r));
    m.set(r.place_id, list);
  }
  return m;
}

/** 행사 보너스: 수동 event_active 또는 지금 보너스가 켜진 일정이 있으면 */
export function placeEventActive(p: Pick<PlaceRow, 'event_active'>, schedules: readonly Schedule[], now: Date): boolean {
  return p.event_active || hasActiveSchedule(schedules, now);
}

export function placeTemp(p: PlaceRow, events: HeatEvent[], now = new Date(), schedules: readonly Schedule[] = []) {
  const temp = temperature(
    { baseline: Number(p.baseline), eventActive: placeEventActive(p, schedules, now), trendSurge: p.trend_surge },
    events,
    now
  );
  return { temp, band: band(temp) };
}

type ScheduleRow = { id: string; place_id: string; title: string; kind: ScheduleKind; starts_at: string; ends_at: string };

/** [from, to] 사이에 보너스가 켜질 수 있는 일정 (시작 1시간 전 ~ 끝이 이 구간과 겹치는 것) */
export async function fetchSchedules(from: Date, to: Date, placeId?: string): Promise<Schedule[]> {
  let q = supabase()
    .from('schedules')
    .select('id, place_id, title, kind, starts_at, ends_at')
    .lt('starts_at', new Date(to.getTime() + SCHEDULE_LEAD_MIN * 60_000).toISOString())
    .gt('ends_at', from.toISOString())
    .order('starts_at');
  if (placeId) q = q.eq('place_id', placeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as ScheduleRow[]).map(r => ({
    id: r.id,
    placeId: r.place_id,
    title: r.title,
    kind: r.kind,
    startsAt: new Date(r.starts_at),
    endsAt: new Date(r.ends_at),
  }));
}

/** 장소 목록 + 현재 온도 (최근 30분 heat_events를 한 번에 가져와 장소별로 계산) */
export async function placesWithTemps(filter?: { category?: Category; categories?: readonly Category[] }) {
  const now = new Date();
  let q = supabase().from('places').select('*').order('name');
  if (filter?.category) q = q.eq('category', filter.category);
  if (filter?.categories) q = q.in('category', filter.categories as Category[]);
  const [{ data, error }, rows, schedules] = await Promise.all([
    q,
    fetchEventsSince(new Date(now.getTime() - WINDOW_MIN * 60_000)),
    fetchSchedules(now, now),
  ]);
  if (error) throw error;
  const byPlace = groupByPlace(rows);
  const schedulesByPlace = groupSchedulesByPlace(schedules);
  return (data as PlaceRow[]).map(p => ({
    id: p.id,
    zoneId: p.zone_id,
    name: p.name,
    category: p.category,
    group: CATEGORY_GROUP[p.category],
    lat: p.lat,
    lng: p.lng,
    ...placeTemp(p, byPlace.get(p.id) ?? [], now, schedulesByPlace.get(p.id) ?? []),
    eventActive: placeEventActive(p, schedulesByPlace.get(p.id) ?? [], now),
  }));
}

export type ZoneRow = {
  id: string;
  name: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  baseline: number;
  event_active: boolean;
  trend_surge: boolean;
};

/** 구역 목록 + 현재 온도. 구역 안 모든 장소의 반응을 합쳐 같은 엔진으로 계산 (동시성도 구역 단위) */
export async function zonesWithTemps() {
  const now = new Date();
  const [zones, places, rows, schedules] = await Promise.all([
    supabase().from('zones').select('*').not('lat', 'is', null).order('name'),
    supabase().from('places').select('id, zone_id'),
    fetchEventsSince(new Date(now.getTime() - WINDOW_MIN * 60_000)),
    fetchSchedules(now, now),
  ]);
  if (zones.error) throw zones.error;
  if (places.error) throw places.error;

  const zoneOf = new Map((places.data as { id: string; zone_id: string | null }[]).map(p => [p.id, p.zone_id]));
  const placeCount = new Map<string, number>();
  for (const z of zoneOf.values()) if (z) placeCount.set(z, (placeCount.get(z) ?? 0) + 1);

  // 구역 안 장소 중 하나라도 일정 보너스가 켜져 있으면 구역도 행사 중으로 본다
  const zoneWithSchedule = new Set(
    schedules.filter(s => hasActiveSchedule([s], now)).map(s => zoneOf.get(s.placeId)).filter((z): z is string => !!z)
  );

  const eventsByZone = new Map<string, HeatEvent[]>();
  for (const r of rows) {
    const z = zoneOf.get(r.place_id);
    if (!z) continue;
    const list = eventsByZone.get(z) ?? [];
    list.push(toHeatEvent(r));
    eventsByZone.set(z, list);
  }

  return (zones.data as ZoneRow[]).map(z => {
    const temp = temperature(
      { baseline: Number(z.baseline), eventActive: z.event_active || zoneWithSchedule.has(z.id), trendSurge: z.trend_surge },
      eventsByZone.get(z.id) ?? [],
      now
    );
    return {
      id: z.id,
      name: z.name,
      description: z.description,
      lat: z.lat as number,
      lng: z.lng as number,
      radiusM: z.radius_m,
      temp,
      band: band(temp),
      placeCount: placeCount.get(z.id) ?? 0,
    };
  });
}

/** 게시물 사진의 공개 주소 */
export function postImageUrl(path: string): string {
  return supabase().storage.from(POST_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** 게시물 목록 (최신순). 장소 하나 또는 카테고리 묶음으로 거른다. before(ISO)보다 오래된 것만 → 다음 페이지 */
export async function listPosts(opts: { placeId?: string; categories?: readonly Category[]; before?: string; limit?: number }): Promise<Post[]> {
  let q = supabase()
    .from('posts')
    .select('id, place_id, nickname, image_path, text, created_at, places!inner(name, category)')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? FEED_LIMIT);
  if (opts.placeId) q = q.eq('place_id', opts.placeId);
  if (opts.categories) q = q.in('places.category', opts.categories as Category[]);
  if (opts.before) q = q.lt('created_at', opts.before);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as PostRow[]).map(r => toPost(r, postImageUrl));
}
