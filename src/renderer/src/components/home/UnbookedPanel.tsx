import { Anchor, Button, Group, Paper, ScrollArea, Stack, Text } from '@mantine/core'
import { useNavigate } from 'react-router'
import type { HomeData } from '@shared/types'
import { daysBetween, relativeDays } from '@shared/domain/dates'
import { useAppModals } from '../../modals/AppModals'

export function UnbookedPanel({ unbooked, today }: { unbooked: HomeData['unbooked']; today: string }): React.JSX.Element {
  const navigate = useNavigate()
  const { openReservation } = useAppModals()
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <Text fw={700}>예약 없는 수강생 {unbooked.length}</Text>
        <Text size="xs" c="dimmed">
          마지막 수업 오래된 순
        </Text>
      </Group>
      {unbooked.length === 0 ? (
        <Text size="sm" c="dimmed" py="sm">
          모든 수강생이 예약되어 있습니다.
        </Text>
      ) : (
        <ScrollArea.Autosize mah={260}>
          <Stack gap={0}>
            {unbooked.map((u) => {
              const old = u.lastLessonDate !== null && daysBetween(u.lastLessonDate, today) >= 14
              return (
                <Group key={u.id} py={8} gap="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }} wrap="nowrap">
                  <Anchor fw={600} c="dark" style={{ flex: 1 }} onClick={() => void navigate(`/customers/${u.id}`)}>
                    {u.name}
                  </Anchor>
                  <Text size="xs" c={old ? 'red' : 'dimmed'} fw={old ? 600 : undefined}>
                    {u.lastLessonDate ? `마지막 수업 ${relativeDays(u.lastLessonDate, today)}` : '수업 기록 없음'}
                  </Text>
                  <Button size="compact-sm" variant="light" onClick={() => openReservation({ customerId: u.id })}>
                    예약
                  </Button>
                </Group>
              )
            })}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Paper>
  )
}
