import { Text } from '@mantine/core'
import { modals } from '@mantine/modals'

interface ConfirmOptions {
  title: string
  message: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
}

/** 확인 창. 확인을 누르면 true, 취소·닫기는 false */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    modals.openConfirmModal({
      title: options.title,
      centered: true,
      children: typeof options.message === 'string' ? <Text size="sm">{options.message}</Text> : options.message,
      labels: { confirm: options.confirmLabel, cancel: options.cancelLabel ?? '취소' },
      confirmProps: options.danger ? { color: 'red' } : undefined,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    })
  })
}

/** 작성 중인 내용이 있을 때 닫기 확인 */
export function confirmDiscard(message = '작성 중인 내용이 있습니다. 닫을까요?'): Promise<boolean> {
  return confirm({ title: '닫기', message, confirmLabel: '닫기', cancelLabel: '계속 작성', danger: true })
}
