import type { Goal } from '@shared/types'
import type { DB } from '../db/connection'
import { GOAL_COLUMNS } from './columns'
import { iso, newId, notFound, validation } from './util'

export function listGoals(db: DB, customerId: string): Goal[] {
  return db
    .prepare(`SELECT ${GOAL_COLUMNS} FROM goals WHERE customer_id = ? ORDER BY created_at, rowid`)
    .all(customerId) as Goal[]
}

export function getGoal(db: DB, id: string): Goal | null {
  return (db.prepare(`SELECT ${GOAL_COLUMNS} FROM goals WHERE id = ?`).get(id) as Goal | undefined) ?? null
}

export function addGoal(db: DB, customerId: string, title: string, now: Date): Goal {
  const t = title.trim()
  if (!t) throw validation('목표 내용을 입력해 주세요.')
  const exists = db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)
  if (!exists) throw notFound('고객을 찾을 수 없습니다.')
  const goal: Goal = {
    id: newId(),
    customerId,
    title: t,
    doneAt: null,
    completedLessonId: null,
    createdAt: iso(now),
    updatedAt: iso(now)
  }
  db.prepare(
    `INSERT INTO goals (id, customer_id, title, done_at, completed_lesson_id, created_at, updated_at)
     VALUES (@id, @customerId, @title, @doneAt, @completedLessonId, @createdAt, @updatedAt)`
  ).run(goal)
  return goal
}

export function renameGoal(db: DB, id: string, title: string, now: Date): void {
  const t = title.trim()
  if (!t) throw validation('목표 내용을 입력해 주세요.')
  const r = db.prepare('UPDATE goals SET title = ?, updated_at = ? WHERE id = ?').run(t, iso(now), id)
  if (r.changes === 0) throw notFound('목표를 찾을 수 없습니다.')
}

/** 왼쪽 목록에서 직접 체크: 완료일 = 오늘, 수업 연결 없음 */
export function setGoalDone(db: DB, id: string, done: boolean, today: string, now: Date): void {
  const r = db
    .prepare('UPDATE goals SET done_at = ?, completed_lesson_id = NULL, updated_at = ? WHERE id = ?')
    .run(done ? today : null, iso(now), id)
  if (r.changes === 0) throw notFound('목표를 찾을 수 없습니다.')
}

export function deleteGoal(db: DB, id: string): void {
  db.prepare('DELETE FROM goals WHERE id = ?').run(id)
}
