// 온도 계산 엔진 파라미터 (4장)
export const WINDOW_MIN = 30;
export const SYNC_WINDOW_SEC = 60;
export const MAX_TAPS = 40;
export const BASE_TEMP = 20;
export const TEMP_PER_RATIO = 10;
export const MAX_RATIO = 3;
export const EVENT_BONUS = 5;
export const TREND_BONUS = 3;
// 일정 보너스: 시작 SCHEDULE_LEAD_MIN분 전부터 끝날 때까지 EVENT_BONUS를 켠다 (노션 2-3·5)
export const SCHEDULE_LEAD_MIN = 60;
// 평소 수준(반응 비율 1)의 온도. 장소 상세 "평소 대비"와 코스 후보 기준에 쓴다
export const USUAL_TEMP = BASE_TEMP + TEMP_PER_RATIO;

// 어뷰징 방지 (5장·7장)
export const HEAT_RADIUS_M = 150;
export const COOLDOWN_MIN = 5;
export const HOURLY_LIMIT = 20;
export const PEERS_NOW_MIN = 5;
export const PEERS_RECENT_MIN = 30; // 장소 상세 "최근 참여 n명"

// 열기 올리기 화면 (6장)
export const TAP_DURATION_SEC = 10;
export const SHAKE_DIVISOR = 15;
export const GRAVITY = 9.8;

// 타임라인 (6시간, 10분 단위)
export const TIMELINE_HOURS = 6;
export const TIMELINE_STEP_MIN = 10;

// 열기 코스 (5장)
export const COURSE_RADIUS_KM = 1.5;
export const COURSE_MIN_TEMP = USUAL_TEMP; // 평소 수준 이상만 추천 (11/9 결정: 새 공식 기준 20°)
export const COURSE_EXCLUDE_M = 50;
export const COURSE_DIST_PENALTY = 10; // 온도 − 10 × 거리(km)
export const COURSE_DEFAULT_LIMIT = 3;

// 지도
export const DEFAULT_CENTER = { lat: 35.869, lng: 128.596 }; // 동성로 일대
export const DEFAULT_LEVEL = 5;
export const POLL_MS = 5000;

export const CATEGORIES = ['food', 'cafe', 'market', 'night_market', 'street', 'show', 'festival', 'cheer'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  food: '맛집',
  cafe: '카페',
  market: '시장',
  night_market: '야시장',
  street: '거리',
  show: '공연',
  festival: '축제',
  cheer: '경기장',
};

// 평소 반응 점수 B. cafe·night_market·show는 문서 표에 없어 추가한 값 (현장 테스트 후 조정)
export const CATEGORY_BASELINE: Record<Category, number> = {
  food: 5,
  cafe: 5,
  street: 8,
  market: 10,
  night_market: 12,
  show: 15,
  festival: 20,
  cheer: 20,
};

// 구역 평소값 기본값 (구역 안 모든 반응을 합친 R과 비교)
export const ZONE_BASELINE = 20;
// 확대 레벨이 이 값 이상(멀리 봄)이면 구역, 미만(가까이 봄)이면 매장을 그린다
export const ZONE_LEVEL_THRESHOLD = 5;

// 화면 필터 그룹 (11/7 결정). 묶는 일은 서버가 한다
export const GROUPS = ['food', 'festival', 'sports', 'etc'] as const;
export type Group = (typeof GROUPS)[number];

export const CATEGORY_GROUP: Record<Category, Group> = {
  food: 'food',
  cafe: 'food',
  market: 'food',
  night_market: 'food',
  festival: 'festival',
  show: 'festival',
  cheer: 'sports',
  street: 'etc',
};

// 게시물 (사진 1장 + 글, 11/9 피그마 SCREEN 07·08)
export const POST_TEXT_MAX = 300;
export const POST_IMAGE_MAX_BYTES = 4 * 1024 * 1024; // Vercel 요청 한도 4.5MB 안. 프론트가 1280px JPEG로 줄여 보낸다
export const POST_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const POST_IMAGE_BUCKET = 'post-images';
export const POST_DEFAULT_NICKNAME = '익명 사용자'; // 카카오 로그인 연결 전까지
export const FEED_LIMIT = 30;

// 일정 (노션 「현재 진행 상황 공유」 5). 끝 시각이 없는 일정은 종류별로 시작 후 이만큼을 끝으로 본다
export const SCHEDULE_KINDS = ['baseball', 'football', 'festival', 'show', 'busking', 'etc'] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];
export const SCHEDULE_DEFAULT_DURATION_MIN: Record<ScheduleKind, number> = {
  baseball: 210, // KBO: 시작 후 3시간 30분
  football: 150, // K리그: 시작 후 2시간 30분
  festival: 720, // 축제: 날짜만 있으면 10:00–22:00
  show: 150,
  busking: 120,
  etc: 120,
};
