import type { ReservationStatus } from '../types'

export const TIME_STEP_MINUTES = 10

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 10분 단위 시각 목록 (기본 07:00 ~ 23:50) */
export function buildTimeOptions(start = '07:00', end = '23:50'): string[] {
  const options: string[] = []
  for (let t = timeToMinutes(start); t <= timeToMinutes(end); t += TIME_STEP_MINUTES) {
    options.push(minutesToTime(t))
  }
  return options
}

/** HH:mm 이고 10분 단위인지 */
export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]0$/.test(time)
}

interface SlotLike {
  id: string
  date: string
  time: string
  status: ReservationStatus
}

/**
 * 같은 날짜에서 시작 시각 차이가 수업 길이보다 작으면 겹침.
 * 취소된 예약과 자기 자신(target.id)은 제외한다.
 */
export function findConflicts<T extends SlotLike>(
  target: { id?: string; date: string; time: string },
  others: T[],
  lessonMinutes: number
): T[] {
  const start = timeToMinutes(target.time)
  return others.filter(
    (o) =>
      o.id !== target.id &&
      o.status !== 'canceled' &&
      o.date === target.date &&
      Math.abs(timeToMinutes(o.time) - start) < lessonMinutes
  )
}
