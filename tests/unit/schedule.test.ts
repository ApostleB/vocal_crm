import { describe, expect, it } from 'vitest'
import { buildTimeOptions, findConflicts, isValidTime } from '@shared/domain/schedule'
import { makeReservation } from '../support/factories'

describe('schedule', () => {
  it('10분 단위 시각 목록', () => {
    const options = buildTimeOptions('14:30', '15:10')
    expect(options).toEqual(['14:30', '14:40', '14:50', '15:00', '15:10'])
    expect(buildTimeOptions()).toHaveLength(102)
  })

  it('isValidTime은 10분 단위만 허용', () => {
    expect(isValidTime('15:00')).toBe(true)
    expect(isValidTime('09:50')).toBe(true)
    expect(isValidTime('15:05')).toBe(false)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('9:00')).toBe(false)
  })

  it('수업 길이보다 가까우면 겹침, 취소·자기 자신·다른 날은 제외', () => {
    const others = [
      makeReservation({ id: 'a', time: '15:00' }),
      makeReservation({ id: 'b', time: '16:00' }),
      makeReservation({ id: 'c', time: '15:30', status: 'canceled' }),
      makeReservation({ id: 'd', time: '15:10', date: '2026-09-29' }),
      makeReservation({ id: 'self', time: '15:20' })
    ]
    const hits = findConflicts({ id: 'self', date: '2026-09-28', time: '15:20' }, others, 60)
    expect(hits.map((r) => r.id)).toEqual(['a', 'b'])
    expect(findConflicts({ date: '2026-09-28', time: '14:00' }, others, 60)).toEqual([])
  })
})
