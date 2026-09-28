import type { CustomerStatus, CustomerSummary } from '../types'

export type StatusFilter = 'active' | 'paused' | 'closed' | 'all'
export type SortKey = 'name' | 'purpose' | 'goals' | 'lastLesson' | 'nextReservation' | 'lessonCount' | 'remaining'
export type SortDir = 'asc' | 'desc'

const FILTER_STATUSES: Record<StatusFilter, CustomerStatus[] | null> = {
  active: ['active'],
  paused: ['paused'],
  closed: ['ended', 'moved'],
  all: null
}

/** 상태 필터 + 이름/연락처 검색 */
export function filterCustomers(list: CustomerSummary[], filter: StatusFilter, query: string): CustomerSummary[] {
  const statuses = FILTER_STATUSES[filter]
  const q = query.trim()
  const digits = q.replace(/\D/g, '')
  return list.filter((c) => {
    if (statuses && !statuses.includes(c.status)) return false
    if (!q) return true
    if (c.name.includes(q)) return true
    return digits.length > 0 && (c.phone ?? '').includes(digits)
  })
}

/** 값이 없는 항목(null)은 방향과 상관없이 항상 맨 뒤 */
export function sortCustomers(list: CustomerSummary[], key: SortKey, dir: SortDir): CustomerSummary[] {
  const value = (c: CustomerSummary): string | number | null => {
    switch (key) {
      case 'name':
        return c.name
      case 'purpose':
        return c.purpose
      case 'goals':
        return c.goalsTotal === 0 ? null : c.goalsDone / c.goalsTotal
      case 'lastLesson':
        return c.lastLessonDate
      case 'nextReservation':
        return c.nextReservation ? `${c.nextReservation.date} ${c.nextReservation.time}` : null
      case 'lessonCount':
        return c.lessonCount
      case 'remaining':
        return c.remainingPasses
    }
  }
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === null && vb === null) return a.name.localeCompare(b.name, 'ko')
    if (va === null) return 1
    if (vb === null) return -1
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ko')
    return cmp === 0 ? a.name.localeCompare(b.name, 'ko') : cmp * sign
  })
}
