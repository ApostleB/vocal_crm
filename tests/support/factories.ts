import type { Customer, Lesson, Reservation, StatusLog } from '@shared/types'
import type { CustomerAggregate } from '@shared/domain/home'

const TS = '2026-09-01T00:00:00.000Z'

export function makeCustomer(over: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: '김민지',
    phone: '01012345678',
    birthDate: null,
    gender: null,
    purpose: null,
    status: 'active',
    registeredAt: '2026-03-02',
    vocalRange: null,
    preferredMusic: null,
    pinnedNote: '',
    pauseUntil: null,
    createdAt: TS,
    updatedAt: TS,
    ...over
  }
}

export function makeLesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    customerId: 'c1',
    lessonDate: '2026-09-28',
    memo: '',
    practice: null,
    homework: null,
    deductPass: true,
    reservationId: null,
    createdAt: TS,
    updatedAt: TS,
    ...over
  }
}

export function makeReservation(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    customerId: 'c1',
    date: '2026-09-28',
    time: '15:00',
    status: 'scheduled',
    note: null,
    createdAt: TS,
    updatedAt: TS,
    ...over
  }
}

export function makeStatusLog(over: Partial<StatusLog> = {}): StatusLog {
  return {
    id: 's1',
    customerId: 'c1',
    date: '2026-03-02',
    fromStatus: null,
    toStatus: 'active',
    reason: null,
    createdAt: TS,
    ...over
  }
}

export function makeAggregate(over: Partial<CustomerAggregate> & { customer?: Customer } = {}): CustomerAggregate {
  return {
    customer: makeCustomer(),
    goalsDone: 0,
    goalsTotal: 0,
    lessonCount: 0,
    lastLessonDate: null,
    deducted: 0,
    passRecords: 0,
    passTotal: 0,
    ...over
  }
}
