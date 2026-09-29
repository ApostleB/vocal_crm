import { useState } from 'react'
import { ActionIcon, Anchor, Collapse, Group, Stack, Text } from '@mantine/core'
import { IconPencil, IconTrash } from '@tabler/icons-react'
import type { Pass } from '@shared/types'
import { formatRemaining, isPassExhausted } from '@shared/domain/passes'
import { useApiMutation } from '../../api/hooks'
import { confirm } from '../../lib/confirm'
import { useAppModals } from '../../modals/AppModals'
import { Section } from './Section'

interface Props {
  customerId: string
  passes: Pass[]
  totalPassCount: number
  remainingPasses: number | null
}

const won = (n: number): string => `${n.toLocaleString('ko-KR')}원`

export function PassesSection({ customerId, passes, totalPassCount, remainingPasses }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { openPass } = useAppModals()
  const remove = useApiMutation('passes.remove')
  const latest = passes[0]

  const handleRemove = async (p: Pass): Promise<void> => {
    const ok = await confirm({
      title: '수강권 기록 삭제',
      message: `${p.purchasedAt} ${p.count}회 구매 기록을 삭제할까요?`,
      confirmLabel: '삭제',
      danger: true
    })
    if (ok) remove.mutate([p.id])
  }

  return (
    <Section
      title="수강권"
      action={
        <Anchor size="xs" onClick={() => openPass({ customerId })}>
          + 구매 추가
        </Anchor>
      }
    >
      <Group gap={6} align="baseline">
        <Text fz={22} fw={700} c={isPassExhausted(remainingPasses) ? 'red' : undefined}>
          {formatRemaining(remainingPasses)}
        </Text>
        <Text size="sm" c="dimmed">
          {remainingPasses === null ? '구매 기록 없음' : `남음 · 총 ${totalPassCount}회 구매`}
        </Text>
      </Group>
      {latest && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            최근 {latest.purchasedAt} · {latest.count}회{latest.amount !== null ? ` · ${won(latest.amount)}` : ''}
          </Text>
          <Anchor size="xs" onClick={() => setOpen((o) => !o)}>
            {open ? '접기' : '내역 보기'}
          </Anchor>
        </Group>
      )}
      <Collapse expanded={open}>
        <Stack gap={4} mt="xs">
          {passes.map((p) => (
            <Group key={p.id} justify="space-between" wrap="nowrap">
              <Text size="xs">
                {p.purchasedAt} · {p.count}회{p.amount !== null ? ` · ${won(p.amount)}` : ''}
                {p.note ? ` · ${p.note}` : ''}
              </Text>
              <Group gap={2} wrap="nowrap">
                <ActionIcon size="sm" variant="subtle" color="gray" aria-label="수정" onClick={() => openPass({ customerId, pass: p })}>
                  <IconPencil size={14} />
                </ActionIcon>
                <ActionIcon size="sm" variant="subtle" color="red" aria-label="삭제" onClick={() => void handleRemove(p)}>
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
      </Collapse>
    </Section>
  )
}
