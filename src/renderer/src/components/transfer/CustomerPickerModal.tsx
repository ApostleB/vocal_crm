import { useMemo, useState } from 'react'
import { Button, Checkbox, Group, Modal, ScrollArea, SegmentedControl, Stack, Table, Text, TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import type { CustomerSummary } from '@shared/types'
import { filterCustomers, sortCustomers, type StatusFilter } from '@shared/domain/customerList'
import { relativeDays } from '@shared/domain/dates'
import { PURPOSE_LABEL } from '@shared/domain/labels'
import { useCustomers } from '../../api/hooks'
import { todayString } from '../../lib/today'

interface Props {
  title: string
  confirmLabel: string
  onConfirm: (customers: CustomerSummary[]) => void
  onClose: () => void
}

/** 내보낼 고객 고르기: 상태 필터 + 검색 + 맨 위 체크박스로 지금 보이는 고객 전체 선택 */
export function CustomerPickerModal({ title, confirmLabel, onConfirm, onClose }: Props): React.JSX.Element {
  const customers = useCustomers()
  const [filter, setFilter] = useState<StatusFilter>('active')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const today = todayString()
  const all = customers.data ?? []
  const rows = useMemo(() => sortCustomers(filterCustomers(all, filter, query), 'name', 'asc'), [all, filter, query])
  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someVisibleSelected = rows.some((r) => selected.has(r.id))

  const toggle = (id: string): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAllVisible = (): void =>
    setSelected((s) => {
      const next = new Set(s)
      for (const r of rows) {
        if (allVisibleSelected) next.delete(r.id)
        else next.add(r.id)
      }
      return next
    })

  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>{title}</Text>} size="lg">
      <Stack gap="sm">
        <Group gap="sm">
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
        <ScrollArea.Autosize mah={360}>
          <Table verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={36}>
                  <Checkbox
                    aria-label="보이는 고객 전체 선택"
                    checked={allVisibleSelected}
                    indeterminate={!allVisibleSelected && someVisibleSelected}
                    onChange={toggleAllVisible}
                  />
                </Table.Th>
                <Table.Th>이름</Table.Th>
                <Table.Th>목적</Table.Th>
                <Table.Th>최근 수업</Table.Th>
                <Table.Th>회차</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Checkbox aria-label={`${c.name} 선택`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  </Table.Td>
                  <Table.Td fw={600}>{c.name}</Table.Td>
                  <Table.Td>{c.purpose ? PURPOSE_LABEL[c.purpose] : '–'}</Table.Td>
                  <Table.Td>{c.lastLessonDate ? relativeDays(c.lastLessonDate, today) : '–'}</Table.Td>
                  <Table.Td>{c.lessonCount > 0 ? c.lessonCount : '–'}</Table.Td>
                </Table.Tr>
              ))}
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      해당하는 고객이 없습니다.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            {selected.size}명 선택됨
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              취소
            </Button>
            <Button disabled={selected.size === 0} onClick={() => onConfirm(all.filter((c) => selected.has(c.id)))}>
              {confirmLabel}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
