import type { Customer, CustomerStatus } from '../types'

/** 가져오기 미리보기에 보여줄 이 PC 의 고객 */
export interface HintCustomer {
  id: string
  name: string
  phone: string | null
  status: CustomerStatus
}

export interface ImportHints {
  /** 🔗 같은 고객: 가져올 고객의 id·별칭이 이 PC 고객의 id·별칭과 일치 */
  same: HintCustomer[]
  /** 비슷한 고객: 연락처 또는 이름(공백 제거)이 같음. 최대 3명 */
  similar: HintCustomer[]
}

const compact = (s: string): string => s.replace(/\s+/g, '')

const toHint = (c: Customer): HintCustomer => ({ id: c.id, name: c.name, phone: c.phone, status: c.status })

export function findHints(
  incoming: { id: string; name: string; phone: string | null; aliases: string[] },
  locals: Customer[],
  aliasRows: { aliasId: string; customerId: string }[]
): ImportHints {
  const incomingIds = new Set([incoming.id, ...incoming.aliases])
  const sameIds = new Set<string>()
  for (const c of locals) if (incomingIds.has(c.id)) sameIds.add(c.id)
  for (const a of aliasRows) if (incomingIds.has(a.aliasId)) sameIds.add(a.customerId)
  const similar = locals
    .filter(
      (c) =>
        !sameIds.has(c.id) &&
        ((incoming.phone !== null && c.phone === incoming.phone) || compact(c.name) === compact(incoming.name))
    )
    .slice(0, 3)
  return { same: locals.filter((c) => sameIds.has(c.id)).map(toHint), similar: similar.map(toHint) }
}

/** 목표 제목이 같은지 (앞뒤 공백 제거, 대소문자 무시) */
export const sameTitle = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** 가져온 기록이 이 PC 기록보다 나중에 수정됐는지 (ISO 문자열 비교) */
export const isNewer = (incomingUpdatedAt: string, localUpdatedAt: string): boolean => incomingUpdatedAt > localUpdatedAt

/** 이력 문구: "홍대점에서 이동해 옴" */
export const movedInReason = (sourceBranch: string): string => `${sourceBranch}에서 이동해 옴`

/**
 * 공통메모 합치기: 가져온 메모가 비었거나 이미 들어 있으면 그대로,
 * 이 PC 메모가 비었으면 가져온 메모, 그 밖에는 구분선을 넣어 아래에 이어 붙인다.
 */
export function mergePinnedNote(local: string, incoming: string, sourceBranch: string, date: string): string {
  const inc = incoming.trim()
  if (!inc || local.includes(inc)) return local
  if (!local.trim()) return inc
  return `${local}\n\n── ${sourceBranch}에서 가져옴 (${date}) ──\n${inc}`
}

export type FillableField = 'phone' | 'birthDate' | 'gender' | 'purpose' | 'vocalRange' | 'preferredMusic'

/** 기본정보: 이 PC 값을 유지하고 비어 있는 칸만 가져온 값으로 채운다 */
export function fillEmptyInfo(local: Customer, incoming: Customer): Pick<Customer, FillableField> {
  return {
    phone: local.phone ?? incoming.phone,
    birthDate: local.birthDate ?? incoming.birthDate,
    gender: local.gender ?? incoming.gender,
    purpose: local.purpose ?? incoming.purpose,
    vocalRange: local.vocalRange ?? incoming.vocalRange,
    preferredMusic: local.preferredMusic ?? incoming.preferredMusic
  }
}
