import { useEffect, useState } from 'react'
import { Badge, Button, Center, Chip, Group, Loader, Modal, Paper, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { getHotkeyHandler } from '@mantine/hooks'
import type { CustomerDetail } from '@shared/types'
import { previousHomework } from '@shared/domain/lessons'
import { useApiMutation, useCustomerDetail } from '../api/hooks'
import { confirmDiscard } from '../lib/confirm'
import { useLeaveGuard } from '../lib/useLeaveGuard'
import { notifySuccess } from '../lib/notify'
import { todayString } from '../lib/today'

export interface LessonTarget {
  customerId: string
  lessonId?: string
  reservationId?: string
  date?: string
}

interface Props extends LessonTarget {
  onClose: () => void
  onBookNext: (customerId: string) => void
}

export function LessonModal({ customerId, lessonId, reservationId, date, onClose, onBookNext }: Props): React.JSX.Element {
  const detail = useCustomerDetail(customerId)
  const [dirty, setDirty] = useState(false)
  useLeaveGuard(dirty)

  const requestClose = async (): Promise<void> => {
    if (!dirty || (await confirmDiscard('작성 중인 메모가 있습니다. 닫을까요?'))) onClose()
  }

  const name = detail.data?.customer.name
  return (
    <Modal
      opened
      onClose={() => void requestClose()}
      title={<Text fw={700}>{name ? `${name} · ${lessonId ? '수업 기록 수정' : '수업 기록'}` : '수업 기록'}</Text>}
      size="lg"
      closeOnClickOutside={false}
    >
      {detail.data ? (
        <LessonForm
          detail={detail.data}
          lessonId={lessonId}
          reservationId={reservationId}
          initialDate={date}
          onDirtyChange={setDirty}
          onCancel={() => void requestClose()}
          onDone={(bookNext) => {
            onClose()
            if (bookNext) onBookNext(customerId)
          }}
        />
      ) : (
        <Center p="xl">
          <Loader />
        </Center>
      )}
    </Modal>
  )
}

interface FormProps {
  detail: CustomerDetail
  lessonId?: string
  reservationId?: string
  initialDate?: string
  onDirtyChange: (dirty: boolean) => void
  onCancel: () => void
  onDone: (bookNext: boolean) => void
}

function LessonForm({ detail, lessonId, reservationId, initialDate, onDirtyChange, onCancel, onDone }: FormProps): React.JSX.Element {
  const editing = lessonId ? (detail.lessons.find((l) => l.id === lessonId) ?? null) : null
  // 창이 열릴 때의 값. 이후 detail 이 다시 불려와도 입력 중인 값은 유지한다
  const [initial] = useState(() => ({
    lessonDate: editing?.lessonDate ?? initialDate ?? todayString(),
    memo: editing?.memo ?? '',
    practice: editing?.practice ?? '',
    homework: editing?.homework ?? '',
    deductPass: editing?.deductPass ?? true,
    goalIds: editing ? detail.goals.filter((g) => g.completedLessonId === editing.id).map((g) => g.id) : []
  }))
  const [values, setValues] = useState(initial)
  const set = (patch: Partial<typeof values>): void => setValues((v) => ({ ...v, ...patch }))
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  const save = useApiMutation('lessons.save')

  const before = detail.lessons.filter((l) => l.lessonDate <= values.lessonDate)
  const number = editing ? editing.number : before.length + 1
  const lastHomework = editing ? previousHomework(detail.lessons, editing.number) : previousHomework(before)
  const goalOptions = detail.goals.filter((g) => g.doneAt === null || (editing && g.completedLessonId === editing.id))
  const base = detail.remainingPasses === null ? null : detail.remainingPasses + (editing?.deductPass ? 1 : 0)
  const after = base === null ? null : base - (values.deductPass ? 1 : 0)

  const submit = async (bookNext: boolean): Promise<void> => {
    if (save.isPending) return
    try {
      await save.mutateAsync([
        {
          id: editing?.id,
          customerId: detail.customer.id,
          lessonDate: values.lessonDate,
          memo: values.memo,
          practice: values.practice || null,
          homework: values.homework || null,
          deductPass: values.deductPass,
          reservationId: editing ? editing.reservationId : (reservationId ?? null),
          completedGoalIds: values.goalIds
        }
      ])
    } catch {
      return // 오류 알림은 전역에서 띄운다
    }
    notifySuccess('수업 기록을 저장했습니다.')
    onDone(bookNext)
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Badge size="lg" variant="light">
          {number}회차
        </Badge>
        <DatePickerInput
          aria-label="수업일"
          size="xs"
          w={170}
          valueFormat="YYYY-MM-DD (dd)"
          value={values.lessonDate}
          onChange={(v) => v && set({ lessonDate: v })}
        />
      </Group>

      {lastHomework && (
        <Paper bg="gray.0" px="sm" py={6} radius="sm">
          <Text size="xs" c="dimmed">
            지난 과제 ·{' '}
            <Text span size="xs" fw={600} c="dark">
              {lastHomework}
            </Text>
          </Text>
        </Paper>
      )}

      <Textarea
        label="메모"
        description="Ctrl+Enter 로 바로 저장"
        data-autofocus
        autosize
        minRows={7}
        maxRows={16}
        styles={{ input: { fontSize: 15, lineHeight: 1.65 } }}
        value={values.memo}
        onChange={(e) => set({ memo: e.currentTarget.value })}
        onKeyDown={getHotkeyHandler([['mod+Enter', () => void submit(false)]])}
      />

      <Group grow>
        <TextInput
          label="연습 곡 · 내용 (선택)"
          value={values.practice}
          onChange={(e) => set({ practice: e.currentTarget.value })}
        />
        <TextInput
          label="다음 과제 (선택)"
          placeholder="예: 믹스 스케일 매일 10분"
          value={values.homework}
          onChange={(e) => set({ homework: e.currentTarget.value })}
        />
      </Group>

      {goalOptions.length > 0 && (
        <div>
          <Text size="sm" fw={500} mb={6}>
            이번 수업에서 완료한 목표
          </Text>
          <Chip.Group multiple value={values.goalIds} onChange={(goalIds) => set({ goalIds })}>
            <Group gap="xs">
              {goalOptions.map((g) => (
                <Chip key={g.id} value={g.id} size="sm">
                  {g.title}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </div>
      )}

      <Paper bg="gray.0" p="sm" radius="md">
        <Switch
          label="수강권 1회 차감"
          description={after === null ? '수강권 구매 기록 없음' : `저장 후 ${after}회 남음`}
          checked={values.deductPass}
          onChange={(e) => set({ deductPass: e.currentTarget.checked })}
        />
      </Paper>

      <Group justify="flex-end" mt="xs">
        <Button variant="default" onClick={onCancel}>
          취소
        </Button>
        {!editing && (
          <Button variant="light" onClick={() => void submit(true)} loading={save.isPending}>
            저장 후 다음 예약
          </Button>
        )}
        <Button onClick={() => void submit(false)} loading={save.isPending}>
          저장
        </Button>
      </Group>
    </Stack>
  )
}
