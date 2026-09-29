import { daysBetween, relativeDays, toDateString } from './dates'

/** 외부 백업이 이 일수 이상 지나면 홈에 안내한다 (설계 7장) */
export const EXTERNAL_BACKUP_REMIND_DAYS = 30

/** 마지막 외부 백업 날짜(로컬 YYYY-MM-DD). 한 번도 안 했으면 null */
export function externalBackupDate(lastIso: string | null): string | null {
  return lastIso ? toDateString(new Date(lastIso)) : null
}

/** "오늘" / "34일 전" / "없음" */
export function externalBackupLabel(lastIso: string | null, today: string): string {
  const date = externalBackupDate(lastIso)
  return date ? relativeDays(date, today) : '없음'
}

/** 외부 백업이 없거나 30일이 지났고, 오늘 닫지 않았으면 안내한다 */
export function needsBackupReminder(lastIso: string | null, today: string, dismissedOn: string | null): boolean {
  if (dismissedOn === today) return false
  const date = externalBackupDate(lastIso)
  return date === null || daysBetween(date, today) >= EXTERNAL_BACKUP_REMIND_DAYS
}
