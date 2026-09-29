import { Group, Text } from '@mantine/core'

export function Section({
  title,
  action,
  children
}: {
  title: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <Group justify="space-between" mb={6}>
        <Text size="xs" fw={700} c="dimmed">
          {title}
        </Text>
        {action}
      </Group>
      {children}
    </div>
  )
}
