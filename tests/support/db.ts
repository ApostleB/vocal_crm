import { openDatabase, type DB } from '@main/db/connection'

export const NOW = new Date('2026-09-28T06:00:00.000Z')
export const TODAY = '2026-09-28'

export function createTestDb(): DB {
  return openDatabase(':memory:')
}
