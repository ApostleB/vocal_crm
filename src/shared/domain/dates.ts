import dayjs from 'dayjs'

export const DATE_FORMAT = 'YYYY-MM-DD'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 로컬 시간 기준 YYYY-MM-DD */
export function toDateString(d: Date): string {
  return dayjs(d).format(DATE_FORMAT)
}

export function addDays(date: string, days: number): string {
  return dayjs(date).add(days, 'day').format(DATE_FORMAT)
}

/** to - from (일). from이 과거면 양수 */
export function daysBetween(from: string, to: string): number {
  return dayjs(to).diff(dayjs(from), 'day')
}

/** 그 주의 월요일 */
export function startOfWeek(date: string): string {
  const d = dayjs(date)
  const dow = d.day()
  const diff = dow === 0 ? -6 : 1 - dow
  return d.add(diff, 'day').format(DATE_FORMAT)
}

export function weekdayLabel(date: string): string {
  return WEEKDAYS[dayjs(date).day()]
}

/** "10/6 (화)" */
export function formatMonthDay(date: string): string {
  const d = dayjs(date)
  return `${d.month() + 1}/${d.date()} (${weekdayLabel(date)})`
}

/** "2026-10-02 (금)" */
export function formatFullDate(date: string): string {
  return `${date} (${weekdayLabel(date)})`
}

/** "9월 28일 (월)" */
export function formatKoreanDate(date: string): string {
  const d = dayjs(date)
  return `${d.month() + 1}월 ${d.date()}일 (${weekdayLabel(date)})`
}

/** 오늘 / 어제 / N일 전 / 내일 / N일 후 */
export function relativeDays(date: string, today: string): string {
  const n = daysBetween(date, today)
  if (n === 0) return '오늘'
  if (n === 1) return '어제'
  if (n > 1) return `${n}일 전`
  if (n === -1) return '내일'
  return `${-n}일 후`
}

/** 만 나이 */
export function ageOn(birthDate: string, today: string): number {
  return dayjs(today).diff(dayjs(birthDate), 'year')
}
