# 열기단디도 MVP 개발 문서

Oct 30, 2026 · @kj

## 1. 개요와 MVP 범위

열기단디도는 대구 원도심에서 "지금 살아 있는 현장"을 온도로 보여줘, 방문객이 명소 한 곳에서 다음 골목으로 이어가게 하는 모바일 웹앱이다.

**문제 정의.** 대구를 찾는 사람은 늘었지만 대표 명소만 보고 떠나, 체류와 소비가 골목 상권으로 이어지지 않는다. 지금 어디가 살아 있는지 보이지 않기 때문이다.

**핵심 고리.** 현장에서 열기를 올리면 → 서버가 장소 온도를 계산하고 → 지도에 바로 반영된다. 이 고리가 2\~3일 차까지 처음부터 끝까지 돌아가야 한다.

**대상 지역.** 동성로·서문시장·김광석길·근대골목 일대 원도심, 시드 장소 30\~50곳.

| 구분 | 기능 | 포함 |
| --- | --- | --- |
| 핵심 | 열기 지도 (온도별 색 마커, 카테고리 필터) | MVP |
| 핵심 | 열기 올리기 (현장 반경 안, 10초 버튼 연타 + 흔들기) | MVP |
| 핵심 | 열기 계산 엔진 (평소 대비, 동시성, 시간 감쇠) | MVP |
| 핵심 | 열기 코스 (지금 위치에서 다음 뜨거운 곳 2\~3곳 연결) | MVP |
| 보조 | 장소 상세 (현재 온도, 최근 6시간 온도 그래프) | MVP |
| 보조 | 열기 발자국 (내가 열기를 올린 장소 기록) | MVP |
| 보조 | 데모 시뮬레이터 (가짜 반응 자동 생성) | MVP |
| 제외 | 회원가입·로그인, 함성 측정, 사진 인증, 실시간 유동인구, 열기 예보, 푸시 알림 | 확장 |

로그인 대신 기기별 익명 ID(localStorage의 UUID)를 쓴다.

## 2. 기술 스택, 프로젝트 구조, 환경 변수

프론트와 API를 Next.js 하나로 묶고, DB는 Supabase(Postgres)를 써서 백엔드 세팅 시간을 줄인다.

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 프레임워크 | Next.js (App Router) + TypeScript | 화면과 API를 한 저장소에서 개발, Vercel 배포가 쉬움 |
| 스타일 | Tailwind CSS | 빠른 모바일 UI |
| 지도 | 카카오맵 JavaScript SDK + 커스텀 오버레이 | 국내 지도 정확도, 마커를 HTML/CSS로 자유롭게 |
| DB | Supabase (Postgres) | 테이블·API 키·대시보드 기본 제공 |
| 실시간 | SWR 5초 폴링 | 웹소켓 없이 충분 |
| 그래프 | Recharts | 시간대별 온도 그래프 |
| 배포 | Vercel | HTTPS 기본 제공 (위치·센서 필수 조건) |
| 장소 좌표 | 카카오 로컬 REST API 키워드 검색 | 시드 스크립트에서 장소명 → 좌표 변환 |

**프로젝트 구조**

```
yeolgi-map/
├─ app/
│  ├─ page.tsx                     # 지도 홈
│  ├─ heat/[placeId]/page.tsx      # 열기 올리기
│  ├─ me/page.tsx                  # 열기 발자국
│  └─ api/
│     ├─ places/route.ts           # GET 장소 목록 + 현재 온도
│     ├─ places/[id]/route.ts      # GET 장소 상세
│     ├─ places/[id]/timeline/route.ts  # GET 최근 6시간 온도
│     ├─ heat/route.ts             # POST 열기 올리기
│     ├─ course/route.ts           # GET 열기 코스
│     └─ me/footprints/route.ts    # GET 내 발자국
├─ components/
│  ├─ KakaoMap.tsx  HeatMarker.tsx  PlaceSheet.tsx
│  ├─ FilterChips.tsx  CourseLayer.tsx  TempChart.tsx
├─ lib/
│  ├─ temperature.ts   # 온도 계산 엔진 (순수 함수)
│  ├─ geo.ts           # 하버사인 거리
│  ├─ supabase.ts      # 서버 전용 클라이언트
│  ├─ device.ts        # 익명 기기 ID
│  └─ constants.ts     # 파라미터 모음
├─ scripts/
│  ├─ seed-places.ts   # CSV → 카카오 좌표 → DB
│  └─ simulate.ts      # 데모용 가짜 반응
├─ data/places.csv     # 기획팀이 정리한 장소 목록
└─ supabase/schema.sql
```

