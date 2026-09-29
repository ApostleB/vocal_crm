import { describe, expect, it } from 'vitest'
import type { CustomerSummary } from '@shared/types'
import { filterCustomers, sortCustomers } from '@shared/domain/customerList'

const summary = (over: Partial<CustomerSummary>): CustomerSummary => ({
  id: over.name ?? 'x',
  name: 'x',
  phone: null,
  purpose: null,
  status: 'active',
  pinnedNote: '',
  goalsDone: 0,
  goalsTotal: 0,
  lessonCount: 0,
  lastLessonDate: null,
  nextReservation: null,
  remainingPasses: null,
  ...over
})

const list = [
  summary({ name: '김민지', phone: '01012345678', lastLessonDate: '2026-09-28', remainingPasses: 6 }),
  summary({ name: '박서준', phone: '01055551212', lastLessonDate: '2026-09-25', remainingPasses: -1 }),
  summary({ name: '정유나', status: 'paused', lastLessonDate: '2026-08-28' }),
  summary({ name: '오세린', status: 'moved' }),
  summary({ name: '윤서아', status: 'ended' })
]

describe('filterCustomers', () => {
  it('상태 필터', () => {
    expect(filterCustomers(list, 'active', '').map((c) => c.name)).toEqual(['김민지', '박서준'])
    expect(filterCustomers(list, 'paused', '').map((c) => c.name)).toEqual(['정유나'])
    expect(filterCustomers(list, 'closed', '').map((c) => c.name)).toEqual(['오세린', '윤서아'])
    expect(filterCustomers(list, 'all', '')).toHaveLength(5)
  })

  it('이름 또는 연락처 숫자로 검색', () => {
    expect(filterCustomers(list, 'all', '민지').map((c) => c.name)).toEqual(['김민지'])
    expect(filterCustomers(list, 'all', '5555').map((c) => c.name)).toEqual(['박서준'])
    expect(filterCustomers(list, 'all', '010-1234').map((c) => c.name)).toEqual(['김민지'])
  })
})

describe('sortCustomers', () => {
  it('최근 수업 내림차순, 값 없는 사람은 맨 뒤', () => {
    expect(sortCustomers(list, 'lastLesson', 'desc').map((c) => c.name)).toEqual([
      '김민지',
      '박서준',
      '정유나',
      '오세린',
      '윤서아'
    ])
  })

  it('남은 수강권 오름차순 (부족한 사람 먼저)', () => {
    expect(sortCustomers(list, 'remaining', 'asc').map((c) => c.name).slice(0, 2)).toEqual(['박서준', '김민지'])
  })

  it('목적은 코드가 아니라 한글 라벨 기준으로 정렬한다', () => {
    // 코드 알파벳 순: audition, exam, hobby, other, pro
    // 라벨(한글) 순: 기타(other), 오디션(audition), 입시(exam), 직업(pro), 취미(hobby)
    const purposeList = [
      summary({ name: '입시고객', purpose: 'exam' }),
      summary({ name: '취미고객', purpose: 'hobby' }),
      summary({ name: '오디션고객', purpose: 'audition' }),
      summary({ name: '기타고객', purpose: 'other' }),
      summary({ name: '직업고객', purpose: 'pro' })
    ]
    expect(sortCustomers(purposeList, 'purpose', 'asc').map((c) => c.name)).toEqual([
      '기타고객',
      '오디션고객',
      '입시고객',
      '직업고객',
      '취미고객'
    ])
  })
})
