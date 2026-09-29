import type { Customer, Goal, Lesson } from '@shared/types'
import { fillEmptyInfo, findHints, isNewer, mergePinnedNote, movedInReason, sameTitle } from '@shared/domain/merge'
import type { ImportDecision, ImportPreviewRow, ImportResult } from '@shared/transferTypes'
import type { VcrmEntry, VcrmFile } from '@shared/vcrm'
import type { DB } from '../db/connection'
import { customerColumns } from '../store/columns'
import { getCustomer, insertStatusLog } from '../store/customers'
import { getGoal, listGoals } from '../store/goals'
import { getLesson } from '../store/lessons'
import { iso, newId, notFound, validation } from '../store/util'

const exists = (db: DB, table: string, id: string): boolean =>
  db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id) !== undefined

/** 이 PC 에 같은 id 가 있으면 새 id */
const freeId = (db: DB, table: string, id: string): string => (exists(db, table, id) ? newId() : id)

export function previewRows(db: DB, file: VcrmFile): ImportPreviewRow[] {
  const locals = db.prepare(`SELECT ${customerColumns()} FROM customers`).all() as Customer[]
  const aliasRows = db
    .prepare('SELECT alias_id AS aliasId, customer_id AS customerId FROM customer_aliases')
    .all() as { aliasId: string; customerId: string }[]
  return file.customers.map((e) => {
    const hints = findHints({ ...e.customer, aliases: e.aliases }, locals, aliasRows)
    return {
      incomingId: e.customer.id,
      name: e.customer.name,
      phone: e.customer.phone,
      lessonCount: e.lessons.length,
      goalCount: e.goals.length,
      passCount: e.passes.length,
      same: hints.same,
      similar: hints.similar
    }
  })
}

