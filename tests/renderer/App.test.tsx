import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@renderer/App'

describe('App', () => {
  it('설정을 불러오지 못하면 로딩에 멈추지 않고 다시 시도할 수 있다', async () => {
    const user = userEvent.setup()
    let fail = true
    const invoke = vi.fn(async () =>
      fail
        ? { ok: false, error: { code: 'DB_ERROR', message: '저장하지 못했습니다. 다시 시도해 주세요.' } }
        : { ok: true, data: { branchName: null, lessonMinutes: 60 } }
    )
    window.api = { invoke } as unknown as Window['api']
    render(<App />)
    expect(await screen.findByText('데이터를 불러오지 못했습니다.')).toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(screen.getByLabelText('지점 이름')).toBeInTheDocument())
  })
})
