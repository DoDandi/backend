import { NextResponse, type NextRequest } from 'next/server';
import { parseBbox } from '@/lib/geo';
import { shopsInCell } from '@/lib/kakao';
import { gridCells, shopCategory } from '@/lib/shops';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nearby?bbox=서,남,동,북 — 화면 범위의 음식점·카페 (카카오에서 그때그때 불러옴, DB에 저장하지 않음)
 * 이미 places에 있는 가게(같은 kakao_id)는 뺀다. 범위가 너무 넓으면(확대 전) 빈 목록.
 */
export async function GET(req: NextRequest) {
  const bbox = parseBbox(req.nextUrl.searchParams.get('bbox'));
  if (!bbox) return NextResponse.json({ error: 'INVALID', field: 'bbox' }, { status: 400 });
  const cells = gridCells(bbox);
  if (!cells) return NextResponse.json([]);

  const docs = (await Promise.all(cells.map(shopsInCell))).flat();
  const shops = new Map<string, { kakaoId: string; name: string; category: 'food' | 'cafe'; lat: number; lng: number }>();
  for (const d of docs) {
    const category = shopCategory(d);
    if (category && !shops.has(d.id)) shops.set(d.id, { kakaoId: d.id, name: d.place_name, category, lat: Number(d.y), lng: Number(d.x) });
  }

  const ids = [...shops.keys()];
  if (ids.length) {
    const { data, error } = await supabase().from('places').select('kakao_id').in('kakao_id', ids);
    if (error) throw error;
    for (const r of data as { kakao_id: string }[]) shops.delete(r.kakao_id);
  }
  return NextResponse.json([...shops.values()]);
}
