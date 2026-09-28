import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone } from '@shared/domain/phone'

describe('phone', () => {
  it('normalizePhone은 숫자만 남기고 비면 null', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678')
    expect(normalizePhone('  ')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })

  it.each([
    ['01012345678', '010-1234-5678'],
    ['0101234567', '010-123-4567'],
    ['0311234567', '031-123-4567'],
    ['0212345678', '02-1234-5678'],
    ['021234567', '02-123-4567'],
    ['0101', '010-1'],
    ['010', '010'],
    ['', '']
  ])('formatPhone(%s) = %s', (input, expected) => {
    expect(formatPhone(input)).toBe(expected)
  })
})
