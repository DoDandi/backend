import { NextResponse } from 'next/server';
import { authUser } from '@/lib/auth';
import { POST_IMAGE_BUCKET } from '@/lib/constants';
import { imagePath, postRetryAfterSec, validatePostInput } from '@/lib/posts';
import { listPosts, supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/places/[id]/photos — 이 장소에 남긴 게시물 (최신순) */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'INVALID' }, { status: 400 });
  const viewer = await authUser(req);
  return NextResponse.json(await listPosts({ placeId: id, viewerId: viewer?.id }));
}

/**
 * POST /api/places/[id]/photos — 사진 1장 + 글 올리기 (multipart: image, text, deviceId)
 * 카카오 로그인 필요 (Authorization: Bearer). 작성자는 카카오 닉네임·프로필 사진으로 저장한다.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'INVALID' }, { status: 400 });
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: 'LOGIN_REQUIRED' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'INVALID' }, { status: 400 });
  const image = form.get('image');
  const file = image instanceof File ? image : null;
  const text = form.get('text');
  const deviceId = form.get('deviceId');

  const invalid = validatePostInput({ text, deviceId, image: file && { type: file.type, size: file.size } });
  if (invalid === 'IMAGE_SIZE') return NextResponse.json({ error: 'TOO_LARGE' }, { status: 413 });
  if (invalid || !file) return NextResponse.json({ error: 'INVALID', field: invalid }, { status: 400 });

  const db = supabase();
  const { data: place } = await db.from('places').select('id, name, category').eq('id', id).maybeSingle();
  if (!place) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // 같은 사람·같은 장소는 30분에 1개 (연속 업로드·도배 방지)
  const { data: last } = await db
    .from('posts')
    .select('created_at')
    .eq('user_id', user.id)
    .eq('place_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const retryAfterSec = postRetryAfterSec(last ? new Date(last.created_at) : null);
  if (retryAfterSec > 0) {
    return NextResponse.json({ error: 'COOLDOWN', retryAfterSec }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } });
  }

  // 1) 사진을 Storage에 올리고 2) 게시물 행을 넣는다. 행 저장이 실패하면 올린 사진을 지운다
  const path = imagePath(id, file.type);
  const up = await db.storage.from(POST_IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw up.error;

  const { data: row, error } = await db
    .from('posts')
    .insert({
      place_id: id,
      device_id: (deviceId as string).trim(),
      user_id: user.id,
      nickname: user.nickname,
      avatar_url: user.avatarUrl,
      image_path: path,
      text: (text as string).trim(),
    })
    .select('id, created_at')
    .single();
  if (error) {
    await db.storage.from(POST_IMAGE_BUCKET).remove([path]);
    throw error;
  }

  return NextResponse.json(
    {
      id: row.id,
      placeId: place.id,
      placeName: place.name,
      category: place.category,
      author: { nickname: user.nickname, avatarUrl: user.avatarUrl },
      mine: true,
      imageUrl: db.storage.from(POST_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl,
      text: (text as string).trim(),
      createdAt: row.created_at,
    },
    { status: 201 }
  );
}
