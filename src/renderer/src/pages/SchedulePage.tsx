import { useState } from 'react'
import { Box, Button, Group, Menu, Paper, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react'
import { useNavigate } from 'react-router'
import type { ReservationWithCustomer } from '@shared/types'
import { addDays, formatMonthDay, startOfWeek } from '@shared/domain/dates'
import { useApiMutation, useReservationsRange } from '../api/hooks'
import { confirm } from '../lib/confirm'
import { todayString } from '../lib/today'
import { useAppModals } from '../modals/AppModals'

type Tone = 'scheduled' | 'done' | 'missed' | 'canceled'

const TONE_STYLE: Record<Tone, { bg: string; border: string; color?: string; strike?: boolean }> = {
  scheduled: { bg: 'var(--mantine-color-blue-0)', border: 'var(--mantine-color-blue-5)' },
  done: { bg: 'var(--mantine-color-gray-0)', border: 'var(--mantine-color-teal-5)', color: 'var(--mantine-color-dimmed)' },
  missed: { bg: 'var(--mantine-color-red-0)', border: 'var(--mantine-color-red-5)' },
  canceled: { bg: 'transparent', border: 'var(--mantine-color-gray-3)', color: 'var(--mantine-color-gray-5)', strike: true }
}

function toneOf(item: ReservationWithCustomer, today: string): Tone {
  const r = item.reservation
  if (r.status === 'done') return 'done'
  if (r.status === 'canceled') return 'canceled'
  return r.date < today ? 'missed' : 'scheduled'
}

function weekTitle(start: string): string {
  const end = addDays(start, 6)
  const [y, m, d] = start.split('-').map(Number)
  const [, m2, d2] = end.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일 – ${m2}월 ${d2}일`
}

export function SchedulePage(): React.JSX.Element {
  const today = todayString()
  const [weekStart, setWeekStart] = useState(startOfWeek(today))
  const weekEnd = addDays(weekStart, 6)
  const range = useReservationsRange(weekStart, weekEnd)
  const { openReservation } = useAppModals()
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>일정</Title>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconChevronLeft size={16} />} onClick={() => setWeekStart(addDays(weekStart, -7))}>
            지난주
          </Button>
          <Button variant="default" onClick={() => setWeekStart(startOfWeek(today))}>
            이번 주
          </Button>
          <Button variant="default" rightSection={<IconChevronRight size={16} />} onClick={() => setWeekStart(addDays(weekStart, 7))}>
            다음 주
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => openReservation()}>
            예약
          </Button>
        </Group>
      </Group>
      <Text fw={700} ta="center">
        {weekTitle(weekStart)}
      </Text>
      <Paper withBorder style={{ overflow: 'hidden' }}>
        <SimpleGrid cols={7} spacing={0}>
          {days.map((day) => (
            <Box key={day} style={{ borderRight: '1px solid var(--mantine-color-gray-2)', minHeight: 360 }}>
              <UnstyledButton
                w="100%"
                py={6}
                bg={day === today ? 'blue.0' : undefined}
                style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', textAlign: 'center' }}
                onClick={() => openReservation({ date: day })}
                title="이 날짜로 예약"
              >
                <Text size="sm" fw={day === today ? 700 : 500} c={day === today ? 'blue' : 'dimmed'}>
                  {formatMonthDay(day)}
                  {day === today ? ' · 오늘' : ''}
                </Text>
              </UnstyledButton>
              <Stack gap={4} p={4}>
                {(range.data ?? [])
                  .filter((item) => item.reservation.date === day)
                  .map((item) => (
                    <ReservationChip key={item.reservation.id} item={item} tone={toneOf(item, today)} />
                  ))}
              </Stack>
            </Box>
          ))}
        </SimpleGrid>
        <Group gap="lg" px="md" py="xs" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
          {(
            [
              ['scheduled', '예정'],
              ['done', '기록 완료'],
              ['missed', '지났는데 기록 안 됨'],
              ['canceled', '취소']
            ] as [Tone, string][]
          ).map(([tone, label]) => (
            <Group key={tone} gap={6}>
              <Box w={10} h={10} style={{ borderRadius: 2, background: TONE_STYLE[tone].border }} />
              <Text size="xs" c="dimmed">
                {label}
              </Text>
            </Group>
          ))}
          <Text size="xs" c="dimmed" ml="auto">
            예약을 누르면 수업 기록 / 변경 / 취소
          </Text>
        </Group>
      </Paper>
    </Stack>
  )
}

function ReservationChip({ item, tone }: { item: ReservationWithCustomer; tone: Tone }): React.JSX.Element {
  const navigate = useNavigate()
  const { openLesson, openReservation } = useAppModals()
  const cancel = useApiMutation('reservations.cancel')
  const r = item.reservation
  const style = TONE_STYLE[tone]
  const open = r.status === 'scheduled'

  const handleCancel = async (): Promise<void> => {
    const ok = await confirm({
      title: '예약 취소',
      message: `${formatMonthDay(r.date)} ${r.time} ${item.customerName} 예약을 취소할까요?`,
      confirmLabel: '예약 취소',
      danger: true
    })
    if (ok) cancel.mutate([r.id])
  }

  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <UnstyledButton
          px={6}
          py={4}
          style={{
            background: style.bg,
            borderLeft: `3px solid ${style.border}`,
            borderRadius: 6,
            color: style.color,
            textDecoration: style.strike ? 'line-through' : undefined
          }}
        >
          <Text size="xs" inherit>
            <Text span fw={700} ff="monospace" inherit>
              {r.time}
            </Text>{' '}
            {item.customerName}
            {r.status === 'done' ? ' ✓' : ''}
          </Text>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {open && (
          <Menu.Item onClick={() => openLesson({ customerId: r.customerId, reservationId: r.id, date: r.date })}>
            수업 기록
          </Menu.Item>
        )}
        {open && <Menu.Item onClick={() => openReservation({ reservation: r })}>변경</Menu.Item>}
        {open && (
          <Menu.Item color="red" onClick={() => void handleCancel()}>
            취소
          </Menu.Item>
        )}
        <Menu.Item onClick={() => void navigate(`/customers/${r.customerId}`)}>고객 보기</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
