import { describe, expect, it } from 'vitest'
import { customersExcelFileName, safeFileName, vcrmFileName } from '@shared/domain/transferNames'

describe('transfer file names', () => {
  it('1명이면 이름, 여러 명이면 인원수', () => {
    expect(vcrmFileName(['김민지'], '강남점', '2026-09-28')).toBe('김민지_강남점_2026-09-28.vcrm')
    expect(vcrmFileName(['김민지', '이하은', '박서준'], '강남점', '2026-09-28')).toBe('고객3명_강남점_2026-09-28.vcrm')
  })

  it('파일 이름에 쓸 수 없는 문자는 지운다', () => {
    expect(safeFileName(' 강남/점: ')).toBe('강남점')
    expect(customersExcelFileName('강남점', '2026-09-28')).toBe('VOCAL_CRM_고객목록_강남점_2026-09-28.xlsx')
  })
})