**환경 변수 (.env.local)**

| 이름 | 용도 | 노출 |
| --- | --- | --- |
| `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` | 카카오맵 JavaScript 키 | 브라우저 |
| `KAKAO_REST_API_KEY` | 시드 스크립트의 로컬 검색 | 서버·스크립트만 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 주소 | 브라우저 |
| `SUPABASE_SERVICE_ROLE_KEY` | API 라우트에서 DB 접근 | 서버만 |
| `DEMO_SECRET` | 시뮬레이터가 위치 검사를 건너뛰는 비밀값 | 서버·스크립트만 |

브라우저는 DB에 직접 붙지 않고 반드시 API 라우트를 거친다. 어뷰징 검사를 서버에서 하기 위해서다.

## 3. 데이터 모델

테이블은 두 개면 충분하다. 장소(places)와 열기 기록(heat\_events)만 저장하고, 온도는 저장하지 않고 요청할 때마다 계산한다.

```sql
-- supabase/schema.sql
create extension if not exists "pgcrypto";

create table places (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null check (category in ('food','market','street','festival','cheer')),
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

create index heat_events_place_time on heat_events (place_id, created_at desc);
create index heat_events_device_time on heat_events (device_id, created_at desc);

-- 브라우저 직접 접근 차단: 정책 없이 RLS만 켜고, API 라우트는 service role 키로 접근
alter table places enable row level security;
alter table heat_events enable row level security;
```

**카테고리별 평소값(baseline) 초기값**

| 카테고리 | 의미 | baseline |
| --- | --- | --- |
| food | 맛집·먹자골목 | 5 |
| street | 거리·골목 | 8 |
| market | 시장·야시장 | 10 |
| festival | 축제·공연장 | 20 |
| cheer | 경기장·응원 현장 | 20 |

**시드 CSV 형식 (data/places.csv)** — 기획팀이 작성하고, 좌표는 스크립트가 카카오 로컬 검색으로 채운다.

```csv
name,category,search_keyword,description,event_active
서문시장 야시장,market,대구 서문시장 야시장,대구 대표 야시장,false
김광석다시그리기길,street,김광석다시그리기길,벽화 골목과 버스킹,false
```

MVP에서는 `event_active`, `trend_surge`를 기획팀이 수동으로 켜고 끈다. 행사 API·검색 트렌드 자동 수집은 여유가 있을 때 붙인다.

## 4. 열기 계산 엔진

온도는 "그 장소의 평소 대비 최근 30분 반응이 몇 배인가"로 정한다. 평소 수준이면 30°C, 2배면 40°C, 3배 이상이면 50°C이고 행사·검색 보너스가 더해진다.

```latex
T = 20 + 10 \times \min\left(\frac{R}{B},\ 3\right) + E
```

- **B**: 장소의 평소값 (`places.baseline`)
- **R**: 최근 30분 반응 점수. 각 열기 올리기 점수 × 시간 감쇠 × 동시성 배수를 모두 더한 값
- **E**: 행사 진행 중이면 +5, 검색 급증이면 +3

