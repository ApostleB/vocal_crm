import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomerDetail } from '@shared/types'
import { buildTimeline, numberLessons } from '@shared/domain/lessons'
import { CustomerDetailPage } from '@renderer/pages/CustomerDetailPage'
import { makeCustomer, makeLesson, makeStatusLog } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

const lessons = numberLessons([
  makeLesson({ id: 'l1', lessonDate: '2026-09-21', memo: '감기 기운, 저음 위주', homework: '립트릴 5분' })
])
const detail: CustomerDetail = {
  customer: makeCustomer({ id: 'c1', name: '김민지', pinnedNote: '성대결절 이력', purpose: 'exam' }),
  goals: [
    { id: 'g1', customerId: 'c1', title: '두성 연결', doneAt: '2026-09-21', completedLessonId: 'l1', createdAt: '', updatedAt: '' },
    { id: 'g2', customerId: 'c1', title: '믹스보이스', doneAt: null, completedLessonId: null, createdAt: '', updatedAt: '' }
  ],
  lessons,
  timeline: buildTimeline(lessons, [makeStatusLog({ id: 's1', date: '2026-03-02' })]),
  passes: [],
  totalPassCount: 0,
  remainingPasses: null,
  nextReservation: null
}

describe('CustomerDetailPage', () => {
  it('공통메모, 회차 기록(메모), 완료 목표, 상태 이력을 보여준다', async () => {
    mockApi({ 'customers.detail': () => detail })
    renderWithProviders(<CustomerDetailPage />, { route: '/customers/c1', path: '/customers/:id' })
    expect(await screen.findByRole('heading', { name: '김민지' })).toBeInTheDocument()
    expect(screen.getByText('성대결절 이력')).toBeInTheDocument()
    expect(screen.getByText('1회차 · 2026-09-21 (월)')).toBeInTheDocument()
    expect(screen.getByText('감기 기운, 저음 위주')).toBeInTheDocument()
    expect(screen.getByText('과제 · 립트릴 5분')).toBeInTheDocument()
    expect(screen.getByText('✓ 목표 완료: 두성 연결')).toBeInTheDocument()
    expect(screen.getByText('2026-03-02 · 수강 시작')).toBeInTheDocument()
    expect(screen.getByText('다음 예약 없음')).toBeInTheDocument()
  })

  it('목표를 체크하면 완료 처리를 요청한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'customers.detail': () => detail })
    renderWithProviders(<CustomerDetailPage />, { route: '/customers/c1', path: '/customers/:id' })
    await user.click(await screen.findByRole('checkbox', { name: '믹스보이스' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('goals.setDone', 'g2', true))
  })
})
