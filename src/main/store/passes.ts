import type { Pass, PassInput } from '@shared/types'
import type { DB } from '../db/connection'
import { PASS_COLUMNS } from './columns'
import { blankToNull, iso, newId, notFound, requireDate, validation } from './util'

export function listPasses(db: DB, customerId: string): Pass[] {
  return db
    .prepare(`SELECT ${PASS_COLUMNS} FROM passes WHERE customer_id = ? ORDER BY purchased_at DESC, created_at DESC`)
    .all(customerId) as Pass[]
}

export function savePass(db: DB, input: PassInput, now: Date): Pass {
  if (!Number.isInteger(input.count) || input.count < 1) throw validation('횟수는 1 이상으로 입력해 주세요.')
  if (input.amount !== null && (!Number.isInteger(input.amount) || input.amount < 0)) {
    throw validation('금액을 확인해 주세요.')
  }
  const purchasedAt = requireDate(input.purchasedAt, '결제일을 확인해 주세요.')
  const ts = iso(now)
  if (input.id) {
    const r = db
      .prepare(
        'UPDATE passes SET count = ?, purchased_at = ?, amount = ?, note = ?, updated_at = ? WHERE id = ? AND customer_id = ?'
      )
      .run(input.count, purchasedAt, input.amount, blankToNull(input.note), ts, input.id, input.customerId)
    if (r.changes === 0) throw notFound('수강권 기록을 찾을 수 없습니다.')
    return db.prepare(`SELECT ${PASS_COLUMNS} FROM passes WHERE id = ?`).get(input.id) as Pass
  }
  const exists = db.prepare('SELECT 1 FROM customers WHERE id = ?').get(input.customerId)
  if (!exists) throw notFound('고객을 찾을 수 없습니다.')
  const pass: Pass = {
    id: newId(),
    customerId: input.customerId,
    count: input.count,
    purchasedAt,
    amount: input.amount,
    note: blankToNull(input.note),
    createdAt: ts,
    updatedAt: ts
  }
  db.prepare(
    `INSERT INTO passes (id, customer_id, count, purchased_at, amount, note, created_at, updated_at)
     VALUES (@id, @customerId, @count, @purchasedAt, @amount, @note, @createdAt, @updatedAt)`
  ).run(pass)
  return pass
}

export function deletePass(db: DB, id: string): void {
  db.prepare('DELETE FROM passes WHERE id = ?').run(id)
}
