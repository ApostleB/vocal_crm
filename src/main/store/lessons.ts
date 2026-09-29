import type { Lesson, LessonInput } from '@shared/types'
import type { DB } from '../db/connection'
import { LESSON_COLUMNS } from './columns'
import { blankToNull, iso, newId, notFound, requireDate } from './util'

type LessonRow = Omit<Lesson, 'deductPass'> & { deductPass: number }

const toLesson = (row: LessonRow): Lesson => ({ ...row, deductPass: row.deductPass === 1 })

export function listLessons(db: DB, customerId: string): Lesson[] {
  const rows = db
    .prepare(`SELECT ${LESSON_COLUMNS} FROM lessons WHERE customer_id = ? ORDER BY lesson_date, created_at, rowid`)
    .all(customerId) as LessonRow[]
  return rows.map(toLesson)
}

export function getLesson(db: DB, id: string): Lesson | null {
  const row = db.prepare(`SELECT ${LESSON_COLUMNS} FROM lessons WHERE id = ?`).get(id) as LessonRow | undefined
  return row ? toLesson(row) : null
}

/**
 * 수업 기록 저장 (새로 만들기 / 수정).
 * - 새 기록이고 예약 연결이 없으면, 같은 고객·같은 날짜의 예정 예약을 찾아 연결한다.
 * - 연결된 예약은 done 이 된다.
 * - completedGoalIds 의 목표는 완료일 = 수업일로 완료 처리하고, 이 수업으로 완료됐던 목표 중
 *   선택에서 빠진 것은 미완료로 되돌린다.
 */
export function saveLesson(db: DB, input: LessonInput, now: Date): Lesson {
  const lessonDate = requireDate(input.lessonDate, '수업일을 확인해 주세요.')
  const ts = iso(now)

  return db.transaction((): Lesson => {
    let lesson: Lesson
    if (input.id) {
      const existing = getLesson(db, input.id)
      if (!existing) throw notFound('수업 기록을 찾을 수 없습니다.')
      lesson = {
        ...existing,
        lessonDate,
        memo: input.memo,
        practice: blankToNull(input.practice),
        homework: blankToNull(input.homework),
        deductPass: input.deductPass,
        updatedAt: ts
      }
      db.prepare(
        `UPDATE lessons SET lesson_date = @lessonDate, memo = @memo, practice = @practice,
           homework = @homework, deduct_pass = @deductPassInt, updated_at = @updatedAt WHERE id = @id`
      ).run({ ...lesson, deductPassInt: lesson.deductPass ? 1 : 0 })
    } else {
      const exists = db.prepare('SELECT 1 FROM customers WHERE id = ?').get(input.customerId)
      if (!exists) throw notFound('고객을 찾을 수 없습니다.')
      const reservationId =
        input.reservationId ??
        ((db
          .prepare(
            "SELECT id FROM reservations WHERE customer_id = ? AND date = ? AND status = 'scheduled' ORDER BY time LIMIT 1"
          )
          .pluck()
          .get(input.customerId, lessonDate) as string | undefined) ?? null)
      lesson = {
        id: newId(),
        customerId: input.customerId,
        lessonDate,
        memo: input.memo,
        practice: blankToNull(input.practice),
        homework: blankToNull(input.homework),
        deductPass: input.deductPass,
        reservationId,
        createdAt: ts,
        updatedAt: ts
      }
      db.prepare(
        `INSERT INTO lessons (id, customer_id, lesson_date, memo, practice, homework, deduct_pass, reservation_id, created_at, updated_at)
         VALUES (@id, @customerId, @lessonDate, @memo, @practice, @homework, @deductPassInt, @reservationId, @createdAt, @updatedAt)`
      ).run({ ...lesson, deductPassInt: lesson.deductPass ? 1 : 0 })
      if (reservationId) {
        db.prepare("UPDATE reservations SET status = 'done', updated_at = ? WHERE id = ?").run(ts, reservationId)
      }
    }

    const selected = new Set(input.completedGoalIds)
    const previouslyCompleted = db
      .prepare('SELECT id FROM goals WHERE completed_lesson_id = ?')
      .pluck()
      .all(lesson.id) as string[]
    for (const goalId of previouslyCompleted) {
      if (!selected.has(goalId)) {
        db.prepare('UPDATE goals SET done_at = NULL, completed_lesson_id = NULL, updated_at = ? WHERE id = ?').run(
          ts,
          goalId
        )
      }
    }
    const complete = db.prepare(
      `UPDATE goals SET done_at = @date, completed_lesson_id = @lessonId, updated_at = @ts
       WHERE id = @goalId AND customer_id = @customerId AND (done_at IS NULL OR completed_lesson_id = @lessonId)`
    )
    for (const goalId of selected) {
      complete.run({ date: lessonDate, lessonId: lesson.id, ts, goalId, customerId: lesson.customerId })
    }
    return lesson
  })()
}

/**
 * 수업 기록 삭제. 연결된 예약은 다시 예정(scheduled)으로 돌아간다.
 * 단, 고객이 이미 종료·타지점 이동 상태면 예약을 되살리지 않고 취소(canceled) 처리한다.
 * 완료한 목표는 완료 상태를 유지한다
 */
export function deleteLesson(db: DB, id: string, now: Date): void {
  db.transaction(() => {
    const lesson = getLesson(db, id)
    if (!lesson) return
    if (lesson.reservationId) {
      const customerStatus = db
        .prepare('SELECT status FROM customers WHERE id = ?')
        .pluck()
        .get(lesson.customerId) as string | undefined
      const revertTo = customerStatus === 'ended' || customerStatus === 'moved' ? 'canceled' : 'scheduled'
      db.prepare("UPDATE reservations SET status = ?, updated_at = ? WHERE id = ? AND status = 'done'").run(
        revertTo,
        iso(now),
        lesson.reservationId
      )
    }
    db.prepare('DELETE FROM lessons WHERE id = ?').run(id)
  })()
}
