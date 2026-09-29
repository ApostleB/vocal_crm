import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { openDatabase } from '@main/db/connection'
import { createBackup, listBackups } from '@main/backup/backups'
import { openWithRecovery, runDailyBackup, type RecoveryUi } from '@main/backup/startup'
import { createCustomer } from '@main/store/customers'
import { customerInput, NOW } from '../support/db'
import { tempDir } from '../support/tempDir'

// node:fs 는 내장 모듈이라 그대로는 spyOn 이 안 된다. 실제 구현을 그대로 감싼 객체로 바꿔 두면
// 개별 테스트에서 함수 하나(예: renameSync)만 특정 호출에 대해서만 실패하도록 바꿔치기할 수 있다
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual }
})

function ui(answer: boolean) {
  return {
    askRestore: vi.fn<RecoveryUi['askRestore']>(() => answer),
    fatal: vi.fn<RecoveryUi['fatal']>(),
    log: vi.fn<RecoveryUi['log']>()
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

  it('무결성 검사가 예외를 던지면 연 db 를 닫고 복원 경로를 탄다 (Windows 에서 .broken 으로 옮길 수 있도록)', async () => {
    const { dbPath, backupDir } = await setupWithBackup()
    const connection = await import('@main/db/connection')
    const closeSpy = vi.spyOn(Database.prototype, 'close')
    const sqliteErr = Object.assign(new Error('database disk image is malformed'), { code: 'SQLITE_CORRUPT' })
    const integrityCheck = vi.spyOn(connection, 'checkIntegrity').mockImplementationOnce(() => {
      throw sqliteErr
    })
    const u = ui(true)
    try {
      const r = openWithRecovery(dbPath, backupDir, u, new Date(2026, 8, 28, 10, 0))
      // setupWithBackup 은 백업을 하나만 만들어서 pickValidBackup 의 검사용 probe db 가 1번 닫힌다.
      // 예외를 던진 원래 db 까지 닫혔다면 2번이어야 한다 (닫지 않으면 1번에 그친다)
      expect(closeSpy).toHaveBeenCalledTimes(2)
      expect(u.askRestore).toHaveBeenCalled()
      expect(r?.restoredFrom).toBe('vocal_crm_20260928_090000_auto.db')
      r?.db.close()
    } finally {
      integrityCheck.mockRestore()
      closeSpy.mockRestore()
    }
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

  it('파일 잠금 등 손상이 아닌 오류는 복원을 묻지 않고 안내만 하며, 파일을 건드리지 않는다', async () => {
    const { dir, dbPath, backupDir } = await setupWithBackup()
    // dbPath 자리에 폴더를 만들면 SQLITE_CANTOPEN 이 난다 (파일 잠금류와 같은 "그 밖의 오류")
    rmSync(dbPath)
    mkdirSync(dbPath)
    const u = ui(true)
    expect(openWithRecovery(dbPath, backupDir, u, NOW)).toBeNull()
    expect(u.askRestore).not.toHaveBeenCalled()
    expect(u.fatal).toHaveBeenCalledWith(
      'VOCAL CRM',
      '데이터 파일을 열지 못했습니다. PC를 다시 켠 뒤 실행해 주세요. 계속되면 데이터 폴더의 logs 폴더를 전달해 주세요.'
    )
    expect(u.log).toHaveBeenCalledTimes(1)
    // 백업이 있어도 아무 파일도 옮기지 않는다
    expect(readdirSync(dir).some((f) => f.includes('.broken-'))).toBe(false)
    expect(existsSync(dbPath)).toBe(true)
  })

  it('SQLITE_NOTADB(손상된 파일)는 여전히 복원을 묻는다', async () => {
    const { dbPath, backupDir } = await setupWithBackup()
    writeFileSync(dbPath, 'this is not a database')
    const u = ui(true)
    const r = openWithRecovery(dbPath, backupDir, u, new Date(2026, 8, 28, 10, 0))
    expect(u.askRestore).toHaveBeenCalled()
    expect(r?.restoredFrom).toBe('vocal_crm_20260928_090000_auto.db')
    expect(u.log).toHaveBeenCalledTimes(1)
    r?.db.close()
  })

  it('복원한 뒤 다시 연 DB 도 손상되어 있으면 fatal 로 끝낸다 (복원 후 재검사)', async () => {
    const { dbPath, backupDir } = await setupWithBackup()
    writeFileSync(dbPath, 'this is not a database')
    const connection = await import('@main/db/connection')
    const integrityCheck = vi.spyOn(connection, 'checkIntegrity').mockReturnValueOnce(false)
    const u = ui(true)
    try {
      const r = openWithRecovery(dbPath, backupDir, u, new Date(2026, 8, 28, 10, 0))
      expect(r).toBeNull()
      expect(u.fatal).toHaveBeenCalledWith(
        '데이터 파일을 열 수 없습니다',
        '복원한 백업도 손상되어 있습니다. 데이터 폴더를 확인해 주세요.'
      )
    } finally {
      integrityCheck.mockRestore()
    }
  })

  it('최신 백업이 깨졌으면 그다음 백업으로 복원하고, restore-tmp 를 남기지 않는다', async () => {
    const { dir, dbPath, backupDir } = await setupWithBackup()
    const db = openDatabase(dbPath)
    createCustomer(db, customerInput({ name: '박서준' }), NOW)
    await createBackup(db, backupDir, 'auto', new Date(2026, 8, 28, 9, 30))
    db.close()
    // 가장 최근(9:30) 백업을 깨뜨린다 - 그다음(9:00) 백업으로 복원해야 한다
    writeFileSync(join(backupDir, 'vocal_crm_20260928_093000_auto.db'), 'broken')
    writeFileSync(dbPath, 'broken')
    const u = ui(true)
    const r = openWithRecovery(dbPath, backupDir, u, new Date(2026, 8, 28, 10, 0))
    expect(u.askRestore).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'vocal_crm_20260928_090000_auto.db' }))
    expect(r?.restoredFrom).toBe('vocal_crm_20260928_090000_auto.db')
    expect(r?.db.prepare('SELECT name FROM customers').pluck().all()).toEqual(['김민지'])
    expect(existsSync(`${dbPath}.restore-tmp`)).toBe(false)
    expect(readdirSync(dir)).toContain('vocal_crm.db.broken-20260928_100000')
    r?.db.close()
  })

  it('복원 마지막 rename 이 실패하면 원래 파일로 되돌리고 fatal 로 끝난다 (DB 없는 상태로 남지 않는다)', async () => {
    const { dir, dbPath, backupDir } = await setupWithBackup()
    writeFileSync(dbPath, 'broken db content')
    const tmpPath = `${dbPath}.restore-tmp`
    const fs = await import('node:fs')
    const actualRename = fs.renameSync
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (from === tmpPath && to === dbPath) throw Object.assign(new Error('EIO'), { code: 'EIO' })
      actualRename(from, to)
    })
    const u = ui(true)
    try {
      const r = openWithRecovery(dbPath, backupDir, u, new Date(2026, 8, 28, 10, 0))
      expect(r).toBeNull()
      expect(u.fatal).toHaveBeenCalledWith(
        'VOCAL CRM',
        '데이터 파일을 열지 못했습니다. PC를 다시 켠 뒤 실행해 주세요. 계속되면 데이터 폴더의 logs 폴더를 전달해 주세요.'
      )
      // DB 파일이 없는 상태로 끝나지 않고 원래(고장난) 내용 그대로 남는다
      expect(readFileSync(dbPath, 'utf-8')).toBe('broken db content')
      expect(existsSync(tmpPath)).toBe(false)
      expect(readdirSync(dir).some((f) => f.includes('.broken-'))).toBe(false)
    } finally {
      rename.mockRestore()
    }
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
