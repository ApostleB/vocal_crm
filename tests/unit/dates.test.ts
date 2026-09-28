import { describe, expect, it } from 'vitest'
import {
  addDays,
  ageOn,
  daysBetween,
  formatFullDate,
  formatKoreanDate,
  formatMonthDay,
  relativeDays,
  startOfWeek,
  toDateString
} from '@shared/domain/dates'

describe('dates', () => {
  it('toDateString은 로컬 날짜를 YYYY-MM-DD로 만든다', () => {
    expect(toDateString(new Date(2026, 8, 28, 23, 59))).toBe('2026-09-28')
  })

  it('addDays와 daysBetween', () => {
    expect(addDays('2026-09-28', 8)).toBe('2026-10-06')
    expect(daysBetween('2026-09-12', '2026-09-28')).toBe(16)
  })

  it('startOfWeek는 월요일을 돌려준다 (일요일은 앞 주)', () => {
    expect(startOfWeek('2026-09-28')).toBe('2026-09-28')
    expect(startOfWeek('2026-10-02')).toBe('2026-09-28')
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28')
  })

  it('한국어 날짜 표기', () => {
    expect(formatMonthDay('2026-10-06')).toBe('10/6 (화)')
    expect(formatFullDate('2026-10-02')).toBe('2026-10-02 (금)')
    expect(formatKoreanDate('2026-09-28')).toBe('9월 28일 (월)')
  })

  it('relativeDays', () => {
    const today = '2026-09-28'
    expect(relativeDays('2026-09-28', today)).toBe('오늘')
    expect(relativeDays('2026-09-27', today)).toBe('어제')
    expect(relativeDays('2026-09-12', today)).toBe('16일 전')
    expect(relativeDays('2026-09-29', today)).toBe('내일')
    expect(relativeDays('2026-10-02', today)).toBe('4일 후')
  })

  it('ageOn은 만 나이', () => {
    expect(ageOn('2003-05-12', '2026-09-28')).toBe(23)
    expect(ageOn('2003-10-12', '2026-09-28')).toBe(22)
  })
})