| 요소 | 규칙 |
| --- | --- |
| 1회 점수 | 0.7 × min(10초간 연타 수 ÷ 40, 1) + 0.3 × 흔들기 세기(0\~1) |
| 시간 감쇠 | 1 − 경과 시간 ÷ 30분 (30분 지나면 0) |
| 동시성 배수 | 같은 장소에서 ±60초 안에 열기를 올린 서로 다른 기기 수 n → min(1 + 0.1 × (n − 1), 2) |
| 온도 단계 | 30°C 미만 미지근 · 30\~40°C 따뜻 · 40\~50°C 뜨거움 · 50°C 이상 대프리카 |

**예시.** 서문시장 야시장 B = 10, 최근 30분 R = 25, 행사 진행 중이면 20 + 10 × 2.5 + 5 = 50°C (대프리카).

```ts
// lib/constants.ts
export const WINDOW_MIN = 30;
export const SYNC_WINDOW_SEC = 60;
export const MAX_TAPS = 40;
export const BASE_TEMP = 20;
export const TEMP_PER_RATIO = 10;
export const MAX_RATIO = 3;
export const EVENT_BONUS = 5;
export const TREND_BONUS = 3;

// lib/temperature.ts
import * as C from './constants';

export type HeatEvent = { deviceId: string; score: number; createdAt: Date };
export type PlaceInput = { baseline: number; eventActive: boolean; trendSurge: boolean };

export function eventScore(taps: number, shake: number): number {
  const t = Math.min(Math.max(taps, 0) / C.MAX_TAPS, 1);
  const s = Math.min(Math.max(shake, 0), 1);
  return 0.7 * t + 0.3 * s;
}

export function reactionScore(events: HeatEvent[], now: Date): number {
  const windowMs = C.WINDOW_MIN * 60_000;
  const recent = events.filter(e => now.getTime() - e.createdAt.getTime() < windowMs);
  let r = 0;
  for (const e of recent) {
    const age = now.getTime() - e.createdAt.getTime();
    const decay = 1 - age / windowMs;
    const peers = new Set(
      recent
        .filter(o => Math.abs(o.createdAt.getTime() - e.createdAt.getTime()) <= C.SYNC_WINDOW_SEC * 1000)
        .map(o => o.deviceId)
    ).size;
    const mult = Math.min(1 + 0.1 * (peers - 1), 2);
    r += e.score * decay * mult;
  }
  return r;
}

export function temperature(place: PlaceInput, events: HeatEvent[], now = new Date()): number {
  const ratio = Math.min(reactionScore(events, now) / place.baseline, C.MAX_RATIO);
  const bonus = (place.eventActive ? C.EVENT_BONUS : 0) + (place.trendSurge ? C.TREND_BONUS : 0);
  return Math.round((C.BASE_TEMP + C.TEMP_PER_RATIO * ratio + bonus) * 10) / 10;
}

export type Band = 'mild' | 'warm' | 'hot' | 'daefrica';
export function band(temp: number): Band {
  if (temp >= 50) return 'daefrica';
  if (temp >= 40) return 'hot';
  if (temp >= 30) return 'warm';
  return 'mild';
}
```

- 엔진은 DB를 모르는 순수 함수로 두고 단위 테스트를 붙인다 (반응 0건 → 20°C, 위 예시 → 50°C, 같은 기기만 반복 → 동시성 배수 1).
- 시간대별 그래프는 최근 6시간을 10분 단위로 나눠, 각 구간 끝 시각을 `now`로 넣어 같은 함수로 계산한다.
- 파라미터는 전부 `constants.ts`에 모아, 테스트하면서 숫자만 바꿔 감을 맞춘다.

## 5. API 명세

API는 6개이고, 모두 Next.js API 라우트에서 service role 키로 Supabase에 접근한다.

