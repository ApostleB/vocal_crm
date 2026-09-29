import type { HintCustomer } from './domain/merge'

export interface ImportPreviewRow {
  incomingId: string
  name: string
  phone: string | null
  lessonCount: number
  goalCount: number
  passCount: number
  same: HintCustomer[]
  similar: HintCustomer[]
}

export interface ImportPreview {
  /** Main 에 잠시 보관한 파일을 가리키는 값. 적용할 때 돌려준다 */
  token: string
  sourceBranch: string
  exportedAt: string
  rows: ImportPreviewRow[]
}

export type ImportDecision =
  | { incomingId: string; action: 'new' }
  | { incomingId: string; action: 'skip' }
  | { incomingId: string; action: 'merge'; targetId: string }

export interface ImportResult {
  added: number
  merged: number
  skipped: number
}
