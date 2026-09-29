import { notifications } from '@mantine/notifications'
import { UNKNOWN_ERROR_MESSAGE } from '@shared/result'

export function notifySuccess(message: string): void {
  notifications.show({ color: 'teal', message })
}

export function notifyError(error: unknown): void {
  const message = error instanceof Error && error.name === 'AppError' ? error.message : UNKNOWN_ERROR_MESSAGE
  notifications.show({ color: 'red', title: '저장하지 못했습니다', message })
}
