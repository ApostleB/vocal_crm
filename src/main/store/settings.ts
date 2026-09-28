import type { Settings } from '@shared/types'
import type { DB } from '../db/connection'
import { validation } from './util'

export const DEFAULT_LESSON_MINUTES = 60

export function getSetting(db: DB, key: string): string | null {
  const value = db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(key) as
    | string
    | null
    | undefined
  return value ?? null
}

export function setSetting(db: DB, key: string, value: string | null): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

export function getSettings(db: DB): Settings {
  const minutes = Number(getSetting(db, 'lesson_minutes'))
  return {
    branchName: getSetting(db, 'branch_name'),
    lessonMinutes: Number.isInteger(minutes) && minutes > 0 ? minutes : DEFAULT_LESSON_MINUTES
  }
}

export interface SettingsPatch {
  branchName?: string
  lessonMinutes?: number
}

export function updateSettings(db: DB, patch: SettingsPatch): Settings {
  if (patch.branchName !== undefined) {
    const name = patch.branchName.trim()
    if (!name) throw validation('지점 이름을 입력해 주세요.')
    setSetting(db, 'branch_name', name)
  }
  if (patch.lessonMinutes !== undefined) {
    const m = patch.lessonMinutes
    if (!Number.isInteger(m) || m < 10 || m > 240) {
      throw validation('수업 길이는 10~240분 사이로 입력해 주세요.')
    }
    setSetting(db, 'lesson_minutes', String(m))
  }
  return getSettings(db)
}
