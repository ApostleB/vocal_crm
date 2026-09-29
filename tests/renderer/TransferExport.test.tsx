import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransferPage } from '@renderer/pages/TransferPage'
import { makeSummary } from '../support/summaries'
import { mockApi, renderWithProviders } from './render'

const customers = [
  makeSummary({ id: 'a', name: '김민지' }),
  makeSummary({ id: 'b', name: '박서준' }),
  makeSummary({ id: 'c', name: '정유나', status: 'paused' })
]

describe('가져오기·내보내기 — 내보내기', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 28, 10, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('수강중 고객 전체 선택 → 보낼 지점·타지점 이동 → 파일로 저장', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({
      'customers.list': () => customers,
      'settings.get': () => ({ branchName: '강남점', lessonMinutes: 60 }),
      'transfer.exportVcrm': () => ({ saved: true, count: 2, moved: 2, canceledReservations: 0 })
    })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '고객 선택' }))
    await user.click(await screen.findByLabelText('보이는 고객 전체 선택'))
    expect(screen.getByText('2명 선택됨')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByText('고객2명_강남점_2026-09-28.vcrm')).toBeInTheDocument()
    await user.type(screen.getByLabelText('보낼 지점 (선택)'), '홍대점')
    await user.click(screen.getByLabelText("내보낸 고객을 '타지점 이동' 상태로 바꾸기"))
    await user.click(screen.getByRole('button', { name: '파일로 저장' }))

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('transfer.exportVcrm', {
        customerIds: ['a', 'b'],
        targetBranch: '홍대점',
        markMoved: true
      })
    )
    await waitFor(() => expect(screen.queryByRole('button', { name: '파일로 저장' })).not.toBeInTheDocument())
  })

  it('엑셀로 내보내기는 고른 고객 id 로 저장을 요청한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'customers.list': () => customers, 'excel.exportCustomers': () => ({ saved: true }) })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '엑셀 저장' }))
    await user.click(await screen.findByLabelText('박서준 선택'))
    await user.click(screen.getByRole('button', { name: '엑셀로 저장' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('excel.exportCustomers', ['b']))
  })

  it('엑셀 저장 창에서 취소하면 고객 선택 창이 그대로 남는다', async () => {
    const user = userEvent.setup()
    mockApi({ 'customers.list': () => customers, 'excel.exportCustomers': () => ({ saved: false }) })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '엑셀 저장' }))
    await user.click(await screen.findByLabelText('박서준 선택'))
    await user.click(screen.getByRole('button', { name: '엑셀로 저장' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '엑셀로 저장' })).toBeInTheDocument())
    expect(screen.getByText('1명 선택됨')).toBeInTheDocument()
  })
})
