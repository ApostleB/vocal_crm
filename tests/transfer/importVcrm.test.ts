import { describe, expect, it } from 'vitest'
import type { DB } from '@main/db/connection'
import { buildVcrm } from '@main/transfer/exportVcrm'
import { applyImport, previewRows } from '@main/transfer/importVcrm'
import { getCustomer, listStatusLogs } from '@main/store/customers'
import { addGoal, listGoals } from '@main/store/goals'
import { listLessons, saveLesson } from '@main/store/lessons'
import { listPasses, savePass } from '@main/store/passes'
import { changeStatus } from '@main/store/status'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'
import { sampleFile } from '../support/vcrm'

const LATER = new Date('2026-09-29T06:00:00.000Z')

function lessonInput(customerId: string, date: string, memo: string, completedGoalIds: string[] = []) {
  return {
    customerId,
    lessonDate: date,
    memo,
    practice: null,
    homework: null,
    deductPass: true,
    reservationId: null,
    completedGoalIds
  }
}

/** 강남점 PC: 목표 1(완료), 수업 2, 수강권 1 */
function seedSource(): { db: DB; id: string } {
  const db = createTestDb()
  const id = seedCustomer(db, { pinnedNote: '성대결절 이력' })
  const g = addGoal(db, id, '두성 연결', NOW)
  saveLesson(db, lessonInput(id, '2026-09-14', '첫 수업'), NOW)
  saveLesson(db, lessonInput(id, '2026-09-21', '두 번째', [g.id]), NOW)
  savePass(db, { customerId: id, count: 10, purchasedAt: '2026-09-01', amount: null, note: null }, NOW)
  return { db, id }
}

const count = (db: DB, table: string): number => db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get() as number

describe('previewRows', () => {
  it('기록 건수와 같은 고객·비슷한 고객 힌트를 보여준다', () => {
    const db = createTestDb()
    const local = seedCustomer(db, { name: '김민지' })
    const file = sampleFile()
    file.customers[0].customer.id = local
    const [row] = previewRows(db, file)
    expect(row).toMatchObject({ name: '김민지', lessonCount: 1, goalCount: 1, passCount: 1 })
    expect(row.same.map((h) => h.id)).toEqual([local])
    expect(row.similar).toEqual([])
  })
})

describe('applyImport — 신규 추가', () => {
  it('id 를 유지하고 모든 기록을 옮기며, 상태는 수강중 + "이동해 옴" 이력', () => {
    const src = seedSource()
    changeStatus(src.db, { customerId: src.id, toStatus: 'moved', date: TODAY, reason: '홍대점으로 이동', pauseUntil: null }, NOW)
    const file = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: '홍대점' }, NOW)
    const db = createTestDb()

    expect(applyImport(db, file, [{ incomingId: src.id, action: 'new' }], TODAY, NOW)).toEqual({
      added: 1,
      merged: 0,
      skipped: 0
    })
    expect(getCustomer(db, src.id)).toMatchObject({ status: 'active', pinnedNote: '성대결절 이력' })
    const lessons = listLessons(db, src.id)
    expect(lessons.map((l) => l.memo)).toEqual(['첫 수업', '두 번째'])
    expect(lessons.every((l) => l.reservationId === null)).toBe(true)
    expect(listGoals(db, src.id)[0]).toMatchObject({ doneAt: '2026-09-21', completedLessonId: lessons[1].id })
    expect(listPasses(db, src.id)).toHaveLength(1)
    expect(listStatusLogs(db, src.id).at(-1)).toMatchObject({ fromStatus: 'moved', toStatus: 'active', reason: '강남점에서 이동해 옴' })
  })

  it('이 PC 에 같은 id 가 있으면 새 id 를 쓰고, 원래 id 는 별칭으로 남긴다', () => {
    const src = seedSource()
    const file = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: null }, NOW)
    const db = createTestDb()
    applyImport(db, file, [{ incomingId: src.id, action: 'new' }], TODAY, NOW)
    applyImport(db, file, [{ incomingId: src.id, action: 'new' }], TODAY, NOW)
    expect(count(db, 'customers')).toBe(2)
    expect(count(db, 'lessons')).toBe(4)
    const copyId = db.prepare('SELECT id FROM customers WHERE id != ?').pluck().get(src.id) as string
    expect(db.prepare('SELECT alias_id FROM customer_aliases WHERE customer_id = ?').pluck().all(copyId)).toEqual([src.id])
    const copyLessons = listLessons(db, copyId)
    expect(listGoals(db, copyId)[0].completedLessonId).toBe(copyLessons[1].id)
  })
})

