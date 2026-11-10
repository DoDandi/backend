-- supabase/schema.sql
create extension if not exists "pgcrypto";

-- 구역: 작은 동네 단위 (동성로, 서문시장, 근대골목 …). 좌표·반경은 소속 장소로부터 시드 스크립트가 계산
create table zones (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  description   text,
  lat           double precision,
  lng           double precision,
  radius_m      int not null default 200,
  baseline      numeric not null default 20,      -- 구역 평소값 (구역 안 모든 반응 합 R과 비교)
  event_active  boolean not null default false,
  trend_surge   boolean not null default false,
  created_at    timestamptz not null default now()
);

-- 장소: 매장·명소·공연장·경기장. 열기는 장소 단위로 쌓인다
create table places (
  id            uuid primary key default gen_random_uuid(),
  zone_id       uuid references zones(id) on delete set null,
  kakao_id      text unique,                      -- 카카오 장소 ID (시드 중복 방지)
  name          text not null,
  category      text not null check (category in ('food','cafe','market','night_market','street','show','festival','cheer')),
  lat           double precision not null,
  lng           double precision not null,
  address       text,
  description   text,
  baseline      numeric not null default 8,       -- 평소 반응 점수 B
  event_active  boolean not null default false,   -- 행사 진행 중이면 +5°C
  trend_surge   boolean not null default false,   -- 검색 급증이면 +3°C
  created_at    timestamptz not null default now()
);

create table heat_events (
  id          bigserial primary key,
  place_id    uuid not null references places(id) on delete cascade,
  device_id   text not null,
  taps        int not null check (taps between 0 and 200),
  shake       numeric not null check (shake between 0 and 1),
  score       numeric not null,                  -- 서버가 계산한 0~1 점수
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index places_zone on places (zone_id);
create index heat_events_place_time on heat_events (place_id, created_at desc);
create index heat_events_device_time on heat_events (device_id, created_at desc);

-- 브라우저 직접 접근 차단: 정책 없이 RLS만 켜고, API 라우트는 service role 키로 접근
alter table zones enable row level security;
alter table places enable row level security;
alter table heat_events enable row level security;

-- 최근 Supabase는 새 테이블 권한을 자동으로 주지 않으므로 service role에 명시적으로 부여
grant select, insert, update, delete on table zones, places, heat_events to service_role;
grant usage, select on sequence heat_events_id_seq to service_role;

-- 게시물 (사진 1장 + 글). 이미 만든 DB라면 migration-003-posts.sql만 실행한다
create table posts (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references places(id) on delete cascade,
  device_id   text not null,
  user_id     uuid,
  nickname    text not null default '익명 사용자',
  image_path  text not null,
  text        text not null check (char_length(text) between 1 and 300),
  created_at  timestamptz not null default now()
);
create index posts_time on posts (created_at desc);
create index posts_place_time on posts (place_id, created_at desc);
create index posts_device_time on posts (device_id, created_at desc);
alter table posts enable row level security;
grant select, insert, update, delete on table posts to service_role;
insert into storage.buckets (id, name, public) values ('post-images', 'post-images', true) on conflict (id) do nothing;

-- 일정 (경기·축제·버스킹). 이미 만든 DB라면 migration-005-schedules.sql만 실행한다
create table schedules (
  id           uuid primary key default gen_random_uuid(),
  place_id     uuid not null references places(id) on delete cascade,
  title        text not null,
  kind         text not null check (kind in ('baseball','football','basketball','volleyball','festival','show','busking','etc')),
  source       text not null check (source in ('kbo','kleague','festival','manual','demo')),
  external_id  text,                                  -- 같은 일정을 다시 넣어도 중복되지 않게 (source별 고유)
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (source, external_id)
);
create index schedules_place_time on schedules (place_id, starts_at);
create index schedules_time on schedules (starts_at, ends_at);

alter table schedules enable row level security;
grant select, insert, update, delete on table schedules to service_role;
