import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { BackupInfo } from '@shared/backupTypes'
import { toDateString } from '@shared/domain/dates'
import { AppError } from '@shared/result'
import { checkIntegrity, openDatabase, type DB } from '../db/connection'
import { getSetting, setSetting } from '../store/settings'
import { createBackup, fileTimestamp, listBackups, validateBackupFile } from './backups'

/** 시작할 때 사용자에게 묻거나 알리는 창 (Main 은 Electron 대화상자, 테스트는 가짜) */
export interface RecoveryUi {
  /** 최근 백업으로 복원할지 묻는다. true 면 복원 */
  askRestore(latest: BackupInfo): boolean
  /** 계속할 수 없는 오류를 알린다 (앱은 종료된다) */
  fatal(title: string, message: string): void
  /** 원래 오류를 기록한다 (화면에는 보이지 않는다) */
  log(err: unknown): void
}

/** better-sqlite3 오류의 code (있으면) */
function sqliteCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string') return err.code
  return null
}

/**
 * 복원을 물어야 하는 손상 오류인지 (integrity_check 실패로 던진 DB_CORRUPT, 또는 SQLite 코드가
 * SQLITE_CORRUPT 로 시작하거나 SQLITE_NOTADB). 그 밖의 오류(파일 잠금, 디스크 가득 참 등)는
 * 아무 파일도 건드리지 않고 안내만 한다 - 멀쩡한 DB 를 잘못 복원으로 치우지 않기 위해서다
 */
function isCorruptionError(err: unknown): boolean {
  if (err instanceof AppError) return err.code === 'DB_CORRUPT'
  const code = sqliteCode(err)
  return code !== null && (code.startsWith('SQLITE_CORRUPT') || code === 'SQLITE_NOTADB')
}

export interface OpenResult {
  db: DB
  /** 복원했다면 사용한 백업 파일 이름 */
  restoredFrom: string | null
}

/** 최신순으로 검사해 처음 통과하는 백업을 고른다. 하나도 없으면 null (최신 백업이 깨졌을 수도 있어서) */
function pickValidBackup(backupDir: string): BackupInfo | null {
  for (const b of listBackups(backupDir)) {
    try {
      validateBackupFile(join(backupDir, b.fileName))
      return b
    } catch {
      continue
    }
  }
  return null
}

/**
 * DB 를 열고 무결성을 검사한다 (설계 8장).
 * - 더 새 버전 앱의 DB 면 안내하고 null (앱 종료)
 * - 열 수 없거나 손상됐으면 최근 백업으로 복원할지 묻는다. 지금 파일은 지우지 않고 "<파일>.broken-<시각>" 으로 옆에 둔다
 * - 백업이 없거나 복원을 거절하면 null
 */
export function openWithRecovery(dbPath: string, backupDir: string, ui: RecoveryUi, now: Date): OpenResult | null {
  try {
    const db = openDatabase(dbPath)
    if (checkIntegrity(db)) return { db, restoredFrom: null }
    db.close()
    throw new AppError('DB_CORRUPT', '데이터 파일이 손상되었습니다.')
  } catch (err) {
    ui.log(err)
    if (err instanceof AppError && err.code === 'DB_TOO_NEW') {
      ui.fatal('VOCAL CRM', err.message)
      return null
    }
    if (!isCorruptionError(err)) {
      ui.fatal(
        'VOCAL CRM',
        '데이터 파일을 열지 못했습니다. PC를 다시 켠 뒤 실행해 주세요. 계속되면 데이터 폴더의 logs 폴더를 전달해 주세요.'
      )
      return null
    }
    const chosen = pickValidBackup(backupDir)
    if (!chosen) {
      ui.fatal('데이터 파일을 열 수 없습니다', '데이터 파일에 문제가 있고 백업도 없습니다. 데이터 폴더를 확인해 주세요.')
      return null
    }
    if (!ui.askRestore(chosen)) return null
    // 원본을 먼저 옮기고 나서 복사하면, 복사가 실패했을 때 DB 가 아예 없는 상태가 된다.
    // 그래서 백업을 tmp 에 미리 복사해 둔 뒤에만 원본을 옆으로 옮기고, 마지막에 tmp 를 rename 한다
    const tmp = `${dbPath}.restore-tmp`
    copyFileSync(join(backupDir, chosen.fileName), tmp)
    let broken: string | null = null
    let journalMoved = false
    if (existsSync(dbPath)) {
      broken = `${dbPath}.broken-${fileTimestamp(now)}`
      renameSync(dbPath, broken)
      const journal = `${dbPath}-journal`
      if (existsSync(journal)) {
        renameSync(journal, `${broken}-journal`)
        journalMoved = true
      }
    }
    try {
      renameSync(tmp, dbPath)
    } catch (renameErr) {
      ui.log(renameErr)
      // 마지막 rename 이 실패해서 DB 파일이 없는 상태로 끝나면 안 되니 원래 파일로 되돌린다
      if (broken) {
        renameSync(broken, dbPath)
        if (journalMoved) renameSync(`${broken}-journal`, `${dbPath}-journal`)
      }
      try {
        rmSync(tmp, { force: true })
      } catch {
        /* 임시 파일 정리 실패는 무시 */
      }
      ui.fatal(
        'VOCAL CRM',
        '데이터 파일을 열지 못했습니다. PC를 다시 켠 뒤 실행해 주세요. 계속되면 데이터 폴더의 logs 폴더를 전달해 주세요.'
      )
      return null
    }
    const db = openDatabase(dbPath)
    if (!checkIntegrity(db)) {
      db.close()
      ui.fatal('데이터 파일을 열 수 없습니다', '복원한 백업도 손상되어 있습니다. 데이터 폴더를 확인해 주세요.')
      return null
    }
    return { db, restoredFrom: chosen.fileName }
  }
}

/** 하루 첫 실행이면 자동 백업을 만든다. 만들었으면 그 정보를, 오늘 이미 만들었으면 null */
export async function runDailyBackup(db: DB, backupDir: string, now: Date): Promise<BackupInfo | null> {
  const today = toDateString(now)
  if (getSetting(db, 'last_auto_backup_date') === today) return null
  const info = await createBackup(db, backupDir, 'auto', now)
  setSetting(db, 'last_auto_backup_date', today)
  return info
}
