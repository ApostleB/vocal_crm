import { describe, expect, it } from 'vitest'
import { statusLogText, withEuro } from '@shared/domain/labels'

describe('statusLogText', () => {
  it.each([
    [{ fromStatus: null, toStatus: 'active', reason: null }, '수강 시작'],
    [{ fromStatus: 'ended', toStatus: 'active', reason: null }, '재등록'],
    [{ fromStatus: 'ended', toStatus: 'active', reason: '강남점에서 이동해 옴' }, '강남점에서 이동해 옴'],
    [{ fromStatus: 'active', toStatus: 'ended', reason: '이사' }, '수강 종료 (이사)'],
    [{ fromStatus: 'active', toStatus: 'paused', reason: null }, '휴강'],
    [{ fromStatus: 'active', toStatus: 'moved', reason: '홍대점으로 이동' }, '타지점 이동 (홍대점으로 이동)']
  ] as const)('%o → %s', (log, expected) => {
    expect(statusLogText(log)).toBe(expected)
  })
})

describe('withEuro', () => {
  it.each([
    ['홍대점', '홍대점으로'],
    ['서울', '서울로'],
    ['부산', '부산으로'],
    ['마포', '마포로'],
    ['B', 'B(으)로']
  ])('%s → %s', (word, expected) => {
    expect(withEuro(word)).toBe(expected)
  })
})
