import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { toDateString } from '@shared/domain/dates'
import { safeFileName } from '@shared/domain/transferNames'
import { AppError } from '@shared/result'
import { createBackup, listBackups, validateBackupFile } from '../backup/backups'
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
   * 파일을 바꾸지 못해도 DB 는 다시 열어 앱이 계속 동작하게 한다.
   */
  const restoreFrom = async (e: AppEnv, restoreSource: string): Promise<void> => {
    await createBackup(db, e.backupDir, 'before-restore', clock())
    db.close()
    try {
      renameSync(restoreSource, e.dbPath)
    } finally {
      e.reload()
    }
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
      const source = `${e.dbPath}.restore-tmp`
      writeFileSync(source, readFileSync(join(e.backupDir, fileName)))
      try {
        validateBackupFile(source)
      } catch (err) {
        unlinkSync(source)
        throw err
      }
      await restoreFrom(e, source)
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
      const source = `${e.dbPath}.restore-tmp`
      writeFileSync(source, await files.readFile(path))
      try {
        validateBackupFile(source)
      } catch (err) {
        unlinkSync(source)
        throw err
      }
      await restoreFrom(e, source)
      return { restored: true }
    }
  }
}
