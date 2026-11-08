import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// 카카오(다음) 이미지·블로그 검색. 같은 검색어는 1시간 캐시해 하루 쿼터를 아낀다
const CACHE_SEC = 3600;

type ImageDoc = { thumbnail_url: string; doc_url: string; display_sitename: string };
type BlogDoc = { title: string; contents: string; url: string; blogname: string; datetime: string; thumbnail: string };

const clean = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

async function search<T>(kind: 'image' | 'blog', query: string, size: number): Promise<T[]> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return [];
  const res = await fetch(
    `https://dapi.kakao.com/v2/search/${kind}?query=${encodeURIComponent(query)}&size=${size}`,
    { headers: { Authorization: `KakaoAK ${key}` }, next: { revalidate: CACHE_SEC } }
  );
  if (!res.ok) return [];
  return ((await res.json()) as { documents: T[] }).documents;
}

/** 장소를 누르면 보여줄 사진·블로그 글과 인스타·네이버 바로가기 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: place } = await supabase().from('places').select('name').eq('id', id).maybeSingle<{ name: string }>();
  if (!place) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const query = `대구 ${place.name}`;
  const [images, blogs] = await Promise.all([
    search<ImageDoc>('image', query, 9),
    search<BlogDoc>('blog', query, 5),
  ]);
  const tag = place.name.replace(/[^\p{L}\p{N}_]/gu, '');

  return NextResponse.json({
    images: images.map(d => ({ thumbnail: d.thumbnail_url, url: d.doc_url, source: d.display_sitename })),
    blogs: blogs.map(d => ({
      title: clean(d.title),
      contents: clean(d.contents),
      url: d.url,
      blogName: d.blogname,
      datetime: d.datetime,
      thumbnail: d.thumbnail || null,
    })),
    instagramUrl: `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`,
    naverBlogUrl: `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(query)}`,
  });
}
