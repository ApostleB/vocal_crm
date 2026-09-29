import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@renderer/App'

// App.tsx 의 queryClient 는 모듈 전역이라 App.test.tsx 와 같은 파일에서 여러 케이스를 두면
// 뮤테이션 오류 알림 등 전역 상태가 테스트 사이에 새어 나간다. 그래서 별도 파일로 둔다
describe('App - 저장 뒤 재조회 실패', () => {
  it('이미 화면이 떠 있으면 재조회 한 번 실패로 오류 화면이 되지 않는다', async () => {
    const user = userEvent.setup()
    // 설정 화면 자체도 useSettings 를 다시 구독하므로 화면을 옮기기만 해도 배경 재조회가 한 번 일어난다.
    // 그건 성공해야 하고, "지금 백업" 으로 invalidateQueries 된 뒤의 재조회만 실패해야 한다
    let breakSettingsAfterMutation = false
    let settingsFailureSeen = false
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'settings.get') {
        if (breakSettingsAfterMutation) {
          settingsFailureSeen = true
          return { ok: false, error: { code: 'DB_ERROR', message: '조회 실패' } }
        }
        return { ok: true, data: { branchName: '강남점', lessonMinutes: 60 } }
      }
      if (channel === 'backup.create') {
        breakSettingsAfterMutation = true
        return { ok: true, data: { fileName: 'x', kind: 'manual', createdAt: '2026-09-28 10:00:00', size: 1 } }
      }
      if (channel === 'backup.status') return { ok: true, data: { lastExternalBackupAt: null, backupCount: 0 } }
      if (channel === 'backup.list') return { ok: true, data: [] }
      if (channel === 'app.info') return { ok: true, data: { version: '0.1.0', dataDir: 'C:\\data' } }
      if (channel === 'home.get') {
        return {
          ok: true,
          data: {
            today: '2026-09-28',
            stats: { active: 0, today: 0, unbooked: 0, passExhausted: 0 },
            todayReservations: [],
            missedReservations: [],
            unbooked: [],
            customers: []
          }
        }
      }
      return { ok: true, data: null }
    })
    window.api = { invoke } as unknown as Window['api']
    render(<App />)

    await user.click(await screen.findByRole('link', { name: '설정·백업' }))
    await user.click(await screen.findByRole('button', { name: '지금 백업' }))
    await waitFor(() => expect(settingsFailureSeen).toBe(true))

    expect(screen.queryByText('데이터를 불러오지 못했습니다.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '설정·백업' })).toBeInTheDocument()
  })
})
