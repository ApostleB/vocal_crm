import ExcelJS from 'exceljs'
import { numberLessons } from '@shared/domain/lessons'
import { GENDER_LABEL, PURPOSE_LABEL, STATUS_LABEL } from '@shared/domain/labels'
import { formatRemaining, remainingPasses } from '@shared/domain/passes'
import { formatPhone } from '@shared/domain/phone'
import { ROSTER_HEADERS, type RosterCell, type RosterRow } from '@shared/domain/roster'
import type { DB } from '../db/connection'
import { getCustomer } from '../store/customers'
import { listLessons } from '../store/lessons'
import { listPasses } from '../store/passes'
import { notFound, validation } from '../store/util'

const toBuffer = async (wb: ExcelJS.Workbook): Promise<Buffer> => Buffer.from(await wb.xlsx.writeBuffer())

function styleHeader(ws: ExcelJS.Worksheet): void {
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

/** 보관·인쇄용 엑셀 (시트: 고객 목록 / 회차 기록 / 수강권). 다시 가져오지 않는다 */
export async function buildCustomersWorkbook(db: DB, customerIds: string[]): Promise<Buffer> {
  if (customerIds.length === 0) throw validation('내보낼 고객을 선택해 주세요.')
  const wb = new ExcelJS.Workbook()
  const customersSheet = wb.addWorksheet('고객 목록')
  customersSheet.columns = [
    { header: '이름', width: 12 },
    { header: '연락처', width: 16 },
    { header: '생년월일', width: 12 },
    { header: '성별', width: 6 },
    { header: '수강 목적', width: 10 },
    { header: '상태', width: 10 },
    { header: '등록일', width: 12 },
    { header: '음역대', width: 12 },
    { header: '선호 장르·목표곡', width: 24 },
    { header: '공통메모', width: 40 },
    { header: '회차 수', width: 8 },
    { header: '최근 수업일', width: 12 },
    { header: '남은 수강권', width: 10 }
  ]
  const lessonsSheet = wb.addWorksheet('회차 기록')
  lessonsSheet.columns = [
    { header: '고객명', width: 12 },
    { header: '회차', width: 6 },
    { header: '날짜', width: 12 },
    { header: '메모', width: 60 },
    { header: '연습 곡', width: 24 },
    { header: '다음 과제', width: 24 },
    { header: '수강권 차감', width: 10 }
  ]
  const passesSheet = wb.addWorksheet('수강권')
  passesSheet.columns = [
    { header: '고객명', width: 12 },
    { header: '결제일', width: 12 },
    { header: '횟수', width: 6 },
    { header: '금액', width: 12 },
    { header: '비고', width: 24 }
  ]

  for (const id of customerIds) {
    const c = getCustomer(db, id)
    if (!c) throw notFound('고객을 찾을 수 없습니다.')
    const lessons = numberLessons(listLessons(db, id))
    const passes = listPasses(db, id)
    const remaining = remainingPasses({
      records: passes.length,
      total: passes.reduce((s, p) => s + p.count, 0),
      deducted: lessons.filter((l) => l.deductPass).length
    })
    customersSheet.addRow([
      c.name,
      c.phone ? formatPhone(c.phone) : '',
      c.birthDate ?? '',
      c.gender ? GENDER_LABEL[c.gender] : '',
      c.purpose ? PURPOSE_LABEL[c.purpose] : '',
      STATUS_LABEL[c.status],
      c.registeredAt,
      c.vocalRange ?? '',
      c.preferredMusic ?? '',
      c.pinnedNote,
      lessons.length,
      lessons.at(-1)?.lessonDate ?? '',
      formatRemaining(remaining)
    ])
    for (const l of lessons) {
      lessonsSheet.addRow([c.name, l.number, l.lessonDate, l.memo, l.practice ?? '', l.homework ?? '', l.deductPass ? '예' : '아니오'])
    }
    for (const p of [...passes].reverse()) {
      passesSheet.addRow([c.name, p.purchasedAt, p.count, p.amount ?? '', p.note ?? ''])
    }
  }
  for (const ws of [customersSheet, lessonsSheet, passesSheet]) styleHeader(ws)
  lessonsSheet.getColumn(4).alignment = { wrapText: true, vertical: 'top' }
  customersSheet.getColumn(10).alignment = { wrapText: true, vertical: 'top' }
  return toBuffer(wb)
}

/** 명단 등록 양식: 첫 시트 "명단"(머리글만), 둘째 시트 "안내" */
export async function buildRosterTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('명단')
  ws.addRow([...ROSTER_HEADERS])
  ws.columns.forEach((col, i) => {
    col.width = [12, 16, 12, 6, 10, 12, 12, 24, 40][i]
  })
  styleHeader(ws)
  const guide = wb.addWorksheet('안내')
  for (const line of [
    '명단 시트의 2번째 줄부터 한 사람씩 입력하세요. 머리글(1번째 줄)은 지우지 마세요.',
    '이름은 꼭 입력해야 합니다. 나머지는 비워도 됩니다.',
    '생년월일·등록일: 2003-05-12 형식 (등록일이 비면 오늘)',
    '성별: 여 / 남',
    '수강 목적: 취미 / 입시 / 오디션 / 직업 / 기타'
  ]) {
    guide.addRow([line])
  }
  guide.getColumn(1).width = 80
  return toBuffer(wb)
}

/** exceljs 칸 값을 단순 값으로 (서식 있는 글자, 링크, 수식 결과 포함) */
export function toRosterCell(v: ExcelJS.CellValue): RosterCell {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return v
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('text' in v && typeof v.text === 'string') return v.text
    if ('result' in v) {
      const r = v.result
      return typeof r === 'string' || typeof r === 'number' || r instanceof Date ? r : null
    }
  }
  return null
}

/** 첫 시트의 2번째 줄부터 읽는다 (1번째 줄은 머리글) */
export async function readRosterRows(data: Buffer): Promise<RosterRow[]> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer)
  } catch {
    throw validation('엑셀 파일을 읽을 수 없습니다. .xlsx 파일인지 확인해 주세요.')
  }
  const ws = wb.worksheets[0]
  if (!ws) throw validation('엑셀 파일에 시트가 없습니다.')
  const rows: RosterRow[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const cells: RosterCell[] = []
    for (let col = 1; col <= ROSTER_HEADERS.length; col++) cells.push(toRosterCell(row.getCell(col).value))
    rows.push({ rowNumber, cells })
  })
  return rows
}
