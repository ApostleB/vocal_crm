import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReservationWithCustomer } from '@shared/types'
import { SchedulePage } from '@renderer/pages/SchedulePage'
import { makeReservation } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

const item = (over: Parameters<typeof makeReservation>[0], name: string): ReservationWithCustomer => ({
  reservation: makeReservation(over),
  customerName: name,
  hasPinnedNote: false,
  lessonNumber: 1,
  remainingPasses: null
})

describe('SchedulePage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 30, 10, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('이번 주(월~일) 예약을 날짜 칸에 보여주고, 지난주로 이동한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({
      'reservations.range': () => [
        item({ id: 'a', date: '2026-09-28', time: '13:00', status: 'done' }, '김민지'),
        item({ id: 'b', date: '2026-10-02', time: '16:00' }, '정유나')
      ]
    })
    renderWithProviders(<SchedulePage />)
    expect(await screen.findByText('2026년 9월 28일 – 10월 4일')).toBeInTheDocument()
    expect(invoke).toHaveBeenCalledWith('reservations.range', '2026-09-28', '2026-10-04')
    expect(await screen.findByText('정유나')).toBeInTheDocument()
    expect(screen.getByText('9/30 (수) · 오늘')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /지난주/ }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('reservations.range', '2026-09-21', '2026-09-27'))
  })
})
