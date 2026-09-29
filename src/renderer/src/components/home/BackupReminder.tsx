import { useState } from 'react'
import { Alert, Button, CloseButton, Group, Text } from '@mantine/core'
import { IconDatabaseExport } from '@tabler/icons-react'
import { useNavigate } from 'react-router'
import { externalBackupLabel, needsBackupReminder } from '@shared/domain/backupReminder'
import { useBackupStatus } from '../../api/hooks'

export const REMINDER_DISMISSED_KEY = 'vocal-crm.backupReminderDismissedOn'

function readDismissed(): string | null {
  try {
    return localStorage.getItem(REMINDER_DISMISSED_KEY)
  } catch {
    return null
  }
}

function writeDismissed(today: string): void {
  try {
    localStorage.setItem(REMINDER_DISMISSED_KEY, today)
  } catch {
    // 저장하지 못해도 이번 화면에서는 닫힌다
  }
}

/** 외부 백업이 없거나 30일이 지나면 홈 상단에 보이는 안내 (설계 7장). 닫으면 그날은 다시 보이지 않는다 */
export function BackupReminder({ today }: { today: string }): React.JSX.Element | null {
  const status = useBackupStatus()
  const navigate = useNavigate()
  const [dismissedOn, setDismissedOn] = useState(readDismissed)
  if (!status.data || !needsBackupReminder(status.data.lastExternalBackupAt, today, dismissedOn)) return null
  const dismiss = (): void => {
    writeDismissed(today)
    setDismissedOn(today)
  }
  return (
    <Alert color="yellow" variant="light" py="xs" icon={<IconDatabaseExport size={18} />}>
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">
          마지막 외부 백업: <b>{externalBackupLabel(status.data.lastExternalBackupAt, today)}</b> · 백업 파일을 USB나 클라우드
          폴더에 저장해 두세요.
        </Text>
        <Group gap={4} wrap="nowrap">
          <Button size="xs" variant="light" color="yellow" onClick={() => void navigate('/settings')}>
            백업하기
          </Button>
          <CloseButton size="sm" aria-label="오늘은 닫기" onClick={dismiss} />
        </Group>
      </Group>
    </Alert>
  )
}
