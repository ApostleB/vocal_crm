import { useState } from 'react'
import { ActionIcon, Anchor, Checkbox, Group, Menu, Progress, Stack, Text, TextInput } from '@mantine/core'
import { IconDots } from '@tabler/icons-react'
import type { Goal } from '@shared/types'
import { useApiMutation } from '../../api/hooks'
import { confirm } from '../../lib/confirm'
import { Section } from './Section'

export function GoalsSection({ customerId, goals }: { customerId: string; goals: Goal[] }): React.JSX.Element {
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const add = useApiMutation('goals.add')
  const setDone = useApiMutation('goals.setDone')
  const rename = useApiMutation('goals.rename')
  const remove = useApiMutation('goals.remove')
  const done = goals.filter((g) => g.doneAt !== null).length

  const submitNew = async (): Promise<void> => {
    if (!newTitle.trim()) return
    try {
      await add.mutateAsync([customerId, newTitle])
    } catch {
      return
    }
    setNewTitle('')
  }

  const submitRename = async (): Promise<void> => {
    if (!editingId) return
    try {
      await rename.mutateAsync([editingId, editTitle])
    } catch {
      return
    }
    setEditingId(null)
  }

  const handleRemove = async (goal: Goal): Promise<void> => {
    const ok = await confirm({ title: '목표 삭제', message: `"${goal.title}" 목표를 삭제할까요?`, confirmLabel: '삭제', danger: true })
    if (ok) remove.mutate([goal.id])
  }

  return (
    <Section
      title={`목표 ${done}/${goals.length}`}
      action={
        <Anchor size="xs" onClick={() => setAdding(true)}>
          + 추가
        </Anchor>
      }
    >
      {goals.length > 0 && <Progress value={(done / goals.length) * 100} size="sm" mb="xs" />}
      <Stack gap={6}>
        {goals.map((g) =>
          editingId === g.id ? (
            <TextInput
              key={g.id}
              size="xs"
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRename()
                if (e.key === 'Escape') setEditingId(null)
              }}
              onBlur={() => setEditingId(null)}
            />
          ) : (
            <Group key={g.id} justify="space-between" wrap="nowrap" gap={4}>
              <Checkbox
                size="xs"
                checked={g.doneAt !== null}
                onChange={(e) => setDone.mutate([g.id, e.currentTarget.checked])}
                label={
                  <Text size="sm" td={g.doneAt ? 'line-through' : undefined} c={g.doneAt ? 'dimmed' : undefined}>
                    {g.title}
                  </Text>
                }
              />
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label="목표 메뉴">
                    <IconDots size={14} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    onClick={() => {
                      setEditTitle(g.title)
                      setEditingId(g.id)
                    }}
                  >
                    이름 수정
                  </Menu.Item>
                  <Menu.Item color="red" onClick={() => void handleRemove(g)}>
                    삭제
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          )
        )}
        {(adding || goals.length === 0) && (
          <TextInput
            size="xs"
            placeholder="목표 입력 후 Enter (예: 믹스보이스 안정화)"
            autoFocus={adding}
            value={newTitle}
            onChange={(e) => setNewTitle(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitNew()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
        )}
      </Stack>
    </Section>
  )
}