| 메서드 · 경로 | 용도 | 주요 파라미터 |
| --- | --- | --- |
| `GET /api/places` | 지도용 장소 목록 + 현재 온도 | `category` (선택) |
| `GET /api/places/[id]` | 장소 상세 | — |
| `GET /api/places/[id]/timeline` | 최근 6시간 10분 단위 온도 | — |
| `POST /api/heat` | 열기 올리기 | 본문 참고 |
| `GET /api/course` | 열기 코스 | `lat`, `lng`, `limit` (기본 3) |
| `GET /api/me/footprints` | 내 열기 발자국 | `deviceId` |

**GET /api/places** — 최근 30분 heat\_events를 한 번에 가져와 장소별로 묶어 계산한다.

```json
[
  { "id": "uuid", "name": "서문시장 야시장", "category": "market",
    "lat": 35.87, "lng": 128.58, "temp": 42.5, "band": "hot", "eventActive": true }
]
```

**GET /api/places/\[id\]**

```json
{ "id": "uuid", "name": "서문시장 야시장", "category": "market", "description": "…",
  "lat": 35.87, "lng": 128.58, "temp": 42.5, "band": "hot",
  "peersNow": 7,                       // 최근 5분 안에 열기를 올린 기기 수
  "todayPeak": { "temp": 51.2, "at": "2026-11-07T21:10:00+09:00" } }
```

**GET /api/places/\[id\]/timeline** — 36개 지점.

```json
[ { "at": "2026-11-07T15:10:00+09:00", "temp": 24.0 }, … ]
```

**POST /api/heat**

```json
// 요청
{ "placeId": "uuid", "deviceId": "uuid", "lat": 35.8701, "lng": 128.5805,
  "taps": 32, "shake": 0.6 }

// 200 성공
{ "tempBefore": 38.1, "tempAfter": 40.4, "delta": 2.3, "peers": 5 }
```

처리 순서는 다음과 같다.

1. 입력 검증: taps 0\~200 정수, shake 0\~1, placeId 존재 여부 → 아니면 `400 INVALID`
2. 거리 검사: 사용자 좌표와 장소 좌표가 150m 넘게 떨어지면 `403 TOO_FAR { distanceM }`
3. 쿨다운 검사: 같은 기기가 같은 장소에 5분 안에 올린 기록이 있으면 `429 COOLDOWN { retryAfterSec }`
4. 서버에서 `eventScore(taps, shake)`로 점수를 다시 계산해 저장 (클라이언트 점수는 믿지 않음)
5. 저장 전후 온도와 최근 60초 동시 참여 기기 수를 응답

헤더 `x-demo-secret`이 `DEMO_SECRET`과 같으면 2·3번을 건너뛰고 `is_demo = true`로 저장한다.

**GET /api/course** — 지금 위치에서 "다음 갈 곳"을 이어 준다.

1. 현재 위치에서 1.5km 안, 온도 30°C 이상인 장소를 후보로 뽑는다 (현재 위치 50m 안의 장소는 제외).
2. 지금 지점에서 `온도 − 10 × 거리(km)`가 가장 큰 장소를 다음 목적지로 고른다.
3. 고른 장소를 새 출발점으로 삼아 `limit`개가 될 때까지 반복한다. 같은 장소는 다시 고르지 않는다.

```json
{ "stops": [ { "id": "uuid", "name": "김광석다시그리기길", "lat": 35.86, "lng": 128.60,
               "temp": 44.0, "distanceM": 620 } ],
  "totalDistanceM": 1450 }
```

**GET /api/me/footprints**

```json
[ { "placeId": "uuid", "name": "서문시장 야시장", "lat": 35.87, "lng": 128.58,
    "count": 3, "lastAt": "2026-11-07T21:05:00+09:00" } ]
```

## 6. 화면 명세

화면은 지도 홈, 장소 시트, 열기 올리기, 발자국 4개이고, 열기 코스는 지도 홈 위에 겹쳐 그린다. 모바일 세로 화면(390px 기준)을 우선한다.

**지도 홈 (`/`)**

