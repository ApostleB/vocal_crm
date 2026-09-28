export interface PassTotals {
  /** 수강권 구매 기록 수 */
  records: number
  /** 구매한 총 횟수 */
  total: number
  /** 수강권을 차감한 수업 수 */
  deducted: number
}

/** 남은 수강권. 구매 기록이 없으면 null (표시: "–") */
export function remainingPasses({ records, total, deducted }: PassTotals): number | null {
  if (records === 0) return null
  return total - deducted
}

export function isPassExhausted(remaining: number | null): boolean {
  return remaining !== null && remaining <= 0
}

/** "6회", "-1회", "–" */
export function formatRemaining(remaining: number | null): string {
  return remaining === null ? '–' : `${remaining}회`
}
