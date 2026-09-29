import { SimpleGrid, Text } from '@mantine/core'
import type { Customer } from '@shared/types'
import { ageOn } from '@shared/domain/dates'
import { GENDER_LABEL, PURPOSE_LABEL } from '@shared/domain/labels'
import { formatPhone } from '@shared/domain/phone'
import { Section } from './Section'

export function InfoSection({ customer, today }: { customer: Customer; today: string }): React.JSX.Element {
  const birth = customer.birthDate
    ? `${customer.birthDate.replaceAll('-', '.')} (${ageOn(customer.birthDate, today)}세)`
    : null
  const rows: [string, string | null][] = [
    ['연락처', customer.phone ? formatPhone(customer.phone) : null],
    ['생년월일', [birth, customer.gender ? GENDER_LABEL[customer.gender] : null].filter(Boolean).join(' · ') || null],
    ['목적', customer.purpose ? PURPOSE_LABEL[customer.purpose] : null],
    ['등록일', customer.registeredAt],
    ['음역대', customer.vocalRange],
    ['선호/목표곡', customer.preferredMusic]
  ]
  if (customer.status === 'paused' && customer.pauseUntil) rows.push(['휴강 종료', customer.pauseUntil])
  return (
    <Section title="공통 고객정보">
      <SimpleGrid cols={2} spacing={4} verticalSpacing={4} style={{ gridTemplateColumns: '72px 1fr' }}>
        {rows.map(([label, value]) => [
          <Text key={`${label}-l`} size="sm" c="dimmed">
            {label}
          </Text>,
          <Text key={`${label}-v`} size="sm" c={value ? undefined : 'dimmed'}>
            {value ?? '–'}
          </Text>
        ])}
      </SimpleGrid>
    </Section>
  )
}
