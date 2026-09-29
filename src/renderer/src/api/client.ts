import type { ArgsOf, Channel, ResultOf } from '@shared/api'
import { AppError } from '@shared/result'

/** Main 프로세스 호출. 실패하면 AppError 를 던진다 */
export async function call<C extends Channel>(channel: C, ...args: ArgsOf<C>): Promise<ResultOf<C>> {
  const res = await window.api.invoke(channel, ...args)
  if (!res.ok) throw new AppError(res.error.code, res.error.message)
  return res.data
}
