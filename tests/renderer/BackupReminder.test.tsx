import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { useBackupStatus } from '@renderer/api/hooks'
import { BackupReminder, REMINDER_DISMISSED_KEY } from '@renderer/components/home/BackupReminder'
import { mockApi, renderWithProviders } from './render'

const TODAY = '2026-09-28'

/** 백업 상태를 불러왔는지 알려 주는 표시. 안내가 "안 보임"을 확인하기 전에 기다린다 */
function Loaded(): React.JSX.Element | null {
  return useBackupStatus().data ? <p>불러옴</p> : null
}

function renderReminder(lastExternalBackupAt: string | null): void {
  mockApi({ 'backup.status': () => ({ lastExternalBackupAt, backupCount: 3 }) })
  renderWithProviders(
    <Routes>
      <Route
        path="/"
        element={
          <>
            <BackupReminder today={TODAY} />
            <Loaded />
          </>
        }
      />
      <Route path="/settings" element={<p>설정 화면</p>} />
    </Routes>
  )
}

describe('외부 백업 안내', () => {
  beforeEach(() => localStorage.clear())

  it('30일이 지나면 마지막 외부 백업 날짜와 함께 보인다', async () => {
    renderReminder('2026-08-25T01:00:00.000Z')
    expect(await screen.findByText('34일 전')).toBeInTheDocument()
  })

  it('한 번도 외부 백업을 안 했으면 "없음"으로 보인다', async () => {
    renderReminder(null)
    expect(await screen.findByText('없음')).toBeInTheDocument()
  })

  it('최근에 백업했으면 보이지 않는다', async () => {
    renderReminder('2026-09-20T01:00:00.000Z')
    await screen.findByText('불러옴')
    expect(screen.queryByText(/마지막 외부 백업/)).not.toBeInTheDocument()
  })

  it('백업하기를 누르면 설정 화면으로 간다', async () => {
    const user = userEvent.setup()
    renderReminder(null)
    await user.click(await screen.findByRole('button', { name: '백업하기' }))
    expect(screen.getByText('설정 화면')).toBeInTheDocument()
  })

  it('닫으면 오늘 날짜를 기억해 그날은 다시 보이지 않는다', async () => {
    const user = userEvent.setup()
    renderReminder(null)
    await user.click(await screen.findByRole('button', { name: '오늘은 닫기' }))
    expect(screen.queryByText(/마지막 외부 백업/)).not.toBeInTheDocument()
    expect(localStorage.getItem(REMINDER_DISMISSED_KEY)).toBe(TODAY)
  })

  it('오늘 이미 닫았으면 처음부터 보이지 않는다', async () => {
    localStorage.setItem(REMINDER_DISMISSED_KEY, TODAY)
    renderReminder(null)
    await screen.findByText('불러옴')
    expect(screen.queryByText(/마지막 외부 백업/)).not.toBeInTheDocument()
  })
})
