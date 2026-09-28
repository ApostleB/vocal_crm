import type { CustomerStatus, Gender, Purpose, StatusLog } from '../types'

export const STATUS_LABEL: Record<CustomerStatus, string> = {
  active: '수강중',
  paused: '휴강',
  ended: '종료',
  moved: '타지점 이동'
}

export const PURPOSE_LABEL: Record<Purpose, string> = {
  hobby: '취미',
  exam: '입시',
  audition: '오디션',
  pro: '직업',
  other: '기타'
}

export const GENDER_LABEL: Record<Gender, string> = { F: '여', M: '남' }

export const END_REASONS = ['목표 달성', '개인 사정', '이사', '기타'] as const

/** 타임라인 구분선 문구. 예: "수강 종료 (이사)", "수강 시작", "재등록" */
export function statusLogText(log: Pick<StatusLog, 'fromStatus' | 'toStatus' | 'reason'>): string {
  const reason = log.reason?.trim() || null
  if (log.toStatus === 'active') {
    if (reason) return reason
    return log.fromStatus === null ? '수강 시작' : '재등록'
  }
  const base = log.toStatus === 'paused' ? '휴강' : log.toStatus === 'ended' ? '수강 종료' : '타지점 이동'
  return reason ? `${base} (${reason})` : base
}

/** 받침 유무에 따라 "으로"/"로". 예: 홍대점 → "홍대점으로", 서울 → "서울로" */
export function withEuro(word: string): string {
  const last = word.trim().charCodeAt(word.trim().length - 1)
  const isHangul = last >= 0xac00 && last <= 0xd7a3
  if (!isHangul) return `${word}(으)로`
  const jong = (last - 0xac00) % 28
  return jong === 0 || jong === 8 ? `${word}로` : `${word}으로`
}
