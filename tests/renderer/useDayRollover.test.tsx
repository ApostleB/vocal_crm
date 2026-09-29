import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDayRollover } from '@renderer/lib/useDayRollover'

function TestComponent(): React.JSX.Element {
  useDayRollover()
  return <div />
}

describe('useDayRollover', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 8, 28, 23, 59, 30))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('자정을 넘기면 한 번만 invalidateQueries 를 부르고, 같은 날에는 다시 부르지 않는다', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>
    )

    vi.advanceTimersByTime(60_000)
    expect(invalidateQueries).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000)
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
  })
})
