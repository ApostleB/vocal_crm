import { describe, expect, it } from 'vitest'
import { parseVcrm, serializeVcrm } from '@shared/vcrm'
import { buildVcrm, markMoved } from '@main/transfer/exportVcrm'
import { getCustomer, listStatusLogs } from '@main/store/customers'
import { addGoal } from '@main/store/goals'
import { saveLesson } from '@main/store/lessons'
import { savePass } from '@main/store/passes'
import { getReservation, saveReservation } from '@main/store/reservations'
import { changeStatus } from '@main/store/status'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

describe('buildVcrm', () => {
  it('고객의 정보·별칭·목표·수업·수강권·이력을 담고 예약 연결은 뺀다', () => {
    const db = createTestDb()
    const id = seedCustomer(db, { pinnedNote: '성대결절 이력' })
    db.prepare('INSERT INTO customer_aliases (alias_id, customer_id) VALUES (?, ?)').run('old-1', id)
    const goal = addGoal(db, id, '두성 연결', NOW)
    const r = saveReservation(db, { customerId: id, date: TODAY, time: '15:00', note: null }, NOW)
    const lesson = saveLesson(
      db,
      {
        customerId: id,
        lessonDate: TODAY,
        memo: '메모',
        practice: null,
        homework: '립트릴',
        deductPass: true,
        reservationId: r.id,
        completedGoalIds: [goal.id]
      },
      NOW
    )
    savePass(db, { customerId: id, count: 10, purchasedAt: TODAY, amount: 550000, note: null }, NOW)

    const file = buildVcrm(db, [id], { sourceBranch: '강남점', targetBranch: ' 홍대점 ' }, NOW)
    expect(file).toMatchObject({ format: 'vocal-crm', version: 1, sourceBranch: '강남점', targetBranch: '홍대점' })
    const entry = file.customers[0]
    expect(entry.customer).toMatchObject({ id, pinnedNote: '성대결절 이력' })
    expect(entry.aliases).toEqual(['old-1'])
    expect(entry.goals).toEqual([expect.objectContaining({ id: goal.id, doneAt: TODAY, completedLessonId: lesson.id })])
    expect(entry.lessons).toHaveLength(1)
    expect(entry.lessons[0]).not.toHaveProperty('reservationId')
    expect(entry.lessons[0]).not.toHaveProperty('customerId')
    expect(entry.passes).toHaveLength(1)
    expect(entry.statusLogs).toHaveLength(1)
    // 형식 검증을 통과한다
    expect(parseVcrm(serializeVcrm(file))).toEqual(file)
  })

  it('고른 고객이 없으면 거부, 없는 고객은 찾을 수 없다고 안내', () => {
    const db = createTestDb()
    expect(() => buildVcrm(db, [], { sourceBranch: '강남점', targetBranch: null }, NOW)).toThrow('내보낼 고객을 선택해 주세요.')
    expect(() => buildVcrm(db, ['nope'], { sourceBranch: '강남점', targetBranch: null }, NOW)).toThrow('고객을 찾을 수 없습니다.')
  })
})

describe('markMoved', () => {
  it('타지점 이동으로 바꾸고 이력에 지점을 남기며 열린 예약은 취소, 이미 이동한 고객은 건너뛴다', () => {
    const db = createTestDb()
    const a = seedCustomer(db)
    const b = seedCustomer(db, { name: '박서준' })
    const r = saveReservation(db, { customerId: a, date: '2026-10-02', time: '13:00', note: null }, NOW)
    changeStatus(db, { customerId: b, toStatus: 'moved', date: TODAY, reason: null, pauseUntil: null }, NOW)

    expect(markMoved(db, [a, b], '홍대점', TODAY, NOW)).toBe(1)
    expect(getCustomer(db, a)?.status).toBe('moved')
    expect(listStatusLogs(db, a).at(-1)).toMatchObject({ toStatus: 'moved', reason: '홍대점으로 이동' })
    expect(getReservation(db, r.id)?.status).toBe('canceled')
    expect(listStatusLogs(db, b)).toHaveLength(2)
  })
})
