import { NextResponse, type NextRequest } from 'next/server';
import { CATEGORIES, type Category } from '@/lib/constants';
import { parseBbox } from '@/lib/geo';
import { placesWithTemps } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/places — 장소 + 현재 온도
 *   ?bbox=서,남,동,북  지도 화면 범위 안만 (지도 마커·현장 인증용)
 *   ?zone=<id>         그 구역 장소만 (구역 시트용)
 *   둘 다 없으면 전체 (검색용)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const c = sp.get('category');
  const category = c && (CATEGORIES as readonly string[]).includes(c) ? (c as Category) : undefined;
  const rawBbox = sp.get('bbox');
  const bbox = parseBbox(rawBbox);
  if (rawBbox && !bbox) return NextResponse.json({ error: 'INVALID', field: 'bbox' }, { status: 400 });
  const zoneId = sp.get('zone');
  if (zoneId && !UUID.test(zoneId)) return NextResponse.json({ error: 'INVALID', field: 'zone' }, { status: 400 });
  return NextResponse.json(await placesWithTemps(category, { bbox, zoneId }));
}
