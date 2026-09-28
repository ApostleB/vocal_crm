import { describe, expect, it } from 'vitest'
import { formatRemaining, isPassExhausted, remainingPasses } from '@shared/domain/passes'

describe('passes', () => {
  it('구매 기록이 없으면 null', () => {
    expect(remainingPasses({ records: 0, total: 0, deducted: 3 })).toBeNull()
  })

  it('총 횟수 - 차감 수업 수, 음수 가능', () => {
    expect(remainingPasses({ records: 2, total: 20, deducted: 14 })).toBe(6)
    expect(remainingPasses({ records: 1, total: 4, deducted: 5 })).toBe(-1)
  })

  it('소진 판단과 표시', () => {
    expect(isPassExhausted(null)).toBe(false)
    expect(isPassExhausted(0)).toBe(true)
    expect(isPassExhausted(-1)).toBe(true)
    expect(isPassExhausted(2)).toBe(false)
    expect(formatRemaining(null)).toBe('–')
    expect(formatRemaining(-2)).toBe('-2회')
  })
})
