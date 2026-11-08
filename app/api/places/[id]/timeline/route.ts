import { NextResponse } from 'next/server';
import { TIMELINE_HOURS, TIMELINE_STEP_MIN, WINDOW_MIN } from '@/lib/constants';
import { fetchEventsSince, placeTemp, supabase, toHeatEvent, type PlaceRow } from '@/lib/supabase';
import { toKSTISO } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** 최근 6시간, 10분 단위 36개 지점. 각 구간 끝 시각을 now로 넣어 같은 엔진으로 계산 (마지막 지점은 지금). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: place } = await supabase().from('places').select('*').eq('id', id).maybeSingle<PlaceRow>();
  if (!place) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const now = new Date();
  const stepMs = TIMELINE_STEP_MIN * 60_000;
  const count = (TIMELINE_HOURS * 60) / TIMELINE_STEP_MIN; // 36
  const lastBoundary = Math.floor(now.getTime() / stepMs) * stepMs;
  const points = [
    ...Array.from({ length: count - 1 }, (_, i) => new Date(lastBoundary - (count - 2 - i) * stepMs)),
    now,
  ];

  const since = new Date(points[0].getTime() - WINDOW_MIN * 60_000);
  const events = (await fetchEventsSince(since, id)).map(toHeatEvent);
  return NextResponse.json(points.map(at => ({ at: toKSTISO(at), temp: placeTemp(place, events, at).temp })));
}
