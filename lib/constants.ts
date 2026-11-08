// 온도 계산 엔진 파라미터 (4장)
export const WINDOW_MIN = 30;
export const SYNC_WINDOW_SEC = 60;
export const MAX_TAPS = 40;
export const BASE_TEMP = 20;
export const TEMP_PER_RATIO = 10;
export const MAX_RATIO = 3;
export const EVENT_BONUS = 5;
export const TREND_BONUS = 3;

// 어뷰징 방지 (5장·7장)
export const HEAT_RADIUS_M = 150;
export const COOLDOWN_MIN = 5;
export const HOURLY_LIMIT = 20;
export const PEERS_NOW_MIN = 5;

// 열기 올리기 화면 (6장)
export const TAP_DURATION_SEC = 10;
export const SHAKE_DIVISOR = 15;
export const GRAVITY = 9.8;

// 타임라인 (6시간, 10분 단위)
export const TIMELINE_HOURS = 6;
export const TIMELINE_STEP_MIN = 10;

// 열기 코스 (5장)
export const COURSE_RADIUS_KM = 1.5;
export const COURSE_MIN_TEMP = 30;
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
