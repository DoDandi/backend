import { POST_COOLDOWN_MIN, POST_DEFAULT_NICKNAME, POST_IMAGE_MAX_BYTES, POST_IMAGE_TYPES, POST_TEXT_MAX, type Category } from './constants';

/** 화면에 내려주는 게시물 (프론트 lib/posts.ts의 Post와 같은 모양) */
export type Post = {
  id: string;
  placeId: string;
  placeName: string;
  category: Category;
  author: { nickname: string; avatarUrl: string | null };
  /** 보고 있는 로그인 사용자가 쓴 글인지 (삭제 메뉴 표시용) */
  mine: boolean;
  imageUrl: string | null;
  text: string;
  createdAt: string;
};

export type PostRow = {
  id: string;
  place_id: string;
  user_id: string | null;
  nickname: string;
  avatar_url: string | null;
  image_path: string;
  text: string;
  created_at: string;
  places: { name: string; category: Category } | null;
};

export function toPost(r: PostRow, imageUrl: (path: string) => string, viewerId: string | null = null): Post {
  return {
    id: r.id,
    placeId: r.place_id,
    placeName: r.places?.name ?? '',
    category: r.places?.category ?? 'street',
    author: { nickname: r.nickname, avatarUrl: r.avatar_url },
    mine: !!viewerId && r.user_id === viewerId,
    imageUrl: imageUrl(r.image_path),
    text: r.text,
    createdAt: r.created_at,
  };
}

export type PostInput = { text: string; deviceId: string; image: { type: string; size: number } };
export type PostInputError = 'TEXT' | 'DEVICE' | 'IMAGE_TYPE' | 'IMAGE_SIZE';

/** 게시물 입력 검사. 문제가 없으면 null */
export function validatePostInput(i: { text: unknown; deviceId: unknown; image: { type: string; size: number } | null }): PostInputError | null {
  if (typeof i.deviceId !== 'string' || !i.deviceId.trim() || i.deviceId.length > 100) return 'DEVICE';
  if (typeof i.text !== 'string') return 'TEXT';
  const text = i.text.trim();
  if (text.length < 1 || text.length > POST_TEXT_MAX) return 'TEXT';
  if (!i.image || !(POST_IMAGE_TYPES as readonly string[]).includes(i.image.type)) return 'IMAGE_TYPE';
  if (i.image.size <= 0 || i.image.size > POST_IMAGE_MAX_BYTES) return 'IMAGE_SIZE';
  return null;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Storage 경로: 장소별 폴더 / 시각-임의값.확장자 */
export function imagePath(placeId: string, type: string, now = new Date(), rand = crypto.randomUUID()): string {
  return `${placeId}/${now.getTime()}-${rand.slice(0, 8)}.${EXT[type] ?? 'jpg'}`;
}

/** 카카오 프로필(user_metadata)에서 닉네임·프로필 사진을 꺼낸다 */
export function profileFrom(meta: Record<string, unknown> | undefined): { nickname: string; avatarUrl: string | null } {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const m = meta ?? {};
  return {
    nickname: (str(m.name) ?? str(m.full_name) ?? str(m.preferred_username) ?? str(m.user_name) ?? POST_DEFAULT_NICKNAME).slice(0, 30),
    avatarUrl: str(m.avatar_url) ?? str(m.picture),
  };
}

/** 마지막 글 시각 → 다시 남길 수 있을 때까지 남은 초. 지금 남길 수 있으면 0 */
export function postRetryAfterSec(lastAt: Date | null, now = new Date()): number {
  if (!lastAt) return 0;
  const left = lastAt.getTime() + POST_COOLDOWN_MIN * 60_000 - now.getTime();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
