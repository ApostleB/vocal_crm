import { describe, expect, it } from 'vitest'
import { isBlankRow, parseRosterRow, rosterDate, rosterPhone } from '@shared/domain/roster'

const TODAY = '2026-09-28'

describe('roster cell helpers', () => {
  it('rosterDate: 엑셀 날짜(UTC 자정)와 여러 구분자 문자열, 없는 날짜는 null', () => {
    expect(rosterDate(new Date(Date.UTC(2003, 4, 12)))).toBe('2003-05-12')
    expect(rosterDate('2003.5.12')).toBe('2003-05-12')
    expect(rosterDate('2003/05/12')).toBe('2003-05-12')
    expect(rosterDate('2003-02-30')).toBeNull()
    expect(rosterDate('5월 12일')).toBeNull()
    expect(rosterDate(null)).toBeNull()
  })

  it('rosterPhone: 숫자로 저장돼 빠진 앞자리 0 을 되살린다', () => {
    expect(rosterPhone(1012345678)).toBe('01012345678')
    expect(rosterPhone('010-1234-5678')).toBe('01012345678')
    expect(rosterPhone(null)).toBeNull()
  })

  it('isBlankRow', () => {
    expect(isBlankRow([null, '', '  '])).toBe(true)
    expect(isBlankRow([null, 'x'])).toBe(false)
  })
})

describe('parseRosterRow', () => {
  it('모든 칸을 고객 입력으로 바꾼다', () => {
    const r = parseRosterRow(
      {
        rowNumber: 2,
        cells: ['김민지', '010-1234-5678', new Date(Date.UTC(2003, 4, 12)), '여', '입시', '2026-03-02', 'F3~C5', '발라드', '성대결절 이력']
      },
      TODAY
    )
    expect(r).toEqual({
      rowNumber: 2,
      errors: [],
      warnings: [],
      input: {
        name: '김민지',
        phone: '01012345678',
        birthDate: '2003-05-12',
        gender: 'F',
        purpose: 'exam',
        registeredAt: '2026-03-02',
        vocalRange: 'F3~C5',
        preferredMusic: '발라드',
        pinnedNote: '성대결절 이력'
      }
    })
  })

  it('이름이 없으면 오류, 형식이 틀린 칸은 비우고 경고, 등록일이 없으면 오늘', () => {
    expect(parseRosterRow({ rowNumber: 3, cells: [null, '010'] }, TODAY)).toMatchObject({
      input: null,
      errors: ['이름이 없습니다.']
    })
    const r = parseRosterRow({ rowNumber: 4, cells: ['박서준', null, '어제', '남자', '밴드', 'x'] }, TODAY)
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([
      '생년월일 형식이 달라 비웠습니다.',
      '성별은 여/남으로 입력해 주세요. 비웠습니다.',
      '수강 목적을 알 수 없어 비웠습니다.',
      '등록일 형식이 달라 오늘로 넣었습니다.'
    ])
    expect(r.input).toMatchObject({ birthDate: null, gender: null, purpose: null, registeredAt: TODAY, pinnedNote: '' })
    expect(parseRosterRow({ rowNumber: 5, cells: ['한지우'] }, TODAY).input?.registeredAt).toBe(TODAY)
  })
})
