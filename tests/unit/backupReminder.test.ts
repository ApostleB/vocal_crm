import { describe, expect, it } from 'vitest'
import { externalBackupDate, externalBackupLabel, needsBackupReminder } from '@shared/domain/backupReminder'

describe('backupReminder', () => {
  it('외부 백업 시각은 로컬 날짜로 본다', () => {
    expect(externalBackupDate('2026-08-25T15:30:00.000Z')).toBe('2026-08-26')
    expect(externalBackupDate(null)).toBeNull()
  })

  it('마지막 외부 백업 문구', () => {
    expect(externalBackupLabel(null, '2026-09-28')).toBe('없음')
    expect(externalBackupLabel('2026-09-28T01:00:00.000Z', '2026-09-28')).toBe('오늘')
    expect(externalBackupLabel('2026-08-25T01:00:00.000Z', '2026-09-28')).toBe('34일 전')
  })

  it('없거나 30일 이상 지나면 안내하고, 29일이면 안내하지 않는다', () => {
    expect(needsBackupReminder(null, '2026-09-28', null)).toBe(true)
    expect(needsBackupReminder('2026-08-29T01:00:00.000Z', '2026-09-28', null)).toBe(true)
    expect(needsBackupReminder('2026-08-30T01:00:00.000Z', '2026-09-28', null)).toBe(false)
  })

  it('오늘 닫았으면 안내하지 않고, 다음 날에는 다시 안내한다', () => {
    expect(needsBackupReminder(null, '2026-09-28', '2026-09-28')).toBe(false)
    expect(needsBackupReminder(null, '2026-09-29', '2026-09-28')).toBe(true)
  })
})
