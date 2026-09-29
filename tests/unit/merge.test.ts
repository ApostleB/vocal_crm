import { describe, expect, it } from 'vitest'
import { fillEmptyInfo, findHints, isNewer, mergePinnedNote, movedInReason, sameTitle } from '@shared/domain/merge'
import { makeCustomer } from '../support/factories'

describe('findHints', () => {
  const locals = [
    makeCustomer({ id: 'a', name: '김민지', phone: '01012345678' }),
    makeCustomer({ id: 'b', name: '박 서준', phone: '01099990000' }),
    makeCustomer({ id: 'c', name: '이하은', phone: '01055551212' }),
    makeCustomer({ id: 'd', name: '최도윤', phone: null })
  ]
  const aliases = [{ aliasId: 'hongdae-7', customerId: 'd' }]

  it('id 가 같거나 가져올 고객의 별칭이 이 PC 고객 id 이거나, 이 PC 별칭과 겹치면 같은 고객', () => {
    expect(findHints({ id: 'a', name: '다른이름', phone: null, aliases: [] }, locals, aliases).same.map((h) => h.id)).toEqual(['a'])
    expect(findHints({ id: 'zz', name: 'x', phone: null, aliases: ['c'] }, locals, aliases).same.map((h) => h.id)).toEqual(['c'])
    expect(findHints({ id: 'hongdae-7', name: 'x', phone: null, aliases: [] }, locals, aliases).same.map((h) => h.id)).toEqual(['d'])
  })

  it('연락처 또는 공백을 뺀 이름이 같으면 비슷한 고객 (같은 고객으로 잡힌 사람은 제외)', () => {
    const h = findHints({ id: 'new', name: '박서준', phone: '01055551212', aliases: [] }, locals, aliases)
    expect(h.same).toEqual([])
    expect(h.similar.map((s) => s.id)).toEqual(['b', 'c'])
    const h2 = findHints({ id: 'a', name: '김민지', phone: '01012345678', aliases: [] }, locals, aliases)
    expect(h2.similar).toEqual([])
  })

  it('비슷한 고객은 최대 3명', () => {
    const many = [1, 2, 3, 4].map((n) => makeCustomer({ id: `k${n}`, name: '김민지', phone: null }))
    expect(findHints({ id: 'new', name: '김민지', phone: null, aliases: [] }, many, []).similar).toHaveLength(3)
  })
})

describe('merge helpers', () => {
  it('sameTitle / isNewer / movedInReason', () => {
    expect(sameTitle(' Mix Voice ', 'mix voice')).toBe(true)
    expect(sameTitle('두성', '두성 연결')).toBe(false)
    expect(isNewer('2026-09-28T01:00:00.000Z', '2026-09-27T23:00:00.000Z')).toBe(true)
    expect(isNewer('2026-09-27T01:00:00.000Z', '2026-09-27T01:00:00.000Z')).toBe(false)
    expect(movedInReason('홍대점')).toBe('홍대점에서 이동해 옴')
  })

  it('mergePinnedNote: 비었거나 이미 있으면 그대로, 이 PC 가 비었으면 가져온 값, 아니면 구분선과 함께 이어 붙임', () => {
    expect(mergePinnedNote('A', '  ', '홍대점', '2026-09-28')).toBe('A')
    expect(mergePinnedNote('A\nB', 'B', '홍대점', '2026-09-28')).toBe('A\nB')
    expect(mergePinnedNote('', 'B', '홍대점', '2026-09-28')).toBe('B')
    expect(mergePinnedNote('A', 'B', '홍대점', '2026-09-28')).toBe('A\n\n── 홍대점에서 가져옴 (2026-09-28) ──\nB')
  })

  it('fillEmptyInfo: 이 PC 값 유지, 빈 칸만 채움', () => {
    const local = makeCustomer({ phone: '01011112222', birthDate: null, gender: null, vocalRange: 'F3~C5' })
    const incoming = makeCustomer({ phone: '01099998888', birthDate: '2003-05-12', gender: 'F', purpose: 'exam', vocalRange: 'G3~D5' })
    expect(fillEmptyInfo(local, incoming)).toEqual({
      phone: '01011112222',
      birthDate: '2003-05-12',
      gender: 'F',
      purpose: 'exam',
      vocalRange: 'F3~C5',
      preferredMusic: null
    })
  })
})