function insertLesson(db: DB, l: VcrmEntry['lessons'][number], id: string, customerId: string): void {
  db.prepare(
    `INSERT INTO lessons (id, customer_id, lesson_date, memo, practice, homework, deduct_pass, reservation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(id, customerId, l.lessonDate, l.memo, l.practice, l.homework, l.deductPass ? 1 : 0, l.createdAt, l.updatedAt)
}

function insertGoal(db: DB, g: VcrmEntry['goals'][number], id: string, customerId: string, lessonId: string | null): void {
  db.prepare(
    `INSERT INTO goals (id, customer_id, title, done_at, completed_lesson_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, customerId, g.title, g.doneAt, lessonId, g.createdAt, g.updatedAt)
}

function insertPass(db: DB, p: VcrmEntry['passes'][number], id: string, customerId: string): void {
  db.prepare(
    `INSERT INTO passes (id, customer_id, count, purchased_at, amount, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, customerId, p.count, p.purchasedAt, p.amount, p.note, p.createdAt, p.updatedAt)
}

function addAliases(db: DB, customerId: string, ids: string[]): void {
  const stmt = db.prepare('INSERT OR IGNORE INTO customer_aliases (alias_id, customer_id) VALUES (?, ?)')
  for (const id of ids) if (id !== customerId) stmt.run(id, customerId)
}

/**
 * 이 PC 에서 이 고객에게 같은 날 같은 사유의 이동 이력이 이미 있고, 상태도 이미 수강중이면 다시 쓰지 않는다
 * (같은 파일 재가져오기). 상태가 다르면 실제로 바뀌는 것이므로 이력을 남긴다
 */
function logMovedIn(db: DB, customer: Customer, reason: string, today: string, now: Date): void {
  const dup = db
    .prepare("SELECT 1 FROM status_logs WHERE customer_id = ? AND reason = ? AND date = ? AND to_status = 'active'")
    .get(customer.id, reason, today)
  if (dup && customer.status === 'active') return
  insertStatusLog(db, {
    id: newId(),
    customerId: customer.id,
    date: today,
    fromStatus: customer.status,
    toStatus: 'active',
    reason,
    createdAt: iso(now)
  })
}

/** 신규 추가: 고객 id 유지(겹치면 새 id), 딸린 기록도 겹치는 id 만 새 id. 상태는 수강중 */
function addAsNew(db: DB, e: VcrmEntry, sourceBranch: string, today: string, now: Date): void {
  const customerId = freeId(db, 'customers', e.customer.id)
  const customer: Customer = { ...e.customer, id: customerId, status: 'active', pauseUntil: null, updatedAt: iso(now) }
  db.prepare(
    `INSERT INTO customers (id, name, phone, birth_date, gender, purpose, status, registered_at, vocal_range,
       preferred_music, pinned_note, pause_until, created_at, updated_at)
     VALUES (@id, @name, @phone, @birthDate, @gender, @purpose, @status, @registeredAt, @vocalRange,
       @preferredMusic, @pinnedNote, @pauseUntil, @createdAt, @updatedAt)`
  ).run(customer)

  const lessonIds = new Map<string, string>()
  for (const l of e.lessons) {
    const id = freeId(db, 'lessons', l.id)
    lessonIds.set(l.id, id)
    insertLesson(db, l, id, customerId)
  }
  for (const g of e.goals) {
    const lessonId = g.completedLessonId ? (lessonIds.get(g.completedLessonId) ?? null) : null
    insertGoal(db, g, freeId(db, 'goals', g.id), customerId, lessonId)
  }
  for (const p of e.passes) insertPass(db, p, freeId(db, 'passes', p.id), customerId)
  for (const s of e.statusLogs) {
    insertStatusLog(db, { ...s, id: freeId(db, 'status_logs', s.id), customerId })
  }
  addAliases(db, customerId, customerId === e.customer.id ? e.aliases : [...e.aliases, e.customer.id])
  logMovedIn(db, { ...customer, status: e.customer.status }, movedInReason(sourceBranch), today, now)
}

/** 기존 고객에 합치기 (설계 5.8 합치기 규칙) */
function mergeInto(db: DB, e: VcrmEntry, targetId: string, sourceBranch: string, today: string, now: Date): void {
  const target = getCustomer(db, targetId)
  if (!target) throw notFound('합칠 고객을 찾을 수 없습니다.')
  const ts = iso(now)

  // 회차 기록: 없는 id 만 추가, 같은 id 면 최신 쪽으로 갱신
  const lessonIds = new Map<string, string>()
  for (const l of e.lessons) {
    const local: Lesson | null = getLesson(db, l.id)
    if (!local) {
      insertLesson(db, l, l.id, targetId)
      lessonIds.set(l.id, l.id)
    } else if (local.customerId === targetId) {
      lessonIds.set(l.id, l.id)
      if (isNewer(l.updatedAt, local.updatedAt)) {
        db.prepare(
          'UPDATE lessons SET lesson_date = ?, memo = ?, practice = ?, homework = ?, deduct_pass = ?, updated_at = ? WHERE id = ?'
        ).run(l.lessonDate, l.memo, l.practice, l.homework, l.deductPass ? 1 : 0, l.updatedAt, l.id)
      }
    } else {
      const id = newId()
      insertLesson(db, l, id, targetId)
      lessonIds.set(l.id, id)
    }
  }

  // 목표: 같은 id → 최신 쪽, 제목이 같으면 하나로(어느 쪽이든 완료면 완료, 이른 완료일), 그 밖에는 추가
  const localGoals: Goal[] = listGoals(db, targetId)
  for (const g of e.goals) {
    const lessonId = g.completedLessonId ? (lessonIds.get(g.completedLessonId) ?? null) : null
    const byId = getGoal(db, g.id)
    if (byId && byId.customerId === targetId) {
      if (isNewer(g.updatedAt, byId.updatedAt)) {
        db.prepare('UPDATE goals SET title = ?, done_at = ?, completed_lesson_id = ?, updated_at = ? WHERE id = ?').run(
          g.title,
          g.doneAt,
          lessonId,
          g.updatedAt,
          g.id
        )
      }
      continue
    }
    const match = localGoals.find((lg) => sameTitle(lg.title, g.title))
    if (match) {
      if (g.doneAt && (match.doneAt === null || g.doneAt < match.doneAt)) {
        db.prepare('UPDATE goals SET done_at = ?, completed_lesson_id = ?, updated_at = ? WHERE id = ?').run(
          g.doneAt,
          lessonId,
          ts,
          match.id
        )
      }
      continue
    }
    insertGoal(db, g, freeId(db, 'goals', g.id), targetId, lessonId)
  }

  // 수강권·상태 이력: 없는 id 만 추가
  for (const p of e.passes) if (!exists(db, 'passes', p.id)) insertPass(db, p, p.id, targetId)
  for (const s of e.statusLogs) if (!exists(db, 'status_logs', s.id)) insertStatusLog(db, { ...s, customerId: targetId })

  // 공통메모 이어 붙이기 + 빈 칸만 채우기
  const info = fillEmptyInfo(target, e.customer)
  db.prepare(
    `UPDATE customers SET pinned_note = @pinnedNote, phone = @phone, birth_date = @birthDate, gender = @gender,
       purpose = @purpose, vocal_range = @vocalRange, preferred_music = @preferredMusic, updated_at = @updatedAt
     WHERE id = @id`
  ).run({
    ...info,
    pinnedNote: mergePinnedNote(target.pinnedNote, e.customer.pinnedNote, sourceBranch, today),
    updatedAt: ts,
    id: targetId
  })

  addAliases(db, targetId, [e.customer.id, ...e.aliases])

  // 이력 + 수강중이 아니면 수강중으로
  logMovedIn(db, target, movedInReason(sourceBranch), today, now)
  if (target.status !== 'active') {
    db.prepare("UPDATE customers SET status = 'active', pause_until = NULL, updated_at = ? WHERE id = ?").run(ts, targetId)
  }
}

/** 고객마다 고른 처리 방법을 하나의 트랜잭션으로 적용한다 */
export function applyImport(
  db: DB,
  file: VcrmFile,
  decisions: ImportDecision[],
  today: string,
  now: Date
): ImportResult {
  const byId = new Map(decisions.map((d) => [d.incomingId, d]))
  if (file.customers.some((e) => !byId.has(e.customer.id))) {
    throw validation('모든 고객의 처리 방법을 선택해 주세요.')
  }
  const result: ImportResult = { added: 0, merged: 0, skipped: 0 }
  db.transaction(() => {
    for (const e of file.customers) {
      const d = byId.get(e.customer.id) as ImportDecision
      if (d.action === 'skip') {
        result.skipped++
      } else if (d.action === 'new') {
        addAsNew(db, e, file.sourceBranch, today, now)
        result.added++
      } else {
        mergeInto(db, e, d.targetId, file.sourceBranch, today, now)
        result.merged++
      }
    }
  })()
  return result
}
