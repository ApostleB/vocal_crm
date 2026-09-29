import { Button, Code, Group, Paper, Stack, Text } from '@mantine/core'
import { useApiMutation, useAppInfo } from '../../api/hooks'

/** 설정 화면의 데이터·앱 정보 영역 (설계 5.9, 8장 로그) */
export function DataSection(): React.JSX.Element {
  const info = useAppInfo()
  const openFolder = useApiMutation('app.openDataFolder')
  return (
    <Paper withBorder p="lg">
      <Stack gap="sm">
        <Text fw={700}>데이터</Text>
        <Text size="sm" c="dimmed">
          고객 데이터, 자동 백업(backups), 오류 기록(logs)이 이 폴더에 있습니다.
        </Text>
        {info.data && <Code block>{info.data.dataDir}</Code>}
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            앱 버전 {info.data?.version ?? ''}
          </Text>
          <Button variant="default" onClick={() => openFolder.mutate([])}>
            데이터 폴더 열기
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}
