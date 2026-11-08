import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { toKSTISO } from '@/lib/time';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('deviceId');
  if (!deviceId) return NextResponse.json({ error: 'INVALID' }, { status: 400 });

  const { data, error } = await supabase()
    .from('heat_events')
    .select('place_id, created_at, places(name, lat, lng)')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  type Row = { place_id: string; created_at: string; places: { name: string; lat: number; lng: number } | null };
  const byPlace = new Map<string, { placeId: string; name: string; lat: number; lng: number; count: number; lastAt: string }>();
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
      });
  }
  return NextResponse.json([...byPlace.values()]);
}
