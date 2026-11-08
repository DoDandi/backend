-- 기존 DB(schema.sql 첫 버전)에 구역 구조를 추가하는 마이그레이션. Supabase SQL Editor에서 한 번 실행.
-- ⚠️ 기존 장소와 열기 기록(시드·데모 데이터)을 모두 지운다. 실행 후 `npm run seed`로 다시 채운다.

create table zones (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  description   text,
  lat           double precision,
  lng           double precision,
  radius_m      int not null default 200,
  baseline      numeric not null default 20,
  event_active  boolean not null default false,
  trend_surge   boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table zones enable row level security;
grant select, insert, update, delete on table zones to service_role;

truncate places cascade;

alter table places add column zone_id uuid references zones(id) on delete set null;
alter table places add column kakao_id text unique;
create index places_zone on places (zone_id);

alter table places drop constraint places_category_check;
alter table places add constraint places_category_check
  check (category in ('food','cafe','market','night_market','street','show','festival','cheer'));
