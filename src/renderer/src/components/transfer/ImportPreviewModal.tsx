import { useState } from 'react'
import { Alert, Badge, Button, Group, Modal, ScrollArea, Select, Stack, Table, Text } from '@mantine/core'
import type { HintCustomer } from '@shared/domain/merge'
import { formatPhone } from '@shared/domain/phone'
import type { ImportDecision, ImportPreview, ImportResult } from '@shared/transferTypes'
import { useApiMutation, useCustomers } from '../../api/hooks'

/** 처리 방법 값: 'new' | 'skip' | 'merge:<고객 id>' */
type Choice = string | null

export function toDecision(incomingId: string, choice: string): ImportDecision {
  if (choice === 'new') return { incomingId, action: 'new' }
  if (choice === 'skip') return { incomingId, action: 'skip' }
  return { incomingId, action: 'merge', targetId: choice.slice('merge:'.length) }
}

const who = (h: HintCustomer): string => [h.name, h.phone ? formatPhone(h.phone) : null].filter(Boolean).join(' · ')

/** .vcrm 가져오기 미리보기: 고객마다 신규 추가 / 합치기 / 건너뛰기를 직접 고른다 (설계 5.8) */
export function ImportPreviewModal({ preview, onClose }: { preview: ImportPreview; onClose: () => void }): React.JSX.Element {
  const customers = useCustomers()
  const apply = useApiMutation('transfer.applyVcrm')
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(preview.rows.map((r) => [r.incomingId, null]))
  )
  const [result, setResult] = useState<ImportResult | null>(null)
  const set = (id: string, choice: Choice): void => setChoices((c) => ({ ...c, [id]: choice }))

  const options = [
    { value: 'new', label: '신규 추가' },
    { value: 'skip', label: '건너뛰기' },
    ...(customers.data ?? []).map((c) => ({
      value: `merge:${c.id}`,
      label: `합치기 → ${[c.name, c.phone ? formatPhone(c.phone) : null].filter(Boolean).join(' · ')}`
    }))
  ]
  const pending = preview.rows.filter((r) => !choices[r.incomingId]).length
  const withSame = preview.rows.filter((r) => r.same.length > 0)

  const mergeAllSame = (): void =>
    setChoices((c) => ({ ...c, ...Object.fromEntries(withSame.map((r) => [r.incomingId, `merge:${r.same[0].id}`])) }))
  const restAsNew = (): void =>
    setChoices((c) => Object.fromEntries(Object.entries(c).map(([id, v]) => [id, v ?? 'new'])))

  const submit = async (): Promise<void> => {
    const decisions = preview.rows.map((r) => toDecision(r.incomingId, choices[r.incomingId] as string))
    try {
      setResult(await apply.mutateAsync([preview.token, decisions]))
    } catch {
      return
    }
  }

  if (result) {
    return (
      <Modal opened onClose={onClose} title={<Text fw={700}>가져오기 완료</Text>}>
        <Stack>
          <Text>
            신규 {result.added}명, 합침 {result.merged}명, 건너뜀 {result.skipped}명
          </Text>
          <Group justify="flex-end">
            <Button onClick={onClose}>닫기</Button>
          </Group>
        </Stack>
      </Modal>
    )
  }

  return (
    <Modal
      opened
      onClose={onClose}
      size="80rem"
      title={
        <Text fw={700}>
          {preview.sourceBranch}에서 보낸 파일 · 고객 {preview.rows.length}명
        </Text>
      }
    >
      <Stack gap="sm">
        <Group gap="xs">
          <Text size="sm" fw={600}>
            한 번에 지정:
          </Text>
          <Button size="compact-sm" variant="light" disabled={withSame.length === 0} onClick={mergeAllSame}>
            🔗 같은 고객 힌트가 있는 고객({withSame.length}) → 그 고객에 합치기
          </Button>
          <Button size="compact-sm" variant="light" disabled={pending === 0} onClick={restAsNew}>
            선택 안 된 나머지 → 신규 추가
          </Button>
        </Group>
        <ScrollArea.Autosize mah={480}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w="26%">가져올 고객</Table.Th>
                <Table.Th w="38%">이 PC 에서 찾은 비슷한 고객</Table.Th>
                <Table.Th>처리 방법</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {preview.rows.map((r) => (
                <Table.Tr key={r.incomingId}>
                  <Table.Td>
                    <Text fw={600}>
                      {r.name}
                      {r.phone ? ` ${formatPhone(r.phone)}` : ''}
                    </Text>
                    <Text size="xs" c="dimmed">
                      회차 기록 {r.lessonCount}건 · 목표 {r.goalCount}개 · 수강권 {r.passCount}건
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      {r.same.map((h) => (
                        <Group key={h.id} gap={6}>
                          <Badge variant="light" color="blue">
                            🔗 같은 고객
                          </Badge>
                          <Text size="sm">{who(h)}</Text>
                        </Group>
                      ))}
                      {r.similar.map((h) => (
                        <Group key={h.id} gap={6}>
                          <Badge variant="light" color="orange">
                            이름·연락처 같음
                          </Badge>
                          <Text size="sm">{who(h)}</Text>
                          <Button size="compact-xs" variant="subtle" onClick={() => set(r.incomingId, `merge:${h.id}`)}>
                            이 고객에 합치기
                          </Button>
                        </Group>
                      ))}
                      {r.same.length === 0 && r.similar.length === 0 && (
                        <Text size="sm" c="dimmed">
                          비슷한 고객 없음
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      aria-label={`${r.name} 처리 방법`}
                      placeholder="선택하세요"
                      searchable
                      data={options}
                      value={choices[r.incomingId]}
                      onChange={(v) => set(r.incomingId, v)}
                      error={choices[r.incomingId] ? undefined : true}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        {pending > 0 && (
          <Alert color="orange" variant="light" p="xs">
            아직 처리 방법을 고르지 않은 고객이 {pending}명 있습니다.
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            취소
          </Button>
          <Button disabled={pending > 0} loading={apply.isPending} onClick={() => void submit()}>
            적용하기
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
