import { NextResponse, type NextRequest } from 'next/server';
import { CATEGORIES, CATEGORY_GROUP, GROUPS, type Group } from '@/lib/constants';
import { authUser } from '@/lib/auth';
import { listPosts } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** GET /api/feed?group=&before= — 현장 피드 (최신순 30개). before(ISO 시각)를 주면 그보다 오래된 글 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const g = sp.get('group');
  if (g && !(GROUPS as readonly string[]).includes(g)) return NextResponse.json({ error: 'INVALID' }, { status: 400 });
  const before = sp.get('before');
  if (before && Number.isNaN(Date.parse(before))) return NextResponse.json({ error: 'INVALID' }, { status: 400 });

  const categories = g ? CATEGORIES.filter(c => CATEGORY_GROUP[c] === (g as Group)) : undefined;
  const viewer = await authUser(req);
  return NextResponse.json(await listPosts({ categories, before: before ?? undefined, viewerId: viewer?.id }));
}