- 카카오맵 전체 화면, 처음 중심은 동성로 일대 (약 35.869, 128.596), 확대 레벨 4
- 상단 필터 칩: 전체 · 맛집 · 시장 · 거리 · 축제 · 응원
- 장소마다 커스텀 오버레이 마커: 원 안에 온도 숫자 (예: 42°)
- 하단 버튼 2개: "다음 갈 곳"(열기 코스), "내 발자국"
- SWR로 `/api/places`를 5초마다 다시 불러 마커 색·크기를 갱신
- 마커를 누르면 장소 시트가 올라온다

| 온도 단계 | 색 | 마커 지름 | 효과 |
| --- | --- | --- | --- |
| 미지근 (30°C 미만) | 회청색 #94A3B8 | 28px | 반투명 |
| 따뜻 (30\~40°C) | 주황 #FB923C | 36px | 없음 |
| 뜨거움 (40\~50°C) | 빨강 #EF4444 | 44px | 천천히 맥박 (2초) |
| 대프리카 (50°C 이상) | 진홍 #B91C1C | 56px | 빠른 맥박 (0.8초) + 바깥 번짐 |

**장소 시트 (지도 홈 위 하단 시트)**

- 장소명, 카테고리, 현재 온도와 단계, "지금 n명이 열기를 올리는 중"
- 최근 6시간 온도 그래프 (Recharts 선 그래프, `/timeline`)
- 오늘 최고 온도와 시각
- 버튼: "열기 올리기" (`/heat/[placeId]`로 이동), "여기서 다음 갈 곳"
- 시트를 내려도 지도 왼쪽 아래 카카오 로고는 가리지 않게 여백을 둔다

**열기 올리기 (`/heat/[placeId]`)**

1. 진입하면 위치를 가져와 장소까지 거리를 표시한다. 150m 밖이면 "현장 150m 안에서만 올릴 수 있어요 (지금 420m)"를 띄우고 버튼을 비활성화한다.
2. "열기 켜기" 버튼을 누르면 흔들기 센서 권한을 요청한다 (iOS는 이 클릭 안에서 `DeviceMotionEvent.requestPermission()` 호출 필수).
3. 3, 2, 1 카운트 후 10초 동안 큰 원형 버튼 연타 + 폰 흔들기. 화면의 온도계 게이지가 탭할 때마다 올라간다 (로컬 연출).
4. 흔들기 세기 = 10초 동안 `max(0, 가속도 크기 − 9.8)` 평균 ÷ 15, 최대 1. 센서가 없거나 권한이 거부되면 0으로 보낸다.
5. 끝나면 `POST /api/heat` → 결과 화면: "+2.3°C · 지금 5명이 같이 터뜨렸어요", 장소 온도가 오르는 숫자 애니메이션
6. 결과 온도가 50°C 이상이면 전체 화면 '대프리카 모드' 효과 (붉은 그라데이션 + 진동)
7. 하단 버튼: "지도로 돌아가기", "다음 갈 곳 보기"

**열기 코스 (지도 홈 위 레이어)**

- 현재 위치를 받아 `/api/course` 호출 → 정류장 2\~3곳에 1, 2, 3 번호 마커와 연결선 (카카오 Polyline)
- 하단 카드에 정류장 이름, 온도, 거리, 총 이동 거리

**내 발자국 (`/me`)**

- 내가 열기를 올린 장소를 작은 지도와 목록으로 표시 (장소명, 올린 횟수, 마지막 시각)
- 상단 요약: "지금까지 n곳에서 열기를 올렸어요"

## 7. 어뷰징 방지와 데모 시뮬레이터

MVP는 "장난만 막는" 수준의 규칙 4개를 서버에서 검사하고, 발표용으로 지도를 살아 있게 만드는 시뮬레이터를 따로 둔다.

