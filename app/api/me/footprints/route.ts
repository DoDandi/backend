import { NextResponse, type NextRequest } from 'next/server';
import { TEMP_PER_RATIO } from '@/lib/constants';
import { placesWithTemps, supabase } from '@/lib/supabase';
import { toKSTISO } from '@/lib/time';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('deviceId');
  if (!deviceId) return NextResponse.json({ error: 'INVALID' }, { status: 400 });

  const [{ data, error }, places] = await Promise.all([
    supabase()
      .from('heat_events')
      .select('place_id, score, created_at, places(name, lat, lng, baseline)')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false }),
    placesWithTemps(),
  ]);
  if (error) throw error;
  const tempById = new Map(places.map(p => [p.id, p.temp]));

  type Row = { place_id: string; score: number; created_at: string; places: { name: string; lat: number; lng: number; baseline: number } | null };
  type Footprint = { placeId: string; name: string; lat: number; lng: number; count: number; lastAt: string; temp: number | null; lastDelta: number };
  const byPlace = new Map<string, Footprint>();
  for (const r of data as unknown as Row[]) {
    if (!r.places) continue;
    const f = byPlace.get(r.place_id);
    if (f) f.count++;
    else
      byPlace.set(r.place_id, {
        placeId: r.place_id,
        name: r.places.name,
        lat: r.places.lat,
        lng: r.places.lng,
        count: 1,
        lastAt: toKSTISO(new Date(r.created_at)), // 최신순 정렬이라 첫 기록이 마지막 시각
        temp: tempById.get(r.place_id) ?? null,
        // 마지막에 올린 열기가 그 순간 더한 온도 (감쇠·동시성 전): 10 × 점수 ÷ 평소값
        lastDelta: Math.round(((TEMP_PER_RATIO * Number(r.score)) / Number(r.places.baseline)) * 10) / 10,
      });
  }
  return NextResponse.json([...byPlace.values()]);
}
