import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RosterPreview } from '@shared/transferTypes'
import { TransferPage } from '@renderer/pages/TransferPage'
import { mockApi, renderWithProviders } from './render'

const input = (name: string) => ({
  name,
  phone: '01012345678',
  birthDate: null,
  gender: null,
  purpose: 'exam' as const,
  registeredAt: '2026-09-28',
  vocalRange: null,
  preferredMusic: null,
  pinnedNote: ''
})

const preview: RosterPreview = {
  token: 'r1',
  rows: [
    { rowNumber: 2, input: input('김민지'), errors: [], warnings: [], similar: [{ id: 'a', name: '김민지', phone: null, status: 'active' }] },
    { rowNumber: 3, input: null, errors: ['이름이 없습니다.'], warnings: [], similar: [] },
    { rowNumber: 4, input: input('한지우'), errors: [], warnings: ['성별은 여/남으로 입력해 주세요. 비웠습니다.'], similar: [] }
  ]
}

describe('엑셀 명단 등록', () => {
  it('양식 받기는 저장을 요청한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'excel.saveRosterTemplate': () => ({ saved: true }) })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '양식 받기' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('excel.saveRosterTemplate'))
  })

  it('이름 없는 행은 고를 수 없고, 경고·힌트를 보여주며, 고른 행만 등록한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'excel.openRoster': () => preview, 'excel.applyRoster': () => ({ added: 1 }) })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '명단 열기' }))

    expect(await screen.findByText('엑셀 명단 등록 · 3행')).toBeInTheDocument()
    expect(screen.getByLabelText('3행 추가')).toBeDisabled()
    expect(screen.getByText('이름이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('성별은 여/남으로 입력해 주세요. 비웠습니다.')).toBeInTheDocument()
    expect(screen.getByText('이미 있는 고객과 이름·연락처가 같습니다: 김민지')).toBeInTheDocument()

    await user.click(screen.getByLabelText('2행 추가'))
    await user.click(screen.getByRole('button', { name: '1명 등록' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('excel.applyRoster', 'r1', [4]))
  })
})
