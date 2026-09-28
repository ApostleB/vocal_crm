import type { CustomerInput } from '@shared/types'
import { openDatabase, type DB } from '@main/db/connection'
import { createCustomer } from '@main/store/customers'

export const NOW = new Date('2026-09-28T06:00:00.000Z')
export const TODAY = '2026-09-28'

export function createTestDb(): DB {
  return openDatabase(':memory:')
}

export function customerInput(over: Partial<CustomerInput> = {}): CustomerInput {
  return {
    name: '김민지',
    phone: '010-1234-5678',
    birthDate: null,
    gender: null,
    purpose: null,
    registeredAt: '2026-03-02',
    vocalRange: null,
    preferredMusic: null,
    pinnedNote: '',
    ...over
  }
}

export function seedCustomer(db: DB, over: Partial<CustomerInput> = {}): string {
  return createCustomer(db, customerInput(over), NOW).id
}
