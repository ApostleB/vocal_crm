import { describe, expect, it, vi } from 'vitest'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { checkIntegrity, openDatabase } from '@main/db/connection'
import {
  backupFileName,
  createBackup,
  listBackups,
  pruneBackups,
  replaceDatabaseFile,
  validateBackupFile
} from '@main/backup/backups'
import { createCustomer } from '@main/store/customers'
import { customerInput, NOW } from '../support/db'
import { tempDir } from '../support/tempDir'

const at = (h: number, m: number, s = 0): Date => new Date(2026, 8, 28, h, m, s)

describe('backupFileName / listBackups', () => {
  it('로컬 시각과 종류로 이름을 만들고, 목록은 최신순이며 다른 파일은 무시한다', () => {
    expect(backupFileName('auto', at(15, 30))).toBe('vocal_crm_20260928_153000_auto.db')
    const dir = tempDir()
    writeFileSync(join(dir, 'vocal_crm_20260928_090000_auto.db'), 'x')
    writeFileSync(join(dir, 'vocal_crm_20260928_101500_before-import.db'), 'xy')
    writeFileSync(join(dir, 'notes.txt'), 'x')
    expect(listBackups(dir)).toEqual([
      { fileName: 'vocal_crm_20260928_101500_before-import.db', kind: 'before-import', createdAt: '2026-09-28 10:15:00', size: 2 },
      { fileName: 'vocal_crm_20260928_090000_auto.db', kind: 'auto', createdAt: '2026-09-28 09:00:00', size: 1 }
    ])
    expect(listBackups(join(dir, 'missing'))).toEqual([])
  })
})

describe('createBackup / pruneBackups', () => {
  it('열려 있는 DB 의 복사본을 만들고, 같은 초에 또 만들면 1초 뒤 이름을 쓴다', async () => {
    const dir = tempDir()
    const db = openDatabase(join(dir, 'vocal_crm.db'))
    createCustomer(db, customerInput(), NOW)
    const backups = join(dir, 'backups')
    const first = await createBackup(db, backups, 'auto', at(15, 30))
    const second = await createBackup(db, backups, 'manual', at(15, 30))
    const third = await createBackup(db, backups, 'auto', at(15, 30))
    expect([first.fileName, second.fileName, third.fileName]).toEqual([
      'vocal_crm_20260928_153000_auto.db',
      'vocal_crm_20260928_153000_manual.db',
      'vocal_crm_20260928_153001_auto.db'
    ])
    const copy = new Database(join(backups, first.fileName), { readonly: true })
    expect(copy.prepare('SELECT name FROM customers').pluck().all()).toEqual(['김민지'])
    copy.close()
  })

  it('최근 30개만 남긴다', () => {
    const dir = tempDir()
    for (let i = 0; i < 32; i++) writeFileSync(join(dir, backupFileName('auto', at(10, i))), 'x')
    expect(pruneBackups(dir)).toBe(2)
    const left = listBackups(dir)
    expect(left).toHaveLength(30)
    expect(left.at(-1)?.createdAt).toBe('2026-09-28 10:02:00')
  })
})

describe('validateBackupFile / replaceDatabaseFile', () => {
  it('정상 백업은 통과, SQLite 가 아니거나 VOCAL CRM 이 아니거나 더 새 버전이면 거부', async () => {
    const dir = tempDir()
    const db = openDatabase(join(dir, 'vocal_crm.db'))
    const backup = await createBackup(db, dir, 'manual', at(9, 0))
    expect(() => validateBackupFile(join(dir, backup.fileName))).not.toThrow()

    writeFileSync(join(dir, 'garbage.vcrmbak'), 'not sqlite at all')
    expect(() => validateBackupFile(join(dir, 'garbage.vcrmbak'))).toThrow('백업 파일을 읽을 수 없습니다.')

    const other = new Database(join(dir, 'other.db'))
    other.exec('CREATE TABLE notes (id TEXT)')
    other.close()
    expect(() => validateBackupFile(join(dir, 'other.db'))).toThrow('백업 파일을 읽을 수 없습니다.')

    const newer = openDatabase(join(dir, 'newer.db'))
    newer.pragma('user_version = 999')
    newer.close()
    expect(() => validateBackupFile(join(dir, 'newer.db'))).toThrow('더 새 버전의 앱에서 만든 데이터입니다.')
    expect(() => validateBackupFile(join(dir, 'nope.db'))).toThrow('백업 파일을 읽을 수 없습니다.')
  })

  it('닫은 DB 파일을 백업으로 바꿔 넣으면 백업 시점 데이터가 된다', async () => {
    const dir = tempDir()
    const dbPath = join(dir, 'vocal_crm.db')
    const db = openDatabase(dbPath)
    const backup = await createBackup(db, dir, 'manual', at(9, 0))
    createCustomer(db, customerInput({ name: '박서준' }), NOW)
    expect(checkIntegrity(db)).toBe(true)
    db.close()
    replaceDatabaseFile(dbPath, join(dir, backup.fileName))
    const reopened = openDatabase(dbPath)
    expect(reopened.prepare('SELECT COUNT(*) FROM customers').pluck().get()).toBe(0)
    reopened.close()
    expect(existsSync(dbPath)).toBe(true)
  })
})

describe('openDatabase', () => {
  it('열다가 실패하면 파일을 닫는다 (Windows 에서 손상 파일을 옆으로 옮길 수 있도록)', () => {
    const dir = tempDir()
    const dbPath = join(dir, 'vocal_crm.db')
    writeFileSync(dbPath, 'this is not a database')
    const close = vi.spyOn(Database.prototype, 'close')
    try {
      expect(() => openDatabase(dbPath)).toThrow()
      expect(close).toHaveBeenCalledTimes(1)
    } finally {
      close.mockRestore()
    }
  })
})
