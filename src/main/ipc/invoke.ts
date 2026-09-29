import type { Channel } from '@shared/api'
import { toErrorPayload, type Result } from '@shared/result'
import type { Handlers } from './handlers'

/** 처리 함수를 호출해 Result 로 감싼다. 예외는 기록하고 사용자용 메시지로 바꾼다 */
export async function invokeHandler(
  handlers: Handlers,
  channel: Channel,
  args: unknown[],
  logError: (err: unknown) => void = (err) => console.error(err)
): Promise<Result<unknown>> {
  const handler = handlers[channel] as ((...a: unknown[]) => unknown) | undefined
  if (!handler) return { ok: false, error: { code: 'NO_CHANNEL', message: `알 수 없는 요청: ${channel}` } }
  try {
    return { ok: true, data: await handler(...args) }
  } catch (err) {
    logError(err)
    return { ok: false, error: toErrorPayload(err) }
  }
}
