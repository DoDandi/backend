import { NextResponse, type NextRequest } from 'next/server';
import { CATEGORIES, CATEGORY_GROUP, GROUPS, type Category, type Group } from '@/lib/constants';
import { placesWithTemps } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get('category');
  const category = c && (CATEGORIES as readonly string[]).includes(c) ? (c as Category) : undefined;
  // ?group=food|festival|sports|etc (화면 필터 4개). 목록에 없는 값이면 무시
  const g = req.nextUrl.searchParams.get('group');
  const group = g && (GROUPS as readonly string[]).includes(g) ? (g as Group) : undefined;
  const categories = group ? CATEGORIES.filter(k => CATEGORY_GROUP[k] === group) : undefined;
  return NextResponse.json(await placesWithTemps({ category, categories }));
}
