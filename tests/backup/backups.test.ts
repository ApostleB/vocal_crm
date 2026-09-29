import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { checkIntegrity, openDatabase } from '@main/db/connection'
import {
  backupFileName,
  createBackup,
  listBackups,
  pruneBackups,
  renameWithRetry,
  replaceDatabaseFile,
  validateBackupFile
} from '@main/backup/backups'
import { createCustomer } from '@main/store/customers'
import { customerInput, NOW } from '../support/db'
import { closeAfterTest, tempDir } from '../support/tempDir'

// node:fs 는 내장 모듈이라 그대로는 spyOn 이 안 된다. 실제 구현을 그대로 감싼 객체로 바꿔 두면
// 개별 테스트에서 함수 하나만 골라 바꿔치기할 수 있다
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual }
})

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
    const db = closeAfterTest(openDatabase(join(dir, 'vocal_crm.db')))
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

  it('백업이 실패하면 tmp 를 지우고 정식 이름의 파일은 목록에 남기지 않는다', async () => {
    const dir = tempDir()
    const db = closeAfterTest(openDatabase(join(dir, 'vocal_crm.db')))
    db.close() // 닫힌 db 로 부르면 db.backup() 이 실패한다
    const backups = join(dir, 'backups')
    await expect(createBackup(db, backups, 'manual', at(9, 0))).rejects.toThrow(
      '백업을 만들지 못했습니다. 디스크 공간을 확인해 주세요.'
    )
    expect(listBackups(backups)).toEqual([])
    expect(readdirSync(backups)).toEqual([])
  })

  it('임시 파일을 정식 이름으로 옮기지 못하면 tmp 를 지우고 BACKUP_FAILED 를 던진다 (tmp 정리 분기를 실제로 탄다)', async () => {
    const dir = tempDir()
    const db = closeAfterTest(openDatabase(join(dir, 'vocal_crm.db')))
    const backups = join(dir, 'backups')
    const fs = await import('node:fs')
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('입출력 오류'), { code: 'EIO' })
    })
    try {
      await expect(createBackup(db, backups, 'manual', at(9, 0))).rejects.toThrow(
        '백업을 만들지 못했습니다. 디스크 공간을 확인해 주세요.'
      )
      expect(listBackups(backups)).toEqual([])
      expect(readdirSync(backups).some((f) => f.endsWith('.tmp'))).toBe(false)
    } finally {
      rename.mockRestore()
    }
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
    const db = closeAfterTest(openDatabase(join(dir, 'vocal_crm.db')))
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

describe('renameWithRetry', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function fsError(code: string): NodeJS.ErrnoException {
    const err = new Error(code) as NodeJS.ErrnoException
    err.code = code
    return err
  }

  it('EBUSY 가 두 번 나다가 성공하면 성공한다', async () => {
    let calls = 0
    const rename = vi.fn(() => {
      calls++
      if (calls <= 2) throw fsError('EBUSY')
    })
    const promise = renameWithRetry('/a', '/b', rename)
    await vi.advanceTimersByTimeAsync(300)
    await expect(promise).resolves.toBeUndefined()
    expect(rename).toHaveBeenCalledTimes(3)
  })

  it('계속 EPERM 이면 3초 뒤 마지막 오류를 던진다', async () => {
    const rename = vi.fn(() => {
      throw fsError('EPERM')
    })
    const promise = renameWithRetry('/a', '/b', rename)
    const assertion = expect(promise).rejects.toMatchObject({ code: 'EPERM' })
    await vi.advanceTimersByTimeAsync(3000)
    await assertion
    expect(rename.mock.calls.length).toBeGreaterThan(1)
  })

  it('재시도 대상이 아닌 오류(ENOENT)는 바로 던진다', async () => {
    const rename = vi.fn(() => {
      throw fsError('ENOENT')
    })
    await expect(renameWithRetry('/a', '/b', rename)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(rename).toHaveBeenCalledTimes(1)
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
