import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingPage } from '@renderer/pages/OnboardingPage'
import { mockApi, renderWithProviders } from './render'

describe('OnboardingPage', () => {
  it('지점 이름을 입력하면 저장한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'settings.update': () => ({ branchName: '강남점', lessonMinutes: 60 }) })
    renderWithProviders(<OnboardingPage />)
    const button = screen.getByRole('button', { name: '시작하기' })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText('지점 이름'), '강남점')
    await user.click(button)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('settings.update', { branchName: '강남점' }))
  })
})
