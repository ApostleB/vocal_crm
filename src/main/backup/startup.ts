import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { BackupInfo } from '@shared/backupTypes'
import { toDateString } from '@shared/domain/dates'
import { AppError } from '@shared/result'
import { checkIntegrity, openDatabase, type DB } from '../db/connection'
import { getSetting, setSetting } from '../store/settings'
import { createBackup, fileTimestamp, listBackups, replaceDatabaseFile } from './backups'

/** 시작할 때 사용자에게 묻거나 알리는 창 (Main 은 Electron 대화상자, 테스트는 가짜) */
export interface RecoveryUi {
  /** 최근 백업으로 복원할지 묻는다. true 면 복원 */
  askRestore(latest: BackupInfo): boolean
  /** 계속할 수 없는 오류를 알린다 (앱은 종료된다) */
  fatal(title: string, message: string): void
}

export interface OpenResult {
  db: DB
  /** 복원했다면 사용한 백업 파일 이름 */
  restoredFrom: string | null
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
    if (err instanceof AppError && err.code === 'DB_TOO_NEW') {
      ui.fatal('VOCAL CRM', err.message)
      return null
    }
    const latest = listBackups(backupDir)[0]
    if (!latest) {
      ui.fatal('데이터 파일을 열 수 없습니다', '데이터 파일에 문제가 있고 백업도 없습니다. 데이터 폴더를 확인해 주세요.')
      return null
    }
    if (!ui.askRestore(latest)) return null
    if (existsSync(dbPath)) renameSync(dbPath, `${dbPath}.broken-${fileTimestamp(now)}`)
    replaceDatabaseFile(dbPath, join(backupDir, latest.fileName))
    return { db: openDatabase(dbPath), restoredFrom: latest.fileName }
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
