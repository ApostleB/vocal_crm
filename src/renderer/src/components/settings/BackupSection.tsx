import { Badge, Button, Group, Paper, ScrollArea, Stack, Table, Text } from '@mantine/core'
import { BACKUP_KIND_LABEL, type BackupInfo } from '@shared/backupTypes'
import { externalBackupLabel } from '@shared/domain/backupReminder'
import { useApiMutation, useBackups, useBackupStatus } from '../../api/hooks'
import { confirm } from '../../lib/confirm'
import { notifySuccess } from '../../lib/notify'
import { todayString } from '../../lib/today'

const KIND_COLOR: Record<BackupInfo['kind'], string> = {
  auto: 'gray',
  manual: 'blue',
  'before-import': 'grape',
  'before-restore': 'orange'
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** 설정 화면의 백업 영역 (설계 5.9) */
export function BackupSection(): React.JSX.Element {
  const status = useBackupStatus()
  const backups = useBackups()
  const create = useApiMutation('backup.create')
  const exportFile = useApiMutation('backup.exportFile')
  const importFile = useApiMutation('backup.importFile')
  const restore = useApiMutation('backup.restore')

  const createNow = async (): Promise<void> => {
    try {
      await create.mutateAsync([])
    } catch {
      return
    }
    notifySuccess('백업을 만들었습니다.')
  }

  const saveFile = async (): Promise<void> => {
    try {
      const result = await exportFile.mutateAsync([])
      if (result.saved) notifySuccess('백업 파일을 저장했습니다.')
    } catch {
      return
    }
  }

  const loadFile = async (): Promise<void> => {
    const ok = await confirm({
      title: '백업 파일 불러오기',
      message: "고른 백업 파일로 이 PC의 데이터를 모두 바꿉니다. 지금 데이터는 '복원 전' 백업으로 남겨 둡니다. 불러온 뒤 화면을 새로 불러옵니다.",
      confirmLabel: '파일 고르기',
      danger: true
    })
    if (!ok) return
    try {
      await importFile.mutateAsync([])
    } catch {
      return
    }
  }

  const restoreTo = async (backup: BackupInfo): Promise<void> => {
    const ok = await confirm({
      title: '이 시점으로 복원',
      message: `${backup.createdAt} (${BACKUP_KIND_LABEL[backup.kind]}) 백업으로 되돌립니다. 지금 데이터는 '복원 전' 백업으로 남겨 둡니다. 복원한 뒤 화면을 새로 불러옵니다.`,
      confirmLabel: '복원',
      danger: true
    })
    if (!ok) return
    try {
      await restore.mutateAsync([backup.fileName])
    } catch {
      return
    }
  }

  // 백업·내보내기 중에 복원하면 db.close() 가 진행 중인 백업을 끊으므로 함께 잠근다
  const busy = restore.isPending || importFile.isPending || create.isPending || exportFile.isPending
  return (
    <Paper withBorder p="lg">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={700}>백업</Text>
            <Text size="sm" c="dimmed">
              자동 백업은 하루 한 번, 가져오기 전, 복원 전에 만들어집니다. 최근 30개를 보관합니다.
            </Text>
          </div>
          <Button variant="light" onClick={() => void createNow()} loading={create.isPending} disabled={busy}>
            지금 백업
          </Button>
        </Group>

        <Paper withBorder p="md" bg="gray.0">
          <Stack gap="xs">
            <Text size="sm">
              마지막 외부 백업:{' '}
              <Text span fw={700}>
                {status.data ? externalBackupLabel(status.data.lastExternalBackupAt, todayString()) : '…'}
              </Text>
            </Text>
            <Text size="sm" c="dimmed">
              PC가 고장 나도 데이터를 지킬 수 있게 백업 파일을 USB나 클라우드 폴더에 저장해 두세요. PC를 바꿀 때는 새 PC에서
              백업 파일을 불러옵니다.
            </Text>
            <Group gap="xs">
              <Button onClick={() => void saveFile()} loading={exportFile.isPending} disabled={busy}>
                백업 파일 내보내기
              </Button>
              <Button variant="default" onClick={() => void loadFile()} loading={importFile.isPending} disabled={busy}>
                백업 파일 불러오기
              </Button>
            </Group>
          </Stack>
        </Paper>

        {backups.data && backups.data.length === 0 && (
          <Text size="sm" c="dimmed">
            아직 백업이 없습니다.
          </Text>
        )}
        {backups.data && backups.data.length > 0 && (
          <ScrollArea.Autosize mah={360}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>만든 시각</Table.Th>
                  <Table.Th>종류</Table.Th>
                  <Table.Th>크기</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {backups.data.map((b) => (
                  <Table.Tr key={b.fileName}>
                    <Table.Td>{b.createdAt}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={KIND_COLOR[b.kind]}>
                        {BACKUP_KIND_LABEL[b.kind]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formatSize(b.size)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Button
                        size="xs"
                        variant="subtle"
                        color="orange"
                        onClick={() => void restoreTo(b)}
                        disabled={busy}
                        aria-label={`${b.createdAt} 백업으로 복원`}
                      >
                        이 시점으로 복원
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </Paper>
  )
}
