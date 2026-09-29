import { useState } from 'react'
import { Button, Checkbox, Group, Modal, Paper, Stack, Text, TextInput } from '@mantine/core'
import type { CustomerSummary } from '@shared/types'
import { vcrmFileName } from '@shared/domain/transferNames'
import { useApiMutation, useSettings } from '../../api/hooks'
import { notifySuccess } from '../../lib/notify'
import { todayString } from '../../lib/today'

/** .vcrm 내보내기: 보낼 지점(선택), '타지점 이동' 으로 바꾸기, 파일 이름 미리보기 */
export function ExportVcrmModal({ customers, onClose }: { customers: CustomerSummary[]; onClose: () => void }): React.JSX.Element {
  const settings = useSettings()
  const [targetBranch, setTargetBranch] = useState('')
  const [markMoved, setMarkMoved] = useState(false)
  const exportVcrm = useApiMutation('transfer.exportVcrm')
  const fileName = vcrmFileName(
    customers.map((c) => c.name),
    settings.data?.branchName ?? '',
    todayString()
  )

  const submit = async (): Promise<void> => {
    let result: { saved: boolean; count: number; moved: number; canceledReservations: number }
    try {
      result = await exportVcrm.mutateAsync([
        { customerIds: customers.map((c) => c.id), targetBranch: targetBranch.trim() || null, markMoved }
      ])
    } catch {
      return
    }
    if (!result.saved) return // 저장 창에서 취소 — 창은 그대로 둔다
    const moved = result.moved > 0 ? ` ${result.moved}명을 타지점 이동으로 바꿨습니다.` : ''
    const canceled = result.canceledReservations > 0 ? ` 예약 ${result.canceledReservations}건을 취소했습니다.` : ''
    notifySuccess(`${result.count}명을 내보냈습니다.${moved}${canceled}`)
    onClose()
  }

  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>고객 내보내기 (.vcrm)</Text>}>
      <Stack gap="sm">
        <div>
          <Text size="sm" fw={500} mb={4}>
            내보낼 고객 · {customers.length}명
          </Text>
          <Text size="sm" c="dimmed">
            {customers
              .slice(0, 5)
              .map((c) => c.name)
              .join(', ')}
            {customers.length > 5 ? ` 외 ${customers.length - 5}명` : ''}
          </Text>
        </div>
        <TextInput
          label="보낼 지점 (선택)"
          placeholder="예: 홍대점"
          value={targetBranch}
          onChange={(e) => setTargetBranch(e.currentTarget.value)}
        />
        <Checkbox
          label="내보낸 고객을 '타지점 이동' 상태로 바꾸기"
          description="홈 목록에서 빠지고 이력에 남습니다. 잡혀 있는 예약은 취소됩니다. 데이터는 지우지 않습니다."
          checked={markMoved}
          onChange={(e) => setMarkMoved(e.currentTarget.checked)}
        />
        <Paper bg="gray.0" p="sm" radius="md">
          <Text size="xs" c="dimmed">
            파일 이름
          </Text>
          <Text size="sm" ff="monospace">
            {fileName}
          </Text>
        </Paper>
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void submit()} loading={exportVcrm.isPending}>
            파일로 저장
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
