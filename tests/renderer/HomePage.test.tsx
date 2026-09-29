import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomerSummary, HomeData } from '@shared/types'
import { HomePage } from '@renderer/pages/HomePage'
import { makeReservation } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

const summary = (over: Partial<CustomerSummary>): CustomerSummary => ({
  id: 'x',
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

const home: HomeData = {
  today: '2026-09-28',
  stats: { active: 2, today: 2, unbooked: 1, passExhausted: 1 },
  todayReservations: [
    {
      reservation: makeReservation({ id: 'r1', customerId: 'minji', time: '13:00', status: 'done' }),
      customerName: '김민지',
      hasPinnedNote: true,
      lessonNumber: null,
      remainingPasses: 6
    },
    {
      reservation: makeReservation({ id: 'r2', customerId: 'seojun', time: '18:30' }),
      customerName: '박서준',
      hasPinnedNote: false,
      lessonNumber: 6,
      remainingPasses: -1
    }
  ],
  missedReservations: [],
  unbooked: [{ id: 'doyun', name: '최도윤', lastLessonDate: '2026-09-12' }],
  customers: [
    summary({ id: 'minji', name: '김민지', pinnedNote: '성대결절 이력', lastLessonDate: '2026-09-28', remainingPasses: 6 }),
    summary({ id: 'seojun', name: '박서준', lastLessonDate: '2026-09-25', remainingPasses: -1 }),
    summary({ id: 'yuna', name: '정유나', status: 'paused' })
  ]
}

describe('HomePage', () => {
  it('오늘 수업, 예약 없는 수강생, 수강중 고객 표를 보여준다', async () => {
    mockApi({ 'home.get': () => home })
    renderWithProviders(<HomePage />)
    expect(await screen.findByText('오늘 수업 2')).toBeInTheDocument()
    expect(screen.getByText('✓ 기록됨')).toBeInTheDocument()
    expect(screen.getByText('6회차')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '수업 기록' })).toBeInTheDocument()
    expect(screen.getByText('마지막 수업 16일 전')).toBeInTheDocument()
    expect(screen.getByText('-1회')).toBeInTheDocument()
    expect(screen.queryByText('정유나')).not.toBeInTheDocument()
  })

  it('필터를 "전체"로 바꾸면 휴강 고객도 보인다', async () => {
    const user = userEvent.setup()
    mockApi({ 'home.get': () => home })
    renderWithProviders(<HomePage />)
    await user.click(await screen.findByText('전체'))
    expect(screen.getByText('정유나')).toBeInTheDocument()
  })
})
