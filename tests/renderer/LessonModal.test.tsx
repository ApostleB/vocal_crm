import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomerDetail } from '@shared/types'
import { numberLessons } from '@shared/domain/lessons'
import { LessonModal } from '@renderer/modals/LessonModal'
import { makeCustomer, makeLesson } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

const lessons = numberLessons([makeLesson({ id: 'l1', lessonDate: '2026-09-21', homework: '립트릴 매일 5분' })])
const detail: CustomerDetail = {
  customer: makeCustomer({ id: 'c1', name: '김민지' }),
  goals: [
    { id: 'g1', customerId: 'c1', title: '믹스보이스 안정화', doneAt: null, completedLessonId: null, createdAt: '', updatedAt: '' }
  ],
  lessons,
  timeline: [],
  passes: [],
  totalPassCount: 10,
  remainingPasses: 6,
  nextReservation: null
}

describe('LessonModal', () => {
  it('지난 과제·회차·차감 후 남은 횟수를 보여주고, 메모와 완료 목표를 저장한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'customers.detail': () => detail, 'lessons.save': () => lessons[0] })
    const onClose = vi.fn()
    renderWithProviders(<LessonModal customerId="c1" date="2026-09-28" reservationId="r1" onClose={onClose} onBookNext={vi.fn()} />)

    expect(await screen.findByText('2회차')).toBeInTheDocument()
    expect(screen.getByText('립트릴 매일 5분')).toBeInTheDocument()
    expect(screen.getByText('저장 후 5회 남음')).toBeInTheDocument()

    await user.type(screen.getByLabelText('메모'), '브릿지 고음 개선')
    await user.click(screen.getByText('믹스보이스 안정화'))
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(invoke).toHaveBeenCalledWith(
      'lessons.save',
      expect.objectContaining({
        customerId: 'c1',
        lessonDate: '2026-09-28',
        memo: '브릿지 고음 개선',
        deductPass: true,
        reservationId: 'r1',
        completedGoalIds: ['g1']
      })
    )
  })

  it('메모를 쓰다 닫으면 확인을 받는다', async () => {
    const user = userEvent.setup()
    mockApi({ 'customers.detail': () => detail })
    const onClose = vi.fn()
    renderWithProviders(<LessonModal customerId="c1" onClose={onClose} onBookNext={vi.fn()} />)

    await user.type(await screen.findByLabelText('메모'), '작성 중')
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(await screen.findByText('작성 중인 메모가 있습니다. 닫을까요?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '닫기' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
