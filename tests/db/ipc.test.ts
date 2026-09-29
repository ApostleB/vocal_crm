import { describe, expect, it, vi } from 'vitest'
import { CHANNELS } from '@shared/api'
import { createHandlers } from '@main/ipc/handlers'
import { invokeHandler } from '@main/ipc/invoke'
import { createTestDb, customerInput, NOW } from '../support/db'

describe('ipc handlers', () => {
  it('모든 채널에 처리 함수가 있다', () => {
    const handlers = createHandlers(createTestDb(), () => NOW)
    for (const channel of CHANNELS) expect(typeof handlers[channel]).toBe('function')
  })

  it('성공은 ok:true, AppError 는 메시지를 그대로, 그 밖의 오류는 일반 메시지', async () => {
    const handlers = createHandlers(createTestDb(), () => NOW)
    const logError = vi.fn()
    const created = await invokeHandler(handlers, 'customers.create', [customerInput()], logError)
    expect(created.ok).toBe(true)

    const invalid = await invokeHandler(handlers, 'customers.create', [customerInput({ name: '' })], logError)
    expect(invalid).toEqual({ ok: false, error: { code: 'VALIDATION', message: '이름을 입력해 주세요.' } })

    const broken = await invokeHandler(handlers, 'customers.detail', [undefined], logError)
    expect(broken.ok).toBe(true)

    const crash = await invokeHandler(
      { ...handlers, 'home.get': () => { throw new Error('boom') } },
      'home.get',
      [],
      logError
    )
    expect(crash).toEqual({
      ok: false,
      error: { code: 'UNKNOWN', message: '처리 중 오류가 발생했습니다. 다시 시도해 주세요.' }
    })
    expect(logError).toHaveBeenCalledTimes(2)
  })

  it('home.get 은 clock 의 날짜를 오늘로 쓴다', async () => {
    const handlers = createHandlers(createTestDb(), () => NOW)
    const home = await handlers['home.get']()
    expect(home.today).toBe('2026-09-28')
  })
})
