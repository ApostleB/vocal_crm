import { useState } from 'react'
import { Alert, Anchor, Badge, Button, Group, Modal, Paper, Stack, Text } from '@mantine/core'
import { useNavigate } from 'react-router'
import type { ReservationWithCustomer } from '@shared/types'
import { formatMonthDay } from '@shared/domain/dates'
import { isPassExhausted } from '@shared/domain/passes'
import { useApiMutation } from '../../api/hooks'
import { confirm } from '../../lib/confirm'
import { useAppModals } from '../../modals/AppModals'
import { PinnedDot } from '../PinnedDot'

interface Props {
  today: ReservationWithCustomer[]
  missed: ReservationWithCustomer[]
  pinnedNotes: Map<string, string>
}

export function TodayPanel({ today, missed, pinnedNotes }: Props): React.JSX.Element {
  const [showMissed, setShowMissed] = useState(false)
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <Text fw={700}>오늘 수업 {today.length}</Text>
        <Text size="xs" c="dimmed">
          시간순
        </Text>
      </Group>
      {today.length === 0 ? (
        <Text size="sm" c="dimmed" py="sm">
          오늘 예약이 없습니다.
        </Text>
      ) : (
        <Stack gap={0}>
          {today.map((item) => (
            <ReservationRow key={item.reservation.id} item={item} note={pinnedNotes.get(item.reservation.customerId) ?? ''} />
          ))}
        </Stack>
      )}
      {missed.length > 0 && (
        <Alert color="red" variant="light" mt="sm" p="xs">
          <Group justify="space-between">
            <Text size="sm">
              ⚠ 지난 예약 중 기록 안 된 수업 {missed.length}건 ({missed.map((m) => `${formatMonthDay(m.reservation.date)} ${m.customerName}`).slice(0, 2).join(', ')}
              {missed.length > 2 ? ' 외' : ''})
            </Text>
            <Anchor size="sm" c="red" onClick={() => setShowMissed(true)}>
              보기
            </Anchor>
          </Group>
        </Alert>
      )}
      {showMissed && <MissedModal missed={missed} onClose={() => setShowMissed(false)} />}
    </Paper>
  )
}

function ReservationRow({ item, note }: { item: ReservationWithCustomer; note: string }): React.JSX.Element {
  const navigate = useNavigate()
  const { openLesson } = useAppModals()
  const r = item.reservation
  return (
    <Group gap="sm" py={8} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }} wrap="nowrap">
      <Text fw={700} w={48} ff="monospace" size="sm">
        {r.time}
      </Text>
      <Group gap={6} style={{ flex: 1 }} wrap="nowrap">
        <Anchor fw={600} c="dark" onClick={() => void navigate(`/customers/${r.customerId}`)}>
          {item.customerName}
        </Anchor>
        <PinnedDot note={note} />
        {item.lessonNumber !== null && (
          <Text size="xs" c="dimmed">
            {item.lessonNumber}회차
          </Text>
        )}
        {isPassExhausted(item.remainingPasses) && (
          <Text size="xs" c="red" fw={600}>
            수강권 {item.remainingPasses}
          </Text>
        )}
      </Group>
      {r.status === 'done' ? (
        <Badge color="teal" variant="light">
          ✓ 기록됨
        </Badge>
      ) : (
        <Button size="compact-sm" onClick={() => openLesson({ customerId: r.customerId, reservationId: r.id, date: r.date })}>
          수업 기록
        </Button>
      )}
    </Group>
  )
}

function MissedModal({ missed, onClose }: { missed: ReservationWithCustomer[]; onClose: () => void }): React.JSX.Element {
  const { openLesson } = useAppModals()
  const cancel = useApiMutation('reservations.cancel')
  const handleCancel = async (item: ReservationWithCustomer): Promise<void> => {
    const ok = await confirm({
      title: '예약 취소',
      message: `${formatMonthDay(item.reservation.date)} ${item.reservation.time} ${item.customerName} 예약을 취소할까요?`,
      confirmLabel: '예약 취소',
      danger: true
    })
    if (ok) cancel.mutate([item.reservation.id])
  }
  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>기록 안 된 지난 예약</Text>} size="lg">
      <Stack gap={0}>
        {missed.length === 0 && <Text c="dimmed">모두 정리했습니다.</Text>}
        {missed.map((item) => (
          <Group key={item.reservation.id} py={8} justify="space-between" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Text size="sm">
              <Text span fw={700} ff="monospace">
                {formatMonthDay(item.reservation.date)} {item.reservation.time}
              </Text>{' '}
              {item.customerName}
            </Text>
            <Group gap="xs">
              <Button
                size="compact-sm"
                onClick={() => {
                  onClose()
                  openLesson({ customerId: item.reservation.customerId, reservationId: item.reservation.id, date: item.reservation.date })
                }}
              >
                수업 기록
              </Button>
              <Button size="compact-sm" variant="default" onClick={() => void handleCancel(item)}>
                취소
              </Button>
            </Group>
          </Group>
        ))}
      </Stack>
    </Modal>
  )
}
