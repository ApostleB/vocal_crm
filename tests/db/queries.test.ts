import { describe, expect, it } from 'vitest'
import type { LessonInput } from '@shared/types'
import { saveLesson } from '@main/store/lessons'
import { savePass } from '@main/store/passes'
import { getCustomerDetail, getHome, listReservationsInRange, listSummaries } from '@main/store/queries'
import { saveReservation } from '@main/store/reservations'
import { changeStatus } from '@main/store/status'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

const lesson = (customerId: string, over: Partial<LessonInput> = {}): LessonInput => ({
  customerId,
  lessonDate: TODAY,
  memo: '',
  practice: null,
  homework: null,
  deductPass: true,
  reservationId: null,
  completedGoalIds: [],
  ...over
})

describe('queries', () => {
  it('상세: 회차, 남은 수강권, 다음 예약, 타임라인', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    savePass(db, { customerId: id, count: 10, purchasedAt: '2026-09-01', amount: 550000, note: null }, NOW)
    saveLesson(db, lesson(id, { lessonDate: '2026-09-14' }), NOW)
    saveLesson(db, lesson(id, { lessonDate: '2026-09-21', deductPass: false }), NOW)
    saveLesson(db, lesson(id, { lessonDate: '2026-09-07' }), NOW)
    saveReservation(db, { customerId: id, date: '2026-10-02', time: '13:00', note: null }, NOW)
    const d = getCustomerDetail(db, id, TODAY)
    expect(d?.lessons.map((l) => [l.lessonDate, l.number])).toEqual([
      ['2026-09-07', 1],
      ['2026-09-14', 2],
      ['2026-09-21', 3]
    ])
    expect(d?.totalPassCount).toBe(10)
    expect(d?.remainingPasses).toBe(8)
    expect(d?.nextReservation).toMatchObject({ date: '2026-10-02', time: '13:00' })
    expect(d?.timeline.map((e) => e.kind)).toEqual(['lesson', 'lesson', 'lesson', 'status'])
    expect(getCustomerDetail(db, 'nope', TODAY)).toBeNull()
  })

  it('요약 목록은 이름순이고 다음 예약을 포함한다', () => {
    const db = createTestDb()
    const b = seedCustomer(db, { name: '박서준' })
    seedCustomer(db, { name: '김민지' })
    saveReservation(db, { customerId: b, date: TODAY, time: '18:30', note: null }, NOW)
    const list = listSummaries(db, TODAY)
    expect(list.map((s) => s.name)).toEqual(['김민지', '박서준'])
    expect(list[1].nextReservation).toEqual({ date: TODAY, time: '18:30' })
  })

  it('기간 조회는 날짜·시간순이고 고객 이름과 회차를 붙인다', () => {
    const db = createTestDb()
    const a = seedCustomer(db, { name: '김민지' })
    const b = seedCustomer(db, { name: '이하은' })
    saveReservation(db, { customerId: b, date: '2026-10-02', time: '16:00', note: null }, NOW)
    saveReservation(db, { customerId: a, date: '2026-09-28', time: '13:00', note: null }, NOW)
    saveReservation(db, { customerId: a, date: '2026-10-05', time: '13:00', note: null }, NOW)
    const week = listReservationsInRange(db, '2026-09-28', '2026-10-04')
    expect(week.map((w) => [w.reservation.date, w.customerName, w.lessonNumber])).toEqual([
      ['2026-09-28', '김민지', 1],
      ['2026-10-02', '이하은', 1]
    ])
  })

  it('홈: 오늘 수업, 지난 미기록, 예약 없음, 요약 숫자', () => {
    const db = createTestDb()
    const a = seedCustomer(db, { name: '김민지' })
    const b = seedCustomer(db, { name: '최도윤' })
    const c = seedCustomer(db, { name: '정유나' })
    changeStatus(db, { customerId: c, toStatus: 'paused', date: TODAY, reason: null, pauseUntil: null }, NOW)
    saveReservation(db, { customerId: a, date: TODAY, time: '13:00', note: null }, NOW)
    saveReservation(db, { customerId: b, date: '2026-09-26', time: '19:00', note: null }, NOW)
    saveLesson(db, lesson(a), NOW)
    const home = getHome(db, TODAY)
    expect(home.todayReservations).toHaveLength(1)
    expect(home.todayReservations[0].reservation.status).toBe('done')
    expect(home.missedReservations.map((m) => m.customerName)).toEqual(['최도윤'])
    expect(home.unbooked.map((u) => u.name)).toEqual(['최도윤', '김민지'])
    expect(home.stats).toEqual({ active: 2, today: 1, unbooked: 2, passExhausted: 0 })
  })
})
