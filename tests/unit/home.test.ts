import { describe, expect, it } from 'vitest'
import { buildHome, nextReservationsByCustomer } from '@shared/domain/home'
import { makeAggregate, makeCustomer, makeReservation } from '../support/factories'

const today = '2026-09-28'

describe('nextReservationsByCustomer', () => {
  it('오늘 포함 이후의 가장 이른 scheduled 예약', () => {
    const map = nextReservationsByCustomer(
      [
        makeReservation({ id: 'past', date: '2026-09-27' }),
        makeReservation({ id: 'later', date: '2026-10-02', time: '13:00' }),
        makeReservation({ id: 'soon', date: '2026-09-28', time: '18:00' }),
        makeReservation({ id: 'done', date: '2026-09-28', time: '09:00', status: 'done' })
      ],
      today
    )
    expect(map.get('c1')?.id).toBe('soon')
  })
})

describe('buildHome', () => {
  const minji = makeAggregate({
    customer: makeCustomer({ id: 'minji', name: '김민지', pinnedNote: '성대결절 이력' }),
    lessonCount: 11,
    lastLessonDate: '2026-09-21',
    passRecords: 2,
    passTotal: 20,
    deducted: 14
  })
  const seojun = makeAggregate({
    customer: makeCustomer({ id: 'seojun', name: '박서준' }),
    lessonCount: 5,
    lastLessonDate: '2026-09-25',
    passRecords: 1,
    passTotal: 4,
    deducted: 5
  })
  const doyun = makeAggregate({
    customer: makeCustomer({ id: 'doyun', name: '최도윤' }),
    lastLessonDate: '2026-09-12'
  })
  const newbie = makeAggregate({ customer: makeCustomer({ id: 'newbie', name: '한지우' }) })
  const paused = makeAggregate({ customer: makeCustomer({ id: 'paused', name: '정유나', status: 'paused' }) })

  const home = buildHome({
    today,
    aggregates: [minji, seojun, doyun, newbie, paused],
    reservations: [
      makeReservation({ id: 'r-minji', customerId: 'minji', time: '13:00', status: 'done' }),
      makeReservation({ id: 'r-seojun', customerId: 'seojun', time: '18:30' }),
      makeReservation({ id: 'r-cancel', customerId: 'doyun', time: '10:00', status: 'canceled' }),
      makeReservation({ id: 'r-missed', customerId: 'doyun', date: '2026-09-26' })
    ]
  })

  it('오늘 수업: 취소 제외, 시간순, 미기록이면 다음 회차', () => {
    expect(home.todayReservations.map((r) => r.reservation.id)).toEqual(['r-minji', 'r-seojun'])
    expect(home.todayReservations[0].lessonNumber).toBeNull()
    expect(home.todayReservations[0].hasPinnedNote).toBe(true)
    expect(home.todayReservations[1].lessonNumber).toBe(6)
    expect(home.todayReservations[1].remainingPasses).toBe(-1)
  })

  it('지난 미기록 예약', () => {
    expect(home.missedReservations.map((r) => r.reservation.id)).toEqual(['r-missed'])
  })

  it('예약 없는 수강생: 수강중만, 수업 기록 없는 사람이 먼저, 그다음 오래된 순', () => {
    expect(home.unbooked.map((u) => u.id)).toEqual(['newbie', 'doyun', 'minji'])
  })

  it('요약 숫자', () => {
    expect(home.stats).toEqual({ active: 4, today: 2, unbooked: 3, passExhausted: 1 })
  })

  it('고객 요약은 이름순, 다음 예약과 남은 수강권 포함', () => {
    expect(home.customers.map((c) => c.name)).toEqual(['김민지', '박서준', '정유나', '최도윤', '한지우'])
    const s = home.customers.find((c) => c.id === 'seojun')
    expect(s?.nextReservation).toEqual({ date: today, time: '18:30' })
    expect(home.customers.find((c) => c.id === 'minji')?.remainingPasses).toBe(6)
    expect(home.customers.find((c) => c.id === 'newbie')?.remainingPasses).toBeNull()
  })
})