describe('applyImport — 기존 고객에 합치기', () => {
  it('설계의 합치기 규칙을 따른다', () => {
    const src = seedSource()
    const file = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: null }, NOW)
    const db = createTestDb()
    const target = seedCustomer(db, { name: '김민지', phone: null, pinnedNote: '입시 12월', vocalRange: 'F3~C5' })
    addGoal(db, target, ' 두성 연결 ', NOW)
    saveLesson(db, lessonInput(target, '2026-09-25', '이 지점 수업'), NOW)
    changeStatus(db, { customerId: target, toStatus: 'ended', date: '2026-09-26', reason: null, pauseUntil: null }, NOW)

    expect(applyImport(db, file, [{ incomingId: src.id, action: 'merge', targetId: target }], TODAY, LATER)).toEqual({
      added: 0,
      merged: 1,
      skipped: 0
    })
    const c = getCustomer(db, target)
    expect(c).toMatchObject({
      status: 'active',
      phone: '01012345678',
      vocalRange: 'F3~C5',
      pinnedNote: `입시 12월\n\n── 강남점에서 가져옴 (${TODAY}) ──\n성대결절 이력`
    })
    const lessons = listLessons(db, target)
    expect(lessons.map((l) => l.memo)).toEqual(['첫 수업', '두 번째', '이 지점 수업'])
    const goals = listGoals(db, target)
    expect(goals).toHaveLength(1)
    expect(goals[0]).toMatchObject({ doneAt: '2026-09-21', completedLessonId: lessons[1].id })
    expect(listPasses(db, target)).toHaveLength(1)
    expect(db.prepare('SELECT alias_id FROM customer_aliases WHERE customer_id = ?').pluck().all(target)).toEqual([src.id])
    expect(listStatusLogs(db, target).at(-1)).toMatchObject({ fromStatus: 'ended', toStatus: 'active', reason: '강남점에서 이동해 옴' })
  })

  it('같은 id 의 회차 기록은 가져온 쪽이 더 최신일 때만 갱신한다', () => {
    const src = seedSource()
    const db = createTestDb()
    const first = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: null }, NOW)
    applyImport(db, first, [{ incomingId: src.id, action: 'new' }], TODAY, NOW)
    const edited = listLessons(src.db, src.id)[0]
    saveLesson(src.db, { ...lessonInput(src.id, edited.lessonDate, '수정한 메모'), id: edited.id }, LATER)
    const second = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: null }, LATER)
    applyImport(db, second, [{ incomingId: src.id, action: 'merge', targetId: src.id }], TODAY, LATER)
    expect(listLessons(db, src.id).map((l) => l.memo)).toEqual(['수정한 메모', '두 번째'])
    applyImport(db, first, [{ incomingId: src.id, action: 'merge', targetId: src.id }], TODAY, LATER)
    expect(listLessons(db, src.id)[0].memo).toBe('수정한 메모')
  })

  it('같은 파일을 두 번 가져오고, 되돌려 보내 다시 가져와도 기록이 중복되지 않는다', () => {
    const src = seedSource()
    const file = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: null }, NOW)
    const db = createTestDb()
    applyImport(db, file, [{ incomingId: src.id, action: 'new' }], TODAY, NOW)
    const snapshot = ['customers', 'lessons', 'goals', 'passes', 'status_logs'].map((t) => count(db, t))
    applyImport(db, file, [{ incomingId: src.id, action: 'merge', targetId: src.id }], TODAY, NOW)
    expect(['customers', 'lessons', 'goals', 'passes', 'status_logs'].map((t) => count(db, t))).toEqual(snapshot)

    const back = buildVcrm(db, [src.id], { sourceBranch: '홍대점', targetBranch: '강남점' }, NOW)
    const before = ['lessons', 'goals', 'passes'].map((t) => count(src.db, t))
    applyImport(src.db, back, [{ incomingId: src.id, action: 'merge', targetId: src.id }], TODAY, NOW)
    expect(['lessons', 'goals', 'passes'].map((t) => count(src.db, t))).toEqual(before)
  })
})

describe('applyImport — 같은 날 재합치기', () => {
  it('같은 날 같은 사유의 이력이 있어도 상태가 다르면 다시 수강중으로 바꾸고 이력을 남긴다', () => {
    const src = seedSource()
    const file = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: null }, NOW)
    const db = createTestDb()
    applyImport(db, file, [{ incomingId: src.id, action: 'new' }], TODAY, NOW)
    changeStatus(db, { customerId: src.id, toStatus: 'ended', date: TODAY, reason: null, pauseUntil: null }, NOW)

    applyImport(db, file, [{ incomingId: src.id, action: 'merge', targetId: src.id }], TODAY, NOW)

    expect(getCustomer(db, src.id)?.status).toBe('active')
    expect(listStatusLogs(db, src.id).at(-1)).toMatchObject({
      fromStatus: 'ended',
      toStatus: 'active',
      reason: '강남점에서 이동해 옴'
    })
  })
})

describe('applyImport — 검증', () => {
  it('처리 방법이 빠진 고객이 있으면 아무것도 바꾸지 않고 거부, 건너뛰기는 센다', () => {
    const db = createTestDb()
    const file = sampleFile()
    expect(() => applyImport(db, file, [], TODAY, NOW)).toThrow('모든 고객의 처리 방법을 선택해 주세요.')
    expect(applyImport(db, file, [{ incomingId: 'x1', action: 'skip' }], TODAY, NOW)).toEqual({
      added: 0,
      merged: 0,
      skipped: 1
    })
    expect(count(db, 'customers')).toBe(0)
  })

  it('합칠 고객이 없으면 거부하고 트랜잭션 전체를 되돌린다', () => {
    const db = createTestDb()
    const file = sampleFile()
    file.customers.push({ ...sampleFile().customers[0], customer: { ...sampleFile().customers[0].customer, id: 'x2' } })
    expect(() =>
      applyImport(
        db,
        file,
        [
          { incomingId: 'x1', action: 'new' },
          { incomingId: 'x2', action: 'merge', targetId: 'nope' }
        ],
        TODAY,
        NOW
      )
    ).toThrow('합칠 고객을 찾을 수 없습니다.')
    expect(count(db, 'customers')).toBe(0)
  })
})
