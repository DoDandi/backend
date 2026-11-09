import { NextResponse } from 'next/server';
import { CATEGORY_GROUP, PEERS_NOW_MIN, TIMELINE_STEP_MIN, WINDOW_MIN } from '@/lib/constants';
import { fetchEventsSince, peersIn, placeTemp, supabase, toHeatEvent, vsBaseline, type PlaceRow } from '@/lib/supabase';
import { startOfTodayKST, toKSTISO } from '@/lib/time';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: place } = await supabase()
    .from('places')
    .select('*, zones(name)')
    .eq('id', id)
    .maybeSingle<PlaceRow & { zones: { name: string } | null }>();
  if (!place) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const now = new Date();
  const todayStart = startOfTodayKST(now);
  const events = (await fetchEventsSince(new Date(todayStart.getTime() - WINDOW_MIN * 60_000), id)).map(toHeatEvent);
  const { temp, band } = placeTemp(place, events, now);

  const peersSince = now.getTime() - PEERS_NOW_MIN * 60_000;
  const peersNow = new Set(events.filter(e => e.createdAt.getTime() >= peersSince).map(e => e.deviceId)).size;

  // 오늘 0시부터 10분 간격 + 지금 시점 중 최고 온도
  let todayPeak = { temp, at: toKSTISO(now) };
  for (let t = todayStart.getTime(); t < now.getTime(); t += TIMELINE_STEP_MIN * 60_000) {
    const v = placeTemp(place, events, new Date(t)).temp;
    if (v > todayPeak.temp) todayPeak = { temp: v, at: toKSTISO(new Date(t)) };
  }

  return NextResponse.json({
    id: place.id,
    name: place.name,
    category: place.category,
    group: CATEGORY_GROUP[place.category],
    zoneId: place.zone_id,
    zoneName: place.zones?.name ?? null,
    description: place.description,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    temp,
    band,
    eventActive: place.event_active,
    peersNow,
    vsBaseline: vsBaseline(temp),
    peers30m: peersIn(events, now),
    todayPeak,
  });
}
