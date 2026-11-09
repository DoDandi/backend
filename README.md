# 열기지도 백엔드 (yeolgi-map-backend)

대구 원도심의 "지금 살아 있는 현장"을 온도로 보여주는 열기지도의 API 서버입니다. Next.js Route Handler + Supabase(Postgres)로 동작합니다.

- 화면은 [DoDandi/frontend](https://github.com/DoDandi/frontend) 저장소에 있습니다. 프론트는 `/api/...` 요청을 이 서버로 넘겨줍니다(Next rewrites).
- 원래 하나였던 프로토타입(`Kjaemin339/yeolgi-map` 커밋 `4418821`)을 백엔드·프론트로 나눈 것입니다.
- 전체 명세는 `CLAUDE.md`, 최신 결정 사항은 `docs/`와 노션 "현재 진행 상황 공유" 페이지를 봅니다. **`CLAUDE.md`는 10/30 명세라 11/7 결정(도 단위 10° 기준 등)과 다른 부분이 있습니다.**

## 시작하기

1. Supabase 프로젝트 SQL Editor에서 `supabase/schema.sql` 실행 (이미 있는 DB라면 `migration-002-zones.sql`, `migration-003-posts.sql`, `migration-004-schedules.sql`처럼 아직 안 돌린 마이그레이션만)
2. `.env.local.example`을 `.env.local`로 복사해 값 채우기 (값은 팀 비밀 채널로 공유)
3. 실행

```bash
npm install
npm run dev -- -p 4000   # 프론트가 http://localhost:4000 으로 요청을 넘김
npm test                 # 온도 엔진 단위 테스트
npm run seed             # data/zones.csv + data/places.csv → 카카오 검색 → DB
npm run sync-schedules            # data/schedules-manual.csv → schedules (--dry-run, --demo-today <장소>, --reset-demo)
```

## API

| 메서드 · 경로 | 용도 |
| --- | --- |
| `GET /api/places` | 장소 목록 + 현재 온도 (`?category=`, `?group=food\|festival\|sports\|etc`). 장소마다 `group` 포함 |
| `GET /api/zones` | 구역 목록 + 현재 온도 |
| `GET /api/places/[id]` | 장소 상세 (`group`, `vsBaseline` 평소 대비, `peers30m` 최근 30분 참여 기기 수, `todaySchedules` 오늘 일정 포함) |
| `GET /api/places/[id]/timeline` | 최근 6시간 10분 단위 온도 |
| `GET /api/places/[id]/posts` | 다음 검색 사진·블로그 (**11/1 회의에서 삭제 확정, 아직 코드에 남아 있음**) |
| `POST /api/heat` | 열기 올리기 |
| `GET /api/course` | 열기 코스 (`lat`, `lng`, `limit`) |
| `GET /api/me/footprints` | 내 발자국 (`deviceId`) |
| `GET /api/feed` | 현장 피드, 최신순 30개 (`?group=food\|festival\|sports\|etc`, `?before=ISO시각`) |
| `GET /api/places/[id]/photos` | 이 장소에 남긴 게시물 |
| `POST /api/places/[id]/photos` | 사진 1장 + 글 올리기 (multipart: `image`, `text`, `deviceId`) → 201 |

상세 명세: 노션 "API 명세서" 페이지

## 데모 시뮬레이터

```bash
npm run simulate -- --mode ambient --base-url <배포 주소>
npm run simulate -- --mode burst --place "서문시장 야시장" --devices 25
npm run simulate -- --mode reset
```

## 폴더

```
app/api/     API 라우트
lib/         온도 엔진(temperature.ts), 상수, Supabase 클라이언트, 거리·시간 유틸
scripts/     시드, 시뮬레이터
data/        장소·구역 CSV
supabase/    스키마 SQL
```

## 규칙

- 작업 브랜치(`feature/…`) → `develop`으로 PR 후 머지. `main`에는 직접 푸시하지 않고, 최종본만 `develop`에서 PR로 머지한다
- 스키마 변경은 `supabase/`에 SQL 파일로 PR
- 응답 형태를 바꾸면 프론트 담당에게 먼저 알리기
- `lib/constants.ts`, `lib/temperature.ts`, `lib/geo.ts`, `lib/time.ts`는 프론트 저장소에도 복사본이 있으므로, 바꾸면 프론트에도 반영 요청
