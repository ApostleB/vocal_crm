import { useState } from 'react'
import { Button, Group, Modal, Paper, Select, Stack, Text, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import type { Reservation } from '@shared/types'
import { formatMonthDay } from '@shared/domain/dates'
import { PURPOSE_LABEL } from '@shared/domain/labels'
import { formatPhone } from '@shared/domain/phone'
import { buildTimeOptions, findConflicts } from '@shared/domain/schedule'
import { useApiMutation, useCustomers, useReservationsRange, useSettings } from '../api/hooks'
import { confirm } from '../lib/confirm'
import { notifySuccess } from '../lib/notify'
import { todayString } from '../lib/today'

export interface ReservationTarget {
  customerId?: string
  reservation?: Reservation
  date?: string
}

const TIME_OPTIONS = buildTimeOptions()

export function ReservationModal({ customerId, reservation, date, onClose }: ReservationTarget & { onClose: () => void }): React.JSX.Element {
  const settings = useSettings()
  const customers = useCustomers()
  const [values, setValues] = useState({
    customerId: reservation?.customerId ?? customerId ?? null,
    date: reservation?.date ?? date ?? todayString(),
    time: reservation?.time ?? null,
    note: reservation?.note ?? ''
  })
  const set = (patch: Partial<typeof values>): void => setValues((v) => ({ ...v, ...patch }))
  const day = useReservationsRange(values.date, values.date)
  const save = useApiMutation('reservations.save')

  const lessonMinutes = settings.data?.lessonMinutes ?? 60
  const dayList = (day.data ?? []).filter((d) => d.reservation.status !== 'canceled')
  const conflicts = values.time
    ? findConflicts(
        { id: reservation?.id, date: values.date, time: values.time },
        dayList.map((d) => d.reservation),
        lessonMinutes
      )
    : []
  const conflictIds = new Set(conflicts.map((c) => c.id))
  const conflictText = dayList
    .filter((d) => conflictIds.has(d.reservation.id))
    .map((d) => `${d.reservation.time} ${d.customerName}`)
    .join(', ')

  const customerOptions = (customers.data ?? [])
    .filter((c) => c.status === 'active' || c.status === 'paused' || c.id === values.customerId)
    .map((c) => ({
      value: c.id,
      label: [c.name, c.purpose ? PURPOSE_LABEL[c.purpose] : null, c.phone ? formatPhone(c.phone) : null]
        .filter(Boolean)
        .join(' · ')
    }))

  const submit = async (): Promise<void> => {
    if (!values.customerId || !values.time) return
    if (conflicts.length > 0) {
      const ok = await confirm({
        title: '⚠ 예약 시간이 겹칩니다',
        message: `${formatMonthDay(values.date)} ${values.time} 근처에 이미 예약이 있습니다 (${conflictText}). 그래도 저장할까요?`,
        confirmLabel: '그래도 저장',
        cancelLabel: '돌아가기'
      })
      if (!ok) return
    }
    try {
      await save.mutateAsync([
        { id: reservation?.id, customerId: values.customerId, date: values.date, time: values.time, note: values.note || null }
      ])
    } catch {
      return
    }
    notifySuccess('예약을 저장했습니다.')
    onClose()
  }

  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>{reservation ? '예약 변경' : '수업 예약'}</Text>}>
      <Stack gap="sm">
        <Select
          label="고객"
          placeholder="이름으로 검색"
          searchable
          data={customerOptions}
          value={values.customerId}
          onChange={(v) => set({ customerId: v })}
          disabled={Boolean(reservation)}
          nothingFoundMessage="고객이 없습니다"
        />
        <Group grow>
          <DatePickerInput
            label="날짜"
            valueFormat="YYYY-MM-DD (dd)"
            value={values.date}
            onChange={(v) => v && set({ date: v })}
          />
          <Select
            label="시간"
            placeholder="예: 15:00"
            searchable
            data={TIME_OPTIONS}
            value={values.time}
            onChange={(v) => set({ time: v })}
            maxDropdownHeight={220}
          />
        </Group>
        {conflicts.length > 0 && (
          <Text size="xs" c="red">
            ⚠ {conflictText} 예약과 겹칩니다
          </Text>
        )}
        <Paper bg="gray.0" p="sm" radius="md">
          <Text size="xs" c="dimmed" fw={600} mb={4}>
            이날 예약 ({settings.data?.branchName ?? ''})
          </Text>
          {dayList.length === 0 ? (
            <Text size="sm" c="dimmed">
              예약 없음
            </Text>
          ) : (
            dayList.map((d) => (
              <Text key={d.reservation.id} size="sm" c={conflictIds.has(d.reservation.id) ? 'red' : undefined}>
                <Text span fw={700} ff="monospace">
                  {d.reservation.time}
                </Text>{' '}
                {d.customerName}
              </Text>
            ))
          )}
        </Paper>
        <TextInput
          label="비고"
          placeholder="예: 입시곡 MR 준비해오기"
          value={values.note}
          onChange={(e) => set({ note: e.currentTarget.value })}
        />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={!values.customerId || !values.time} loading={save.isPending}>
            예약 저장
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
