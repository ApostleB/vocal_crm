import { toDateString } from '@shared/domain/dates'
import { customersExcelFileName, ROSTER_TEMPLATE_FILE_NAME, vcrmFileName } from '@shared/domain/transferNames'
import { AppError } from '@shared/result'
import type { RosterPreviewRow } from '@shared/transferTypes'
import { parseVcrm, serializeVcrm, type VcrmFile } from '@shared/vcrm'
import type { DB } from '../db/connection'
import { getSettings } from '../store/settings'
import { newId } from '../store/util'
import { buildCustomersWorkbook, buildRosterTemplate, readRosterRows } from '../transfer/excel'
import { buildVcrm, markMoved } from '../transfer/exportVcrm'
import { EXCEL_FILTERS, VCRM_FILTERS, type FileAccess } from '../transfer/files'
import { applyImport, previewRows } from '../transfer/importVcrm'
import { applyRoster, previewRoster } from '../transfer/roster'
import type { Handlers } from './handlers'

type TransferChannel =
  | 'transfer.exportVcrm'
  | 'transfer.openVcrm'
  | 'transfer.applyVcrm'
  | 'excel.exportCustomers'
  | 'excel.saveRosterTemplate'
  | 'excel.openRoster'
  | 'excel.applyRoster'

const expired = (): AppError =>
  new AppError('IMPORT_EXPIRED', '가져오기 정보가 만료되었습니다. 파일을 다시 열어 주세요.')

/**
 * 지점 이동(.vcrm)·엑셀 채널. 열어 둔 파일은 미리보기와 적용 사이에 Main 메모리에 한 개만 보관한다.
 */
export function createTransferHandlers(
  db: DB,
  clock: () => Date,
  files: FileAccess
): Pick<Handlers, TransferChannel> {
  const today = (): string => toDateString(clock())
  const branch = (): string => getSettings(db).branchName ?? ''
  let pendingVcrm: { token: string; file: VcrmFile } | null = null
  let pendingRoster: { token: string; rows: RosterPreviewRow[] } | null = null

  return {
    'transfer.exportVcrm': async ({ customerIds, targetBranch, markMoved: move }) => {
      const file = buildVcrm(db, customerIds, { sourceBranch: branch(), targetBranch }, clock())
      const names = file.customers.map((e) => e.customer.name)
      const path = await files.chooseSavePath(vcrmFileName(names, branch(), today()), VCRM_FILTERS)
      if (!path) return { saved: false, count: 0, moved: 0 }
      await files.writeFile(path, serializeVcrm(file))
      const moved = move ? markMoved(db, customerIds, targetBranch, today(), clock()) : 0
      return { saved: true, count: customerIds.length, moved }
    },

    'transfer.openVcrm': async () => {
      const path = await files.chooseOpenPath(VCRM_FILTERS)
      if (!path) return null
      const file = parseVcrm((await files.readFile(path)).toString('utf-8'))
      pendingVcrm = { token: newId(), file }
      return {
        token: pendingVcrm.token,
        sourceBranch: file.sourceBranch,
        exportedAt: file.exportedAt,
        rows: previewRows(db, file)
      }
    },

    'transfer.applyVcrm': (token, decisions) => {
      if (!pendingVcrm || pendingVcrm.token !== token) throw expired()
      const result = applyImport(db, pendingVcrm.file, decisions, today(), clock())
      pendingVcrm = null
      return result
    },

    'excel.exportCustomers': async (customerIds) => {
      const data = await buildCustomersWorkbook(db, customerIds)
      const path = await files.chooseSavePath(customersExcelFileName(branch(), today()), EXCEL_FILTERS)
      if (!path) return { saved: false }
      await files.writeFile(path, data)
      return { saved: true }
    },

    'excel.saveRosterTemplate': async () => {
      const path = await files.chooseSavePath(ROSTER_TEMPLATE_FILE_NAME, EXCEL_FILTERS)
      if (!path) return { saved: false }
      await files.writeFile(path, await buildRosterTemplate())
      return { saved: true }
    },

    'excel.openRoster': async () => {
      const path = await files.chooseOpenPath(EXCEL_FILTERS)
      if (!path) return null
      const rows = previewRoster(db, await readRosterRows(await files.readFile(path)), today())
      pendingRoster = { token: newId(), rows }
      return { token: pendingRoster.token, rows }
    },

    'excel.applyRoster': (token, rowNumbers) => {
      if (!pendingRoster || pendingRoster.token !== token) throw expired()
      const result = applyRoster(db, pendingRoster.rows, rowNumbers, clock())
      pendingRoster = null
      return result
    }
  }
}
