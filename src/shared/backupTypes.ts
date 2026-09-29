export type BackupKind = 'auto' | 'manual' | 'before-import' | 'before-restore'

export const BACKUP_KIND_LABEL: Record<BackupKind, string> = {
  auto: '자동',
  manual: '수동',
  'before-import': '가져오기 전',
  'before-restore': '복원 전'
}

export interface BackupInfo {
  fileName: string
  kind: BackupKind
  /** 로컬 시각 "YYYY-MM-DD HH:mm:ss" */
  createdAt: string
  size: number
}

export interface BackupStatus {
  /** 마지막 외부 백업(백업 파일 내보내기) 시각, ISO. 없으면 null */
  lastExternalBackupAt: string | null
  backupCount: number
}

export interface AppInfo {
  version: string
  dataDir: string
}
