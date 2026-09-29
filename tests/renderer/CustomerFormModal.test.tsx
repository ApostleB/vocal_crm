import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomerFormModal } from '@renderer/modals/CustomerFormModal'
import { makeCustomer } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

describe('CustomerFormModal', () => {
  it('이름이 없으면 저장하지 않고, 연락처는 입력하면서 하이픈이 들어간다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'customers.create': () => makeCustomer({ id: 'new', name: '김민지' }) })
    const onClose = vi.fn()
    renderWithProviders(<CustomerFormModal onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('이름을 입력해 주세요.')).toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalledWith('customers.create', expect.anything())

    await user.type(screen.getByLabelText(/이름/), '김민지')
    await user.type(screen.getByLabelText('연락처'), '01012345678')
    expect(screen.getByLabelText('연락처')).toHaveValue('010-1234-5678')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(invoke).toHaveBeenCalledWith(
      'customers.create',
      expect.objectContaining({ name: '김민지', phone: '010-1234-5678', pinnedNote: '' })
    )
  })
})
