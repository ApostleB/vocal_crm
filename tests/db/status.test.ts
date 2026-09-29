import { describe, expect, it } from 'vitest'
import { getCustomer, listStatusLogs } from '@main/store/customers'
import { saveReservation } from '@main/store/reservations'
import { changeStatus, countOpenReservations } from '@main/store/status'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

describe('status store', () => {
  it('종료하면 열린 예약(지난 미기록 포함)을 모두 취소하고 이력을 남긴다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    saveReservation(db, { customerId: id, date: '2026-09-20', time: '15:00', note: null }, NOW)
    saveReservation(db, { customerId: id, date: '2026-10-02', time: '13:00', note: null }, NOW)
    expect(countOpenReservations(db, id)).toBe(2)
    const result = changeStatus(db, { customerId: id, toStatus: 'ended', date: TODAY, reason: '이사', pauseUntil: null }, NOW)
    expect(result.canceledReservations).toBe(2)
    expect(countOpenReservations(db, id)).toBe(0)
    expect(getCustomer(db, id)?.status).toBe('ended')
    expect(listStatusLogs(db, id).at(-1)).toMatchObject({ fromStatus: 'active', toStatus: 'ended', reason: '이사' })
  })

  it('휴강은 예약을 유지하고 종료 예정일을 저장, 같은 상태로는 바꿀 수 없다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    saveReservation(db, { customerId: id, date: '2026-10-02', time: '13:00', note: null }, NOW)
    const r = changeStatus(db, { customerId: id, toStatus: 'paused', date: TODAY, reason: null, pauseUntil: '2026-11-01' }, NOW)
    expect(r.canceledReservations).toBe(0)
    expect(getCustomer(db, id)?.pauseUntil).toBe('2026-11-01')
    expect(() =>
      changeStatus(db, { customerId: id, toStatus: 'paused', date: TODAY, reason: null, pauseUntil: null }, NOW)
    ).toThrow('이미 같은 상태입니다.')
  })

  it('재등록하면 수강중으로 돌아오고 휴강 종료일은 지운다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    changeStatus(db, { customerId: id, toStatus: 'paused', date: TODAY, reason: null, pauseUntil: '2026-11-01' }, NOW)
    changeStatus(db, { customerId: id, toStatus: 'active', date: '2026-10-05', reason: null, pauseUntil: null }, NOW)
    expect(getCustomer(db, id)).toMatchObject({ status: 'active', pauseUntil: null })
    expect(listStatusLogs(db, id).map((l) => l.toStatus)).toEqual(['active', 'paused', 'active'])
  })
})
