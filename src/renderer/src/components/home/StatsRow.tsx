import { Paper, SimpleGrid, Text } from '@mantine/core'
import type { HomeData } from '@shared/types'

export function StatsRow({ stats }: { stats: HomeData['stats'] }): React.JSX.Element {
  const items = [
    { label: '수강중', value: stats.active, color: undefined },
    { label: '오늘 수업', value: stats.today, color: 'blue' },
    { label: '예약 없음', value: stats.unbooked, color: stats.unbooked > 0 ? 'red' : undefined },
    { label: '수강권 소진', value: stats.passExhausted, color: stats.passExhausted > 0 ? 'red' : undefined }
  ]
  return (
    <SimpleGrid cols={4} spacing="sm">
      {items.map((item) => (
        <Paper key={item.label} withBorder p="sm">
          <Text fz={24} fw={700} c={item.color}>
            {item.value}
          </Text>
          <Text size="xs" c="dimmed">
            {item.label}
          </Text>
        </Paper>
      ))}
    </SimpleGrid>
  )
}
