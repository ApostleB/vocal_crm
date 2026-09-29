import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { ROSTER_HEADERS } from '@shared/domain/roster'
import { buildCustomersWorkbook, buildRosterTemplate, readRosterRows } from '@main/transfer/excel'
import { saveLesson } from '@main/store/lessons'
import { savePass } from '@main/store/passes'
import { createTestDb, NOW, seedCustomer } from '../support/db'

async function load(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  return wb
}

const values = (ws: ExcelJS.Worksheet, row: number): unknown[] => (ws.getRow(row).values as unknown[]).slice(1)

describe('buildCustomersWorkbook', () => {
  it('고객 목록 / 회차 기록 / 수강권 시트를 만든다', async () => {
    const db = createTestDb()
    const id = seedCustomer(db, { purpose: 'exam', pinnedNote: '성대결절 이력' })
    savePass(db, { customerId: id, count: 10, purchasedAt: '2026-09-01', amount: 550000, note: null }, NOW)
    for (const [date, memo] of [
      ['2026-09-21', '두 번째'],
      ['2026-09-14', '첫 수업']
    ]) {
      saveLesson(
        db,
        { customerId: id, lessonDate: date, memo, practice: null, homework: null, deductPass: true, reservationId: null, completedGoalIds: [] },
        NOW
      )
    }
    const wb = await load(await buildCustomersWorkbook(db, [id]))
    expect(wb.worksheets.map((w) => w.name)).toEqual(['고객 목록', '회차 기록', '수강권'])
    const customers = wb.getWorksheet('고객 목록') as ExcelJS.Worksheet
    expect(values(customers, 1)[0]).toBe('이름')
    expect(values(customers, 2)).toEqual([
      '김민지',
      '010-1234-5678',
      '',
      '',
      '입시',
      '수강중',
      '2026-03-02',
      '',
      '',
      '성대결절 이력',
      2,
      '2026-09-21',
      '8회'
    ])
    const lessons = wb.getWorksheet('회차 기록') as ExcelJS.Worksheet
    expect(values(lessons, 2).slice(0, 4)).toEqual(['김민지', 1, '2026-09-14', '첫 수업'])
    expect(values(lessons, 3).slice(0, 4)).toEqual(['김민지', 2, '2026-09-21', '두 번째'])
    const passes = wb.getWorksheet('수강권') as ExcelJS.Worksheet
    expect(values(passes, 2)).toEqual(['김민지', '2026-09-01', 10, 550000, ''])
  })

  it('고른 고객이 없으면 거부', async () => {
    await expect(buildCustomersWorkbook(createTestDb(), [])).rejects.toThrow('내보낼 고객을 선택해 주세요.')
  })
})

describe('roster template & reader', () => {
  it('양식은 머리글만 있고, 그대로 읽으면 행이 없다', async () => {
    const buf = await buildRosterTemplate()
    const wb = await load(buf)
    expect(values(wb.worksheets[0], 1)).toEqual([...ROSTER_HEADERS])
    expect(wb.worksheets[1].name).toBe('안내')
    expect(await readRosterRows(buf)).toEqual([])
  })

  it('날짜 칸·숫자 연락처·서식 있는 글자를 단순 값으로 읽는다', async () => {
    const wb = await load(await buildRosterTemplate())
    const ws = wb.worksheets[0]
    ws.addRow([{ richText: [{ text: '김' }, { text: '민지' }] }, 1012345678, new Date(Date.UTC(2003, 4, 12)), '여'])
    ws.addRow([])
    ws.addRow(['박서준'])
    const rows = await readRosterRows(Buffer.from(await wb.xlsx.writeBuffer()))
    expect(rows).toEqual([
      { rowNumber: 2, cells: ['김민지', 1012345678, new Date(Date.UTC(2003, 4, 12)), '여', null, null, null, null, null] },
      { rowNumber: 4, cells: ['박서준', null, null, null, null, null, null, null, null] }
    ])
  })

  it('엑셀이 아니면 안내한다', async () => {
    await expect(readRosterRows(Buffer.from('not excel'))).rejects.toThrow('엑셀 파일을 읽을 수 없습니다.')
  })
})
