import { NextResponse } from 'next/server';
import { authUser } from '@/lib/auth';
import { listPosts } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** GET /api/me/posts — 로그인 사용자가 쓴 글 (최신순 50개) */
export async function GET(req: Request) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: 'LOGIN_REQUIRED' }, { status: 401 });
  return NextResponse.json(await listPosts({ userId: user.id, viewerId: user.id, limit: 50 }));
}
