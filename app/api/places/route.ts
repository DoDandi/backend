import { NextResponse, type NextRequest } from 'next/server';
import { CATEGORIES, type Category } from '@/lib/constants';
import { placesWithTemps } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get('category');
  const category = c && (CATEGORIES as readonly string[]).includes(c) ? (c as Category) : undefined;
  return NextResponse.json(await placesWithTemps(category));
}
