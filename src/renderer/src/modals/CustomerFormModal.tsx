import { useEffect, useState } from 'react'
import { Button, Group, Modal, SegmentedControl, Select, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useNavigate } from 'react-router'
import type { Customer, CustomerInput, Gender, Purpose } from '@shared/types'
import { PURPOSE_LABEL } from '@shared/domain/labels'
import { formatPhone } from '@shared/domain/phone'
import { useApiMutation } from '../api/hooks'
import { confirm, confirmDiscard } from '../lib/confirm'
import { notifySuccess } from '../lib/notify'
import { todayString } from '../lib/today'

export interface CustomerFormTarget {
  customer?: Customer
}

const PURPOSE_OPTIONS = (Object.keys(PURPOSE_LABEL) as Purpose[]).map((p) => ({ value: p, label: PURPOSE_LABEL[p] }))

function toInput(c?: Customer): CustomerInput {
  return {
    name: c?.name ?? '',
    phone: c?.phone ? formatPhone(c.phone) : '',
    birthDate: c?.birthDate ?? null,
    gender: c?.gender ?? null,
    purpose: c?.purpose ?? null,
    registeredAt: c?.registeredAt ?? todayString(),
    vocalRange: c?.vocalRange ?? '',
    preferredMusic: c?.preferredMusic ?? '',
    pinnedNote: c?.pinnedNote ?? ''
  }
}

export function CustomerFormModal({ customer, onClose }: CustomerFormTarget & { onClose: () => void }): React.JSX.Element {
  const navigate = useNavigate()
  const [initial] = useState(() => toInput(customer))
  const [values, setValues] = useState(initial)
  const [nameError, setNameError] = useState<string | null>(null)
  const set = (patch: Partial<CustomerInput>): void => setValues((v) => ({ ...v, ...patch }))
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)
  const create = useApiMutation('customers.create')
  const update = useApiMutation('customers.update')
  const remove = useApiMutation('customers.remove')

  useEffect(() => {
    if (values.name.trim()) setNameError(null)
  }, [values.name])

  const requestClose = async (): Promise<void> => {
    if (!dirty || (await confirmDiscard())) onClose()
  }

  const submit = async (): Promise<void> => {
    if (!values.name.trim()) {
      setNameError('이름을 입력해 주세요.')
      return
    }
    try {
      if (customer) {
        await update.mutateAsync([customer.id, values])
        notifySuccess('고객 정보를 저장했습니다.')
        onClose()
      } else {
        const created = await create.mutateAsync([values])
        notifySuccess(`${created.name} 님을 등록했습니다.`)
        onClose()
        void navigate(`/customers/${created.id}`)
      }
    } catch {
      return
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!customer) return
    const ok = await confirm({
      title: '고객 삭제',
      message: `${customer.name} 님과 모든 기록(수업, 목표, 수강권, 예약, 이력)을 삭제합니다. 되돌릴 수 없습니다.`,
      confirmLabel: '삭제',
      danger: true
    })
    if (!ok) return
    try {
      await remove.mutateAsync([customer.id])
    } catch {
      return
    }
    notifySuccess('고객을 삭제했습니다.')
    onClose()
    void navigate('/')
  }

  return (
    <Modal
      opened
      onClose={() => void requestClose()}
      title={<Text fw={700}>{customer ? '고객 정보 수정' : '새 고객 등록'}</Text>}
      size="lg"
      closeOnClickOutside={false}
    >
      <Stack gap="sm">
        <Group grow align="flex-start">
          <TextInput
            label="이름"
            withAsterisk
            data-autofocus
            value={values.name}
            error={nameError}
            onChange={(e) => set({ name: e.currentTarget.value })}
          />
          <TextInput
            label="연락처"
            placeholder="010-0000-0000"
            value={values.phone ?? ''}
            onChange={(e) => set({ phone: formatPhone(e.currentTarget.value) })}
          />
        </Group>
        <Group grow align="flex-start">
          <DatePickerInput
            label="생년월일"
            clearable
            defaultLevel="decade"
            valueFormat="YYYY-MM-DD"
            value={values.birthDate}
            onChange={(v) => set({ birthDate: v })}
          />
          <div>
            <Text size="sm" fw={500} mb={3}>
              성별
            </Text>
            <SegmentedControl
              fullWidth
              value={values.gender ?? ''}
              onChange={(v) => set({ gender: v === '' ? null : (v as Gender) })}
              data={[
                { value: '', label: '미입력' },
                { value: 'F', label: '여' },
                { value: 'M', label: '남' }
              ]}
            />
          </div>
        </Group>
        <Group grow align="flex-start">
          <Select
            label="수강 목적"
            clearable
            data={PURPOSE_OPTIONS}
            value={values.purpose}
            onChange={(v) => set({ purpose: v as Purpose | null })}
          />
          <DatePickerInput
            label="등록일"
            valueFormat="YYYY-MM-DD"
            value={values.registeredAt}
            onChange={(v) => v && set({ registeredAt: v })}
          />
        </Group>
        <Group grow align="flex-start">
          <TextInput
            label="음역대"
            placeholder="예: F3 ~ C5"
            value={values.vocalRange ?? ''}
            onChange={(e) => set({ vocalRange: e.currentTarget.value })}
          />
          <TextInput
            label="선호 장르 · 목표곡"
            value={values.preferredMusic ?? ''}
            onChange={(e) => set({ preferredMusic: e.currentTarget.value })}
          />
        </Group>
        <Textarea
          label="📌 공통메모"
          description="고객 화면 상단에 항상 보입니다. 예: 성대결절 이력, 입시 일정"
          autosize
          minRows={2}
          value={values.pinnedNote}
          onChange={(e) => set({ pinnedNote: e.currentTarget.value })}
        />
        <Group justify="space-between" mt="xs">
          {customer ? (
            <Button variant="subtle" color="red" onClick={() => void handleDelete()}>
              고객 삭제
            </Button>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={() => void requestClose()}>
              취소
            </Button>
            <Button onClick={() => void submit()} loading={create.isPending || update.isPending}>
              저장
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
