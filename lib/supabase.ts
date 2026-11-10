import 'server-only';
import { distanceM, type Bbox, type LatLng } from './geo';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CATEGORY_GROUP, FEED_LIMIT, NORMAL_TEMP, POPULAR_DAYS, POST_IMAGE_BUCKET, SCHEDULE_LEAD_MIN, WINDOW_MIN, type Category, type ScheduleKind } from './constants';
import { toPost, type Post, type PostRow } from './posts';
import { groupSchedulesByPlace, hasActiveSchedule, type Schedule } from './schedules';
import { band, dayStart, popularityBonus, popularityScore, temperature, type HeatEvent } from './temperature';

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

let popularCache: { day: number; byPlace: Map<string, number> } | null = null;

/** 장소별 인기 점수 (지난 7일). 하루 안에서는 바뀌지 않으므로 하루 경계(새벽 5시)마다 한 번만 계산한다 */
export async function popularityByPlace(now = new Date()): Promise<Map<string, number>> {
  const today = dayStart(now).getTime();
  if (popularCache?.day === today) return popularCache.byPlace;
  const rows = await fetchEventsSince(new Date(today - POPULAR_DAYS * 86_400_000));
  const byPlace = new Map<string, number>();
  for (const [placeId, events] of groupByPlace(rows)) byPlace.set(placeId, popularityScore(events, now));
  popularCache = { day: today, byPlace };
  return byPlace;
}

/** 이 장소의 인기 보너스 P (°) */
export function placePopularity(p: Pick<PlaceRow, 'id' | 'baseline'>, scores: Map<string, number>): number {
  return popularityBonus(scores.get(p.id) ?? 0, Number(p.baseline));
}

/** 평소(20°) 대비 몇 도 (소수 첫째 자리) */
export const vsBaseline = (temp: number) => Math.round((temp - NORMAL_TEMP) * 10) / 10;

/** 최근 30분 안에 참여한 서로 다른 기기 수 */
export function peersIn(events: HeatEvent[], now: Date, minutes = WINDOW_MIN): number {
  const since = now.getTime() - minutes * 60_000;
  return new Set(events.filter(e => e.createdAt.getTime() >= since).map(e => e.deviceId)).size;
}

/** 행사 보너스: 수동 event_active 또는 지금 보너스가 켜진 일정이 있으면 */
export function placeEventActive(p: Pick<PlaceRow, 'event_active'>, schedules: readonly Schedule[], now: Date): boolean {
  return p.event_active || hasActiveSchedule(schedules, now);
}

