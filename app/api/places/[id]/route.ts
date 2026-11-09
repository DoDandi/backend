import { NextResponse } from 'next/server';
import { CATEGORY_GROUP, PEERS_NOW_MIN, PEERS_RECENT_MIN, TIMELINE_STEP_MIN, WINDOW_MIN } from '@/lib/constants';
import { distinctDevicesSince, vsBaseline } from '@/lib/stats';
import { todaySchedules } from '@/lib/schedules';
import { fetchEventsSince, fetchSchedules, placeEventActive, placeTemp, supabase, toHeatEvent, type PlaceRow } from '@/lib/supabase';
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
  const todayEnd = new Date(todayStart.getTime() + 24 * 3600_000);
  const [eventRows, schedules] = await Promise.all([
    fetchEventsSince(new Date(todayStart.getTime() - WINDOW_MIN * 60_000), id),
    fetchSchedules(todayStart, todayEnd, id),
  ]);
  const events = eventRows.map(toHeatEvent);
  const { temp, band } = placeTemp(place, events, now, schedules);

  const peersNow = distinctDevicesSince(events, now, PEERS_NOW_MIN);
  const peers30m = distinctDevicesSince(events, now, PEERS_RECENT_MIN);

  // 오늘 0시부터 10분 간격 + 지금 시점 중 최고 온도
  let todayPeak = { temp, at: toKSTISO(now) };
  for (let t = todayStart.getTime(); t < now.getTime(); t += TIMELINE_STEP_MIN * 60_000) {
    const v = placeTemp(place, events, new Date(t), schedules).temp;
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
    vsBaseline: vsBaseline(temp),
    eventActive: placeEventActive(place, schedules, now),
    peersNow,
    peers30m,
    todayPeak,
    todaySchedules: todaySchedules(schedules, now),
  });
}
