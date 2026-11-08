// 서버는 UTC로 저장, 화면 표시는 Asia/Seoul
const KST_OFFSET_MS = 9 * 3600_000;

export function formatKST(iso: string | Date, opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ...opts }).format(new Date(iso));
}

/** 오늘(Asia/Seoul) 0시의 Date */
export function startOfTodayKST(now = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - KST_OFFSET_MS);
}

/** ISO 문자열을 +09:00 표기로 */
export function toKSTISO(d: Date): string {
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  return kst.toISOString().replace(/\.\d{3}Z$/, '+09:00');
}
