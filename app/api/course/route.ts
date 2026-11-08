import { NextResponse, type NextRequest } from 'next/server';
import {
  COURSE_DEFAULT_LIMIT,
  COURSE_DIST_PENALTY,
  COURSE_EXCLUDE_M,
  COURSE_MIN_TEMP,
  COURSE_RADIUS_KM,
} from '@/lib/constants';
import { distanceM, type LatLng } from '@/lib/geo';
import { placesWithTemps } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  if (!sp.get('lat') || !sp.get('lng') || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'INVALID' }, { status: 400 });
  }
  const limitRaw = Number(sp.get('limit') ?? COURSE_DEFAULT_LIMIT);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 10) : COURSE_DEFAULT_LIMIT;
  const origin: LatLng = { lat, lng };

  // 1. 현재 위치에서 1.5km 안, 30°C 이상 (현재 위치 50m 안은 제외)
  const candidates = (await placesWithTemps()).filter(p => {
    const d = distanceM(origin, p);
    return p.temp >= COURSE_MIN_TEMP && d <= COURSE_RADIUS_KM * 1000 && d > COURSE_EXCLUDE_M;
  });

  // 2~3. 온도 − 10 × 거리(km)가 가장 큰 곳을 고르고, 그곳을 새 출발점으로 반복
  const stops: { id: string; name: string; lat: number; lng: number; temp: number; distanceM: number }[] = [];
  let from = origin;
  while (stops.length < limit && candidates.length > 0) {
    let best = 0;
    let bestValue = -Infinity;
    candidates.forEach((p, i) => {
      const v = p.temp - COURSE_DIST_PENALTY * (distanceM(from, p) / 1000);
      if (v > bestValue) {
        bestValue = v;
        best = i;
      }
    });
    const [p] = candidates.splice(best, 1);
    stops.push({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, temp: p.temp, distanceM: Math.round(distanceM(from, p)) });
    from = p;
  }

  return NextResponse.json({ stops, totalDistanceM: stops.reduce((s, x) => s + x.distanceM, 0) });
}
