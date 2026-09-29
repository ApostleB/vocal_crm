import { Button, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { formatKoreanDate } from '@shared/domain/dates'
import { useHome } from '../api/hooks'
import { CustomerTable } from '../components/home/CustomerTable'
import { StatsRow } from '../components/home/StatsRow'
import { TodayPanel } from '../components/home/TodayPanel'
import { UnbookedPanel } from '../components/home/UnbookedPanel'
import { useAppModals } from '../modals/AppModals'

export function HomePage(): React.JSX.Element {
  const home = useHome()
  const { openReservation, openCustomerForm } = useAppModals()
  if (!home.data) {
    return (
      <Center h={300}>
        <Loader />
      </Center>
    )
  }
  const data = home.data
  const pinnedNotes = new Map(data.customers.map((c) => [c.id, c.pinnedNote]))
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="xs" align="baseline">
          <Title order={2}>홈</Title>
          <Text c="dimmed">{formatKoreanDate(data.today)}</Text>
        </Group>
        <Group gap="xs">
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => openReservation()}>
            예약
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => openCustomerForm()}>
            새 고객
          </Button>
        </Group>
      </Group>
      <StatsRow stats={data.stats} />
      <SimpleGrid cols={2} spacing="md">
        <TodayPanel today={data.todayReservations} missed={data.missedReservations} pinnedNotes={pinnedNotes} />
        <UnbookedPanel unbooked={data.unbooked} today={data.today} />
      </SimpleGrid>
      <CustomerTable customers={data.customers} today={data.today} />
    </Stack>
  )
}
