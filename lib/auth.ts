import 'server-only';
import { profileFrom } from './posts';
import { supabase } from './supabase';

export type AuthUser = { id: string; nickname: string; avatarUrl: string | null };

/** Authorization: Bearer <Supabase 액세스 토큰> → 로그인 사용자. 없거나 틀리면 null */
export async function authUser(req: Request): Promise<AuthUser | null> {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await supabase().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, ...profileFrom(data.user.user_metadata) };
}
