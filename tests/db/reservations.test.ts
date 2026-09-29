import { describe, expect, it } from 'vitest'
import { cancelReservation, getReservation, saveReservation } from '@main/store/reservations'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

describe('reservations store', () => {
  it('10분 단위가 아니면 거부, 변경·취소', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    expect(() => saveReservation(db, { customerId: id, date: TODAY, time: '15:05', note: null }, NOW)).toThrow(
      '10분 단위'
    )
    const r = saveReservation(db, { customerId: id, date: TODAY, time: '15:00', note: ' MR 준비 ' }, NOW)
    expect(r).toMatchObject({ status: 'scheduled', note: 'MR 준비' })
    saveReservation(db, { id: r.id, customerId: id, date: '2026-10-06', time: '15:10', note: null }, NOW)
    expect(getReservation(db, r.id)).toMatchObject({ date: '2026-10-06', time: '15:10', note: null })
    cancelReservation(db, r.id, NOW)
    expect(getReservation(db, r.id)?.status).toBe('canceled')
    expect(() => cancelReservation(db, r.id, NOW)).toThrow('이미 취소된')
    expect(() => saveReservation(db, { id: r.id, customerId: id, date: TODAY, time: '16:00', note: null }, NOW)).toThrow(
      '변경할 수 없습니다'
    )
  })

  it('없는 고객에게는 예약할 수 없다', () => {
    const db = createTestDb()
    expect(() => saveReservation(db, { customerId: 'nope', date: TODAY, time: '15:00', note: null }, NOW)).toThrow(
      '고객을 찾을 수 없습니다.'
    )
  })
})
