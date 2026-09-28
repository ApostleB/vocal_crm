import { describe, expect, it } from 'vitest'
import { getSettings, updateSettings } from '@main/store/settings'
import { createTestDb } from '../support/db'

describe('settings store', () => {
  it('처음에는 지점 이름이 없고 수업 길이는 60분', () => {
    expect(getSettings(createTestDb())).toEqual({ branchName: null, lessonMinutes: 60 })
  })

  it('지점 이름과 수업 길이를 저장한다', () => {
    const db = createTestDb()
    updateSettings(db, { branchName: '  강남점 ' })
    expect(updateSettings(db, { lessonMinutes: 50 })).toEqual({ branchName: '강남점', lessonMinutes: 50 })
  })

  it('빈 지점 이름과 범위 밖 수업 길이는 거부', () => {
    const db = createTestDb()
    expect(() => updateSettings(db, { branchName: ' ' })).toThrow('지점 이름을 입력해 주세요.')
    expect(() => updateSettings(db, { lessonMinutes: 5 })).toThrow('10~240분')
  })
})
