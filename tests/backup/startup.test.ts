import { describe, expect, it, vi } from 'vitest'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase } from '@main/db/connection'
import { createBackup, listBackups } from '@main/backup/backups'
import { openWithRecovery, runDailyBackup, type RecoveryUi } from '@main/backup/startup'
import { createCustomer } from '@main/store/customers'
import { customerInput, NOW } from '../support/db'
import { tempDir } from '../support/tempDir'

function ui(answer: boolean) {
  return {
    askRestore: vi.fn<RecoveryUi['askRestore']>(() => answer),
    fatal: vi.fn<RecoveryUi['fatal']>()
  }
}

async function setupWithBackup(): Promise<{ dir: string; dbPath: string; backupDir: string }> {
  const dir = tempDir()
  const dbPath = join(dir, 'vocal_crm.db')
  const backupDir = join(dir, 'backups')
  const db = openDatabase(dbPath)
  createCustomer(db, customerInput(), NOW)
  await createBackup(db, backupDir, 'auto', new Date(2026, 8, 28, 9, 0))
  db.close()
  return { dir, dbPath, backupDir }
}

describe('openWithRecovery', () => {
  it('정상 DB 는 그대로 연다', async () => {
    const { dbPath, backupDir } = await setupWithBackup()
    const u = ui(true)
    const r = openWithRecovery(dbPath, backupDir, u, NOW)
    expect(r?.restoredFrom).toBeNull()
    expect(u.askRestore).not.toHaveBeenCalled()
    r?.db.close()
  })

  it('손상된 DB 는 최근 백업으로 복원할지 묻고, 복원하면 원래 파일은 옆에 남긴다', async () => {
    const { dir, dbPath, backupDir } = await setupWithBackup()
    writeFileSync(dbPath, 'this is not a database')
    const u = ui(true)
    const r = openWithRecovery(dbPath, backupDir, u, new Date(2026, 8, 28, 10, 0))
    expect(u.askRestore).toHaveBeenCalledWith(expect.objectContaining({ kind: 'auto', createdAt: '2026-09-28 09:00:00' }))
    expect(r?.restoredFrom).toBe('vocal_crm_20260928_090000_auto.db')
    expect(r?.db.prepare('SELECT name FROM customers').pluck().all()).toEqual(['김민지'])
    expect(readdirSync(dir)).toContain('vocal_crm.db.broken-20260928_100000')
    r?.db.close()
  })

  it('복원을 거절하면 null, 백업이 없으면 알리고 null', async () => {
    const { dbPath, backupDir } = await setupWithBackup()
    writeFileSync(dbPath, 'broken')
    expect(openWithRecovery(dbPath, backupDir, ui(false), NOW)).toBeNull()

    const empty = tempDir()
    const lonely = join(empty, 'vocal_crm.db')
    writeFileSync(lonely, 'broken')
    const u = ui(true)
    expect(openWithRecovery(lonely, join(empty, 'backups'), u, NOW)).toBeNull()
    expect(u.fatal).toHaveBeenCalledWith('데이터 파일을 열 수 없습니다', expect.stringContaining('백업도 없습니다'))
  })

  it('더 새 버전 앱의 DB 면 복원을 묻지 않고 안내만 한다', async () => {
    const { dbPath, backupDir } = await setupWithBackup()
    const db = openDatabase(dbPath)
    db.pragma('user_version = 999')
    db.close()
    const u = ui(true)
    expect(openWithRecovery(dbPath, backupDir, u, NOW)).toBeNull()
    expect(u.askRestore).not.toHaveBeenCalled()
    expect(u.fatal).toHaveBeenCalledWith('VOCAL CRM', expect.stringContaining('더 새 버전'))
    expect(existsSync(dbPath)).toBe(true)
  })
})

describe('runDailyBackup', () => {
  it('하루에 한 번만 자동 백업을 만든다', async () => {
    const dir = tempDir()
    const db = openDatabase(join(dir, 'vocal_crm.db'))
    const backupDir = join(dir, 'backups')
    expect(await runDailyBackup(db, backupDir, new Date(2026, 8, 28, 9, 0))).toMatchObject({ kind: 'auto' })
    expect(await runDailyBackup(db, backupDir, new Date(2026, 8, 28, 18, 0))).toBeNull()
    expect(await runDailyBackup(db, backupDir, new Date(2026, 8, 29, 9, 0))).toMatchObject({ kind: 'auto' })
    expect(listBackups(backupDir)).toHaveLength(2)
    db.close()
  })
})
