import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ImportPreview } from '@shared/transferTypes'
import { toDecision } from '@renderer/components/transfer/ImportPreviewModal'
import { TransferPage } from '@renderer/pages/TransferPage'
import { makeSummary } from '../support/summaries'
import { mockApi, renderWithProviders } from './render'

const hint = (id: string, name: string) => ({ id, name, phone: null, status: 'active' as const })

const preview: ImportPreview = {
  token: 't1',
  sourceBranch: '홍대점',
  exportedAt: '2026-09-27T06:00:00.000Z',
  rows: [
    { incomingId: 'x1', name: '김민지', phone: null, lessonCount: 12, goalCount: 7, passCount: 2, same: [hint('a', '김민지')], similar: [] },
    { incomingId: 'x2', name: '박서준', phone: null, lessonCount: 5, goalCount: 3, passCount: 0, same: [], similar: [hint('b', '박서준')] },
    { incomingId: 'x3', name: '한지우', phone: null, lessonCount: 1, goalCount: 0, passCount: 0, same: [], similar: [] }
  ]
}

describe('toDecision', () => {
  it('선택 값을 처리 방법으로 바꾼다', () => {
    expect(toDecision('x', 'new')).toEqual({ incomingId: 'x', action: 'new' })
    expect(toDecision('x', 'skip')).toEqual({ incomingId: 'x', action: 'skip' })
    expect(toDecision('x', 'merge:a')).toEqual({ incomingId: 'x', action: 'merge', targetId: 'a' })
  })
})

describe('가져오기 미리보기', () => {
  it('모두 고를 때까지 적용할 수 없고, 한 번에 지정·힌트 버튼으로 채운 뒤 적용 결과를 보여준다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({
      'customers.list': () => [makeSummary({ id: 'a', name: '김민지' }), makeSummary({ id: 'b', name: '박서준' })],
      'transfer.openVcrm': () => preview,
      'transfer.applyVcrm': () => ({ added: 1, merged: 2, skipped: 0 })
    })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '파일 열기' }))

    expect(await screen.findByText('홍대점에서 보낸 파일 · 고객 3명')).toBeInTheDocument()
    expect(screen.getByText('내보낸 날짜 2026-09-27 15:00')).toBeInTheDocument()
    expect(screen.getByText('회차 기록 12건 · 목표 7개 · 수강권 2건')).toBeInTheDocument()
    const apply = screen.getByRole('button', { name: '적용하기' })
    expect(apply).toBeDisabled()
    expect(screen.getByText('아직 처리 방법을 고르지 않은 고객이 3명 있습니다.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /같은 고객 힌트가 있는 고객\(1\)/ }))
    await user.click(screen.getByRole('button', { name: '이 고객에 합치기' }))
    await user.click(screen.getByRole('button', { name: '선택 안 된 나머지 → 신규 추가' }))
    expect(apply).toBeEnabled()
    await user.click(apply)

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('transfer.applyVcrm', 't1', [
        { incomingId: 'x1', action: 'merge', targetId: 'a' },
        { incomingId: 'x2', action: 'merge', targetId: 'b' },
        { incomingId: 'x3', action: 'new' }
      ])
    )
    expect(await screen.findByText('신규 1명, 합침 2명, 건너뜀 0명')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument()
  })

  it('파일 열기를 취소하면 아무 창도 뜨지 않는다', async () => {
    const user = userEvent.setup()
    mockApi({ 'transfer.openVcrm': () => null })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '파일 열기' }))
    await waitFor(() => expect(screen.queryByText(/보낸 파일/)).not.toBeInTheDocument())
  })
})
