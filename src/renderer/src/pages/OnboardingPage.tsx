import { useState } from 'react'
import { Button, Center, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useApiMutation } from '../api/hooks'

export function OnboardingPage(): React.JSX.Element {
  const [name, setName] = useState('')
  const save = useApiMutation('settings.update')
  const submit = (): void => {
    if (name.trim()) save.mutate([{ branchName: name }])
  }
  return (
    <Center h="100vh" bg="gray.0">
      <Paper withBorder shadow="sm" p="xl" w={420}>
        <Stack>
          <Title order={3}>🎤 VOCAL CRM 시작하기</Title>
          <Text c="dimmed" size="sm">
            이 PC는 어느 지점인가요? 한 번만 입력하면 되고, 나중에 설정에서 바꿀 수 있습니다.
          </Text>
          <TextInput
            label="지점 이름"
            placeholder="예: 강남점"
            data-autofocus
            autoFocus
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <Button onClick={submit} disabled={!name.trim()} loading={save.isPending}>
            시작하기
          </Button>
        </Stack>
      </Paper>
    </Center>
  )
}
