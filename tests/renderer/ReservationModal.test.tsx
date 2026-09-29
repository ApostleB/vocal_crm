import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomerSummary, ReservationWithCustomer } from '@shared/types'
import { ReservationModal } from '@renderer/modals/ReservationModal'
import { makeReservation } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

const minji: CustomerSummary = {
  id: 'c1',
  name: '김민지',
  phone: '01012345678',
  purpose: 'exam',
  status: 'active',
  pinnedNote: '',
  goalsDone: 0,
  goalsTotal: 0,
  lessonCount: 0,
  lastLessonDate: null,
  nextReservation: null,
  remainingPasses: null
}
const existing: ReservationWithCustomer = {
  reservation: makeReservation({ id: 'r-haeun', customerId: 'c2', date: '2026-10-06', time: '15:00' }),
  customerName: '이하은',
  hasPinnedNote: false,
  lessonNumber: 3,
  remainingPasses: null
}

describe('ReservationModal', () => {
  it('겹치면 안내하고, 저장할 때 확인을 받은 뒤 저장한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({
      'settings.get': () => ({ branchName: '강남점', lessonMinutes: 60 }),
      'customers.list': () => [minji],
      'reservations.range': () => [existing],
      'reservations.save': () => existing.reservation
    })
    const onClose = vi.fn()
    renderWithProviders(<ReservationModal customerId="c1" date="2026-10-06" onClose={onClose} />)

    await user.click(await screen.findByPlaceholderText('예: 15:00'))
    // 드롭다운은 전환 효과 때문에 jsdom 에서 '숨김'으로 계산되므로 hidden: true 로 찾는다
    await user.click(await screen.findByRole('option', { name: '15:30', hidden: true }))
    expect(await screen.findByText('⚠ 15:00 이하은 예약과 겹칩니다')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '예약 저장' }))
    expect(await screen.findByText('⚠ 예약 시간이 겹칩니다')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '그래도 저장' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(invoke).toHaveBeenCalledWith('reservations.save', {
      id: undefined,
      customerId: 'c1',
      date: '2026-10-06',
      time: '15:30',
      note: null
    })
  })
})
