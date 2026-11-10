import { NextResponse } from 'next/server';
import { COOLDOWN_MIN, GPS_MAX_ACCURACY_M, HEAT_RADIUS_BY_CATEGORY, HOURLY_LIMIT, SYNC_WINDOW_SEC, WINDOW_MIN } from '@/lib/constants';
import { checkOnSite, distanceM } from '@/lib/geo';
import { findKakaoShop, saveKakaoShop, type NewShop } from '@/lib/kakaoPlaces';
import { fetchEventsSince, fetchSchedules, placePopularity, placeTemp, popularityByPlace, supabase, toHeatEvent, type PlaceRow } from '@/lib/supabase';
import { eventScore } from '@/lib/temperature';

export const dynamic = 'force-dynamic';

const invalid = () => NextResponse.json({ error: 'INVALID' }, { status: 400 });
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const KAKAO_ID = /^\d{1,20}$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return invalid();
  const { placeId, kakaoId, kakaoName, deviceId, lat, lng, accuracy, taps, shake } = body as Record<string, unknown>;
  const isDemo = !!process.env.DEMO_SECRET && req.headers.get('x-demo-secret') === process.env.DEMO_SECRET;

  // 1. 입력 검증. 장소는 placeId(DB) 또는 kakaoId + kakaoName(지도에 점으로만 보이던 주변 가게)
  const byKakao = kakaoId !== undefined;
  if (byKakao) {
    if (typeof kakaoId !== 'string' || !KAKAO_ID.test(kakaoId)) return invalid();
    if (typeof kakaoName !== 'string' || !kakaoName.trim() || kakaoName.length > 100) return invalid();
    if (!isNum(lat) || !isNum(lng)) return invalid(); // 가게를 내 위치 주변에서 찾기 때문에 데모도 좌표가 필요하다
  } else if (typeof placeId !== 'string') return invalid();
  if (typeof deviceId !== 'string' || !deviceId) return invalid();
  if (!Number.isInteger(taps) || (taps as number) < 0 || (taps as number) > 200) return invalid();
  // shake: null 이면 흔들기 센서 없음 → 연타만으로 점수 (11/7 결정)
  if (shake !== null && (!isNum(shake) || shake < 0 || shake > 1)) return invalid();
  if (!isDemo && (!isNum(lat) || !isNum(lng) || !isNum(accuracy))) return invalid();

  const db = supabase();
  let place: PlaceRow | null = null;
  let newShop: NewShop | null = null;
  if (byKakao) {
    ({ data: place } = await db.from('places').select('*').eq('kakao_id', kakaoId).maybeSingle<PlaceRow>());
    if (!place) {
      // 아직 DB에 없는 가게: 내 위치 주변에서 카카오로 확인. 현장 인증·쿨다운을 통과하면 저장한다
      newShop = await findKakaoShop(kakaoId as string, (kakaoName as string).trim(), { lat: lat as number, lng: lng as number });
      if (!newShop) return invalid();
    }
  } else {
    ({ data: place } = await db.from('places').select('*').eq('id', placeId).maybeSingle<PlaceRow>());
  }
  const target = place ?? newShop;
  if (!target) return invalid();

  const now = new Date();

  if (!isDemo) {
    // 2. 현장 인증: 장소 종류별 반경 + 위치 오차
    const radiusM = HEAT_RADIUS_BY_CATEGORY[target.category];
    const d = distanceM({ lat: lat as number, lng: lng as number }, target);
    const site = checkOnSite(d, accuracy as number, radiusM, GPS_MAX_ACCURACY_M);
    if (!site.ok) {
      return NextResponse.json(
        { error: site.reason, distanceM: site.distanceM, radiusM, accuracyM: Math.round(accuracy as number), maxAccuracyM: GPS_MAX_ACCURACY_M },
        { status: 403 }
      );
    }

    // 3. 쿨다운: 같은 기기·같은 장소 5분에 1회, 기기당 1시간 20회
    const { data: mine, error } = await db
      .from('heat_events')
      .select('place_id, created_at')
      .eq('device_id', deviceId)
      .gte('created_at', new Date(now.getTime() - 3600_000).toISOString())
      .order('created_at', { ascending: false });
    if (error) throw error;

    const existingId = place?.id;
    const samePlace = existingId ? mine.find(e => e.place_id === existingId) : undefined;
    if (samePlace) {
      const elapsed = now.getTime() - new Date(samePlace.created_at).getTime();
      if (elapsed < COOLDOWN_MIN * 60_000) {
        return NextResponse.json(
          { error: 'COOLDOWN', retryAfterSec: Math.ceil((COOLDOWN_MIN * 60_000 - elapsed) / 1000) },
          { status: 429 }
        );
      }
    }
    if (mine.length >= HOURLY_LIMIT) {
      const oldest = new Date(mine[HOURLY_LIMIT - 1].created_at).getTime();
      return NextResponse.json(
        { error: 'COOLDOWN', retryAfterSec: Math.max(1, Math.ceil((oldest + 3600_000 - now.getTime()) / 1000)) },
        { status: 429 }
      );
    }
  }

  // 처음 열기를 받은 가게를 저장한다 (동시에 두 명이 올려도 kakao_id가 같아 한 줄만 생긴다)
  if (newShop) place = await saveKakaoShop(newShop);
  const saved = place!;
  const id = saved.id;

  // 저장 전 온도
  const [beforeRows, schedules, popular] = await Promise.all([
    fetchEventsSince(new Date(now.getTime() - WINDOW_MIN * 60_000), id),
    fetchSchedules(now, new Date(now.getTime() + 60_000), id),
    popularityByPlace(now),
  ]);
  const before = beforeRows.map(toHeatEvent);
  const popularity = placePopularity(saved, popular);
  const tempBefore = placeTemp(saved, before, now, schedules, popularity).temp;

  // 4. 서버에서 점수를 다시 계산해 저장
  const score = eventScore(taps as number, shake as number | null);
  const { data: inserted, error: insErr } = await db
    .from('heat_events')
    .insert({ place_id: id, device_id: deviceId, taps, shake: shake ?? 0, score, is_demo: isDemo })
    .select('created_at')
    .single();
  if (insErr) throw insErr;

  // 5. 저장 후 온도와 최근 60초 동시 참여 기기 수
  const createdAt = new Date(inserted.created_at);
  const after = [...before, { deviceId, score, createdAt }];
  // DB 시각이 앱 서버 시각보다 약간 앞설 수 있어, 새 기록이 빠지지 않도록 더 늦은 쪽을 기준으로 계산
  const afterNow = new Date(Math.max(Date.now(), createdAt.getTime()));
  const tempAfter = placeTemp(saved, after, afterNow, schedules, popularity).temp;
  const syncSince = afterNow.getTime() - SYNC_WINDOW_SEC * 1000;
  const peers = new Set(after.filter(e => e.createdAt.getTime() >= syncSince).map(e => e.deviceId)).size;

  return NextResponse.json({
    placeId: id,
    created: !!newShop,
    tempBefore,
    tempAfter,
    delta: Math.round((tempAfter - tempBefore) * 10) / 10,
    peers,
  });
}
