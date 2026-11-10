-- 일정 데이터 (경기·축제·버스킹). Supabase SQL Editor에서 한 번 실행.
-- 일정 시작 1시간 전부터 끝날 때까지 그 장소에 행사 보너스(+5)가 켜진다 (lib/schedules.ts).
-- 예전 migration-004-schedules.sql로 이미 만든 DB에서도 그대로 실행하면 된다 (농구·배구 종류만 추가된다).
-- 외부 일정은 scripts/sync-schedules.ts가 넣는다. 사용자 요청 때는 외부 API를 부르지 않는다.

create table if not exists schedules (
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
create index if not exists schedules_place_time on schedules (place_id, starts_at);
create index if not exists schedules_time on schedules (starts_at, ends_at);

alter table schedules enable row level security;
grant select, insert, update, delete on table schedules to service_role;

-- 경기 종류에 농구·배구 추가 (이미 만든 테이블의 제약을 바꾼다)
alter table schedules drop constraint if exists schedules_kind_check;
alter table schedules add constraint schedules_kind_check
  check (kind in ('baseball','football','basketball','volleyball','festival','show','busking','etc'));
