import type { CustomerStatus, StatusChangeInput } from '@shared/types'
import { isCustomerStatus } from '@shared/domain/enums'
import type { DB } from '../db/connection'
import { getCustomer, insertStatusLog } from './customers'
import { blankToNull, iso, newId, notFound, optionalDate, requireDate, validation } from './util'

/** 아직 기록·취소되지 않은 예약 수 (지난 미기록 포함) */
export function countOpenReservations(db: DB, customerId: string): number {
  return db
    .prepare("SELECT COUNT(*) FROM reservations WHERE customer_id = ? AND status = 'scheduled'")
    .pluck()
    .get(customerId) as number
}

const CLOSING: CustomerStatus[] = ['ended', 'moved']

/**
 * 상태 변경 (휴강·종료·타지점 이동·재등록). 이력을 남기고,
 * 종료·타지점 이동이면 열린 예약을 모두 취소한다.
 */
export function changeStatus(
  db: DB,
  input: StatusChangeInput,
  now: Date
): { canceledReservations: number } {
  if (!isCustomerStatus(input.toStatus)) throw validation('상태를 확인해 주세요.')
  const customer = getCustomer(db, input.customerId)
  if (!customer) throw notFound('고객을 찾을 수 없습니다.')
  if (customer.status === input.toStatus) throw validation('이미 같은 상태입니다.')
  const date = requireDate(input.date, '날짜를 확인해 주세요.')
  const pauseUntil =
    input.toStatus === 'paused' ? optionalDate(input.pauseUntil, '휴강 종료 예정일을 확인해 주세요.') : null
  const ts = iso(now)

  return db.transaction(() => {
    db.prepare('UPDATE customers SET status = ?, pause_until = ?, updated_at = ? WHERE id = ?').run(
      input.toStatus,
      pauseUntil,
      ts,
      customer.id
    )
    insertStatusLog(db, {
      id: newId(),
      customerId: customer.id,
      date,
      fromStatus: customer.status,
      toStatus: input.toStatus,
      reason: blankToNull(input.reason),
      createdAt: ts
    })
    let canceledReservations = 0
    if (CLOSING.includes(input.toStatus)) {
      canceledReservations = db
        .prepare(
          "UPDATE reservations SET status = 'canceled', updated_at = ? WHERE customer_id = ? AND status = 'scheduled'"
        )
        .run(ts, customer.id).changes
    }
    return { canceledReservations }
  })()
}
