-- 게시물 (사진 1장 + 글). Supabase SQL Editor에서 한 번 실행한다.
-- 카카오 로그인 연결 전까지는 기기 ID로 저장하고, 로그인 후 user_id·nickname을 채운다.

create table if not exists posts (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references places(id) on delete cascade,
  device_id   text not null,
  user_id     uuid,                                   -- 카카오 로그인 연결 후 auth.users.id
  nickname    text not null default '익명 사용자',
  image_path  text not null,                          -- Storage post-images 버킷 안 경로
  text        text not null check (char_length(text) between 1 and 300),
  created_at  timestamptz not null default now()
);

create index if not exists posts_time on posts (created_at desc);
create index if not exists posts_place_time on posts (place_id, created_at desc);
create index if not exists posts_device_time on posts (device_id, created_at desc);

-- 브라우저 직접 접근 차단 (API 라우트가 service role 키로 접근)
alter table posts enable row level security;
grant select, insert, update, delete on table posts to service_role;

-- 사진 버킷: 보기는 공개(로그인 없이 피드를 볼 수 있게), 올리기는 API만
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;
