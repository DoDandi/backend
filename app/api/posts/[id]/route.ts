import { NextResponse } from 'next/server';
import { authUser } from '@/lib/auth';
import { POST_IMAGE_BUCKET } from '@/lib/constants';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DELETE /api/posts/[id] — 내 글 삭제 (사진도 함께 지운다) */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'INVALID' }, { status: 400 });
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: 'LOGIN_REQUIRED' }, { status: 401 });

  const db = supabase();
  const { data: post, error } = await db.from('posts').select('user_id, image_path').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!post) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (post.user_id !== user.id) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const del = await db.from('posts').delete().eq('id', id);
  if (del.error) throw del.error;
  // 행을 지운 뒤 사진을 지운다. 사진 삭제가 실패해도 글은 이미 사라졌으므로 오류로 돌려주지 않는다
  const rm = await db.storage.from(POST_IMAGE_BUCKET).remove([post.image_path]);
  if (rm.error) console.error('post image remove failed', rm.error);
  return new NextResponse(null, { status: 204 });
}
