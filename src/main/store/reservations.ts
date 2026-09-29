import type { Reservation, ReservationInput } from '@shared/types'
import { isValidTime } from '@shared/domain/schedule'
import type { DB } from '../db/connection'
import { RESERVATION_COLUMNS } from './columns'
import { blankToNull, iso, newId, notFound, requireDate, validation } from './util'

export function getReservation(db: DB, id: string): Reservation | null {
  return (
    (db.prepare(`SELECT ${RESERVATION_COLUMNS} FROM reservations WHERE id = ?`).get(id) as Reservation | undefined) ??
    null
  )
}

export function saveReservation(db: DB, input: ReservationInput, now: Date): Reservation {
  const date = requireDate(input.date, '날짜를 확인해 주세요.')
  if (!isValidTime(input.time)) throw validation('시간은 10분 단위로 선택해 주세요.')
  const ts = iso(now)
  if (input.id) {
    const existing = getReservation(db, input.id)
    if (!existing) throw notFound('예약을 찾을 수 없습니다.')
    if (existing.status !== 'scheduled') throw validation('기록되었거나 취소된 예약은 변경할 수 없습니다.')
    db.prepare('UPDATE reservations SET date = ?, time = ?, note = ?, updated_at = ? WHERE id = ?').run(
      date,
      input.time,
      blankToNull(input.note),
      ts,
      input.id
    )
    return getReservation(db, input.id) as Reservation
  }
  const exists = db.prepare('SELECT 1 FROM customers WHERE id = ?').get(input.customerId)
  if (!exists) throw notFound('고객을 찾을 수 없습니다.')
  const reservation: Reservation = {
    id: newId(),
    customerId: input.customerId,
    date,
    time: input.time,
    status: 'scheduled',
    note: blankToNull(input.note),
    createdAt: ts,
    updatedAt: ts
  }
  db.prepare(
    `INSERT INTO reservations (id, customer_id, date, time, status, note, created_at, updated_at)
     VALUES (@id, @customerId, @date, @time, @status, @note, @createdAt, @updatedAt)`
  ).run(reservation)
  return reservation
}

export function cancelReservation(db: DB, id: string, now: Date): void {
  const existing = getReservation(db, id)
  if (!existing) throw notFound('예약을 찾을 수 없습니다.')
  if (existing.status !== 'scheduled') throw validation('기록되었거나 이미 취소된 예약입니다.')
  db.prepare("UPDATE reservations SET status = 'canceled', updated_at = ? WHERE id = ?").run(iso(now), id)
}
