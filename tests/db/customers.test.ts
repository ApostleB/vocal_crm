import { describe, expect, it } from 'vitest'
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listStatusLogs,
  setPinnedNote,
  updateCustomer
} from '@main/store/customers'
import { addGoal } from '@main/store/goals'
import { savePass } from '@main/store/passes'
import { createTestDb, customerInput, NOW, seedCustomer, TODAY } from '../support/db'

describe('customers store', () => {
  it('등록하면 수강중 + "수강 시작" 이력, 연락처는 숫자만 저장', () => {
    const db = createTestDb()
    const c = createCustomer(db, customerInput({ name: ' 김민지 ', vocalRange: ' ' }), NOW)
    expect(c).toMatchObject({ name: '김민지', phone: '01012345678', status: 'active', vocalRange: null })
    expect(getCustomer(db, c.id)).toEqual(c)
    expect(listStatusLogs(db, c.id)).toMatchObject([{ fromStatus: null, toStatus: 'active', date: '2026-03-02' }])
  })

  it('이름이 없거나 날짜 형식이 틀리면 거부', () => {
    const db = createTestDb()
    expect(() => createCustomer(db, customerInput({ name: '  ' }), NOW)).toThrow('이름을 입력해 주세요.')
    expect(() => createCustomer(db, customerInput({ birthDate: '2003.05.12' }), NOW)).toThrow('생년월일')
  })

  it('정보 수정과 공통메모 저장', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    updateCustomer(db, id, customerInput({ name: '김민지', purpose: 'exam', vocalRange: 'F3 ~ C5' }), NOW)
    setPinnedNote(db, id, ' 성대결절 이력 \n', NOW)
    expect(getCustomer(db, id)).toMatchObject({ purpose: 'exam', vocalRange: 'F3 ~ C5', pinnedNote: '성대결절 이력' })
  })

  it('등록일을 수정하면 "수강 시작" 이력의 날짜도 함께 바뀐다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    updateCustomer(db, id, customerInput({ registeredAt: '2026-04-01' }), NOW)
    expect(listStatusLogs(db, id)[0].date).toBe('2026-04-01')
  })

  it('없는 고객 수정은 거부', () => {
    const db = createTestDb()
    expect(() => updateCustomer(db, 'nope', customerInput(), NOW)).toThrow('고객을 찾을 수 없습니다.')
  })

  it('삭제하면 관련 기록이 모두 지워진다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    addGoal(db, id, '복식호흡', NOW)
    savePass(db, { customerId: id, count: 10, purchasedAt: TODAY, amount: null, note: null }, NOW)
    deleteCustomer(db, id)
    for (const table of ['customers', 'goals', 'passes', 'status_logs']) {
      expect(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()).toBe(0)
    }
  })
})
