import { render, type RenderResult } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi, type Mock } from 'vitest'
import type { Channel } from '@shared/api'

type Responses = Partial<Record<Channel, (...args: unknown[]) => unknown>>

/** window.api.invoke 를 가짜로 바꾼다. 응답이 없는 채널은 undefined 를 돌려준다 */
export function mockApi(responses: Responses): Mock {
  const invoke = vi.fn(async (channel: Channel, ...args: unknown[]) => ({
    ok: true,
    data: responses[channel]?.(...args)
  }))
  window.api = { invoke } as unknown as Window['api']
  return invoke
}

/** 앱과 같은 Provider 로 감싸서 그린다. route/path 를 주면 그 주소의 Route 로 그린다 */
export function renderWithProviders(ui: React.ReactNode, options: { route?: string; path?: string } = {}): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const content = options.path ? (
    <Routes>
      <Route path={options.path} element={ui} />
    </Routes>
  ) : (
    ui
  )
  return render(
    <MantineProvider>
      <DatesProvider settings={{ locale: 'ko', firstDayOfWeek: 1 }}>
        <QueryClientProvider client={queryClient}>
          <ModalsProvider>
            <MemoryRouter initialEntries={[options.route ?? '/']}>{content}</MemoryRouter>
          </ModalsProvider>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  )
}
