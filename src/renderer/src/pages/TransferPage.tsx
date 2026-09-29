import { useState } from 'react'
import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import type { CustomerSummary } from '@shared/types'
import type { ImportPreview } from '@shared/transferTypes'
import { useApiMutation } from '../api/hooks'
import { CustomerPickerModal } from '../components/transfer/CustomerPickerModal'
import { ExportVcrmModal } from '../components/transfer/ExportVcrmModal'
import { ImportPreviewModal } from '../components/transfer/ImportPreviewModal'
import { notifySuccess } from '../lib/notify'

function TransferCard(props: {
  icon: string
  tag: string
  tagColor: string
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Card withBorder padding="md">
      <Stack gap={6} h="100%">
        <Text fz={24}>{props.icon}</Text>
        <Badge variant="light" color={props.tagColor} w="fit-content">
          {props.tag}
        </Badge>
        <Text fw={700}>{props.title}</Text>
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>
          {props.description}
        </Text>
        <Group gap="xs">{props.children}</Group>
      </Stack>
    </Card>
  )
}

export function TransferPage(): React.JSX.Element {
  const [picker, setPicker] = useState<'vcrm' | 'excel' | null>(null)
  const [exportTarget, setExportTarget] = useState<CustomerSummary[] | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const exportExcel = useApiMutation('excel.exportCustomers')
  const openVcrm = useApiMutation('transfer.openVcrm')

  const openImport = async (): Promise<void> => {
    try {
      const preview = await openVcrm.mutateAsync([])
      if (preview) setImportPreview(preview)
    } catch {
      return
    }
  }

  const saveExcel = async (customers: CustomerSummary[]): Promise<void> => {
    let result: { saved: boolean }
    try {
      result = await exportExcel.mutateAsync([customers.map((c) => c.id)])
    } catch {
      return
    }
    if (!result.saved) return // 저장 창에서 취소 — 고객 선택 창은 그대로 둔다
    setPicker(null)
    notifySuccess(`${customers.length}명을 엑셀로 저장했습니다.`)
  }

  return (
    <Stack gap="md">
      <Title order={2}>가져오기 · 내보내기</Title>
      <SimpleGrid cols={4} spacing="md">
        <TransferCard
          icon="📤"
          tag="지점 이동용"
          tagColor="blue"
          title="고객 내보내기"
          description="고른 고객의 정보·공통메모·목표·회차 기록·수강권을 .vcrm 파일로 저장합니다."
        >
          <Button onClick={() => setPicker('vcrm')}>고객 선택</Button>
        </TransferCard>
        <TransferCard
          icon="📥"
          tag="지점 이동용"
          tagColor="blue"
          title="고객 가져오기"
          description="다른 지점에서 받은 .vcrm 파일을 열어 고객마다 신규 추가 / 합치기 / 건너뛰기를 고릅니다."
        >
          <Button onClick={() => void openImport()} loading={openVcrm.isPending}>
            파일 열기
          </Button>
        </TransferCard>
        <TransferCard
          icon="📊"
          tag="엑셀"
          tagColor="teal"
          title="엑셀로 내보내기"
          description="보관·인쇄용입니다. 시트: 고객 목록 / 회차 기록 / 수강권. 다시 가져올 수는 없습니다."
        >
          <Button variant="light" onClick={() => setPicker('excel')} loading={exportExcel.isPending}>
            엑셀 저장
          </Button>
        </TransferCard>
      </SimpleGrid>

      {picker === 'vcrm' && (
        <CustomerPickerModal
          title="내보낼 고객 선택"
          confirmLabel="다음"
          onClose={() => setPicker(null)}
          onConfirm={(customers) => {
            setPicker(null)
            setExportTarget(customers)
          }}
        />
      )}
      {picker === 'excel' && (
        <CustomerPickerModal
          title="엑셀로 내보낼 고객 선택"
          confirmLabel="엑셀로 저장"
          onClose={() => setPicker(null)}
          onConfirm={(customers) => void saveExcel(customers)}
        />
      )}
      {exportTarget && <ExportVcrmModal customers={exportTarget} onClose={() => setExportTarget(null)} />}
      {importPreview && <ImportPreviewModal preview={importPreview} onClose={() => setImportPreview(null)} />}
    </Stack>
  )
}
