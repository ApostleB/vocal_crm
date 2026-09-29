import { describe, expect, it } from 'vitest'
import type { LessonInput } from '@shared/types'
import { addGoal, listGoals } from '@main/store/goals'
import { deleteLesson, getLesson, saveLesson } from '@main/store/lessons'
import { getReservation, saveReservation } from '@main/store/reservations'
import { changeStatus } from '@main/store/status'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

const base = (customerId: string, over: Partial<LessonInput> = {}): LessonInput => ({
  customerId,
  lessonDate: TODAY,
  memo: '브릿지 고음에서 후두가 올라감',
  practice: ' 밤편지 2절 ',
  homework: '',
  deductPass: true,
  reservationId: null,
  completedGoalIds: [],
  ...over
})

describe('lessons store', () => {
  it('새 기록은 같은 날 예정 예약에 자동 연결되고 예약은 done', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const r = saveReservation(db, { customerId: id, date: TODAY, time: '15:00', note: null }, NOW)
    const lesson = saveLesson(db, base(id), NOW)
    expect(lesson).toMatchObject({ reservationId: r.id, practice: '밤편지 2절', homework: null })
    expect(getReservation(db, r.id)?.status).toBe('done')
  })

  it('완료한 목표는 완료일 = 수업일, 수정에서 빼면 미완료로 되돌린다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const g1 = addGoal(db, id, '두성 연결', NOW)
    const g2 = addGoal(db, id, '믹스보이스', NOW)
    const lesson = saveLesson(db, base(id, { lessonDate: '2026-09-21', completedGoalIds: [g1.id, g2.id] }), NOW)
    expect(listGoals(db, id).map((g) => [g.doneAt, g.completedLessonId])).toEqual([
      ['2026-09-21', lesson.id],
      ['2026-09-21', lesson.id]
    ])
    saveLesson(db, base(id, { id: lesson.id, lessonDate: '2026-09-22', completedGoalIds: [g1.id] }), NOW)
    expect(listGoals(db, id).map((g) => [g.title, g.doneAt])).toEqual([
      ['두성 연결', '2026-09-22'],
      ['믹스보이스', null]
    ])
  })

  it('이미 다른 날 완료된 목표는 덮어쓰지 않는다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const g = addGoal(db, id, '호흡', NOW)
    const first = saveLesson(db, base(id, { lessonDate: '2026-09-14', completedGoalIds: [g.id] }), NOW)
    saveLesson(db, base(id, { lessonDate: '2026-09-21', completedGoalIds: [g.id] }), NOW)
    expect(listGoals(db, id)[0]).toMatchObject({ doneAt: '2026-09-14', completedLessonId: first.id })
  })

  it('삭제하면 연결된 예약은 다시 예정, 목표는 완료 유지', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const g = addGoal(db, id, '호흡', NOW)
    const r = saveReservation(db, { customerId: id, date: TODAY, time: '15:00', note: null }, NOW)
    const lesson = saveLesson(db, base(id, { reservationId: r.id, completedGoalIds: [g.id] }), NOW)
    deleteLesson(db, lesson.id, NOW)
    expect(getLesson(db, lesson.id)).toBeNull()
    expect(getReservation(db, r.id)?.status).toBe('scheduled')
    expect(listGoals(db, id)[0]).toMatchObject({ doneAt: TODAY, completedLessonId: null })
  })

  it('종료·이동한 고객의 수업을 지워도 예약을 되살리지 않고 취소한다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const r = saveReservation(db, { customerId: id, date: TODAY, time: '15:00', note: null }, NOW)
    const lesson = saveLesson(db, base(id, { reservationId: r.id }), NOW)
    changeStatus(db, { customerId: id, toStatus: 'ended', date: TODAY, reason: null, pauseUntil: null }, NOW)
    deleteLesson(db, lesson.id, NOW)
    expect(getReservation(db, r.id)?.status).toBe('canceled')
  })

  it('수업일 형식이 틀리면 거부', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    expect(() => saveLesson(db, base(id, { lessonDate: '9/28' }), NOW)).toThrow('수업일을 확인해 주세요.')
  })

  it('없는 고객에게는 수업 기록을 저장할 수 없다', () => {
    const db = createTestDb()
    expect(() => saveLesson(db, base('nope'), NOW)).toThrow('고객을 찾을 수 없습니다.')
  })
})
