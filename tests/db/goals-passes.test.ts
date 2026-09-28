import { describe, expect, it } from 'vitest'
import { addGoal, deleteGoal, listGoals, renameGoal, setGoalDone } from '@main/store/goals'
import { deletePass, listPasses, savePass } from '@main/store/passes'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

describe('goals store', () => {
  it('추가 순서대로, 체크하면 완료일 = 오늘, 해제·이름변경·삭제', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const a = addGoal(db, id, ' 복식호흡 ', new Date('2026-09-01T00:00:00Z'))
    const b = addGoal(db, id, '두성 연결', new Date('2026-09-02T00:00:00Z'))
    setGoalDone(db, a.id, true, TODAY, NOW)
    renameGoal(db, b.id, '두성-흉성 연결', NOW)
    expect(listGoals(db, id).map((g) => [g.title, g.doneAt])).toEqual([
      ['복식호흡', TODAY],
      ['두성-흉성 연결', null]
    ])
    setGoalDone(db, a.id, false, TODAY, NOW)
    deleteGoal(db, b.id)
    expect(listGoals(db, id).map((g) => [g.title, g.doneAt])).toEqual([['복식호흡', null]])
  })

  it('빈 목표는 거부', () => {
    const db = createTestDb()
    expect(() => addGoal(db, seedCustomer(db), ' ', NOW)).toThrow('목표 내용을 입력해 주세요.')
  })
})

describe('passes store', () => {
  it('구매 추가·수정·삭제, 최근 결제일 순', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const p1 = savePass(db, { customerId: id, count: 10, purchasedAt: '2026-03-02', amount: 500000, note: null }, NOW)
    savePass(db, { customerId: id, count: 10, purchasedAt: '2026-09-01', amount: null, note: ' 이벤트 ' }, NOW)
    savePass(db, { id: p1.id, customerId: id, count: 8, purchasedAt: '2026-03-02', amount: 400000, note: null }, NOW)
    expect(listPasses(db, id).map((p) => [p.purchasedAt, p.count, p.note])).toEqual([
      ['2026-09-01', 10, '이벤트'],
      ['2026-03-02', 8, null]
    ])
    deletePass(db, p1.id)
    expect(listPasses(db, id)).toHaveLength(1)
  })

  it('횟수 0 이하와 음수 금액은 거부', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    expect(() => savePass(db, { customerId: id, count: 0, purchasedAt: TODAY, amount: null, note: null }, NOW)).toThrow(
      '횟수는 1 이상'
    )
    expect(() => savePass(db, { customerId: id, count: 1, purchasedAt: TODAY, amount: -1, note: null }, NOW)).toThrow(
      '금액을 확인해 주세요.'
    )
  })
})
