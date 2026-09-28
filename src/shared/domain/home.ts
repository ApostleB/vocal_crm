import type {
  Customer,
  CustomerSummary,
  HomeData,
  Reservation,
  ReservationWithCustomer
} from '../types'
import { isPassExhausted, remainingPasses } from './passes'

/** DB에서 고객별로 집계해 온 값 */
export interface CustomerAggregate {
  customer: Customer
  goalsDone: number
  goalsTotal: number
  lessonCount: number
  lastLessonDate: string | null
  deducted: number
  passRecords: number
  passTotal: number
}

const byTime = (a: Reservation, b: Reservation): number =>
  a.date.localeCompare(b.date) || a.time.localeCompare(b.time)

/** 고객별로 오늘(포함) 이후 가장 이른 예정(scheduled) 예약 */
export function nextReservationsByCustomer(
  reservations: Reservation[],
  today: string
): Map<string, Reservation> {
  const result = new Map<string, Reservation>()
  const upcoming = reservations
    .filter((r) => r.status === 'scheduled' && r.date >= today)
    .sort(byTime)
  for (const r of upcoming) {
    if (!result.has(r.customerId)) result.set(r.customerId, r)
  }
  return result
}

export function remainingOf(a: CustomerAggregate): number | null {
  return remainingPasses({ records: a.passRecords, total: a.passTotal, deducted: a.deducted })
}

export function toSummary(a: CustomerAggregate, next: Reservation | undefined): CustomerSummary {
  return {
    id: a.customer.id,
    name: a.customer.name,
    phone: a.customer.phone,
    purpose: a.customer.purpose,
    status: a.customer.status,
    pinnedNote: a.customer.pinnedNote,
    goalsDone: a.goalsDone,
    goalsTotal: a.goalsTotal,
    lessonCount: a.lessonCount,
    lastLessonDate: a.lastLessonDate,
    nextReservation: next ? { date: next.date, time: next.time } : null,
    remainingPasses: remainingOf(a)
  }
}

export function withCustomer(r: Reservation, a: CustomerAggregate): ReservationWithCustomer {
  return {
    reservation: r,
    customerName: a.customer.name,
    hasPinnedNote: a.customer.pinnedNote.trim() !== '',
    lessonNumber: r.status === 'scheduled' ? a.lessonCount + 1 : null,
    remainingPasses: remainingOf(a)
  }
}

export function buildHome(input: {
  today: string
  aggregates: CustomerAggregate[]
  reservations: Reservation[]
}): HomeData {
  const { today, aggregates, reservations } = input
  const byId = new Map(aggregates.map((a) => [a.customer.id, a]))
  const next = nextReservationsByCustomer(reservations, today)
  const attach = (list: Reservation[]): ReservationWithCustomer[] =>
    list.flatMap((r) => {
      const a = byId.get(r.customerId)
      return a ? [withCustomer(r, a)] : []
    })

  const todayReservations = attach(
    reservations.filter((r) => r.date === today && r.status !== 'canceled').sort(byTime)
  )
  const missedReservations = attach(
    reservations.filter((r) => r.status === 'scheduled' && r.date < today).sort(byTime)
  )

  const active = aggregates.filter((a) => a.customer.status === 'active')
  const unbooked = active
    .filter((a) => !next.has(a.customer.id))
    .sort((x, y) => {
      if (x.lastLessonDate === y.lastLessonDate) return x.customer.name.localeCompare(y.customer.name, 'ko')
      if (x.lastLessonDate === null) return -1
      if (y.lastLessonDate === null) return 1
      return x.lastLessonDate.localeCompare(y.lastLessonDate)
    })
    .map((a) => ({ id: a.customer.id, name: a.customer.name, lastLessonDate: a.lastLessonDate }))

  const customers = aggregates
    .map((a) => toSummary(a, next.get(a.customer.id)))
    .sort((x, y) => x.name.localeCompare(y.name, 'ko'))

  return {
    today,
    stats: {
      active: active.length,
      today: todayReservations.length,
      unbooked: unbooked.length,
      passExhausted: active.filter((a) => isPassExhausted(remainingOf(a))).length
    },
    todayReservations,
    missedReservations,
    unbooked,
    customers
  }
}
