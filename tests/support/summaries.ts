import type { CustomerSummary } from '@shared/types'

export function makeSummary(over: Partial<CustomerSummary> = {}): CustomerSummary {
  return {
    id: 'c1',
    name: '김민지',
    phone: '01012345678',
    purpose: null,
    status: 'active',
    pinnedNote: '',
    goalsDone: 0,
    goalsTotal: 0,
    lessonCount: 0,
    lastLessonDate: null,
    nextReservation: null,
    remainingPasses: null,
    ...over
  }
}
