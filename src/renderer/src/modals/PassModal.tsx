import { useState } from 'react'
import { Button, Group, Modal, NumberInput, Stack, Text, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import type { Pass } from '@shared/types'
import { useApiMutation } from '../api/hooks'
import { notifySuccess } from '../lib/notify'
import { todayString } from '../lib/today'

export interface PassTarget {
  customerId: string
  pass?: Pass
}

export function PassModal({ customerId, pass, onClose }: PassTarget & { onClose: () => void }): React.JSX.Element {
  const [count, setCount] = useState<number | string>(pass?.count ?? 10)
  const [purchasedAt, setPurchasedAt] = useState(pass?.purchasedAt ?? todayString())
  const [amount, setAmount] = useState<number | string>(pass?.amount ?? '')
  const [note, setNote] = useState(pass?.note ?? '')
  const save = useApiMutation('passes.save')

  const submit = async (): Promise<void> => {
    try {
      await save.mutateAsync([
        {
          id: pass?.id,
          customerId,
          count: Number(count),
          purchasedAt,
          amount: amount === '' ? null : Number(amount),
          note: note || null
        }
      ])
    } catch {
      return
    }
    notifySuccess('수강권을 저장했습니다.')
    onClose()
  }

  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>{pass ? '수강권 수정' : '수강권 구매 추가'}</Text>}>
      <Stack gap="sm">
        <Group grow>
          <NumberInput label="횟수" min={1} suffix="회" value={count} onChange={setCount} data-autofocus />
          <DatePickerInput
            label="결제일"
            valueFormat="YYYY-MM-DD"
            value={purchasedAt}
            onChange={(v) => v && setPurchasedAt(v)}
          />
        </Group>
        <NumberInput
          label="금액 (선택)"
          min={0}
          thousandSeparator=","
          suffix="원"
          value={amount}
          onChange={setAmount}
        />
        <TextInput label="비고 (선택)" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending} disabled={!count}>
            저장
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
