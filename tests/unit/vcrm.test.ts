import { describe, expect, it } from 'vitest'
import { parseVcrm, serializeVcrm, VCRM_VERSION } from '@shared/vcrm'
import { sampleFile } from '../support/vcrm'

describe('parseVcrm', () => {
  it('저장한 내용을 그대로 다시 읽는다', () => {
    const file = sampleFile()
    expect(parseVcrm(serializeVcrm(file))).toEqual(file)
  })

  it('JSON 이 아니거나 형식이 다르거나 구조가 틀리면 "이 파일은 읽을 수 없습니다."', () => {
    expect(() => parseVcrm('hello')).toThrow('이 파일은 읽을 수 없습니다.')
    expect(() => parseVcrm(JSON.stringify({ ...sampleFile(), format: 'other' }))).toThrow('이 파일은 읽을 수 없습니다.')
    const broken = sampleFile()
    ;(broken.customers[0].lessons[0] as { lessonDate: string }).lessonDate = '9/21'
    expect(() => parseVcrm(JSON.stringify(broken))).toThrow('이 파일은 읽을 수 없습니다.')
  })

  it('더 새 버전 파일은 앱을 바꾸라고 안내한다', () => {
    expect(() => parseVcrm(JSON.stringify({ ...sampleFile(), version: VCRM_VERSION + 1 }))).toThrow(
      '새 버전 앱에서 만든 파일입니다'
    )
  })
})
