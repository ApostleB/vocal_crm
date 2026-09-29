import { Anchor, Badge, Box, Button, Center, Group, Loader, Menu, Paper, Stack, Text, Title } from '@mantine/core'
import { IconChevronDown, IconChevronLeft, IconPlus } from '@tabler/icons-react'
import { Link, useParams } from 'react-router'
import type { CustomerDetail, CustomerStatus } from '@shared/types'
import { formatMonthDay } from '@shared/domain/dates'
import { STATUS_LABEL } from '@shared/domain/labels'
import { useApiMutation, useCustomerDetail } from '../api/hooks'
import { GoalsSection } from '../components/customer/GoalsSection'
import { InfoSection } from '../components/customer/InfoSection'
import { PassesSection } from '../components/customer/PassesSection'
import { PinnedNoteSection } from '../components/customer/PinnedNoteSection'
import { Timeline } from '../components/customer/Timeline'
import { confirm } from '../lib/confirm'
import { todayString } from '../lib/today'
import { useAppModals } from '../modals/AppModals'

const STATUS_COLOR: Record<CustomerStatus, string> = { active: 'teal', paused: 'orange', ended: 'gray', moved: 'gray' }

/** 현재 상태에서 바꿀 수 있는 상태 */
const NEXT_STATUSES: Record<CustomerStatus, CustomerStatus[]> = {
  active: ['paused', 'ended', 'moved'],
  paused: ['active', 'ended', 'moved'],
  ended: ['active'],
  moved: ['active']
}
const MENU_LABEL: Record<CustomerStatus, string> = {
  active: '수강중으로 (재등록)',
  paused: '휴강',
  ended: '종료',
  moved: '타지점 이동'
}

export function CustomerDetailPage(): React.JSX.Element {
  const { id } = useParams()
  const detail = useCustomerDetail(id)
  if (detail.isPending) {
    return (
      <Center h={300}>
        <Loader />
      </Center>
    )
  }
  if (!detail.data) {
    return (
      <Stack align="center" py="xl">
        <Text>고객을 찾을 수 없습니다.</Text>
        <Anchor component={Link} to="/">
          홈으로
        </Anchor>
      </Stack>
    )
  }
  return <DetailView key={detail.data.customer.id} detail={detail.data} />
}

function DetailView({ detail }: { detail: CustomerDetail }): React.JSX.Element {
  const { customer } = detail
  const today = todayString()
  const { openLesson, openReservation, openCustomerForm, openStatusChange } = useAppModals()
  const cancel = useApiMutation('reservations.cancel')
  const next = detail.nextReservation

  const cancelNext = async (): Promise<void> => {
    if (!next) return
    const ok = await confirm({
      title: '예약 취소',
      message: `${formatMonthDay(next.date)} ${next.time} 예약을 취소할까요?`,
      confirmLabel: '예약 취소',
      danger: true
    })
    if (ok) cancel.mutate([next.id])
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="sm">
          <Anchor component={Link} to="/" c="dimmed" size="sm">
            <Group gap={2}>
              <IconChevronLeft size={16} /> 홈
            </Group>
          </Anchor>
          <Title order={2}>{customer.name}</Title>
          <Menu position="bottom-start">
            <Menu.Target>
              <Badge
                component="button"
                size="lg"
                variant="light"
                color={STATUS_COLOR[customer.status]}
                rightSection={<IconChevronDown size={12} />}
                style={{ cursor: 'pointer' }}
              >
                {STATUS_LABEL[customer.status]}
              </Badge>
            </Menu.Target>
            <Menu.Dropdown>
              {NEXT_STATUSES[customer.status].map((s) => (
                <Menu.Item
                  key={s}
                  onClick={() => openStatusChange({ customer, toStatus: s, remainingPasses: detail.remainingPasses })}
                >
                  {MENU_LABEL[s]}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Group>
        <Group gap="xs">
          <Button variant="default" onClick={() => openCustomerForm({ customer })}>
            정보 수정
          </Button>
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => openReservation({ customerId: customer.id })}>
            예약
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => openLesson({ customerId: customer.id })}>
            수업 기록
          </Button>
        </Group>
      </Group>

      <Group align="flex-start" gap="md" wrap="nowrap">
        <Paper bg="gray.0" p="md" w={310} style={{ flexShrink: 0 }}>
          <Stack gap="lg">
            <InfoSection customer={customer} today={today} />
            <PinnedNoteSection key={customer.pinnedNote} customerId={customer.id} note={customer.pinnedNote} />
            <GoalsSection customerId={customer.id} goals={detail.goals} />
            <PassesSection
              customerId={customer.id}
              passes={detail.passes}
              totalPassCount={detail.totalPassCount}
              remainingPasses={detail.remainingPasses}
            />
          </Stack>
        </Paper>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Paper withBorder p="sm" mb="md" style={{ borderStyle: 'dashed', borderColor: 'var(--mantine-color-blue-4)' }}>
            {next ? (
              <Group justify="space-between">
                <Text c="blue" fw={600}>
                  다음 예약 · {next.date === today ? '오늘' : formatMonthDay(next.date)} {next.time}
                </Text>
                <Group gap="xs">
                  <Anchor size="sm" onClick={() => openReservation({ reservation: next })}>
                    변경
                  </Anchor>
                  <Anchor size="sm" c="red" onClick={() => void cancelNext()}>
                    취소
                  </Anchor>
                </Group>
              </Group>
            ) : (
              <Group justify="space-between">
                <Text c="dimmed">다음 예약 없음</Text>
                <Anchor size="sm" onClick={() => openReservation({ customerId: customer.id })}>
                  예약하기
                </Anchor>
              </Group>
            )}
          </Paper>
          <Timeline timeline={detail.timeline} goals={detail.goals} />
        </Box>
      </Group>
    </Stack>
  )
}
