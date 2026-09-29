import { useState } from 'react'
import { Anchor, Button, Group, Paper, Text, Textarea } from '@mantine/core'
import { useApiMutation } from '../../api/hooks'
import { notifySuccess } from '../../lib/notify'
import { Section } from './Section'

export function PinnedNoteSection({ customerId, note }: { customerId: string; note: string }): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)
  const save = useApiMutation('customers.setPinnedNote')

  const submit = async (): Promise<void> => {
    try {
      await save.mutateAsync([customerId, draft])
    } catch {
      return
    }
    notifySuccess('공통메모를 저장했습니다.')
    setEditing(false)
  }

  return (
    <Section
      title="📌 공통메모"
      action={
        !editing && (
          <Anchor
            size="xs"
            onClick={() => {
              setDraft(note)
              setEditing(true)
            }}
          >
            수정
          </Anchor>
        )
      }
    >
      {editing ? (
        <>
          <Textarea autosize minRows={3} autoFocus value={draft} onChange={(e) => setDraft(e.currentTarget.value)} />
          <Group justify="flex-end" gap="xs" mt="xs">
            <Button size="compact-sm" variant="default" onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button size="compact-sm" onClick={() => void submit()} loading={save.isPending}>
              저장
            </Button>
          </Group>
        </>
      ) : (
        <Paper bg="yellow.0" withBorder p="sm" style={{ borderColor: 'var(--mantine-color-yellow-3)' }}>
          <Text size="sm" c={note ? 'yellow.9' : 'dimmed'} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {note || '공통메모가 없습니다.'}
          </Text>
        </Paper>
      )}
    </Section>
  )
}
