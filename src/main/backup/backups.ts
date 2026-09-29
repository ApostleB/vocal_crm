import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { BackupInfo, BackupKind } from '@shared/backupTypes'
import { AppError } from '@shared/result'
import type { DB } from '../db/connection'
import { SCHEMA_VERSION } from '../db/migrations'

/** 종류와 상관없이 최근 몇 개를 남길지 (설계 7장) */
export const BACKUP_KEEP = 30

const NAME_RE = /^vocal_crm_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(auto|manual|before-import|before-restore)\.db$/

const pad = (n: number): string => String(n).padStart(2, '0')

/** 로컬 시각 "20260928_153000" */
export function fileTimestamp(now: Date): string {
  const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const t = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${d}_${t}`
}

/** 로컬 시각 기준 "vocal_crm_20260928_153000_auto.db" */
export function backupFileName(kind: BackupKind, now: Date): string {
  return `vocal_crm_${fileTimestamp(now)}_${kind}.db`
}

function parseName(fileName: string): Omit<BackupInfo, 'size'> | null {
  const m = fileName.match(NAME_RE)
  if (!m) return null
  return { fileName, kind: m[7] as BackupKind, createdAt: `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` }
}

/** 최신순. 이름 규칙에 맞지 않는 파일은 무시한다 */
export function listBackups(dir: string): BackupInfo[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map(parseName)
    .filter((b): b is Omit<BackupInfo, 'size'> => b !== null)
    .map((b) => ({ ...b, size: statSync(join(dir, b.fileName)).size }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.fileName.localeCompare(a.fileName))
}

/** 최근 keep 개만 남기고 지운다. 지운 수를 돌려준다 */
export function pruneBackups(dir: string, keep = BACKUP_KEEP): number {
  const old = listBackups(dir).slice(keep)
  for (const b of old) unlinkSync(join(dir, b.fileName))
  return old.length
}

/**
 * 앱을 쓰는 중에도 일관된 복사본을 만든다 (better-sqlite3 backup API). 만든 뒤 오래된 백업을 정리한다.
 * 만드는 도중(백신 검사 등)에 잘못 잘린 파일이 정식 이름으로 남지 않도록 tmp 이름에 쓴 뒤 rename 한다
 */
export async function createBackup(db: DB, dir: string, kind: BackupKind, now: Date): Promise<BackupInfo> {
  mkdirSync(dir, { recursive: true })
  let at = now
  // 같은 초에 두 번 만들면 이름이 겹치므로 1초씩 뒤로 민다
  while (existsSync(join(dir, backupFileName(kind, at)))) at = new Date(at.getTime() + 1000)
  const fileName = backupFileName(kind, at)
  const tmpPath = join(dir, `${fileName}.tmp`)
  try {
    await db.backup(tmpPath)
  } catch (err) {
    rmSync(tmpPath, { force: true })
    throw new AppError('BACKUP_FAILED', '백업을 만들지 못했습니다. 디스크 공간을 확인해 주세요.', { cause: err })
  }
  renameSync(tmpPath, join(dir, fileName))
  pruneBackups(dir)
  const info = listBackups(dir).find((b) => b.fileName === fileName)
  if (!info) throw new AppError('BACKUP_FAILED', '백업을 만들지 못했습니다.')
  return info
}

const invalidBackup = (): AppError =>
  new AppError('BACKUP_INVALID', '백업 파일을 읽을 수 없습니다. VOCAL CRM 백업 파일인지 확인해 주세요.')

/** 복원 전에 파일을 검사한다: SQLite 이고, VOCAL CRM 테이블이 있고, 이 앱보다 새 버전이 아니며, 손상되지 않았는지 */
export function validateBackupFile(path: string): void {
  let probe: Database.Database
  try {
    probe = new Database(path, { readonly: true, fileMustExist: true })
  } catch {
    throw invalidBackup()
  }
  try {
    const version = probe.pragma('user_version', { simple: true }) as number
    if (version > SCHEMA_VERSION) {
      throw new AppError('DB_TOO_NEW', '더 새 버전의 앱에서 만든 데이터입니다. 앱을 새 버전으로 바꿔 주세요.')
    }
    const tables = probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all() as string[]
    if (!tables.includes('customers') || !tables.includes('settings')) throw invalidBackup()
    if (probe.pragma('integrity_check', { simple: true }) !== 'ok') throw invalidBackup()
  } catch (err) {
    if (err instanceof AppError) throw err
    throw invalidBackup()
  } finally {
    probe.close()
  }
}

/** DB 파일을 백업 파일로 바꿔 넣는다. 호출하는 쪽이 먼저 DB 를 닫아야 한다 */
export function replaceDatabaseFile(dbPath: string, sourcePath: string): void {
  copyFileSync(sourcePath, dbPath)
}

const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RENAME_RETRY_INTERVAL_MS = 100
const RENAME_RETRY_TIMEOUT_MS = 3000

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 백신 검사·탐색기 등이 파일을 잠깐 잡는 것에 대비해 rename 을 재시도한다 (설계 8장).
 * EPERM/EBUSY/EACCES 면 100ms 간격으로 최대 3초 재시도하고, 그 밖의 오류거나 시간을 넘기면 마지막 오류를 던진다
 */
export async function renameWithRetry(
  from: string,
  to: string,
  rename: (from: string, to: string) => void = renameSync
): Promise<void> {
  const deadline = Date.now() + RENAME_RETRY_TIMEOUT_MS
  for (;;) {
    try {
      rename(from, to)
      return
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: unknown }).code : undefined
      if (typeof code !== 'string' || !RETRYABLE_RENAME_CODES.has(code) || Date.now() >= deadline) throw err
      await wait(RENAME_RETRY_INTERVAL_MS)
    }
  }
}
