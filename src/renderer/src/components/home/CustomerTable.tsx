import { useMemo, useState } from 'react'
import { Group, Paper, Progress, SegmentedControl, Table, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronUp, IconSearch } from '@tabler/icons-react'
import { useNavigate } from 'react-router'
import type { CustomerSummary } from '@shared/types'
import { filterCustomers, sortCustomers, type SortDir, type SortKey, type StatusFilter } from '@shared/domain/customerList'
import { daysBetween, formatMonthDay, relativeDays } from '@shared/domain/dates'
import { PURPOSE_LABEL } from '@shared/domain/labels'
import { formatRemaining, isPassExhausted } from '@shared/domain/passes'
import { PinnedDot } from '../PinnedDot'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: '이름' },
  { key: 'purpose', label: '목적' },
  { key: 'goals', label: '목표 진행' },
  { key: 'lastLesson', label: '최근 수업' },
  { key: 'nextReservation', label: '다음 예약' },
  { key: 'lessonCount', label: '회차' },
  { key: 'remaining', label: '남은 수강권' }
]

export function CustomerTable({ customers, today }: { customers: CustomerSummary[]; today: string }): React.JSX.Element {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<StatusFilter>('active')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })

  const rows = useMemo(
    () => sortCustomers(filterCustomers(customers, filter, query), sort.key, sort.dir),
    [customers, filter, query, sort]
  )

  const toggleSort = (key: SortKey): void =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  return (
    <Paper withBorder p="md">
      <Group mb="sm" gap="sm">
        <Text fw={700} mr="xs">
          전체 고객
        </Text>
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={setFilter}
          data={[
            { value: 'active', label: '수강중' },
            { value: 'paused', label: '휴강' },
            { value: 'closed', label: '종료·이동' },
            { value: 'all', label: '전체' }
          ]}
        />
        <TextInput
          size="xs"
          style={{ flex: 1 }}
          leftSection={<IconSearch size={14} />}
          placeholder="이름 · 연락처 검색"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      </Group>
      <Table highlightOnHover verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            {COLUMNS.map((col) => (
              <Table.Th key={col.key}>
                <UnstyledButton onClick={() => toggleSort(col.key)}>
                  <Group gap={2} wrap="nowrap">
                    <Text size="xs" c="dimmed" fw={500}>
                      {col.label}
                    </Text>
                    {sort.key === col.key &&
                      (sort.dir === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />)}
                  </Group>
                </UnstyledButton>
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={COLUMNS.length}>
                <Text c="dimmed" size="sm" ta="center" py="md">
                  해당하는 고객이 없습니다.
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
          {rows.map((c) => {
            const stale = c.lastLessonDate !== null && daysBetween(c.lastLessonDate, today) >= 14
            return (
              <Table.Tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => void navigate(`/customers/${c.id}`)}>
                <Table.Td>
                  <Text span fw={600}>
                    {c.name}
                  </Text>
                  <PinnedDot note={c.pinnedNote} />
                </Table.Td>
                <Table.Td>{c.purpose ? PURPOSE_LABEL[c.purpose] : '–'}</Table.Td>
                <Table.Td>
                  {c.goalsTotal === 0 ? (
                    <Text size="xs" c="dimmed">
                      –
                    </Text>
                  ) : (
                    <Group gap={6} wrap="nowrap">
                      <Progress value={(c.goalsDone / c.goalsTotal) * 100} w={70} size="sm" />
                      <Text size="xs" c="dimmed">
                        {c.goalsDone}/{c.goalsTotal}
                      </Text>
                    </Group>
                  )}
                </Table.Td>
                <Table.Td c={stale ? 'red' : undefined}>
                  {c.lastLessonDate ? relativeDays(c.lastLessonDate, today) : '–'}
                </Table.Td>
                <Table.Td>
                  {c.nextReservation ? (
                    `${c.nextReservation.date === today ? '오늘' : formatMonthDay(c.nextReservation.date)} ${c.nextReservation.time}`
                  ) : c.status === 'active' ? (
                    <Text size="xs" c="red" fw={600}>
                      예약 없음
                    </Text>
                  ) : (
                    '–'
                  )}
                </Table.Td>
                <Table.Td>{c.lessonCount > 0 ? `${c.lessonCount}회차` : '–'}</Table.Td>
                <Table.Td c={isPassExhausted(c.remainingPasses) ? 'red' : undefined} fw={isPassExhausted(c.remainingPasses) ? 600 : undefined}>
                  {formatRemaining(c.remainingPasses)}
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Paper>
  )
}
