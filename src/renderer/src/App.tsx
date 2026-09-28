import { MantineProvider, Stack, Text, Title } from '@mantine/core'
import { theme } from './theme'

export function App(): React.JSX.Element {
  return (
    <MantineProvider theme={theme}>
      <Stack p="xl">
        <Title order={2}>🎤 VOCAL CRM</Title>
        <Text c="dimmed">프로젝트 뼈대가 준비되었습니다.</Text>
      </Stack>
    </MantineProvider>
  )
}
