import { describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { SCHEMA_VERSION } from '@main/db/migrations'

describe('migrations', () => {
  it('빈 DB에 모든 테이블을 만들고 user_version을 올린다', () => {
    const db = openDatabase(':memory:')
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .pluck()
      .all()
    expect(tables).toEqual([
      'customer_aliases',
      'customers',
      'goals',
      'lessons',
      'passes',
      'reservations',
      'settings',
      'status_logs'
    ])
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
  })

  it('외래 키가 켜져 있다', () => {
    const db = openDatabase(':memory:')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})
