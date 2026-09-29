import type { ArgsOf, Channel, ResultOf } from '@shared/api'
import type { Result } from '@shared/result'

declare global {
  interface Window {
    api: {
      invoke<C extends Channel>(channel: C, ...args: ArgsOf<C>): Promise<Result<ResultOf<C>>>
    }
  }
}

export {}
