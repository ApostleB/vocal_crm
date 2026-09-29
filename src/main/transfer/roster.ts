import type { Customer } from '@shared/types'
import { findHints } from '@shared/domain/merge'
import { isBlankRow, parseRosterRow, type RosterRow } from '@shared/domain/roster'
import type { RosterPreviewRow } from '@shared/transferTypes'
import type { DB } from '../db/connection'
import { customerColumns } from '../store/columns'
import { createCustomer } from '../store/customers'
import { validation } from '../store/util'

/** 빈 행은 빼고, 행마다 검증 결과와 이름·연락처가 같은 고객 힌트를 붙인다 */
export function previewRoster(db: DB, rows: RosterRow[], today: string): RosterPreviewRow[] {
  const locals = db.prepare(`SELECT ${customerColumns()} FROM customers`).all() as Customer[]
  return rows
    .filter((r) => !isBlankRow(r.cells))
    .map((r) => {
      const parsed = parseRosterRow(r, today)
      const similar = parsed.input
        ? findHints({ id: '', name: parsed.input.name, phone: parsed.input.phone, aliases: [] }, locals, []).similar
        : []
      return { ...parsed, similar }
    })
}

/** 고른 행을 하나의 트랜잭션으로 새 고객 등록한다 */
export function applyRoster(db: DB, rows: RosterPreviewRow[], rowNumbers: number[], now: Date): { added: number } {
  const selected = rows.filter((r) => rowNumbers.includes(r.rowNumber))
  const invalid = selected.filter((r) => r.input === null)
  if (invalid.length > 0) {
    throw validation(`추가할 수 없는 행이 있습니다: ${invalid.map((r) => `${r.rowNumber}행`).join(', ')}`)
  }
  db.transaction(() => {
    for (const r of selected) if (r.input) createCustomer(db, r.input, now)
  })()
  return { added: selected.length }
}
