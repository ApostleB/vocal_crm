import { useState } from 'react'
import { Button, Group, NumberInput, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import type { Settings } from '@shared/types'
import { useApiMutation, useSettings } from '../api/hooks'
import { BackupSection } from '../components/settings/BackupSection'
import { DataSection } from '../components/settings/DataSection'
import { notifySuccess } from '../lib/notify'

export function SettingsPage(): React.JSX.Element {
  const settings = useSettings()
  if (!settings.data) return <></>
  return (
    <Stack maw={720}>
      <Title order={2}>설정·백업</Title>
      <BasicSettings key={JSON.stringify(settings.data)} settings={settings.data} />
      <BackupSection />
      <DataSection />
    </Stack>
  )
}

function BasicSettings({ settings }: { settings: Settings }): React.JSX.Element {
  const [branchName, setBranchName] = useState(settings.branchName ?? '')
  const [lessonMinutes, setLessonMinutes] = useState<number | string>(settings.lessonMinutes)
  const save = useApiMutation('settings.update')
  const submit = async (): Promise<void> => {
    try {
      await save.mutateAsync([{ branchName, lessonMinutes: Number(lessonMinutes) }])
    } catch {
      return
    }
    notifySuccess('설정을 저장했습니다.')
  }
  return (
    <Paper withBorder p="lg">
      <Stack>
        <Text fw={700}>기본</Text>
        <TextInput label="이 PC의 지점 이름" value={branchName} onChange={(e) => setBranchName(e.currentTarget.value)} />
        <NumberInput
          label="기본 수업 길이"
          description="예약 시간이 겹치는지 판단할 때 씁니다"
          min={10}
          max={240}
          step={10}
          suffix="분"
          value={lessonMinutes}
          onChange={setLessonMinutes}
        />
        <Group justify="flex-end">
          <Button onClick={() => void submit()} loading={save.isPending}>
            저장
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}
