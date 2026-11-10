-- 카카오 로그인 작성자 정보. Supabase SQL Editor에서 한 번 실행한다.
alter table posts add column if not exists avatar_url text;  -- 카카오 프로필 사진
create index if not exists posts_user_time on posts (user_id, created_at desc);
