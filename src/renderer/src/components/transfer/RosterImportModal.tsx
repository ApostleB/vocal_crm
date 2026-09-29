import { useState } from 'react'
import { Button, Checkbox, Group, Modal, ScrollArea, Stack, Table, Text } from '@mantine/core'
import { PURPOSE_LABEL } from '@shared/domain/labels'
import { formatPhone } from '@shared/domain/phone'
import type { RosterPreview } from '@shared/transferTypes'
import { useApiMutation } from '../../api/hooks'
import { notifySuccess } from '../../lib/notify'

/** 엑셀 명단 미리보기: 행마다 추가(기본) / 건너뛰기. 이름 없는 행은 추가할 수 없다 */
export function RosterImportModal({ preview, onClose }: { preview: RosterPreview; onClose: () => void }): React.JSX.Element {
  const apply = useApiMutation('excel.applyRoster')
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(preview.rows.filter((r) => r.input !== null).map((r) => r.rowNumber))
  )
  const toggle = (row: number): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(row)) next.delete(row)
      else next.add(row)
      return next
    })

  const submit = async (): Promise<void> => {
    let result: { added: number }
    try {
      result = await apply.mutateAsync([preview.token, [...selected].sort((a, b) => a - b)])
    } catch {
      return
    }
    notifySuccess(`${result.added}명을 등록했습니다.`)
    onClose()
  }

  return (
    <Modal opened onClose={onClose} size="70rem" title={<Text fw={700}>엑셀 명단 등록 · {preview.rows.length}행</Text>}>
      <Stack gap="sm">
        {preview.rows.length === 0 ? (
          <Text c="dimmed">등록할 행이 없습니다. 양식의 2번째 줄부터 입력했는지 확인해 주세요.</Text>
        ) : (
          <ScrollArea.Autosize mah={480}>
            <Table verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={60}>추가</Table.Th>
                  <Table.Th w={50}>행</Table.Th>
                  <Table.Th>이름</Table.Th>
                  <Table.Th>연락처</Table.Th>
                  <Table.Th>목적</Table.Th>
                  <Table.Th>확인할 점</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {preview.rows.map((r) => (
                  <Table.Tr key={r.rowNumber}>
                    <Table.Td>
                      <Checkbox
                        aria-label={`${r.rowNumber}행 추가`}
                        disabled={r.input === null}
                        checked={selected.has(r.rowNumber)}
                        onChange={() => toggle(r.rowNumber)}
                      />
                    </Table.Td>
                    <Table.Td>{r.rowNumber}</Table.Td>
                    <Table.Td fw={600}>{r.input?.name ?? '–'}</Table.Td>
                    <Table.Td>{r.input?.phone ? formatPhone(r.input.phone) : '–'}</Table.Td>
                    <Table.Td>{r.input?.purpose ? PURPOSE_LABEL[r.input.purpose] : '–'}</Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        {r.errors.map((e) => (
                          <Text key={e} size="xs" c="red">
                            {e}
                          </Text>
                        ))}
                        {r.warnings.map((w) => (
                          <Text key={w} size="xs" c="orange">
                            {w}
                          </Text>
                        ))}
                        {r.similar.length > 0 && (
                          <Text size="xs" c="blue">
                            이미 있는 고객과 이름·연락처가 같습니다: {r.similar.map((h) => h.name).join(', ')}
                          </Text>
                        )}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            취소
          </Button>
          <Button disabled={selected.size === 0} loading={apply.isPending} onClick={() => void submit()}>
            {selected.size}명 등록
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
