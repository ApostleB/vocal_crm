export interface ErrorPayload {
  code: string
  message: string
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorPayload }

/** 사용자에게 그대로 보여줄 수 있는 한국어 메시지를 가진 오류 */
export class AppError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AppError'
    this.code = code
  }
}

export const UNKNOWN_ERROR_MESSAGE = '처리 중 오류가 발생했습니다. 다시 시도해 주세요.'

export function toErrorPayload(err: unknown): ErrorPayload {
  if (err instanceof AppError) return { code: err.code, message: err.message }
  return { code: 'UNKNOWN', message: UNKNOWN_ERROR_MESSAGE }
}
