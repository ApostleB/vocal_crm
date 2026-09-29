import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { createHandlers } from '@main/ipc/handlers'
import { getCustomer } from '@main/store/customers'
import { updateSettings } from '@main/store/settings'
import { parseVcrm, serializeVcrm } from '@shared/vcrm'
import { createTestDb, NOW, seedCustomer } from '../support/db'
import { memoryFiles } from '../support/files'
import { sampleFile } from '../support/vcrm'

function setup() {
  const db = createTestDb()
  updateSettings(db, { branchName: '강남점' })
  const files = memoryFiles()
  return { db, files, h: createHandlers(db, () => NOW, files) }
}

describe('transfer.exportVcrm', () => {
  it('파일 이름을 제안하고 저장하며, 요청하면 타지점 이동으로 바꾼다', async () => {
    const { db, files, h } = setup()
    const id = seedCustomer(db)
    const r = await h['transfer.exportVcrm']({ customerIds: [id], targetBranch: '홍대점', markMoved: true })
    expect(r).toEqual({ saved: true, count: 1, moved: 1, canceledReservations: 0 })
    expect(files.lastDefaultName).toBe('김민지_강남점_2026-09-28.vcrm')
    const file = parseVcrm((files.store.get('/out/file') as Buffer).toString('utf-8'))
    expect(file).toMatchObject({ sourceBranch: '강남점', targetBranch: '홍대점' })
    expect(getCustomer(db, id)?.status).toBe('moved')
  })

  it('저장 창을 취소하면 아무것도 바꾸지 않는다', async () => {
    const { db, files, h } = setup()
    const id = seedCustomer(db)
    files.nextSavePath = null
    expect(await h['transfer.exportVcrm']({ customerIds: [id], targetBranch: null, markMoved: true })).toEqual({
      saved: false,
      count: 0,
      moved: 0,
      canceledReservations: 0
    })
    expect(getCustomer(db, id)?.status).toBe('active')
  })
})

describe('transfer.openVcrm / applyVcrm', () => {
  it('열어서 미리보기를 주고, 같은 token 으로 한 번 적용한다', async () => {
    const { db, files, h } = setup()
    files.store.set('/in/file', Buffer.from(serializeVcrm(sampleFile()), 'utf-8'))
    const preview = await h['transfer.openVcrm']()
    expect(preview).toMatchObject({ sourceBranch: '홍대점', rows: [{ incomingId: 'x1', name: '김민지' }] })
    const result = await h['transfer.applyVcrm'](preview!.token, [{ incomingId: 'x1', action: 'new' }])
    expect(result).toEqual({ added: 1, merged: 0, skipped: 0 })
    expect(getCustomer(db, 'x1')?.status).toBe('active')
    await expect(async () => h['transfer.applyVcrm'](preview!.token, [])).rejects.toThrow('가져오기 정보가 만료되었습니다')
  })

  it('취소하면 null, 잘못된 파일이면 읽을 수 없다고 안내', async () => {
    const { files, h } = setup()
    files.nextOpenPath = null
    expect(await h['transfer.openVcrm']()).toBeNull()
    files.nextOpenPath = '/in/file'
    files.store.set('/in/file', Buffer.from('garbage'))
    await expect(h['transfer.openVcrm']()).rejects.toThrow('이 파일은 읽을 수 없습니다.')
  })
})

describe('excel channels', () => {
  it('고객 엑셀과 명단 양식을 저장한다', async () => {
    const { db, files, h } = setup()
    const id = seedCustomer(db)
    expect(await h['excel.exportCustomers']([id])).toEqual({ saved: true })
    expect(files.lastDefaultName).toBe('VOCAL_CRM_고객목록_강남점_2026-09-28.xlsx')
    expect(await h['excel.saveRosterTemplate']()).toEqual({ saved: true })
    expect(files.lastDefaultName).toBe('VOCAL_CRM_명단등록_양식.xlsx')
  })

  it('명단을 열어 미리보기 후 고른 행만 등록한다', async () => {
    const { db, files, h } = setup()
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('명단')
    ws.addRow(['이름', '연락처'])
    ws.addRow(['한지우', '010-3333-7777'])
    ws.addRow(['윤서아'])
    files.store.set('/in/file', Buffer.from(await wb.xlsx.writeBuffer()))
    const preview = await h['excel.openRoster']()
    expect(preview?.rows.map((r) => r.input?.name)).toEqual(['한지우', '윤서아'])
    expect(await h['excel.applyRoster'](preview!.token, [2])).toEqual({ added: 1 })
    expect(db.prepare('SELECT name FROM customers').pluck().all()).toEqual(['한지우'])
    await expect(async () => h['excel.applyRoster'](preview!.token, [3])).rejects.toThrow('가져오기 정보가 만료되었습니다')
  })
})
