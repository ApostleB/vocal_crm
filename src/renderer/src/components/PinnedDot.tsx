import { Text, Tooltip } from '@mantine/core'

/** 공통메모가 있으면 주황 점. 마우스를 올리면 내용을 보여준다 */
export function PinnedDot({ note }: { note: string }): React.JSX.Element | null {
  if (!note.trim()) return null
  return (
    <Tooltip label={<Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>{note}</Text>} multiline maw={320} withArrow>
      <Text span c="orange" ml={4} aria-label="공통메모 있음">
        ●
      </Text>
    </Tooltip>
  )
}
