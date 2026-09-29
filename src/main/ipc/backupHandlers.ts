import { readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { toDateString } from '@shared/domain/dates'
import { safeFileName } from '@shared/domain/transferNames'
import { AppError } from '@shared/result'
import { createBackup, listBackups, renameWithRetry, validateBackupFile } from '../backup/backups'
import type { AppEnv } from '../backup/env'
import type { DB } from '../db/connection'
import { getSetting, getSettings, setSetting } from '../store/settings'
import { iso, newId, notFound } from '../store/util'
import { BACKUP_FILTERS, type FileAccess } from '../transfer/files'
import type { Handlers } from './handlers'

type BackupChannel =
  | 'app.info'
  | 'app.openDataFolder'
  | 'backup.status'
  | 'backup.list'
  | 'backup.create'
  | 'backup.restore'
  | 'backup.exportFile'
  | 'backup.importFile'

/** 설정·백업 화면 채널 (설계 5.9, 7장) */
export function createBackupHandlers(
  db: DB,
  clock: () => Date,
  files: FileAccess,
  env: AppEnv | null
): Pick<Handlers, BackupChannel> {
  const requireEnv = (): AppEnv => {
    if (!env) throw new AppError('NO_APP_ENV', '이 기능을 쓸 수 없습니다.')
    return env
  }

  /**
   * 검사한 백업 파일(restoreSource)로 DB 를 바꾸고 다시 연다.
   * 먼저 '복원 전' 백업을 만든다. 그 백업이 오래된 백업을 정리하다 원본을 지워도 되도록 원본은 미리 복사해 둔다.
   * 백업을 만들지 못하면 restore-tmp 를 지우고 오류를 다시 던진다 (DB 는 아직 닫지 않았으므로 그대로 쓸 수 있다).
   * rename 이 파일 잠금(백신 등)으로 실패하면 재시도하고, 그래도 안 되면 tmp 를 지우고 DB 는 다시 열되
   * 화면은 새로 불러오지 않는다 (그래야 오류 알림이 화면에 남는다).
   */
  const restoreFrom = async (e: AppEnv, restoreSource: string): Promise<void> => {
    try {
      await createBackup(db, e.backupDir, 'before-restore', clock())
    } catch (err) {
      rmSync(restoreSource, { force: true })
      throw err
    }
    db.close()
    try {
      await renameWithRetry(restoreSource, e.dbPath)
    } catch {
      rmSync(restoreSource, { force: true })
      e.reopen()
      throw new AppError(
        'RESTORE_FAILED',
        '복원하지 못했습니다. 다른 프로그램이 데이터 파일을 쓰고 있을 수 있습니다. 잠시 뒤 다시 시도해 주세요.'
      )
    }
    e.reopen()
    e.reloadWindow()
  }

  /** 복원할 내용을 "<DB 파일>.restore-tmp" 에 쓰고 검사한다. 검사에 실패하면 지우고 오류를 다시 던진다 */
  const prepareRestore = (e: AppEnv, data: Buffer): string => {
    const source = `${e.dbPath}.restore-tmp`
    writeFileSync(source, data)
    try {
      validateBackupFile(source)
    } catch (err) {
      try {
        rmSync(source, { force: true })
      } catch {
        /* 임시 파일 정리 실패는 무시 - 원래 검사 오류가 사용자에게 가야 한다 */
      }
      throw err
    }
    return source
  }

  return {
    'app.info': () => {
      const e = requireEnv()
      return { version: e.version, dataDir: e.dataDir }
    },

    'app.openDataFolder': async () => {
      const e = requireEnv()
      await e.openPath(e.dataDir)
    },

    'backup.status': () => ({
      lastExternalBackupAt: getSetting(db, 'last_external_backup_at'),
      backupCount: env ? listBackups(env.backupDir).length : 0
    }),

    'backup.list': () => listBackups(requireEnv().backupDir),

    'backup.create': () => createBackup(db, requireEnv().backupDir, 'manual', clock()),

    'backup.restore': async (fileName) => {
      const e = requireEnv()
      if (!listBackups(e.backupDir).some((b) => b.fileName === fileName)) throw notFound('백업을 찾을 수 없습니다.')
      await restoreFrom(e, prepareRestore(e, readFileSync(join(e.backupDir, fileName))))
    },

    'backup.exportFile': async () => {
      const branch = safeFileName(getSettings(db).branchName ?? '')
      const path = await files.chooseSavePath(
        `VOCAL_CRM_백업_${branch}_${toDateString(clock())}.vcrmbak`,
        BACKUP_FILTERS
      )
      if (!path) return { saved: false }
      const tmp = join(tmpdir(), `vocal-crm-export-${newId()}.db`)
      try {
        await db.backup(tmp)
        await files.writeFile(path, readFileSync(tmp))
      } finally {
        unlinkSync(tmp)
      }
      setSetting(db, 'last_external_backup_at', iso(clock()))
      return { saved: true }
    },

    'backup.importFile': async () => {
      const e = requireEnv()
      const path = await files.chooseOpenPath(BACKUP_FILTERS)
      if (!path) return { restored: false }
      await restoreFrom(e, prepareRestore(e, await files.readFile(path)))
      return { restored: true }
    }
  }
}
