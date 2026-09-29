import { ActionIcon, Badge, Divider, Group, Menu, Paper, Stack, Text } from '@mantine/core'
import { IconDots } from '@tabler/icons-react'
import type { Goal, NumberedLesson, TimelineEntry } from '@shared/types'
import { formatFullDate } from '@shared/domain/dates'
import { statusLogText } from '@shared/domain/labels'
import { useApiMutation } from '../../api/hooks'
import { confirm } from '../../lib/confirm'
import { useAppModals } from '../../modals/AppModals'

export function Timeline({ timeline, goals }: { timeline: TimelineEntry[]; goals: Goal[] }): React.JSX.Element {
  if (!timeline.some((e) => e.kind === 'lesson')) {
    return (
      <Stack>
        <Text c="dimmed" size="sm" ta="center" py="xl">
          아직 수업 기록이 없습니다. '+ 수업 기록'으로 첫 수업을 남겨 보세요.
        </Text>
        {timeline.map((e) =>
          e.kind === 'status' ? <StatusLine key={e.statusLog.id} date={e.date} text={statusLogText(e.statusLog)} /> : null
        )}
      </Stack>
    )
  }
  return (
    <Stack gap="sm">
      {timeline.map((e) =>
        e.kind === 'lesson' ? (
          <LessonCard key={e.lesson.id} lesson={e.lesson} goals={goals.filter((g) => g.completedLessonId === e.lesson.id)} />
        ) : (
          <StatusLine key={e.statusLog.id} date={e.date} text={statusLogText(e.statusLog)} />
        )
      )}
    </Stack>
  )
}

function StatusLine({ date, text }: { date: string; text: string }): React.JSX.Element {
  return <Divider label={`${date} · ${text}`} labelPosition="center" my={4} />
}

function LessonCard({ lesson, goals }: { lesson: NumberedLesson; goals: Goal[] }): React.JSX.Element {
  const { openLesson } = useAppModals()
  const remove = useApiMutation('lessons.remove')

  const handleRemove = async (): Promise<void> => {
    const ok = await confirm({
      title: '수업 기록 삭제',
      message: `${lesson.number}회차 (${lesson.lessonDate}) 기록을 삭제할까요?`,
      confirmLabel: '삭제',
      danger: true
    })
    if (ok) remove.mutate([lesson.id])
  }

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb={6}>
        <Text fw={700}>
          {lesson.number}회차 · {formatFullDate(lesson.lessonDate)}
        </Text>
        <Group gap={4}>
          {lesson.deductPass && (
            <Text size="xs" c="dimmed">
              수강권 차감
            </Text>
          )}
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label="수업 기록 메뉴">
                <IconDots size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => openLesson({ customerId: lesson.customerId, lessonId: lesson.id })}>수정</Menu.Item>
              <Menu.Item color="red" onClick={() => void handleRemove()}>
                삭제
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }} c={lesson.memo ? undefined : 'dimmed'}>
        {lesson.memo || '메모 없음'}
      </Text>
      {(lesson.practice || lesson.homework) && (
        <Stack gap={2} mt="xs">
          {lesson.practice && (
            <Text size="xs" c="dimmed">
              연습 · {lesson.practice}
            </Text>
          )}
          {lesson.homework && (
            <Text size="xs" c="dimmed">
              과제 · {lesson.homework}
            </Text>
          )}
        </Stack>
      )}
      {goals.length > 0 && (
        <Group gap={4} mt="xs">
          {goals.map((g) => (
            <Badge key={g.id} variant="light" size="sm">
              ✓ 목표 완료: {g.title}
            </Badge>
          ))}
        </Group>
      )}
    </Paper>
  )
}
