import { SCHEDULE_DEFAULT_DURATION_MIN, SCHEDULE_LEAD_MIN, type ScheduleKind } from './constants';
import { startOfTodayKST, toKSTISO } from './time';

export type Schedule = {
  id: string;
  placeId: string;
  title: string;
  kind: ScheduleKind;
  startsAt: Date;
  endsAt: Date;
};

const leadMs = SCHEDULE_LEAD_MIN * 60_000;

/** 일정 보너스가 켜지는 시각 (시작 1시간 전) */
export function bonusStart(s: Pick<Schedule, 'startsAt'>): Date {
  return new Date(s.startsAt.getTime() - leadMs);
}

/** now에 이 일정의 보너스가 켜져 있는가: 시작 1시간 전 ≤ now < 끝 */
export function isBonusActive(s: Pick<Schedule, 'startsAt' | 'endsAt'>, now: Date): boolean {
  const t = now.getTime();
  return t >= bonusStart(s).getTime() && t < s.endsAt.getTime();
}

export function hasActiveSchedule(list: readonly Pick<Schedule, 'startsAt' | 'endsAt'>[], now: Date): boolean {
  return list.some(s => isBonusActive(s, now));
}

/** 끝 시각이 없는 일정의 기본 끝 시각 */
export function defaultEnd(kind: ScheduleKind, startsAt: Date): Date {
  return new Date(startsAt.getTime() + SCHEDULE_DEFAULT_DURATION_MIN[kind] * 60_000);
}

/** 오늘(Asia/Seoul) 하루와 겹치는 일정. 장소 시트 "오늘 일정"용, 시작 순 */
export function todaySchedules(list: readonly Schedule[], now: Date) {
  const start = startOfTodayKST(now).getTime();
  const end = start + 24 * 3600_000;
  return list
    .filter(s => s.startsAt.getTime() < end && s.endsAt.getTime() > start)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map(s => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      startsAt: toKSTISO(s.startsAt),
      endsAt: toKSTISO(s.endsAt),
      bonusActive: isBonusActive(s, now),
    }));
}

/** 장소별로 묶기 */
export function groupSchedulesByPlace(list: readonly Schedule[]): Map<string, Schedule[]> {
  const m = new Map<string, Schedule[]>();
  for (const s of list) {
    const arr = m.get(s.placeId) ?? [];
    arr.push(s);
    m.set(s.placeId, arr);
  }
  return m;
}
