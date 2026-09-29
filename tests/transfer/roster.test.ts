import { describe, expect, it } from 'vitest'
import { applyRoster, previewRoster } from '@main/transfer/roster'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

const rows = [
  { rowNumber: 2, cells: ['김민지', '010-1234-5678', '2003-05-12', '여', '입시', null, null, null, '메모'] },
  { rowNumber: 3, cells: [null, null, null, null, null, null, null, null, null] },
  { rowNumber: 4, cells: [null, '010-0000-0000', null, null, null, null, null, null, null] },
  { rowNumber: 5, cells: ['한지우', null, null, null, null, null, null, null, null] }
]

describe('previewRoster', () => {
  it('빈 행은 빼고, 이름·연락처가 같은 고객을 힌트로 붙인다', () => {
    const db = createTestDb()
    const existing = seedCustomer(db, { name: '김민지' })
    const preview = previewRoster(db, rows, TODAY)
    expect(preview.map((r) => r.rowNumber)).toEqual([2, 4, 5])
    expect(preview[0].similar.map((h) => h.id)).toEqual([existing])
    expect(preview[1]).toMatchObject({ input: null, errors: ['이름이 없습니다.'], similar: [] })
    expect(preview[2].similar).toEqual([])
  })
})

describe('applyRoster', () => {
  it('고른 행만 새 고객으로 등록하고, 이름 없는 행을 고르면 아무것도 등록하지 않고 거부', () => {
    const db = createTestDb()
    const preview = previewRoster(db, rows, TODAY)
    expect(() => applyRoster(db, preview, [2, 4], NOW)).toThrow('추가할 수 없는 행이 있습니다: 4행')
    expect(db.prepare('SELECT COUNT(*) FROM customers').pluck().get()).toBe(0)
    expect(applyRoster(db, preview, [2, 5], NOW)).toEqual({ added: 2 })
    const names = db.prepare('SELECT name, purpose, registered_at FROM customers ORDER BY name').all()
    expect(names).toEqual([
      { name: '김민지', purpose: 'exam', registered_at: TODAY },
      { name: '한지우', purpose: null, registered_at: TODAY }
    ])
  })
})
