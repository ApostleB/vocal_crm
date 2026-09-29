import { withEuro } from '@shared/domain/labels'
import { VCRM_FORMAT, VCRM_VERSION, type VcrmEntry, type VcrmFile } from '@shared/vcrm'
import type { DB } from '../db/connection'
import { getCustomer, listStatusLogs } from '../store/customers'
import { listGoals } from '../store/goals'
import { listLessons } from '../store/lessons'
import { listPasses } from '../store/passes'
import { changeStatus } from '../store/status'
import { iso, notFound, validation } from '../store/util'

export interface ExportMeta {
  sourceBranch: string
  targetBranch: string | null
}

export function listAliases(db: DB, customerId: string): string[] {
  return db
    .prepare('SELECT alias_id FROM customer_aliases WHERE customer_id = ? ORDER BY alias_id')
    .pluck()
    .all(customerId) as string[]
}

function buildEntry(db: DB, customerId: string): VcrmEntry {
  const customer = getCustomer(db, customerId)
  if (!customer) throw notFound('고객을 찾을 수 없습니다.')
  return {
    customer,
    aliases: listAliases(db, customerId),
    goals: listGoals(db, customerId).map(({ id, title, doneAt, completedLessonId, createdAt, updatedAt }) => ({
      id,
      title,
      doneAt,
      completedLessonId,
      createdAt,
      updatedAt
    })),
    // 예약은 지점 전용이라 reservationId 는 넣지 않는다
    lessons: listLessons(db, customerId).map(
      ({ id, lessonDate, memo, practice, homework, deductPass, createdAt, updatedAt }) => ({
        id,
        lessonDate,
        memo,
        practice,
        homework,
        deductPass,
        createdAt,
        updatedAt
      })
    ),
    passes: listPasses(db, customerId).map(({ id, count, purchasedAt, amount, note, createdAt, updatedAt }) => ({
      id,
      count,
      purchasedAt,
      amount,
      note,
      createdAt,
      updatedAt
    })),
    statusLogs: listStatusLogs(db, customerId).map(({ id, date, fromStatus, toStatus, reason, createdAt }) => ({
      id,
      date,
      fromStatus,
      toStatus,
      reason,
      createdAt
    }))
  }
}

/** 고른 고객을 .vcrm 형식으로 모은다 (고른 순서 유지) */
export function buildVcrm(db: DB, customerIds: string[], meta: ExportMeta, now: Date): VcrmFile {
  if (customerIds.length === 0) throw validation('내보낼 고객을 선택해 주세요.')
  return {
    format: VCRM_FORMAT,
    version: VCRM_VERSION,
    exportedAt: iso(now),
    sourceBranch: meta.sourceBranch,
    targetBranch: meta.targetBranch?.trim() || null,
    customers: customerIds.map((id) => buildEntry(db, id))
  }
}

/** 내보낸 고객을 '타지점 이동' 으로 바꾼다. 이미 이동 상태인 고객은 건너뛴다. 바꾼 수와 취소된 예약 수를 돌려준다 */
export function markMoved(
  db: DB,
  customerIds: string[],
  targetBranch: string | null,
  today: string,
  now: Date
): { moved: number; canceledReservations: number } {
  const target = targetBranch?.trim() || null
  let moved = 0
  let canceledReservations = 0
  db.transaction(() => {
    for (const id of customerIds) {
      const customer = getCustomer(db, id)
      if (!customer || customer.status === 'moved') continue
      const result = changeStatus(
        db,
        { customerId: id, toStatus: 'moved', date: today, reason: target ? `${withEuro(target)} 이동` : null, pauseUntil: null },
        now
      )
      canceledReservations += result.canceledReservations
      moved++
    }
  })()
  return { moved, canceledReservations }
}
