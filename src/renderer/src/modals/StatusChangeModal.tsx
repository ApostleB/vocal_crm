import { useState } from 'react'
import { Alert, Button, Group, Modal, SegmentedControl, Stack, Text, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import type { Customer, CustomerStatus } from '@shared/types'
import { END_REASONS, withEuro } from '@shared/domain/labels'
import { formatRemaining } from '@shared/domain/passes'
import { useApiMutation, useOpenReservationCount } from '../api/hooks'
import { notifySuccess } from '../lib/notify'
import { todayString } from '../lib/today'

export interface StatusTarget {
  customer: Customer
  toStatus: CustomerStatus
  remainingPasses: number | null
}

const TITLE: Record<CustomerStatus, string> = {
  active: '재등록 (수강중으로)',
  paused: '휴강 처리',
  ended: '수강 종료',
  moved: '타지점 이동'
}

export function StatusChangeModal({
  customer,
  toStatus,
  remainingPasses,
  onClose
}: StatusTarget & { onClose: () => void }): React.JSX.Element {
  const [date, setDate] = useState(todayString())
  const [endReason, setEndReason] = useState<string>(END_REASONS[0])
  const [memo, setMemo] = useState('')
  const [pauseUntil, setPauseUntil] = useState<string | null>(null)
  const [branch, setBranch] = useState('')
  const openCount = useOpenReservationCount(customer.id)
  const change = useApiMutation('customers.changeStatus')
  const closing = toStatus === 'ended' || toStatus === 'moved'

  const reason = (): string | null => {
    if (toStatus === 'ended') return memo.trim() ? `${endReason} · ${memo.trim()}` : endReason
    if (toStatus === 'moved') return branch.trim() ? `${withEuro(branch.trim())} 이동` : null
    return memo.trim() || null
  }

  const submit = async (): Promise<void> => {
    let result: { canceledReservations: number }
    try {
      result = await change.mutateAsync([
        { customerId: customer.id, toStatus, date, reason: reason(), pauseUntil: toStatus === 'paused' ? pauseUntil : null }
      ])
    } catch {
      return
    }
    const canceled = result.canceledReservations > 0 ? ` 예약 ${result.canceledReservations}건을 취소했습니다.` : ''
    notifySuccess(`${customer.name} 님: ${TITLE[toStatus]} 완료.${canceled}`)
    onClose()
  }

  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>{`${customer.name} 님 ${TITLE[toStatus]}`}</Text>}>
      <Stack gap="sm">
        <DatePickerInput label="날짜" valueFormat="YYYY-MM-DD" value={date} onChange={(v) => v && setDate(v)} />

        {toStatus === 'ended' && (
          <div>
            <Text size="sm" fw={500} mb={3}>
              사유
            </Text>
            <SegmentedControl fullWidth value={endReason} onChange={setEndReason} data={[...END_REASONS]} />
          </div>
        )}
        {toStatus === 'moved' && (
          <TextInput label="이동할 지점 (선택)" placeholder="예: 홍대점" value={branch} onChange={(e) => setBranch(e.currentTarget.value)} />
        )}
        {toStatus === 'paused' && (
          <DatePickerInput
            label="휴강 종료 예정일 (선택)"
            clearable
            valueFormat="YYYY-MM-DD"
            value={pauseUntil}
            onChange={setPauseUntil}
          />
        )}
        {toStatus !== 'moved' && (
          <TextInput label="메모 (선택)" value={memo} onChange={(e) => setMemo(e.currentTarget.value)} />
        )}

        {closing && (openCount.data ?? 0) > 0 && (
          <Alert color="orange" variant="light">
            잡혀 있는 예약 {openCount.data}건을 함께 취소합니다.
          </Alert>
        )}
        {closing && remainingPasses !== null && (
          <Text size="sm" c="dimmed">
            ℹ 남은 수강권 {formatRemaining(remainingPasses)} (참고용)
          </Text>
        )}
        {toStatus === 'paused' && (
          <Text size="sm" c="dimmed">
            홈 화면 목록에서 빠지고, 잡혀 있는 예약은 그대로 둡니다.
          </Text>
        )}

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            취소
          </Button>
          <Button color={closing ? 'red' : undefined} onClick={() => void submit()} loading={change.isPending}>
            {TITLE[toStatus]}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
