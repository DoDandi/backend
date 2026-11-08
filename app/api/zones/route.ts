import { NextResponse } from 'next/server';
import { zonesWithTemps } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await zonesWithTemps());
}
