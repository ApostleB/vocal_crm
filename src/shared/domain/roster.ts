import type { CustomerInput, Gender, Purpose } from '../types'
import { PURPOSE_LABEL } from './labels'
import { normalizePhone } from './phone'

/** 엑셀 명단 양식의 열 순서 (설계 5.8) */
export const ROSTER_HEADERS = [
  '이름',
  '연락처',
  '생년월일',
  '성별',
  '수강 목적',
  '등록일',
  '음역대',
  '선호 장르·목표곡',
  '공통메모'
] as const

/** 엑셀 칸에서 꺼낸 값 (Main 에서 exceljs 값을 이 형태로 바꿔 넘긴다) */
export type RosterCell = string | number | Date | null

export interface RosterRow {
  rowNumber: number
  cells: RosterCell[]
}

export interface RosterRowResult {
  rowNumber: number
  /** 이름이 없으면 null (추가할 수 없음) */
  input: CustomerInput | null
  errors: string[]
  warnings: string[]
}

const text = (v: RosterCell | undefined): string => {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return ''
  return String(v).trim()
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** 엑셀 날짜 칸(UTC 자정 Date) 또는 "2003-05-12" / "2003.05.12" / "2003/5/12" 문자열 → YYYY-MM-DD. 알 수 없으면 null */
export function rosterDate(v: RosterCell | undefined): string | null {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
  }
  const m = text(v).match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  return `${y}-${pad(mo)}-${pad(d)}`
}

/** 숫자로 저장돼 앞자리 0 이 빠진 휴대폰 번호(1012345678)를 되살린다 */
export function rosterPhone(v: RosterCell | undefined): string | null {
  if (typeof v === 'number') {
    const digits = String(Math.trunc(v))
    return digits.length >= 9 && digits.length <= 10 && !digits.startsWith('0') ? `0${digits}` : digits
  }
  return normalizePhone(text(v))
}

const GENDER_BY_LABEL: Record<string, Gender> = { 여: 'F', 남: 'M' }
const PURPOSE_BY_LABEL = Object.fromEntries(
  (Object.keys(PURPOSE_LABEL) as Purpose[]).map((p) => [PURPOSE_LABEL[p], p])
) as Record<string, Purpose>

/** 모든 칸이 비었으면 true (건너뛸 행) */
export const isBlankRow = (cells: RosterCell[]): boolean => cells.every((c) => text(c) === '' && !(c instanceof Date))

/** 한 행을 고객 입력으로 바꾼다. 형식이 틀린 칸은 비우고 경고, 이름이 없으면 오류 */
export function parseRosterRow(row: RosterRow, today: string): RosterRowResult {
  const c = row.cells
  const errors: string[] = []
  const warnings: string[] = []
  const name = text(c[0])
  if (!name) errors.push('이름이 없습니다.')

  const birthRaw = c[2]
  const birthDate = rosterDate(birthRaw)
  if (birthDate === null && (birthRaw instanceof Date || text(birthRaw) !== '')) {
    warnings.push('생년월일 형식이 달라 비웠습니다.')
  }

  const genderText = text(c[3])
  const gender = genderText ? (GENDER_BY_LABEL[genderText] ?? null) : null
  if (genderText && !gender) warnings.push('성별은 여/남으로 입력해 주세요. 비웠습니다.')

  const purposeText = text(c[4])
  const purpose = purposeText ? (PURPOSE_BY_LABEL[purposeText] ?? null) : null
  if (purposeText && !purpose) warnings.push('수강 목적을 알 수 없어 비웠습니다.')

  const regRaw = c[5]
  let registeredAt = rosterDate(regRaw)
  if (registeredAt === null) {
    if (regRaw instanceof Date || text(regRaw) !== '') warnings.push('등록일 형식이 달라 오늘로 넣었습니다.')
    registeredAt = today
  }

  return {
    rowNumber: row.rowNumber,
    errors,
    warnings,
    input: name
      ? {
          name,
          phone: rosterPhone(c[1]),
          birthDate,
          gender,
          purpose,
          registeredAt,
          vocalRange: text(c[6]) || null,
          preferredMusic: text(c[7]) || null,
          pinnedNote: text(c[8])
        }
      : null
  }
}