| 문제 | 규칙 | 응답 |
| --- | --- | --- |
| 집에서 열기 올리기 | 장소 반경 150m 안에서만 허용 (하버사인 거리) | 403 TOO\_FAR |
| 한 사람이 계속 누르기 | 같은 기기·같은 장소 5분에 1회, 기기당 1시간 20회 | 429 COOLDOWN |
| 미친 듯이 연타·흔들기 | 연타 40회, 흔들기 1에서 점수 상한 | 점수만 깎임 |
| 혼자서 동시성 보너스 | 동시성은 서로 다른 기기 수로만 계산 | 배수 1 |

기기 ID를 지우고 다시 만드는 우회는 MVP에서 막지 않는다. 발표 때 "로그인 연동 시 계정 단위로 제한"을 확장 계획으로 말한다.

**시뮬레이터 (scripts/simulate.ts)** — `x-demo-secret` 헤더로 `POST /api/heat`를 대신 보낸다.

| 모드 | 하는 일 | 쓰는 때 |
| --- | --- | --- |
| `ambient` | 모든 장소에 30분 동안 드문드문 반응을 보내 지도 전체를 미지근\~따뜻하게 | 발표 30분 전 |
| `burst` | 지정 장소에 가짜 기기 N대가 30초 안에 몰아서 반응 → 동시성 보너스로 급상승 | 발표 클라이맥스 |
| `reset` | `is_demo = true` 기록 전부 삭제 | 리허설 후 |

```bash
# 예시
npx tsx scripts/simulate.ts --mode ambient --base-url https://yeolgi-map.vercel.app
npx tsx scripts/simulate.ts --mode burst --place "서문시장 야시장" --devices 15
npx tsx scripts/simulate.ts --mode reset
```

가짜 반응은 연타 20\~40회, 흔들기 0.3\~0.9 사이 무작위 값으로 만든다. 실제 발표에서는 심사위원 폰 반응 + `burst`를 함께 써서 온도가 확실히 50°C를 넘게 한다.

## 8. Claude Code 개발 순서와 수용 기준

Claude Code에는 한 번에 마일스톤 하나만 맡기고, 수용 기준을 직접 확인한 뒤 커밋하고 다음으로 넘어간다. M4까지가 "버튼 누르면 지도 색이 바뀌는" 핵심 고리이며 3일 차까지 끝내는 것이 목표다.

**시작 전 준비.** 이 문서를 마크다운으로 내보내 저장소 루트에 `CLAUDE.md`로 넣는다. Claude Code가 매 작업마다 이 명세를 읽는다.

1. **M1 프로젝트 뼈대** (1일 차)
   - 요청: "CLAUDE.md 명세대로 Next.js + TypeScript + Tailwind 프로젝트를 만들고, supabase/schema.sql을 작성하고, lib/supabase.ts와 GET /api/places를 구현해줘. 온도는 일단 20으로 고정해."
   - 수용 기준: Supabase에 장소 3곳을 직접 넣으면 `/api/places`가 3곳을 temp 20으로 돌려준다.
2. **M2 열기 계산 엔진** (1일 차)
   - 요청: "4장 공식대로 lib/temperature.ts와 constants.ts를 만들고 Vitest 단위 테스트를 붙여줘."
   - 수용 기준: 반응 0건 → 20°C, 4장 예시 → 50°C, 같은 기기 반복 → 동시성 배수 1, 세 테스트 통과.
3. **M3 열기 올리기 API** (2일 차)
   - 요청: "5장 처리 순서대로 POST /api/heat를 구현하고, /api/places가 실제 엔진으로 온도를 계산하게 바꿔줘. 테스트용으로 버튼 하나짜리 /dev 페이지도 만들어줘."
   - 수용 기준: 장소 좌표로 올리면 온도가 오른다. 200m 떨어진 좌표면 403, 5분 안에 다시 올리면 429.
