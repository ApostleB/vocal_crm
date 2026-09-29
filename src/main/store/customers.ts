import type { Customer, CustomerInput, StatusLog } from '@shared/types'
import { normalizePhone } from '@shared/domain/phone'
import type { DB } from '../db/connection'
import { customerColumns, STATUS_LOG_COLUMNS } from './columns'
import { blankToNull, iso, newId, notFound, optionalDate, requireDate, validation } from './util'

export function getCustomer(db: DB, id: string): Customer | null {
  return (
    (db.prepare(`SELECT ${customerColumns()} FROM customers WHERE id = ?`).get(id) as Customer | undefined) ?? null
  )
}

function cleanInput(input: CustomerInput): CustomerInput {
  const name = input.name.trim()
  if (!name) throw validation('이름을 입력해 주세요.')
  return {
    name,
    phone: normalizePhone(input.phone),
    birthDate: optionalDate(input.birthDate, '생년월일을 확인해 주세요.'),
    gender: input.gender,
    purpose: input.purpose,
    registeredAt: requireDate(input.registeredAt, '등록일을 확인해 주세요.'),
    vocalRange: blankToNull(input.vocalRange),
    preferredMusic: blankToNull(input.preferredMusic),
    pinnedNote: input.pinnedNote.trim()
  }
}

export function insertStatusLog(db: DB, log: StatusLog): void {
  db.prepare(
    `INSERT INTO status_logs (id, customer_id, date, from_status, to_status, reason, created_at)
     VALUES (@id, @customerId, @date, @fromStatus, @toStatus, @reason, @createdAt)`
  ).run(log)
}

export function listStatusLogs(db: DB, customerId: string): StatusLog[] {
  return db
    .prepare(`SELECT ${STATUS_LOG_COLUMNS} FROM status_logs WHERE customer_id = ? ORDER BY date, created_at`)
    .all(customerId) as StatusLog[]
}

/** 새 고객 등록. 상태는 수강중, 이력에 "수강 시작"(from NULL) 을 남긴다 */
export function createCustomer(db: DB, input: CustomerInput, now: Date): Customer {
  const clean = cleanInput(input)
  const ts = iso(now)
  const customer: Customer = {
    id: newId(),
    ...clean,
    status: 'active',
    pauseUntil: null,
    createdAt: ts,
    updatedAt: ts
  }
  db.transaction(() => {
    db.prepare(
      `INSERT INTO customers (id, name, phone, birth_date, gender, purpose, status, registered_at, vocal_range,
         preferred_music, pinned_note, pause_until, created_at, updated_at)
       VALUES (@id, @name, @phone, @birthDate, @gender, @purpose, @status, @registeredAt, @vocalRange,
         @preferredMusic, @pinnedNote, @pauseUntil, @createdAt, @updatedAt)`
    ).run(customer)
    insertStatusLog(db, {
      id: newId(),
      customerId: customer.id,
      date: customer.registeredAt,
      fromStatus: null,
      toStatus: 'active',
      reason: null,
      createdAt: ts
    })
  })()
  return customer
}

export function updateCustomer(db: DB, id: string, input: CustomerInput, now: Date): Customer {
  const clean = cleanInput(input)
  db.transaction(() => {
    const r = db
      .prepare(
        `UPDATE customers SET name = @name, phone = @phone, birth_date = @birthDate, gender = @gender,
           purpose = @purpose, registered_at = @registeredAt, vocal_range = @vocalRange,
           preferred_music = @preferredMusic, pinned_note = @pinnedNote, updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({ ...clean, id, updatedAt: iso(now) })
    if (r.changes === 0) throw notFound('고객을 찾을 수 없습니다.')
    db.prepare('UPDATE status_logs SET date = @registeredAt WHERE customer_id = @id AND from_status IS NULL').run({
      registeredAt: clean.registeredAt,
      id
    })
  })()
  return getCustomer(db, id) as Customer
}

export function setPinnedNote(db: DB, id: string, note: string, now: Date): void {
  const r = db
    .prepare('UPDATE customers SET pinned_note = ?, updated_at = ? WHERE id = ?')
    .run(note.trim(), iso(now), id)
  if (r.changes === 0) throw notFound('고객을 찾을 수 없습니다.')
}

/** 고객과 모든 관련 기록(목표·수업·수강권·예약·이력)을 삭제 */
export function deleteCustomer(db: DB, id: string): void {
  db.prepare('DELETE FROM customers WHERE id = ?').run(id)
}
