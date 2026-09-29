import { describe, expect, it } from 'vitest'
import type { CustomerInput, CustomerStatus } from '@shared/types'
import { createCustomer } from '@main/store/customers'
import { saveLesson } from '@main/store/lessons'
import { savePass } from '@main/store/passes'
import { cancelReservation, saveReservation } from '@main/store/reservations'
import { changeStatus } from '@main/store/status'
import { createTestDb, customerInput, NOW, seedCustomer, TODAY } from '../support/db'

const lesson = (customerId: string, reservationId: string | null) => ({
  customerId,
  lessonDate: TODAY,
  memo: '',
  practice: null,
  homework: null,
  deductPass: true,
  reservationId,
  completedGoalIds: []
})

describe('store 입력 검증 보강', () => {
  it('성별·수강 목적 값이 정해진 값이 아니면 거부', () => {
    const db = createTestDb()
    expect(() => createCustomer(db, customerInput({ gender: 'X' } as unknown as Partial<CustomerInput>), NOW)).toThrow(
      '성별을 확인해 주세요.'
    )
    expect(() =>
      createCustomer(db, customerInput({ purpose: 'music' } as unknown as Partial<CustomerInput>), NOW)
    ).toThrow('수강 목적을 확인해 주세요.')
  })

  it('상태 값이 정해진 값이 아니면 거부', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    expect(() =>
      changeStatus(
        db,
        { customerId: id, toStatus: 'gone' as CustomerStatus, date: TODAY, reason: null, pauseUntil: null },
        NOW
      )
    ).toThrow('상태를 확인해 주세요.')
  })

  it('수강권: 없는 고객에게는 추가할 수 없고, 다른 고객의 기록은 수정할 수 없다', () => {
    const db = createTestDb()
    const a = seedCustomer(db)
    const b = seedCustomer(db, { name: '박서준' })
    expect(() => savePass(db, { customerId: 'nope', count: 10, purchasedAt: TODAY, amount: null, note: null }, NOW)).toThrow(
      '고객을 찾을 수 없습니다.'
    )
    const p = savePass(db, { customerId: a, count: 10, purchasedAt: TODAY, amount: null, note: null }, NOW)
    expect(() =>
      savePass(db, { id: p.id, customerId: b, count: 5, purchasedAt: TODAY, amount: null, note: null }, NOW)
    ).toThrow('수강권 기록을 찾을 수 없습니다.')
  })

  it('수업 기록: 넘긴 예약이 다른 고객의 것이거나 예정 상태가 아니면 거부', () => {
    const db = createTestDb()
    const a = seedCustomer(db)
    const b = seedCustomer(db, { name: '박서준' })
    const rb = saveReservation(db, { customerId: b, date: TODAY, time: '15:00', note: null }, NOW)
    expect(() => saveLesson(db, lesson(a, rb.id), NOW)).toThrow('연결할 예약을 확인해 주세요.')
    const ra = saveReservation(db, { customerId: a, date: TODAY, time: '16:00', note: null }, NOW)
    cancelReservation(db, ra.id, NOW)
    expect(() => saveLesson(db, lesson(a, ra.id), NOW)).toThrow('연결할 예약을 확인해 주세요.')
    expect(() => saveLesson(db, lesson(a, 'nope'), NOW)).toThrow('연결할 예약을 확인해 주세요.')
  })
})
