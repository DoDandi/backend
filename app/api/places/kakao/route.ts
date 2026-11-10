import { NextResponse } from 'next/server';
import { findKakaoShop, saveKakaoShop } from '@/lib/kakaoPlaces';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const KAKAO_ID = /^\d{1,20}$/;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const invalid = () => NextResponse.json({ error: 'INVALID' }, { status: 400 });

/**
 * POST /api/places/kakao — 주변 가게(카카오)를 장소로 만들어 id를 돌려준다 (기록 남기기처럼 장소 id가 필요할 때).
 * 본문: { kakaoId, kakaoName, lat, lng } (lat·lng는 /api/nearby가 준 가게 좌표)
 * 이미 저장된 가게면 그 id, 아니면 카카오에서 실제 가게인지 확인하고 저장한다. 확인 안 되면 404
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return invalid();
  const { kakaoId, kakaoName, lat, lng } = body as Record<string, unknown>;
  if (typeof kakaoId !== 'string' || !KAKAO_ID.test(kakaoId)) return invalid();
  if (typeof kakaoName !== 'string' || !kakaoName.trim() || kakaoName.length > 100) return invalid();
  if (!isNum(lat) || !isNum(lng)) return invalid();

  const { data: existing, error } = await supabase().from('places').select('id').eq('kakao_id', kakaoId).maybeSingle<{ id: string }>();
  if (error) throw error;
  if (existing) return NextResponse.json({ id: existing.id, created: false });

  const shop = await findKakaoShop(kakaoId, kakaoName.trim(), { lat, lng });
  if (!shop) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  const place = await saveKakaoShop(shop);
  return NextResponse.json({ id: place.id, created: true });
}
