import { POST_IMAGE_MAX_BYTES, POST_IMAGE_TYPES, POST_TEXT_MAX, type Category } from './constants';

/** 화면에 내려주는 게시물 (프론트 lib/posts.ts의 Post와 같은 모양) */
export type Post = {
  id: string;
  placeId: string;
  placeName: string;
  category: Category;
  author: { nickname: string; avatarUrl: string | null };
  imageUrl: string | null;
  text: string;
  createdAt: string;
};

export type PostRow = {
  id: string;
  place_id: string;
  nickname: string;
  image_path: string;
  text: string;
  created_at: string;
  places: { name: string; category: Category } | null;
};

export function toPost(r: PostRow, imageUrl: (path: string) => string): Post {
  return {
    id: r.id,
    placeId: r.place_id,
    placeName: r.places?.name ?? '',
    category: r.places?.category ?? 'street',
    author: { nickname: r.nickname, avatarUrl: null },
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
