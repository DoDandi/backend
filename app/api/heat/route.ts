import { NextResponse } from 'next/server';
import { COOLDOWN_MIN, GPS_MAX_ACCURACY_M, HEAT_RADIUS_BY_CATEGORY, HOURLY_LIMIT, SYNC_WINDOW_SEC, WINDOW_MIN } from '@/lib/constants';
import { checkOnSite, distanceM } from '@/lib/geo';
import { fetchEventsSince, placeTemp, supabase, toHeatEvent, type PlaceRow } from '@/lib/supabase';
import { eventScore } from '@/lib/temperature';

export const dynamic = 'force-dynamic';

const invalid = () => NextResponse.json({ error: 'INVALID' }, { status: 400 });
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return invalid();
  const { placeId, deviceId, lat, lng, accuracy, taps, shake } = body as Record<string, unknown>;
  const isDemo = !!process.env.DEMO_SECRET && req.headers.get('x-demo-secret') === process.env.DEMO_SECRET;

  // 1. 입력 검증
  if (typeof placeId !== 'string' || typeof deviceId !== 'string' || !deviceId) return invalid();
  if (!Number.isInteger(taps) || (taps as number) < 0 || (taps as number) > 200) return invalid();
  if (!isNum(shake) || shake < 0 || shake > 1) return invalid();
  if (!isDemo && (!isNum(lat) || !isNum(lng) || !isNum(accuracy))) return invalid();

  const db = supabase();
  const { data: place } = await db.from('places').select('*').eq('id', placeId).maybeSingle<PlaceRow>();
  if (!place) return invalid();

  const now = new Date();

  if (!isDemo) {
    // 2. 현장 인증: 장소 종류별 반경 + 위치 오차
    const radiusM = HEAT_RADIUS_BY_CATEGORY[place.category];
    const d = distanceM({ lat: lat as number, lng: lng as number }, place);
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

    const samePlace = mine.find(e => e.place_id === placeId);
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

  // 저장 전 온도
  const before = (await fetchEventsSince(new Date(now.getTime() - WINDOW_MIN * 60_000), placeId)).map(toHeatEvent);
  const tempBefore = placeTemp(place, before, now).temp;

  // 4. 서버에서 점수를 다시 계산해 저장
  const score = eventScore(taps as number, shake);
  const { data: inserted, error: insErr } = await db
    .from('heat_events')
    .insert({ place_id: placeId, device_id: deviceId, taps, shake, score, is_demo: isDemo })
    .select('created_at')
    .single();
  if (insErr) throw insErr;

  // 5. 저장 후 온도와 최근 60초 동시 참여 기기 수
  const createdAt = new Date(inserted.created_at);
  const after = [...before, { deviceId, score, createdAt }];
  // DB 시각이 앱 서버 시각보다 약간 앞설 수 있어, 새 기록이 빠지지 않도록 더 늦은 쪽을 기준으로 계산
  const afterNow = new Date(Math.max(Date.now(), createdAt.getTime()));
  const tempAfter = placeTemp(place, after, afterNow).temp;
  const syncSince = afterNow.getTime() - SYNC_WINDOW_SEC * 1000;
  const peers = new Set(after.filter(e => e.createdAt.getTime() >= syncSince).map(e => e.deviceId)).size;

  return NextResponse.json({
    tempBefore,
    tempAfter,
    delta: Math.round((tempAfter - tempBefore) * 10) / 10,
    peers,
  });
}