4. **M4 지도와 실시간 반영** (2\~3일 차) — 핵심 고리 완성
   - 요청: "카카오맵 SDK로 지도 홈을 만들고, 6장 표대로 커스텀 오버레이 마커를 그리고, SWR로 5초마다 갱신해줘."
   - 수용 기준: Vercel에 배포한 주소에서, 한 폰으로 열기를 올리면 다른 폰 지도의 마커 색이 5초 안에 바뀐다.
5. **M5 장소 시트와 열기 올리기 화면** (4\~5일 차)
   - 요청: "6장 명세대로 장소 시트, timeline API와 그래프, /heat/\[placeId\] 화면(카운트다운, 연타, 흔들기, 결과, 대프리카 모드)을 만들어줘."
   - 수용 기준: 아이폰·안드로이드 실기기 각각에서 센서 권한 요청부터 결과 화면까지 끝까지 동작한다.
6. **M6 열기 코스와 발자국** (5\~6일 차)
   - 요청: "5장 알고리즘대로 /api/course와 지도 위 코스 레이어, /api/me/footprints와 /me 화면을 만들어줘."
   - 수용 기준: 동성로 좌표에서 코스를 요청하면 30°C 이상 장소 2\~3곳이 번호와 선으로 이어진다.
7. **M7 시드와 시뮬레이터** (6일 차)
   - 요청: "data/places.csv를 읽어 카카오 로컬 키워드 검색으로 좌표를 채워 DB에 넣는 seed-places.ts와, 7장 3개 모드의 simulate.ts를 만들어줘."
   - 수용 기준: 기획팀 CSV 30곳 이상이 지도에 뜨고, `ambient` 후 지도 전체에 색이 돌고, `burst`로 한 곳이 50°C를 넘는다.
8. **M8 디자인 적용과 점검** (7\~8일 차)
   - 요청: 디자인 시안 이미지를 첨부하고 "이 시안대로 마커, 시트, 열기 올리기 화면을 다듬어줘."
   - 수용 기준: 동성로 현장에서 실제 폰 3대 이상으로 테스트해 위치 오차, 센서, 갱신 속도에 문제가 없다.

9\~10일 차는 데모 리허설, 발표 자료, 예비일로 비워 둔다.

## 9. 주의사항

대부분의 막힘은 기능이 아니라 환경 설정에서 나온다. 1일 차에 아래를 먼저 처리한다.

- [ ] **HTTPS 배포를 1일 차에**: 위치 정보와 흔들기 센서는 HTTPS에서만 동작한다. localhost 대신 Vercel 미리보기 주소로 폰 테스트한다.
- [ ] **카카오 개발자 콘솔**: 앱 생성 → JavaScript 키 발급 → Web 플랫폼에 Vercel 도메인과 `http://localhost:3000` 등록. 등록 안 된 도메인에서는 지도가 뜨지 않는다.
- [ ] **카카오 로고 가리지 않기**: 지도 구석의 카카오 로고·저작권 표시는 하단 시트나 버튼으로 덮지 않는다.
- [ ] **아이폰 센서 권한**: `DeviceMotionEvent.requestPermission()`은 사용자 클릭 핸들러 안에서만 호출할 수 있다.
- [ ] **아이폰 진동 미지원**: iOS 사파리는 진동 API가 없으므로 대프리카 모드는 화면 효과로 대체한다.
- [ ] **실내 GPS 오차**: 시장·건물 안에서는 위치가 수십 미터 튈 수 있다. 현장 테스트 후 반경 150m를 조정한다.
- [ ] **서비스 키 보호**: `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_SECRET`은 `NEXT_PUBLIC_`을 붙이지 않고, 저장소에 커밋하지 않는다.
- [ ] **시간대**: 서버는 UTC로 저장하고, 화면 표시는 Asia/Seoul로 변환한다.
- [ ] **데모 데이터 정리**: 리허설 후 `simulate --mode reset`으로 가짜 기록을 지우고, 발표 30분 전에 `ambient`를 다시 돌린다.
