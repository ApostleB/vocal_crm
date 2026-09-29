import type {
  Customer,
  CustomerDetail,
  CustomerSummary,
  HomeData,
  Reservation,
  ReservationWithCustomer
} from '@shared/types'
import type { CustomerAggregate } from '@shared/domain/home'
import { buildHome, nextReservationsByCustomer, toSummary, withCustomer } from '@shared/domain/home'
import { buildTimeline, numberLessons } from '@shared/domain/lessons'
import { remainingPasses } from '@shared/domain/passes'
import type { DB } from '../db/connection'
import { customerColumns, RESERVATION_COLUMNS } from './columns'
import { getCustomer, listStatusLogs } from './customers'
import { listGoals } from './goals'
import { listLessons } from './lessons'
import { listPasses } from './passes'

type AggregateRow = Customer & Omit<CustomerAggregate, 'customer'>

export function listAggregates(db: DB): CustomerAggregate[] {
  const rows = db
    .prepare(
      `SELECT ${customerColumns('c.')},
         (SELECT COUNT(*) FROM goals g WHERE g.customer_id = c.id) AS goalsTotal,
         (SELECT COUNT(*) FROM goals g WHERE g.customer_id = c.id AND g.done_at IS NOT NULL) AS goalsDone,
         (SELECT COUNT(*) FROM lessons l WHERE l.customer_id = c.id) AS lessonCount,
         (SELECT MAX(l.lesson_date) FROM lessons l WHERE l.customer_id = c.id) AS lastLessonDate,
         (SELECT COUNT(*) FROM lessons l WHERE l.customer_id = c.id AND l.deduct_pass = 1) AS deducted,
         (SELECT COUNT(*) FROM passes p WHERE p.customer_id = c.id) AS passRecords,
         (SELECT COALESCE(SUM(p.count), 0) FROM passes p WHERE p.customer_id = c.id) AS passTotal
       FROM customers c`
    )
    .all() as AggregateRow[]
  return rows.map(
    ({ goalsTotal, goalsDone, lessonCount, lastLessonDate, deducted, passRecords, passTotal, ...customer }) => ({
      customer,
      goalsTotal,
      goalsDone,
      lessonCount,
      lastLessonDate,
      deducted,
      passRecords,
      passTotal
    })
  )
}

export function listSummaries(db: DB, today: string): CustomerSummary[] {
  const upcoming = db
    .prepare(`SELECT ${RESERVATION_COLUMNS} FROM reservations WHERE status = 'scheduled' AND date >= ?`)
    .all(today) as Reservation[]
  const next = nextReservationsByCustomer(upcoming, today)
  return listAggregates(db)
    .map((a) => toSummary(a, next.get(a.customer.id)))
    .sort((x, y) => x.name.localeCompare(y.name, 'ko'))
}

export function getCustomerDetail(db: DB, id: string, today: string): CustomerDetail | null {
  const customer = getCustomer(db, id)
  if (!customer) return null
  const lessons = numberLessons(listLessons(db, id))
  const passes = listPasses(db, id)
  const totalPassCount = passes.reduce((sum, p) => sum + p.count, 0)
  const nextReservation =
    (db
      .prepare(
        `SELECT ${RESERVATION_COLUMNS} FROM reservations
         WHERE customer_id = ? AND status = 'scheduled' AND date >= ? ORDER BY date, time LIMIT 1`
      )
      .get(id, today) as Reservation | undefined) ?? null
  return {
    customer,
    goals: listGoals(db, id),
    lessons,
    timeline: buildTimeline(lessons, listStatusLogs(db, id)),
    passes,
    totalPassCount,
    remainingPasses: remainingPasses({
      records: passes.length,
      total: totalPassCount,
      deducted: lessons.filter((l) => l.deductPass).length
    }),
    nextReservation
  }
}

export function attachCustomers(db: DB, reservations: Reservation[]): ReservationWithCustomer[] {
  const byId = new Map(listAggregates(db).map((a) => [a.customer.id, a]))
  return reservations.flatMap((r) => {
    const a = byId.get(r.customerId)
    return a ? [withCustomer(r, a)] : []
  })
}

/** from ~ to (둘 다 포함), 날짜·시간순. 취소 포함 */
export function listReservationsInRange(db: DB, from: string, to: string): ReservationWithCustomer[] {
  const rows = db
    .prepare(`SELECT ${RESERVATION_COLUMNS} FROM reservations WHERE date BETWEEN ? AND ? ORDER BY date, time`)
    .all(from, to) as Reservation[]
  return attachCustomers(db, rows)
}

/** 홈 계산용: 오늘 이후 전부 + 지난 미기록(scheduled) */
export function listReservationsForHome(db: DB, today: string): Reservation[] {
  return db
    .prepare(
      `SELECT ${RESERVATION_COLUMNS} FROM reservations
       WHERE date >= ? OR (status = 'scheduled' AND date < ?) ORDER BY date, time`
    )
    .all(today, today) as Reservation[]
}

export function getHome(db: DB, today: string): HomeData {
  return buildHome({
    today,
    aggregates: listAggregates(db),
    reservations: listReservationsForHome(db, today)
  })
}