export function placeTemp(p: PlaceRow, events: HeatEvent[], now = new Date(), schedules: readonly Schedule[] = [], popularity = 0) {
  const temp = temperature(
    { baseline: Number(p.baseline), eventActive: placeEventActive(p, schedules, now), popularity },
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

function withExtras(t: { temp: number; band: string }, events: HeatEvent[], now: Date) {
  return { ...t, vsBaseline: vsBaseline(t.temp), peers30m: peersIn(events, now) };
}

/** 장소별 최신 게시물 사진 (목록 썸네일용, 02-B). 최근 게시물 500개 안에서 찾는다 */
async function latestPhotoByPlace(): Promise<Map<string, string>> {
  const { data, error } = await supabase().from('posts').select('place_id, image_path').order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  const m = new Map<string, string>();
  for (const r of data as { place_id: string; image_path: string }[]) if (!m.has(r.place_id)) m.set(r.place_id, postImageUrl(r.image_path));
  return m;
}

/**
 * 장소 목록 + 현재 온도 (최근 30분 heat_events를 한 번에 가져와 장소별로 계산).
 * bbox를 주면 그 화면 범위 안, zoneId를 주면 그 구역 장소만.
 */
export async function placesWithTemps(category?: Category, opts: { bbox?: Bbox | null; zoneId?: string | null } = {}) {
  const now = new Date();
  let q = supabase().from('places').select('*').order('name');
  if (category) q = q.eq('category', category);
  if (opts.bbox) {
    const b = opts.bbox;
    q = q.gte('lat', b.minLat).lte('lat', b.maxLat).gte('lng', b.minLng).lte('lng', b.maxLng);
  }
  if (opts.zoneId) q = q.eq('zone_id', opts.zoneId);
  const [{ data, error }, rows, photos, schedules, popular] = await Promise.all([
    q,
    fetchEventsSince(new Date(now.getTime() - WINDOW_MIN * 60_000)),
    latestPhotoByPlace(),
    fetchSchedules(now, now),
    popularityByPlace(now),
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
    ...withExtras(
      placeTemp(p, byPlace.get(p.id) ?? [], now, schedulesByPlace.get(p.id) ?? [], placePopularity(p, popular)),
      byPlace.get(p.id) ?? [],
      now
    ),
    eventActive: placeEventActive(p, schedulesByPlace.get(p.id) ?? [], now),
    photoUrl: photos.get(p.id) ?? null,
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

/** 이 지점을 반경 안에 두는 가장 가까운 구역 id (없으면 null) */
export async function zoneAt(p: LatLng): Promise<string | null> {
  const { data, error } = await supabase().from('zones').select('id, lat, lng, radius_m').not('lat', 'is', null);
  if (error) throw error;
  let best: { id: string; d: number } | null = null;
  for (const z of data as { id: string; lat: number; lng: number; radius_m: number }[]) {
    const d = distanceM(p, z);
    if (d <= z.radius_m && (!best || d < best.d)) best = { id: z.id, d };
  }
  return best?.id ?? null;
}

/** 구역 목록 + 현재 온도. 구역 안 모든 장소의 반응을 합쳐 같은 엔진으로 계산 (동시성도 구역 단위) */
export async function zonesWithTemps() {
  const now = new Date();
  const [zones, places, rows, schedules, popular] = await Promise.all([
    supabase().from('zones').select('*').not('lat', 'is', null).order('name'),
    supabase().from('places').select('id, zone_id'),
    fetchEventsSince(new Date(now.getTime() - WINDOW_MIN * 60_000)),
    fetchSchedules(now, now),
    popularityByPlace(now),
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

  // 구역 인기 점수 = 구역 안 장소 인기 점수의 합 (반응을 합쳐 R을 구하는 것과 같은 방식)
  const popularByZone = new Map<string, number>();
  for (const [placeId, score] of popular) {
    const z = zoneOf.get(placeId);
    if (z) popularByZone.set(z, (popularByZone.get(z) ?? 0) + score);
  }

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
      {
        baseline: Number(z.baseline),
        eventActive: z.event_active || zoneWithSchedule.has(z.id),
        popularity: popularityBonus(popularByZone.get(z.id) ?? 0, Number(z.baseline)),
      },
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
      vsBaseline: vsBaseline(temp),
      peers30m: peersIn(eventsByZone.get(z.id) ?? [], now),
      placeCount: placeCount.get(z.id) ?? 0,
    };
  });
}

/** 게시물 사진의 공개 주소 */
export function postImageUrl(path: string): string {
  return supabase().storage.from(POST_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** 게시물 목록 (최신순). 장소 하나 또는 카테고리 묶음으로 거른다. before(ISO)보다 오래된 것만 → 다음 페이지 */
export async function listPosts(opts: {
  placeId?: string;
  categories?: readonly Category[];
  before?: string;
  limit?: number;
  /** 이 사용자가 쓴 글만 */
  userId?: string;
  /** 보고 있는 로그인 사용자 (mine 표시) */
  viewerId?: string | null;
}): Promise<Post[]> {
  let q = supabase()
    .from('posts')
    .select('id, place_id, user_id, nickname, avatar_url, image_path, text, created_at, places!inner(name, category)')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? FEED_LIMIT);
  if (opts.placeId) q = q.eq('place_id', opts.placeId);
  if (opts.categories) q = q.in('places.category', opts.categories as Category[]);
  if (opts.before) q = q.lt('created_at', opts.before);
  if (opts.userId) q = q.eq('user_id', opts.userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as PostRow[]).map(r => toPost(r, postImageUrl, opts.viewerId ?? null));
}
