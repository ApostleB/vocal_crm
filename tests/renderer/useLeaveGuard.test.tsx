import { describe, expect, it, vi } from 'vitest'
import { renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomerDetail } from '@shared/types'
import { useLeaveGuard } from '@renderer/lib/useLeaveGuard'
import { CustomerFormModal } from '@renderer/modals/CustomerFormModal'
import { LessonModal } from '@renderer/modals/LessonModal'
import { makeCustomer } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

const detail: CustomerDetail = {
  customer: makeCustomer({ id: 'c1', name: '김민지' }),
  goals: [],
  lessons: [],
  timeline: [],
  passes: [],
  totalPassCount: 0,
  remainingPasses: null,
  nextReservation: null
}

/** 창을 닫을 때 브라우저가 보내는 이벤트. 멈췄으면 true */
function tryLeave(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('useLeaveGuard', () => {
  it('켜져 있을 때만 창 닫기를 멈추고, 꺼지거나 사라지면 풀린다', () => {
    const { rerender, unmount } = renderHook(({ active }) => useLeaveGuard(active), { initialProps: { active: false } })
    expect(tryLeave()).toBe(false)
    rerender({ active: true })
    expect(tryLeave()).toBe(true)
    rerender({ active: false })
    expect(tryLeave()).toBe(false)
    rerender({ active: true })
    unmount()
    expect(tryLeave()).toBe(false)
  })

  it('고객 정보 창에 입력하면 창 닫기를 멈춘다', async () => {
    const user = userEvent.setup()
    mockApi({})
    renderWithProviders(<CustomerFormModal onClose={vi.fn()} />)
    expect(tryLeave()).toBe(false)
    await user.type(screen.getByLabelText(/이름/), '김')
    expect(tryLeave()).toBe(true)
  })

  it('수업 기록 창에 메모를 쓰면 창 닫기를 멈춘다', async () => {
    const user = userEvent.setup()
    mockApi({ 'customers.detail': () => detail })
    renderWithProviders(<LessonModal customerId="c1" onClose={vi.fn()} onBookNext={vi.fn()} />)
    const memo = await screen.findByLabelText('메모')
    expect(tryLeave()).toBe(false)
    await user.type(memo, '작성 중')
    expect(tryLeave()).toBe(true)
  })
})
