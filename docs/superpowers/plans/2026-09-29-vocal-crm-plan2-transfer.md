# VOCAL_CRM 계획 2: 지점 이동(.vcrm)·엑셀 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계 문서 5.8·6장의 가져오기·내보내기 — 고객을 `.vcrm` 파일로 내보내고(선택 시 '타지점 이동' 처리), 다른 지점 파일을 미리보기에서 고객마다 신규 추가 / 합치기 / 건너뛰기로 가져오고, 보관용 엑셀 내보내기와 첫 시작용 엑셀 명단 등록 — 을 만들고, 그 전에 계획 1 후속 문서의 store 입력 검증을 보강한다.

**Architecture:** `.vcrm` 형식은 `src/shared/vcrm.ts`(zod 스키마)가, 합치기 판단(힌트·제목 비교·공통메모 이어 붙이기·빈 칸 채우기)과 엑셀 행 해석은 `src/shared/domain` 의 순수 함수가 맡는다. Main 의 `src/main/transfer/` 가 DB 에서 파일 내용을 만들고(`exportVcrm`), 한 트랜잭션으로 적용하며(`importVcrm`, `roster`), exceljs 로 엑셀을 읽고 쓴다(`excel`). 파일 대화상자·읽기·쓰기는 `FileAccess` 인터페이스로 감싸 테스트에서 메모리 가짜로 바꾼다. 열어 둔 파일은 미리보기와 적용 사이에 Main 메모리에 token 으로 한 개만 보관한다.

**Tech Stack:** 계획 1 그대로 (Electron 44, electron-vite 5, React 19, Mantine 9, TanStack Query 5, better-sqlite3 13, Vitest 5) + **zod 4**(.vcrm 검증) + **exceljs 4**(엑셀).

**전제:** 계획 1 이 main 에 완료되어 있다 (테스트 25개 파일 94개 통과). 이 계획이 끝나면 테스트 38개 파일 145개가 통과한다.

## Global Constraints

- 모든 명령은 저장소 루트 `/Users/jeongbaul/Dev/SIDE_PROJECT/VOCAL_CRM` 에서 실행한다.
- Node.js 22.12 이상. 계획 1 의 패키지 버전을 바꾸지 않는다. 새로 추가하는 것은 **`zod@^4.6.5`, `exceljs@^4.4.0` 두 개뿐이며 `dependencies`** 에 넣는다 (Main 번들에서 외부 모듈로 남는다).
- 화면 문구·오류 메시지는 모두 **한국어**. 사용자에게 보이는 오류는 `AppError(code, message)` 로 던진다.
- 날짜 `YYYY-MM-DD`, 생성·수정 시각 ISO 8601, id 는 `crypto.randomUUID()` (계획 1 과 같음).
- `.vcrm` 은 UTF-8 JSON, `format: "vocal-crm"`, `version: 1`. 예약과 수업의 `reservationId` 는 파일에 넣지 않는다.
- 가져오기는 **자동으로 결정하지 않는다.** 모든 고객의 처리 방법을 사용자가 고르기 전에는 적용할 수 없다. "한 번에 지정" 버튼도 누를 때만 채운다.
- 가져오기·명단 등록 적용은 **하나의 트랜잭션** — 중간에 실패하면 아무것도 바뀌지 않는다.
- 같은 파일을 두 번 가져와도(합치기) 기록이 중복되지 않아야 한다(멱등).
- `useEffect` 콜백은 항상 중괄호 블록으로 쓴다 (계획 1 과 같음).
- 커밋 메시지는 한국어 한 줄 요약 + 마지막 줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 하나만. 다른 공동 작성자 줄을 붙이지 않는다.

## 설계 문서와 달라진 점

| 설계 문서 | 이 계획 | 이유 |
|---|---|---|
| 가져오기 적용 직전 자동 백업 | 이 계획에는 없음. 계획 3 에서 백업을 만들 때 `transfer.applyVcrm`·`excel.applyRoster` 앞에 끼워 넣는다 | 백업 기능이 계획 3 범위 |
| 이 PC 의 메모가 비었을 때도 구분선과 함께 이어 붙임 | 이 PC 공통메모가 비어 있으면 가져온 메모를 그대로 넣는다 (구분선 없음) | 빈 메모 아래 구분선만 생기는 것을 막기 위해 |
| 엑셀 명단 카드 버튼 "파일 열기" | "명단 열기" | 같은 화면의 .vcrm "파일 열기" 와 구분 |
| 신규 추가 시 이력 | 파일의 상태 이력을 모두 옮기고, 마지막에 `"<보낸 지점>에서 이동해 옴"`(from = 파일의 상태) 한 줄 추가 | 설계 그대로이며 from 값을 명시 |
| 같은 날 같은 사유의 "이동해 옴" 이력 | 이미 있으면 다시 쓰지 않는다 | 같은 파일 재가져오기 멱등 |

## 파일 구조

```
src/shared/
  vcrm.ts                        .vcrm zod 스키마, parseVcrm / serializeVcrm, VCRM_VERSION
  transferTypes.ts               ImportPreview·ImportDecision·ImportResult·RosterPreview (IPC 로 오가는 타입)
  domain/enums.ts                상태·목적·성별 값 목록과 판별 함수
  domain/transferNames.ts        내보내기 파일 이름 규칙
  domain/merge.ts                힌트 찾기, 제목 비교, 최신 판단, 공통메모 이어 붙이기, 빈 칸 채우기
  domain/roster.ts               엑셀 명단 열 정의와 행 해석(날짜·연락처·성별·목적)
src/main/transfer/
  exportVcrm.ts                  buildVcrm (DB → 파일 내용), markMoved
  importVcrm.ts                  previewRows, applyImport (신규 추가 / 합치기 / 건너뛰기)
  excel.ts                       고객 엑셀, 명단 양식, 명단 읽기 (exceljs)
  roster.ts                      previewRoster, applyRoster
  files.ts                       FileAccess 인터페이스, 필터, noFileAccess
  electronFiles.ts               Electron 대화상자 + fs 구현
src/main/ipc/transferHandlers.ts transfer.* · excel.* 채널 (createHandlers 가 합친다)
src/renderer/src/
  pages/TransferPage.tsx         카드 4개 (고객 내보내기 / 가져오기 / 엑셀 내보내기 / 엑셀 명단 등록)
  components/transfer/           CustomerPickerModal, ExportVcrmModal, ImportPreviewModal, RosterImportModal
tests/
  db/hardening.test.ts           store 입력 검증 보강
  unit/vcrm·transferNames·merge·roster.test.ts
  transfer/*.test.ts             exportVcrm, importVcrm, excel, roster, transferHandlers (메모리 SQLite + 메모리 파일)
  renderer/Transfer*.test.tsx    화면
  support/vcrm.ts · files.ts · summaries.ts
```

---

### Task 1: store 입력 검증 보강 (계획 1 후속)

**Files:**
- Create: `src/shared/domain/enums.ts`
- Modify: `src/main/store/customers.ts`, `src/main/store/status.ts`, `src/main/store/passes.ts`, `src/main/store/lessons.ts` (각각 전체 내용으로 교체)
- Test: `tests/db/hardening.test.ts`

**Interfaces:**
- Produces: `CUSTOMER_STATUSES`, `PURPOSES`, `GENDERS`, `isCustomerStatus(v)`, `isPurpose(v)`, `isGender(v)` (타입 가드). 가져오기·명단 등록이 같은 store 함수를 타므로 여기서 막는다.
- 새 오류 문구: `성별을 확인해 주세요.`, `수강 목적을 확인해 주세요.`, `상태를 확인해 주세요.`, `연결할 예약을 확인해 주세요.`; `savePass` 새 기록은 `고객을 찾을 수 없습니다.`, 다른 고객의 수강권 수정은 `수강권 기록을 찾을 수 없습니다.`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/db/hardening.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { CustomerInput, CustomerStatus } from '@shared/types'
import { createCustomer } from '@main/store/customers'
import { saveLesson } from '@main/store/lessons'
import { savePass } from '@main/store/passes'
import { cancelReservation, saveReservation } from '@main/store/reservations'
import { changeStatus } from '@main/store/status'
import { createTestDb, customerInput, NOW, seedCustomer, TODAY } from '../support/db'

const lesson = (customerId: string, reservationId: string | null) => ({
  customerId,
  lessonDate: TODAY,
  memo: '',
  practice: null,
  homework: null,
  deductPass: true,
  reservationId,
  completedGoalIds: []
})

describe('store 입력 검증 보강', () => {
  it('성별·수강 목적 값이 정해진 값이 아니면 거부', () => {
    const db = createTestDb()
    expect(() => createCustomer(db, customerInput({ gender: 'X' } as unknown as Partial<CustomerInput>), NOW)).toThrow(
      '성별을 확인해 주세요.'
    )
    expect(() =>
      createCustomer(db, customerInput({ purpose: 'music' } as unknown as Partial<CustomerInput>), NOW)
    ).toThrow('수강 목적을 확인해 주세요.')
  })

  it('상태 값이 정해진 값이 아니면 거부', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    expect(() =>
      changeStatus(
        db,
        { customerId: id, toStatus: 'gone' as CustomerStatus, date: TODAY, reason: null, pauseUntil: null },
        NOW
      )
    ).toThrow('상태를 확인해 주세요.')
  })

  it('수강권: 없는 고객에게는 추가할 수 없고, 다른 고객의 기록은 수정할 수 없다', () => {
    const db = createTestDb()
    const a = seedCustomer(db)
    const b = seedCustomer(db, { name: '박서준' })
    expect(() => savePass(db, { customerId: 'nope', count: 10, purchasedAt: TODAY, amount: null, note: null }, NOW)).toThrow(
      '고객을 찾을 수 없습니다.'
    )
    const p = savePass(db, { customerId: a, count: 10, purchasedAt: TODAY, amount: null, note: null }, NOW)
    expect(() =>
      savePass(db, { id: p.id, customerId: b, count: 5, purchasedAt: TODAY, amount: null, note: null }, NOW)
    ).toThrow('수강권 기록을 찾을 수 없습니다.')
  })

  it('수업 기록: 넘긴 예약이 다른 고객의 것이거나 예정 상태가 아니면 거부', () => {
    const db = createTestDb()
    const a = seedCustomer(db)
    const b = seedCustomer(db, { name: '박서준' })
    const rb = saveReservation(db, { customerId: b, date: TODAY, time: '15:00', note: null }, NOW)
    expect(() => saveLesson(db, lesson(a, rb.id), NOW)).toThrow('연결할 예약을 확인해 주세요.')
    const ra = saveReservation(db, { customerId: a, date: TODAY, time: '16:00', note: null }, NOW)
    cancelReservation(db, ra.id, NOW)
    expect(() => saveLesson(db, lesson(a, ra.id), NOW)).toThrow('연결할 예약을 확인해 주세요.')
    expect(() => saveLesson(db, lesson(a, 'nope'), NOW)).toThrow('연결할 예약을 확인해 주세요.')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/db/hardening.test.ts`
Expected: FAIL 4개 — 예: `expected [Function] to throw error including '성별을 확인해 주세요.'` (지금은 SQLite CHECK 오류 등 다른 오류가 나거나 저장된다).

- [ ] **Step 3: 구현**

`src/shared/domain/enums.ts`

```ts
import type { CustomerStatus, Gender, Purpose } from '../types'

export const CUSTOMER_STATUSES: readonly CustomerStatus[] = ['active', 'paused', 'ended', 'moved']
export const PURPOSES: readonly Purpose[] = ['hobby', 'exam', 'audition', 'pro', 'other']
export const GENDERS: readonly Gender[] = ['F', 'M']

export const isCustomerStatus = (v: unknown): v is CustomerStatus =>
  typeof v === 'string' && (CUSTOMER_STATUSES as readonly string[]).includes(v)

export const isPurpose = (v: unknown): v is Purpose =>
  typeof v === 'string' && (PURPOSES as readonly string[]).includes(v)

export const isGender = (v: unknown): v is Gender => typeof v === 'string' && (GENDERS as readonly string[]).includes(v)
```

`src/main/store/customers.ts` — 아래 전체 내용으로 교체

```ts
import type { Customer, CustomerInput, StatusLog } from '@shared/types'
import { isGender, isPurpose } from '@shared/domain/enums'
import { normalizePhone } from '@shared/domain/phone'
import type { DB } from '../db/connection'
import { customerColumns, STATUS_LOG_COLUMNS } from './columns'
import { blankToNull, iso, newId, notFound, optionalDate, requireDate, validation } from './util'

export function getCustomer(db: DB, id: string): Customer | null {
  return (
    (db.prepare(`SELECT ${customerColumns()} FROM customers WHERE id = ?`).get(id) as Customer | undefined) ?? null
  )
}

function cleanInput(input: CustomerInput): CustomerInput {
  const name = input.name.trim()
  if (!name) throw validation('이름을 입력해 주세요.')
  if (input.gender !== null && !isGender(input.gender)) throw validation('성별을 확인해 주세요.')
  if (input.purpose !== null && !isPurpose(input.purpose)) throw validation('수강 목적을 확인해 주세요.')
  return {
    name,
    phone: normalizePhone(input.phone),
    birthDate: optionalDate(input.birthDate, '생년월일을 확인해 주세요.'),
    gender: input.gender,
    purpose: input.purpose,
    registeredAt: requireDate(input.registeredAt, '등록일을 확인해 주세요.'),
    vocalRange: blankToNull(input.vocalRange),
    preferredMusic: blankToNull(input.preferredMusic),
    pinnedNote: input.pinnedNote.trim()
  }
}

export function insertStatusLog(db: DB, log: StatusLog): void {
  db.prepare(
    `INSERT INTO status_logs (id, customer_id, date, from_status, to_status, reason, created_at)
     VALUES (@id, @customerId, @date, @fromStatus, @toStatus, @reason, @createdAt)`
  ).run(log)
}

export function listStatusLogs(db: DB, customerId: string): StatusLog[] {
  return db
    .prepare(`SELECT ${STATUS_LOG_COLUMNS} FROM status_logs WHERE customer_id = ? ORDER BY date, created_at`)
    .all(customerId) as StatusLog[]
}

/** 새 고객 등록. 상태는 수강중, 이력에 "수강 시작"(from NULL) 을 남긴다 */
export function createCustomer(db: DB, input: CustomerInput, now: Date): Customer {
  const clean = cleanInput(input)
  const ts = iso(now)
  const customer: Customer = {
    id: newId(),
    ...clean,
    status: 'active',
    pauseUntil: null,
    createdAt: ts,
    updatedAt: ts
  }
  db.transaction(() => {
    db.prepare(
      `INSERT INTO customers (id, name, phone, birth_date, gender, purpose, status, registered_at, vocal_range,
         preferred_music, pinned_note, pause_until, created_at, updated_at)
       VALUES (@id, @name, @phone, @birthDate, @gender, @purpose, @status, @registeredAt, @vocalRange,
         @preferredMusic, @pinnedNote, @pauseUntil, @createdAt, @updatedAt)`
    ).run(customer)
    insertStatusLog(db, {
      id: newId(),
      customerId: customer.id,
      date: customer.registeredAt,
      fromStatus: null,
      toStatus: 'active',
      reason: null,
      createdAt: ts
    })
  })()
  return customer
}

export function updateCustomer(db: DB, id: string, input: CustomerInput, now: Date): Customer {
  const clean = cleanInput(input)
  db.transaction(() => {
    const r = db
      .prepare(
        `UPDATE customers SET name = @name, phone = @phone, birth_date = @birthDate, gender = @gender,
           purpose = @purpose, registered_at = @registeredAt, vocal_range = @vocalRange,
           preferred_music = @preferredMusic, pinned_note = @pinnedNote, updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({ ...clean, id, updatedAt: iso(now) })
    if (r.changes === 0) throw notFound('고객을 찾을 수 없습니다.')
    db.prepare('UPDATE status_logs SET date = @registeredAt WHERE customer_id = @id AND from_status IS NULL').run({
      registeredAt: clean.registeredAt,
      id
    })
  })()
  return getCustomer(db, id) as Customer
}

export function setPinnedNote(db: DB, id: string, note: string, now: Date): void {
  const r = db
    .prepare('UPDATE customers SET pinned_note = ?, updated_at = ? WHERE id = ?')
    .run(note.trim(), iso(now), id)
  if (r.changes === 0) throw notFound('고객을 찾을 수 없습니다.')
}

/** 고객과 모든 관련 기록(목표·수업·수강권·예약·이력)을 삭제 */
export function deleteCustomer(db: DB, id: string): void {
  db.prepare('DELETE FROM customers WHERE id = ?').run(id)
}
```

`src/main/store/status.ts` — 아래 전체 내용으로 교체

```ts
import type { CustomerStatus, StatusChangeInput } from '@shared/types'
import { isCustomerStatus } from '@shared/domain/enums'
import type { DB } from '../db/connection'
import { getCustomer, insertStatusLog } from './customers'
import { blankToNull, iso, newId, notFound, optionalDate, requireDate, validation } from './util'

/** 아직 기록·취소되지 않은 예약 수 (지난 미기록 포함) */
export function countOpenReservations(db: DB, customerId: string): number {
  return db
    .prepare("SELECT COUNT(*) FROM reservations WHERE customer_id = ? AND status = 'scheduled'")
    .pluck()
    .get(customerId) as number
}

const CLOSING: CustomerStatus[] = ['ended', 'moved']

/**
 * 상태 변경 (휴강·종료·타지점 이동·재등록). 이력을 남기고,
 * 종료·타지점 이동이면 열린 예약을 모두 취소한다.
 */
export function changeStatus(
  db: DB,
  input: StatusChangeInput,
  now: Date
): { canceledReservations: number } {
  if (!isCustomerStatus(input.toStatus)) throw validation('상태를 확인해 주세요.')
  const customer = getCustomer(db, input.customerId)
  if (!customer) throw notFound('고객을 찾을 수 없습니다.')
  if (customer.status === input.toStatus) throw validation('이미 같은 상태입니다.')
  const date = requireDate(input.date, '날짜를 확인해 주세요.')
  const pauseUntil =
    input.toStatus === 'paused' ? optionalDate(input.pauseUntil, '휴강 종료 예정일을 확인해 주세요.') : null
  const ts = iso(now)

  return db.transaction(() => {
    db.prepare('UPDATE customers SET status = ?, pause_until = ?, updated_at = ? WHERE id = ?').run(
      input.toStatus,
      pauseUntil,
      ts,
      customer.id
    )
    insertStatusLog(db, {
      id: newId(),
      customerId: customer.id,
      date,
      fromStatus: customer.status,
      toStatus: input.toStatus,
      reason: blankToNull(input.reason),
      createdAt: ts
    })
    let canceledReservations = 0
    if (CLOSING.includes(input.toStatus)) {
      canceledReservations = db
        .prepare(
          "UPDATE reservations SET status = 'canceled', updated_at = ? WHERE customer_id = ? AND status = 'scheduled'"
        )
        .run(ts, customer.id).changes
    }
    return { canceledReservations }
  })()
}
```

`src/main/store/passes.ts` — 아래 전체 내용으로 교체

```ts
import type { Pass, PassInput } from '@shared/types'
import type { DB } from '../db/connection'
import { PASS_COLUMNS } from './columns'
import { blankToNull, iso, newId, notFound, requireDate, validation } from './util'

export function listPasses(db: DB, customerId: string): Pass[] {
  return db
    .prepare(`SELECT ${PASS_COLUMNS} FROM passes WHERE customer_id = ? ORDER BY purchased_at DESC, created_at DESC`)
    .all(customerId) as Pass[]
}

export function savePass(db: DB, input: PassInput, now: Date): Pass {
  if (!Number.isInteger(input.count) || input.count < 1) throw validation('횟수는 1 이상으로 입력해 주세요.')
  if (input.amount !== null && (!Number.isInteger(input.amount) || input.amount < 0)) {
    throw validation('금액을 확인해 주세요.')
  }
  const purchasedAt = requireDate(input.purchasedAt, '결제일을 확인해 주세요.')
  const ts = iso(now)
  if (input.id) {
    const r = db
      .prepare(
        'UPDATE passes SET count = ?, purchased_at = ?, amount = ?, note = ?, updated_at = ? WHERE id = ? AND customer_id = ?'
      )
      .run(input.count, purchasedAt, input.amount, blankToNull(input.note), ts, input.id, input.customerId)
    if (r.changes === 0) throw notFound('수강권 기록을 찾을 수 없습니다.')
    return db.prepare(`SELECT ${PASS_COLUMNS} FROM passes WHERE id = ?`).get(input.id) as Pass
  }
  const exists = db.prepare('SELECT 1 FROM customers WHERE id = ?').get(input.customerId)
  if (!exists) throw notFound('고객을 찾을 수 없습니다.')
  const pass: Pass = {
    id: newId(),
    customerId: input.customerId,
    count: input.count,
    purchasedAt,
    amount: input.amount,
    note: blankToNull(input.note),
    createdAt: ts,
    updatedAt: ts
  }
  db.prepare(
    `INSERT INTO passes (id, customer_id, count, purchased_at, amount, note, created_at, updated_at)
     VALUES (@id, @customerId, @count, @purchasedAt, @amount, @note, @createdAt, @updatedAt)`
  ).run(pass)
  return pass
}

export function deletePass(db: DB, id: string): void {
  db.prepare('DELETE FROM passes WHERE id = ?').run(id)
}
```

`src/main/store/lessons.ts` — 아래 전체 내용으로 교체

```ts
import type { Lesson, LessonInput } from '@shared/types'
import type { DB } from '../db/connection'
import { LESSON_COLUMNS } from './columns'
import { blankToNull, iso, newId, notFound, requireDate, validation } from './util'

type LessonRow = Omit<Lesson, 'deductPass'> & { deductPass: number }

const toLesson = (row: LessonRow): Lesson => ({ ...row, deductPass: row.deductPass === 1 })

export function listLessons(db: DB, customerId: string): Lesson[] {
  const rows = db
    .prepare(`SELECT ${LESSON_COLUMNS} FROM lessons WHERE customer_id = ? ORDER BY lesson_date, created_at, rowid`)
    .all(customerId) as LessonRow[]
  return rows.map(toLesson)
}

export function getLesson(db: DB, id: string): Lesson | null {
  const row = db.prepare(`SELECT ${LESSON_COLUMNS} FROM lessons WHERE id = ?`).get(id) as LessonRow | undefined
  return row ? toLesson(row) : null
}

/**
 * 수업 기록 저장 (새로 만들기 / 수정).
 * - 새 기록이고 예약 연결이 없으면, 같은 고객·같은 날짜의 예정 예약을 찾아 연결한다.
 * - 연결된 예약은 done 이 된다.
 * - completedGoalIds 의 목표는 완료일 = 수업일로 완료 처리하고, 이 수업으로 완료됐던 목표 중
 *   선택에서 빠진 것은 미완료로 되돌린다.
 */
export function saveLesson(db: DB, input: LessonInput, now: Date): Lesson {
  const lessonDate = requireDate(input.lessonDate, '수업일을 확인해 주세요.')
  const ts = iso(now)

  return db.transaction((): Lesson => {
    let lesson: Lesson
    if (input.id) {
      const existing = getLesson(db, input.id)
      if (!existing) throw notFound('수업 기록을 찾을 수 없습니다.')
      lesson = {
        ...existing,
        lessonDate,
        memo: input.memo,
        practice: blankToNull(input.practice),
        homework: blankToNull(input.homework),
        deductPass: input.deductPass,
        updatedAt: ts
      }
      db.prepare(
        `UPDATE lessons SET lesson_date = @lessonDate, memo = @memo, practice = @practice,
           homework = @homework, deduct_pass = @deductPassInt, updated_at = @updatedAt WHERE id = @id`
      ).run({ ...lesson, deductPassInt: lesson.deductPass ? 1 : 0 })
    } else {
      const exists = db.prepare('SELECT 1 FROM customers WHERE id = ?').get(input.customerId)
      if (!exists) throw notFound('고객을 찾을 수 없습니다.')
      if (input.reservationId) {
        const linked = db
          .prepare('SELECT customer_id AS customerId, status FROM reservations WHERE id = ?')
          .get(input.reservationId) as { customerId: string; status: string } | undefined
        if (!linked || linked.customerId !== input.customerId || linked.status !== 'scheduled') {
          throw validation('연결할 예약을 확인해 주세요.')
        }
      }
      const reservationId =
        input.reservationId ??
        ((db
          .prepare(
            "SELECT id FROM reservations WHERE customer_id = ? AND date = ? AND status = 'scheduled' ORDER BY time LIMIT 1"
          )
          .pluck()
          .get(input.customerId, lessonDate) as string | undefined) ?? null)
      lesson = {
        id: newId(),
        customerId: input.customerId,
        lessonDate,
        memo: input.memo,
        practice: blankToNull(input.practice),
        homework: blankToNull(input.homework),
        deductPass: input.deductPass,
        reservationId,
        createdAt: ts,
        updatedAt: ts
      }
      db.prepare(
        `INSERT INTO lessons (id, customer_id, lesson_date, memo, practice, homework, deduct_pass, reservation_id, created_at, updated_at)
         VALUES (@id, @customerId, @lessonDate, @memo, @practice, @homework, @deductPassInt, @reservationId, @createdAt, @updatedAt)`
      ).run({ ...lesson, deductPassInt: lesson.deductPass ? 1 : 0 })
      if (reservationId) {
        db.prepare("UPDATE reservations SET status = 'done', updated_at = ? WHERE id = ?").run(ts, reservationId)
      }
    }

    const selected = new Set(input.completedGoalIds)
    const previouslyCompleted = db
      .prepare('SELECT id FROM goals WHERE completed_lesson_id = ?')
      .pluck()
      .all(lesson.id) as string[]
    for (const goalId of previouslyCompleted) {
      if (!selected.has(goalId)) {
        db.prepare('UPDATE goals SET done_at = NULL, completed_lesson_id = NULL, updated_at = ? WHERE id = ?').run(
          ts,
          goalId
        )
      }
    }
    const complete = db.prepare(
      `UPDATE goals SET done_at = @date, completed_lesson_id = @lessonId, updated_at = @ts
       WHERE id = @goalId AND customer_id = @customerId AND (done_at IS NULL OR completed_lesson_id = @lessonId)`
    )
    for (const goalId of selected) {
      complete.run({ date: lessonDate, lessonId: lesson.id, ts, goalId, customerId: lesson.customerId })
    }
    return lesson
  })()
}

/**
 * 수업 기록 삭제. 연결된 예약은 다시 예정(scheduled)으로 돌아간다.
 * 단, 고객이 이미 종료·타지점 이동 상태면 예약을 되살리지 않고 취소(canceled) 처리한다.
 * 완료한 목표는 완료 상태를 유지한다
 */
export function deleteLesson(db: DB, id: string, now: Date): void {
  db.transaction(() => {
    const lesson = getLesson(db, id)
    if (!lesson) return
    if (lesson.reservationId) {
      const customerStatus = db
        .prepare('SELECT status FROM customers WHERE id = ?')
        .pluck()
        .get(lesson.customerId) as string | undefined
      const revertTo = customerStatus === 'ended' || customerStatus === 'moved' ? 'canceled' : 'scheduled'
      db.prepare("UPDATE reservations SET status = ?, updated_at = ? WHERE id = ? AND status = 'done'").run(
        revertTo,
        iso(now),
        lesson.reservationId
      )
    }
    db.prepare('DELETE FROM lessons WHERE id = ?').run(id)
  })()
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  26 passed`, `Tests  98 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "fix: store 입력 검증 보강 (성별·목적·상태, 수강권 고객 확인, 수업 예약 연결 확인)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: .vcrm 파일 형식과 파일 이름 규칙

**Files:**
- Modify: `package.json`, `package-lock.json` (npm install 로)
- Create: `src/shared/vcrm.ts`, `src/shared/domain/transferNames.ts`
- Test: `tests/support/vcrm.ts`, `tests/unit/vcrm.test.ts`, `tests/unit/transferNames.test.ts`

**Interfaces:**
- Produces:
  - `VCRM_FORMAT = 'vocal-crm'`, `VCRM_VERSION = 1`, 타입 `VcrmFile`, `VcrmEntry`, `VcrmGoal`, `VcrmLesson`
  - `parseVcrm(text): VcrmFile` — JSON 이 아니거나 format·구조가 틀리면 `AppError('VCRM_INVALID', '이 파일은 읽을 수 없습니다.')`, version 이 더 크면 `AppError('VCRM_TOO_NEW', '새 버전 앱에서 만든 파일입니다. 앱을 새 버전으로 바꿔 주세요.')`
  - `serializeVcrm(file): string` (들여쓰기 2)
  - `safeFileName(text)`, `vcrmFileName(names, branch, date)`, `customersExcelFileName(branch, date)`, `ROSTER_TEMPLATE_FILE_NAME`
  - 테스트 도우미 `sampleFile()` — 홍대점 → 강남점, 고객 `x1` 김민지 (별칭 old-1, 목표 g1 완료, 수업 l1, 수강권 p1, 이력 s1)

- [ ] **Step 1: 의존성 추가**

Run: `npm install zod@^4.6.5 exceljs@^4.4.0`
Expected: `package.json` 의 `dependencies` 가 아래와 같아진다.

```json
  "dependencies": {
    "better-sqlite3": "^13.0.3",
    "exceljs": "^4.4.0",
    "zod": "^4.6.5"
  },
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/support/vcrm.ts`

```ts
import { VCRM_VERSION, type VcrmFile } from '@shared/vcrm'
import { makeCustomer } from './factories'

const TS = '2026-09-01T00:00:00.000Z'

export function sampleFile(): VcrmFile {
  return {
    format: 'vocal-crm',
    version: VCRM_VERSION,
    exportedAt: '2026-09-28T06:00:00.000Z',
    sourceBranch: '홍대점',
    targetBranch: '강남점',
    customers: [
      {
        customer: makeCustomer({ id: 'x1', name: '김민지', pinnedNote: '성대결절 이력' }),
        aliases: ['old-1'],
        goals: [{ id: 'g1', title: '두성 연결', doneAt: '2026-09-21', completedLessonId: 'l1', createdAt: TS, updatedAt: TS }],
        lessons: [
          {
            id: 'l1',
            lessonDate: '2026-09-21',
            memo: '메모',
            practice: null,
            homework: '립트릴',
            deductPass: true,
            createdAt: TS,
            updatedAt: TS
          }
        ],
        passes: [{ id: 'p1', count: 10, purchasedAt: '2026-09-01', amount: 550000, note: null, createdAt: TS, updatedAt: TS }],
        statusLogs: [{ id: 's1', date: '2026-03-02', fromStatus: null, toStatus: 'active', reason: null, createdAt: TS }]
      }
    ]
  }
}
```

`tests/unit/vcrm.test.ts`

```ts
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
```

`tests/unit/transferNames.test.ts`

```ts
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
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/unit/vcrm.test.ts tests/unit/transferNames.test.ts`
Expected: FAIL — `Failed to resolve import "@shared/vcrm"` / `"@shared/domain/transferNames"`.

- [ ] **Step 4: 구현**

`src/shared/vcrm.ts`

```ts
import { z } from 'zod'
import { AppError } from './result'

/** .vcrm 파일 형식 (설계 6장). 필드를 바꾸면 VCRM_VERSION 을 올리고 이전 버전 읽기를 유지한다 */
export const VCRM_FORMAT = 'vocal-crm'
export const VCRM_VERSION = 1

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const status = z.enum(['active', 'paused', 'ended', 'moved'])

const customerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().nullable(),
  birthDate: date.nullable(),
  gender: z.enum(['F', 'M']).nullable(),
  purpose: z.enum(['hobby', 'exam', 'audition', 'pro', 'other']).nullable(),
  status,
  registeredAt: date,
  vocalRange: z.string().nullable(),
  preferredMusic: z.string().nullable(),
  pinnedNote: z.string(),
  pauseUntil: date.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})

const goalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  doneAt: date.nullable(),
  completedLessonId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})

const lessonSchema = z.object({
  id: z.string().min(1),
  lessonDate: date,
  memo: z.string(),
  practice: z.string().nullable(),
  homework: z.string().nullable(),
  deductPass: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

const passSchema = z.object({
  id: z.string().min(1),
  count: z.number().int().positive(),
  purchasedAt: date,
  amount: z.number().int().nonnegative().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})

const statusLogSchema = z.object({
  id: z.string().min(1),
  date,
  fromStatus: status.nullable(),
  toStatus: status,
  reason: z.string().nullable(),
  createdAt: z.string()
})

const entrySchema = z.object({
  customer: customerSchema,
  aliases: z.array(z.string().min(1)),
  goals: z.array(goalSchema),
  lessons: z.array(lessonSchema),
  passes: z.array(passSchema),
  statusLogs: z.array(statusLogSchema)
})

const fileSchema = z.object({
  format: z.literal(VCRM_FORMAT),
  version: z.number().int().positive(),
  exportedAt: z.string(),
  sourceBranch: z.string(),
  targetBranch: z.string().nullable(),
  customers: z.array(entrySchema)
})

export type VcrmFile = z.infer<typeof fileSchema>
export type VcrmEntry = z.infer<typeof entrySchema>
export type VcrmGoal = z.infer<typeof goalSchema>
export type VcrmLesson = z.infer<typeof lessonSchema>

const invalid = (): AppError => new AppError('VCRM_INVALID', '이 파일은 읽을 수 없습니다.')

/** 파일 내용을 검증해 읽는다. 형식이 틀리면 VCRM_INVALID, 더 새 버전이면 VCRM_TOO_NEW */
export function parseVcrm(text: string): VcrmFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw invalid()
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== VCRM_FORMAT) {
    throw invalid()
  }
  const version = (raw as { version?: unknown }).version
  if (typeof version === 'number' && version > VCRM_VERSION) {
    throw new AppError('VCRM_TOO_NEW', '새 버전 앱에서 만든 파일입니다. 앱을 새 버전으로 바꿔 주세요.')
  }
  const parsed = fileSchema.safeParse(raw)
  if (!parsed.success) throw invalid()
  return parsed.data
}

export function serializeVcrm(file: VcrmFile): string {
  return JSON.stringify(file, null, 2)
}
```

`src/shared/domain/transferNames.ts`

```ts
/** 파일 이름에 쓸 수 없는 문자를 지운다 (Windows 기준) */
export function safeFileName(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, '').trim()
}

/** 1명: "김민지_강남점_2026-09-28.vcrm", 여러 명: "고객18명_강남점_2026-09-28.vcrm" */
export function vcrmFileName(names: string[], branch: string, date: string): string {
  const who = names.length === 1 ? safeFileName(names[0]) : `고객${names.length}명`
  return `${who}_${safeFileName(branch)}_${date}.vcrm`
}

export function customersExcelFileName(branch: string, date: string): string {
  return `VOCAL_CRM_고객목록_${safeFileName(branch)}_${date}.xlsx`
}

export const ROSTER_TEMPLATE_FILE_NAME = 'VOCAL_CRM_명단등록_양식.xlsx'
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  28 passed`, `Tests  103 passed`.

- [ ] **Step 6: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 7: 커밋**

```bash
git add package.json package-lock.json src tests
git commit -m "feat: .vcrm 파일 형식 검증과 내보내기 파일 이름 규칙" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: .vcrm 내보내기 (DB → 파일 내용, 타지점 이동 처리)

**Files:**
- Modify: `vitest.config.ts`, `tsconfig.node.json` (`tests/transfer` 폴더 추가 — 전체 내용으로 교체)
- Create: `src/main/transfer/exportVcrm.ts`
- Test: `tests/transfer/exportVcrm.test.ts`

**Interfaces:**
- Consumes: 계획 1 의 `getCustomer`, `listStatusLogs`, `listGoals`, `listLessons`, `listPasses`, `changeStatus`; Task 2 의 `VCRM_FORMAT`, `VCRM_VERSION`, `VcrmFile`.
- Produces:
  - `ExportMeta = { sourceBranch: string; targetBranch: string | null }`
  - `listAliases(db, customerId): string[]`
  - `buildVcrm(db, customerIds, meta, now): VcrmFile` — 고른 순서 유지, 빈 목록이면 `내보낼 고객을 선택해 주세요.`, 없는 고객이면 `고객을 찾을 수 없습니다.`, 보낼 지점은 trim 후 비면 null
  - `markMoved(db, customerIds, targetBranch, today, now): number` — 이미 `moved` 인 고객은 건너뛰고, 사유는 `"<지점>으로 이동"`(조사 자동) 또는 null. 바꾼 수를 돌려준다. (`changeStatus` 가 열린 예약을 취소한다)

- [ ] **Step 1: 테스트 폴더 등록**

`vitest.config.ts` — 아래 전체 내용으로 교체

```ts
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

process.env.TZ = 'Asia/Seoul'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
      '@main': resolve('src/main')
    }
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts', 'tests/db/**/*.test.ts', 'tests/transfer/**/*.test.ts']
        }
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.tsx'],
          setupFiles: ['tests/renderer/setup.ts']
        }
      }
    ]
  }
})
```

`tsconfig.node.json` — 아래 전체 내용으로 교체

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": [
    "electron.vite.config.ts",
    "vitest.config.ts",
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*",
    "tests/unit/**/*",
    "tests/db/**/*",
    "tests/transfer/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "types": ["node", "electron-vite/node"],
    "paths": {
      "@shared/*": ["./src/shared/*"],
      "@main/*": ["./src/main/*"]
    }
  }
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/transfer/exportVcrm.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { parseVcrm, serializeVcrm } from '@shared/vcrm'
import { buildVcrm, markMoved } from '@main/transfer/exportVcrm'
import { getCustomer, listStatusLogs } from '@main/store/customers'
import { addGoal } from '@main/store/goals'
import { saveLesson } from '@main/store/lessons'
import { savePass } from '@main/store/passes'
import { getReservation, saveReservation } from '@main/store/reservations'
import { changeStatus } from '@main/store/status'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

describe('buildVcrm', () => {
  it('고객의 정보·별칭·목표·수업·수강권·이력을 담고 예약 연결은 뺀다', () => {
    const db = createTestDb()
    const id = seedCustomer(db, { pinnedNote: '성대결절 이력' })
    db.prepare('INSERT INTO customer_aliases (alias_id, customer_id) VALUES (?, ?)').run('old-1', id)
    const goal = addGoal(db, id, '두성 연결', NOW)
    const r = saveReservation(db, { customerId: id, date: TODAY, time: '15:00', note: null }, NOW)
    const lesson = saveLesson(
      db,
      {
        customerId: id,
        lessonDate: TODAY,
        memo: '메모',
        practice: null,
        homework: '립트릴',
        deductPass: true,
        reservationId: r.id,
        completedGoalIds: [goal.id]
      },
      NOW
    )
    savePass(db, { customerId: id, count: 10, purchasedAt: TODAY, amount: 550000, note: null }, NOW)

    const file = buildVcrm(db, [id], { sourceBranch: '강남점', targetBranch: ' 홍대점 ' }, NOW)
    expect(file).toMatchObject({ format: 'vocal-crm', version: 1, sourceBranch: '강남점', targetBranch: '홍대점' })
    const entry = file.customers[0]
    expect(entry.customer).toMatchObject({ id, pinnedNote: '성대결절 이력' })
    expect(entry.aliases).toEqual(['old-1'])
    expect(entry.goals).toEqual([expect.objectContaining({ id: goal.id, doneAt: TODAY, completedLessonId: lesson.id })])
    expect(entry.lessons).toHaveLength(1)
    expect(entry.lessons[0]).not.toHaveProperty('reservationId')
    expect(entry.lessons[0]).not.toHaveProperty('customerId')
    expect(entry.passes).toHaveLength(1)
    expect(entry.statusLogs).toHaveLength(1)
    // 형식 검증을 통과한다
    expect(parseVcrm(serializeVcrm(file))).toEqual(file)
  })

  it('고른 고객이 없으면 거부, 없는 고객은 찾을 수 없다고 안내', () => {
    const db = createTestDb()
    expect(() => buildVcrm(db, [], { sourceBranch: '강남점', targetBranch: null }, NOW)).toThrow('내보낼 고객을 선택해 주세요.')
    expect(() => buildVcrm(db, ['nope'], { sourceBranch: '강남점', targetBranch: null }, NOW)).toThrow('고객을 찾을 수 없습니다.')
  })
})

describe('markMoved', () => {
  it('타지점 이동으로 바꾸고 이력에 지점을 남기며 열린 예약은 취소, 이미 이동한 고객은 건너뛴다', () => {
    const db = createTestDb()
    const a = seedCustomer(db)
    const b = seedCustomer(db, { name: '박서준' })
    const r = saveReservation(db, { customerId: a, date: '2026-10-02', time: '13:00', note: null }, NOW)
    changeStatus(db, { customerId: b, toStatus: 'moved', date: TODAY, reason: null, pauseUntil: null }, NOW)

    expect(markMoved(db, [a, b], '홍대점', TODAY, NOW)).toBe(1)
    expect(getCustomer(db, a)?.status).toBe('moved')
    expect(listStatusLogs(db, a).at(-1)).toMatchObject({ toStatus: 'moved', reason: '홍대점으로 이동' })
    expect(getReservation(db, r.id)?.status).toBe('canceled')
    expect(listStatusLogs(db, b)).toHaveLength(2)
  })
})
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/transfer`
Expected: FAIL — `Failed to resolve import "@main/transfer/exportVcrm"`.

- [ ] **Step 4: 구현**

`src/main/transfer/exportVcrm.ts`

```ts
import { withEuro } from '@shared/domain/labels'
import { VCRM_FORMAT, VCRM_VERSION, type VcrmEntry, type VcrmFile } from '@shared/vcrm'
import type { DB } from '../db/connection'
import { getCustomer, listStatusLogs } from '../store/customers'
import { listGoals } from '../store/goals'
import { listLessons } from '../store/lessons'
import { listPasses } from '../store/passes'
import { changeStatus } from '../store/status'
import { iso, notFound, validation } from '../store/util'

export interface ExportMeta {
  sourceBranch: string
  targetBranch: string | null
}

export function listAliases(db: DB, customerId: string): string[] {
  return db
    .prepare('SELECT alias_id FROM customer_aliases WHERE customer_id = ? ORDER BY alias_id')
    .pluck()
    .all(customerId) as string[]
}

function buildEntry(db: DB, customerId: string): VcrmEntry {
  const customer = getCustomer(db, customerId)
  if (!customer) throw notFound('고객을 찾을 수 없습니다.')
  return {
    customer,
    aliases: listAliases(db, customerId),
    goals: listGoals(db, customerId).map(({ id, title, doneAt, completedLessonId, createdAt, updatedAt }) => ({
      id,
      title,
      doneAt,
      completedLessonId,
      createdAt,
      updatedAt
    })),
    // 예약은 지점 전용이라 reservationId 는 넣지 않는다
    lessons: listLessons(db, customerId).map(
      ({ id, lessonDate, memo, practice, homework, deductPass, createdAt, updatedAt }) => ({
        id,
        lessonDate,
        memo,
        practice,
        homework,
        deductPass,
        createdAt,
        updatedAt
      })
    ),
    passes: listPasses(db, customerId).map(({ id, count, purchasedAt, amount, note, createdAt, updatedAt }) => ({
      id,
      count,
      purchasedAt,
      amount,
      note,
      createdAt,
      updatedAt
    })),
    statusLogs: listStatusLogs(db, customerId).map(({ id, date, fromStatus, toStatus, reason, createdAt }) => ({
      id,
      date,
      fromStatus,
      toStatus,
      reason,
      createdAt
    }))
  }
}

/** 고른 고객을 .vcrm 형식으로 모은다 (고른 순서 유지) */
export function buildVcrm(db: DB, customerIds: string[], meta: ExportMeta, now: Date): VcrmFile {
  if (customerIds.length === 0) throw validation('내보낼 고객을 선택해 주세요.')
  return {
    format: VCRM_FORMAT,
    version: VCRM_VERSION,
    exportedAt: iso(now),
    sourceBranch: meta.sourceBranch,
    targetBranch: meta.targetBranch?.trim() || null,
    customers: customerIds.map((id) => buildEntry(db, id))
  }
}

/** 내보낸 고객을 '타지점 이동' 으로 바꾼다. 이미 이동 상태인 고객은 건너뛴다. 바꾼 수를 돌려준다 */
export function markMoved(
  db: DB,
  customerIds: string[],
  targetBranch: string | null,
  today: string,
  now: Date
): number {
  const target = targetBranch?.trim() || null
  let changed = 0
  db.transaction(() => {
    for (const id of customerIds) {
      const customer = getCustomer(db, id)
      if (!customer || customer.status === 'moved') continue
      changeStatus(
        db,
        { customerId: id, toStatus: 'moved', date: today, reason: target ? `${withEuro(target)} 이동` : null, pauseUntil: null },
        now
      )
      changed++
    }
  })()
  return changed
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  29 passed`, `Tests  106 passed`.

- [ ] **Step 6: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 7: 커밋**

```bash
git add vitest.config.ts tsconfig.node.json src tests
git commit -m "feat: .vcrm 내보내기와 타지점 이동 처리" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 합치기 판단 규칙 (순수 함수)

**Files:**
- Create: `src/shared/domain/merge.ts`
- Test: `tests/unit/merge.test.ts`

**Interfaces:**
- Produces:
  - `HintCustomer = { id, name, phone, status }`, `ImportHints = { same: HintCustomer[]; similar: HintCustomer[] }`
  - `findHints(incoming: { id, name, phone, aliases }, locals: Customer[], aliasRows: { aliasId, customerId }[]): ImportHints` — 🔗 같은 고객: 가져올 고객의 id·별칭이 이 PC 고객 id 이거나 이 PC 별칭(alias_id)과 일치. 비슷한 고객: (같은 고객 제외) 연락처가 같거나 공백 뺀 이름이 같음, 최대 3명
  - `sameTitle(a, b)` (trim + 대소문자 무시), `isNewer(incomingUpdatedAt, localUpdatedAt)` (문자열 비교, 같으면 false), `movedInReason(source)` → `"<source>에서 이동해 옴"`
  - `mergePinnedNote(local, incoming, source, date)` — 가져온 메모가 비었거나 이미 포함되면 그대로, 이 PC 가 비었으면 가져온 메모, 그 밖에는 `\n\n── <source>에서 가져옴 (<date>) ──\n<incoming>` 을 이어 붙임
  - `FillableField`, `fillEmptyInfo(local, incoming)` — phone·birthDate·gender·purpose·vocalRange·preferredMusic 을 `local ?? incoming`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/merge.test.ts`

```ts
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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/unit/merge.test.ts`
Expected: FAIL — `Failed to resolve import "@shared/domain/merge"`.

- [ ] **Step 3: 구현**

`src/shared/domain/merge.ts`

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  30 passed`, `Tests  112 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "feat: 가져오기 합치기 판단 규칙 (힌트, 공통메모, 빈 칸 채우기)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: .vcrm 가져오기 (미리보기, 신규 추가·합치기·건너뛰기 적용)

**Files:**
- Create: `src/shared/transferTypes.ts` (이 Task 버전 — Task 7 에서 명단 타입 추가), `src/main/transfer/importVcrm.ts`
- Test: `tests/transfer/importVcrm.test.ts`

**Interfaces:**
- Consumes: Task 4 전부, 계획 1 의 `getCustomer`, `insertStatusLog`, `getGoal`, `listGoals`, `getLesson`, `customerColumns`.
- Produces:
  - 타입 `ImportPreviewRow`, `ImportPreview`(`token`, `sourceBranch`, `exportedAt`, `rows`), `ImportDecision`(`new` / `skip` / `merge` + `targetId`), `ImportResult`(`added`, `merged`, `skipped`)
  - `previewRows(db, file): ImportPreviewRow[]` — 행마다 이름·연락처·기록 건수와 힌트
  - `applyImport(db, file, decisions, today, now): ImportResult` — 하나의 트랜잭션. 파일의 모든 고객에 결정이 없으면 `모든 고객의 처리 방법을 선택해 주세요.`, 합칠 고객이 없으면 `합칠 고객을 찾을 수 없습니다.`

적용 규칙 (설계 5.8, 코드 주석과 같은 순서):
- **신규 추가:** 고객 id 유지(이 PC 에 있으면 새 id), 수업·목표·수강권·이력도 겹치는 id 만 새 id, 목표의 `completedLessonId` 는 바뀐 수업 id 로 따라감, 수업의 예약 연결은 NULL, 상태 수강중·휴강 종료일 NULL, 별칭은 파일의 별칭(+ 고객 id 가 바뀌었으면 원래 id), 마지막에 `"<보낸 지점>에서 이동해 옴"` 이력.
- **합치기:** 수업은 없는 id 추가 / 같은 id 는 가져온 쪽이 최신이면 갱신 / 다른 고객 소유 id 면 새 id 로 추가 → 목표는 같은 id 면 최신 쪽, 제목이 같으면 하나로(완료는 이른 날짜 우선), 그 밖에는 추가 → 수강권·이력은 없는 id 만 → 공통메모 이어 붙이기 + 빈 칸 채우기 → 별칭 추가 → 이동 이력(같은 날 같은 사유가 있으면 생략) + 수강중이 아니면 수강중으로.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/transfer/importVcrm.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { DB } from '@main/db/connection'
import { buildVcrm } from '@main/transfer/exportVcrm'
import { applyImport, previewRows } from '@main/transfer/importVcrm'
import { getCustomer, listStatusLogs } from '@main/store/customers'
import { addGoal, listGoals } from '@main/store/goals'
import { listLessons, saveLesson } from '@main/store/lessons'
import { listPasses, savePass } from '@main/store/passes'
import { changeStatus } from '@main/store/status'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'
import { sampleFile } from '../support/vcrm'

const LATER = new Date('2026-09-29T06:00:00.000Z')

function lessonInput(customerId: string, date: string, memo: string, completedGoalIds: string[] = []) {
  return {
    customerId,
    lessonDate: date,
    memo,
    practice: null,
    homework: null,
    deductPass: true,
    reservationId: null,
    completedGoalIds
  }
}

/** 강남점 PC: 목표 1(완료), 수업 2, 수강권 1 */
function seedSource(): { db: DB; id: string } {
  const db = createTestDb()
  const id = seedCustomer(db, { pinnedNote: '성대결절 이력' })
  const g = addGoal(db, id, '두성 연결', NOW)
  saveLesson(db, lessonInput(id, '2026-09-14', '첫 수업'), NOW)
  saveLesson(db, lessonInput(id, '2026-09-21', '두 번째', [g.id]), NOW)
  savePass(db, { customerId: id, count: 10, purchasedAt: '2026-09-01', amount: null, note: null }, NOW)
  return { db, id }
}

const count = (db: DB, table: string): number => db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get() as number

describe('previewRows', () => {
  it('기록 건수와 같은 고객·비슷한 고객 힌트를 보여준다', () => {
    const db = createTestDb()
    const local = seedCustomer(db, { name: '김민지' })
    const file = sampleFile()
    file.customers[0].customer.id = local
    const [row] = previewRows(db, file)
    expect(row).toMatchObject({ name: '김민지', lessonCount: 1, goalCount: 1, passCount: 1 })
    expect(row.same.map((h) => h.id)).toEqual([local])
    expect(row.similar).toEqual([])
  })
})

describe('applyImport — 신규 추가', () => {
  it('id 를 유지하고 모든 기록을 옮기며, 상태는 수강중 + "이동해 옴" 이력', () => {
    const src = seedSource()
    changeStatus(src.db, { customerId: src.id, toStatus: 'moved', date: TODAY, reason: '홍대점으로 이동', pauseUntil: null }, NOW)
    const file = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: '홍대점' }, NOW)
    const db = createTestDb()

    expect(applyImport(db, file, [{ incomingId: src.id, action: 'new' }], TODAY, NOW)).toEqual({
      added: 1,
      merged: 0,
      skipped: 0
    })
    expect(getCustomer(db, src.id)).toMatchObject({ status: 'active', pinnedNote: '성대결절 이력' })
    const lessons = listLessons(db, src.id)
    expect(lessons.map((l) => l.memo)).toEqual(['첫 수업', '두 번째'])
    expect(lessons.every((l) => l.reservationId === null)).toBe(true)
    expect(listGoals(db, src.id)[0]).toMatchObject({ doneAt: '2026-09-21', completedLessonId: lessons[1].id })
    expect(listPasses(db, src.id)).toHaveLength(1)
    expect(listStatusLogs(db, src.id).at(-1)).toMatchObject({ fromStatus: 'moved', toStatus: 'active', reason: '강남점에서 이동해 옴' })
  })

  it('이 PC 에 같은 id 가 있으면 새 id 를 쓰고, 원래 id 는 별칭으로 남긴다', () => {
    const src = seedSource()
    const file = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: null }, NOW)
    const db = createTestDb()
    applyImport(db, file, [{ incomingId: src.id, action: 'new' }], TODAY, NOW)
    applyImport(db, file, [{ incomingId: src.id, action: 'new' }], TODAY, NOW)
    expect(count(db, 'customers')).toBe(2)
    expect(count(db, 'lessons')).toBe(4)
    const copyId = db.prepare('SELECT id FROM customers WHERE id != ?').pluck().get(src.id) as string
    expect(db.prepare('SELECT alias_id FROM customer_aliases WHERE customer_id = ?').pluck().all(copyId)).toEqual([src.id])
    const copyLessons = listLessons(db, copyId)
    expect(listGoals(db, copyId)[0].completedLessonId).toBe(copyLessons[1].id)
  })
})

describe('applyImport — 기존 고객에 합치기', () => {
  it('설계의 합치기 규칙을 따른다', () => {
    const src = seedSource()
    const file = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: null }, NOW)
    const db = createTestDb()
    const target = seedCustomer(db, { name: '김민지', phone: null, pinnedNote: '입시 12월', vocalRange: 'F3~C5' })
    addGoal(db, target, ' 두성 연결 ', NOW)
    saveLesson(db, lessonInput(target, '2026-09-25', '이 지점 수업'), NOW)
    changeStatus(db, { customerId: target, toStatus: 'ended', date: '2026-09-26', reason: null, pauseUntil: null }, NOW)

    expect(applyImport(db, file, [{ incomingId: src.id, action: 'merge', targetId: target }], TODAY, LATER)).toEqual({
      added: 0,
      merged: 1,
      skipped: 0
    })
    const c = getCustomer(db, target)
    expect(c).toMatchObject({
      status: 'active',
      phone: '01012345678',
      vocalRange: 'F3~C5',
      pinnedNote: `입시 12월\n\n── 강남점에서 가져옴 (${TODAY}) ──\n성대결절 이력`
    })
    const lessons = listLessons(db, target)
    expect(lessons.map((l) => l.memo)).toEqual(['첫 수업', '두 번째', '이 지점 수업'])
    const goals = listGoals(db, target)
    expect(goals).toHaveLength(1)
    expect(goals[0]).toMatchObject({ doneAt: '2026-09-21', completedLessonId: lessons[1].id })
    expect(listPasses(db, target)).toHaveLength(1)
    expect(db.prepare('SELECT alias_id FROM customer_aliases WHERE customer_id = ?').pluck().all(target)).toEqual([src.id])
    expect(listStatusLogs(db, target).at(-1)).toMatchObject({ fromStatus: 'ended', toStatus: 'active', reason: '강남점에서 이동해 옴' })
  })

  it('같은 id 의 회차 기록은 가져온 쪽이 더 최신일 때만 갱신한다', () => {
    const src = seedSource()
    const db = createTestDb()
    const first = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: null }, NOW)
    applyImport(db, first, [{ incomingId: src.id, action: 'new' }], TODAY, NOW)
    const edited = listLessons(src.db, src.id)[0]
    saveLesson(src.db, { ...lessonInput(src.id, edited.lessonDate, '수정한 메모'), id: edited.id }, LATER)
    const second = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: null }, LATER)
    applyImport(db, second, [{ incomingId: src.id, action: 'merge', targetId: src.id }], TODAY, LATER)
    expect(listLessons(db, src.id).map((l) => l.memo)).toEqual(['수정한 메모', '두 번째'])
    applyImport(db, first, [{ incomingId: src.id, action: 'merge', targetId: src.id }], TODAY, LATER)
    expect(listLessons(db, src.id)[0].memo).toBe('수정한 메모')
  })

  it('같은 파일을 두 번 가져오고, 되돌려 보내 다시 가져와도 기록이 중복되지 않는다', () => {
    const src = seedSource()
    const file = buildVcrm(src.db, [src.id], { sourceBranch: '강남점', targetBranch: null }, NOW)
    const db = createTestDb()
    applyImport(db, file, [{ incomingId: src.id, action: 'new' }], TODAY, NOW)
    const snapshot = ['customers', 'lessons', 'goals', 'passes', 'status_logs'].map((t) => count(db, t))
    applyImport(db, file, [{ incomingId: src.id, action: 'merge', targetId: src.id }], TODAY, NOW)
    expect(['customers', 'lessons', 'goals', 'passes', 'status_logs'].map((t) => count(db, t))).toEqual(snapshot)

    const back = buildVcrm(db, [src.id], { sourceBranch: '홍대점', targetBranch: '강남점' }, NOW)
    const before = ['lessons', 'goals', 'passes'].map((t) => count(src.db, t))
    applyImport(src.db, back, [{ incomingId: src.id, action: 'merge', targetId: src.id }], TODAY, NOW)
    expect(['lessons', 'goals', 'passes'].map((t) => count(src.db, t))).toEqual(before)
  })
})

describe('applyImport — 검증', () => {
  it('처리 방법이 빠진 고객이 있으면 아무것도 바꾸지 않고 거부, 건너뛰기는 센다', () => {
    const db = createTestDb()
    const file = sampleFile()
    expect(() => applyImport(db, file, [], TODAY, NOW)).toThrow('모든 고객의 처리 방법을 선택해 주세요.')
    expect(applyImport(db, file, [{ incomingId: 'x1', action: 'skip' }], TODAY, NOW)).toEqual({
      added: 0,
      merged: 0,
      skipped: 1
    })
    expect(count(db, 'customers')).toBe(0)
  })

  it('합칠 고객이 없으면 거부하고 트랜잭션 전체를 되돌린다', () => {
    const db = createTestDb()
    const file = sampleFile()
    file.customers.push({ ...sampleFile().customers[0], customer: { ...sampleFile().customers[0].customer, id: 'x2' } })
    expect(() =>
      applyImport(
        db,
        file,
        [
          { incomingId: 'x1', action: 'new' },
          { incomingId: 'x2', action: 'merge', targetId: 'nope' }
        ],
        TODAY,
        NOW
      )
    ).toThrow('합칠 고객을 찾을 수 없습니다.')
    expect(count(db, 'customers')).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/transfer/importVcrm.test.ts`
Expected: FAIL — `Failed to resolve import "@main/transfer/importVcrm"`.

- [ ] **Step 3: 구현**

`src/shared/transferTypes.ts`

```ts
import type { HintCustomer } from './domain/merge'

export interface ImportPreviewRow {
  incomingId: string
  name: string
  phone: string | null
  lessonCount: number
  goalCount: number
  passCount: number
  same: HintCustomer[]
  similar: HintCustomer[]
}

export interface ImportPreview {
  /** Main 에 잠시 보관한 파일을 가리키는 값. 적용할 때 돌려준다 */
  token: string
  sourceBranch: string
  exportedAt: string
  rows: ImportPreviewRow[]
}

export type ImportDecision =
  | { incomingId: string; action: 'new' }
  | { incomingId: string; action: 'skip' }
  | { incomingId: string; action: 'merge'; targetId: string }

export interface ImportResult {
  added: number
  merged: number
  skipped: number
}
```

`src/main/transfer/importVcrm.ts`

```ts
import type { Customer, Goal, Lesson } from '@shared/types'
import { fillEmptyInfo, findHints, isNewer, mergePinnedNote, movedInReason, sameTitle } from '@shared/domain/merge'
import type { ImportDecision, ImportPreviewRow, ImportResult } from '@shared/transferTypes'
import type { VcrmEntry, VcrmFile } from '@shared/vcrm'
import type { DB } from '../db/connection'
import { customerColumns } from '../store/columns'
import { getCustomer, insertStatusLog } from '../store/customers'
import { getGoal, listGoals } from '../store/goals'
import { getLesson } from '../store/lessons'
import { iso, newId, notFound, validation } from '../store/util'

const exists = (db: DB, table: string, id: string): boolean =>
  db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id) !== undefined

/** 이 PC 에 같은 id 가 있으면 새 id */
const freeId = (db: DB, table: string, id: string): string => (exists(db, table, id) ? newId() : id)

export function previewRows(db: DB, file: VcrmFile): ImportPreviewRow[] {
  const locals = db.prepare(`SELECT ${customerColumns()} FROM customers`).all() as Customer[]
  const aliasRows = db
    .prepare('SELECT alias_id AS aliasId, customer_id AS customerId FROM customer_aliases')
    .all() as { aliasId: string; customerId: string }[]
  return file.customers.map((e) => {
    const hints = findHints({ ...e.customer, aliases: e.aliases }, locals, aliasRows)
    return {
      incomingId: e.customer.id,
      name: e.customer.name,
      phone: e.customer.phone,
      lessonCount: e.lessons.length,
      goalCount: e.goals.length,
      passCount: e.passes.length,
      same: hints.same,
      similar: hints.similar
    }
  })
}

function insertLesson(db: DB, l: VcrmEntry['lessons'][number], id: string, customerId: string): void {
  db.prepare(
    `INSERT INTO lessons (id, customer_id, lesson_date, memo, practice, homework, deduct_pass, reservation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(id, customerId, l.lessonDate, l.memo, l.practice, l.homework, l.deductPass ? 1 : 0, l.createdAt, l.updatedAt)
}

function insertGoal(db: DB, g: VcrmEntry['goals'][number], id: string, customerId: string, lessonId: string | null): void {
  db.prepare(
    `INSERT INTO goals (id, customer_id, title, done_at, completed_lesson_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, customerId, g.title, g.doneAt, lessonId, g.createdAt, g.updatedAt)
}

function insertPass(db: DB, p: VcrmEntry['passes'][number], id: string, customerId: string): void {
  db.prepare(
    `INSERT INTO passes (id, customer_id, count, purchased_at, amount, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, customerId, p.count, p.purchasedAt, p.amount, p.note, p.createdAt, p.updatedAt)
}

function addAliases(db: DB, customerId: string, ids: string[]): void {
  const stmt = db.prepare('INSERT OR IGNORE INTO customer_aliases (alias_id, customer_id) VALUES (?, ?)')
  for (const id of ids) if (id !== customerId) stmt.run(id, customerId)
}

/** 이 PC 에서 이 고객에게 같은 날 같은 사유의 이동 이력이 이미 있으면 다시 쓰지 않는다 (같은 파일 재가져오기) */
function logMovedIn(db: DB, customer: Customer, reason: string, today: string, now: Date): void {
  const dup = db
    .prepare("SELECT 1 FROM status_logs WHERE customer_id = ? AND reason = ? AND date = ? AND to_status = 'active'")
    .get(customer.id, reason, today)
  if (dup) return
  insertStatusLog(db, {
    id: newId(),
    customerId: customer.id,
    date: today,
    fromStatus: customer.status,
    toStatus: 'active',
    reason,
    createdAt: iso(now)
  })
}

/** 신규 추가: 고객 id 유지(겹치면 새 id), 딸린 기록도 겹치는 id 만 새 id. 상태는 수강중 */
function addAsNew(db: DB, e: VcrmEntry, sourceBranch: string, today: string, now: Date): void {
  const customerId = freeId(db, 'customers', e.customer.id)
  const customer: Customer = { ...e.customer, id: customerId, status: 'active', pauseUntil: null, updatedAt: iso(now) }
  db.prepare(
    `INSERT INTO customers (id, name, phone, birth_date, gender, purpose, status, registered_at, vocal_range,
       preferred_music, pinned_note, pause_until, created_at, updated_at)
     VALUES (@id, @name, @phone, @birthDate, @gender, @purpose, @status, @registeredAt, @vocalRange,
       @preferredMusic, @pinnedNote, @pauseUntil, @createdAt, @updatedAt)`
  ).run(customer)

  const lessonIds = new Map<string, string>()
  for (const l of e.lessons) {
    const id = freeId(db, 'lessons', l.id)
    lessonIds.set(l.id, id)
    insertLesson(db, l, id, customerId)
  }
  for (const g of e.goals) {
    const lessonId = g.completedLessonId ? (lessonIds.get(g.completedLessonId) ?? null) : null
    insertGoal(db, g, freeId(db, 'goals', g.id), customerId, lessonId)
  }
  for (const p of e.passes) insertPass(db, p, freeId(db, 'passes', p.id), customerId)
  for (const s of e.statusLogs) {
    insertStatusLog(db, { ...s, id: freeId(db, 'status_logs', s.id), customerId })
  }
  addAliases(db, customerId, customerId === e.customer.id ? e.aliases : [...e.aliases, e.customer.id])
  logMovedIn(db, { ...customer, status: e.customer.status }, movedInReason(sourceBranch), today, now)
}

/** 기존 고객에 합치기 (설계 5.8 합치기 규칙) */
function mergeInto(db: DB, e: VcrmEntry, targetId: string, sourceBranch: string, today: string, now: Date): void {
  const target = getCustomer(db, targetId)
  if (!target) throw notFound('합칠 고객을 찾을 수 없습니다.')
  const ts = iso(now)

  // 회차 기록: 없는 id 만 추가, 같은 id 면 최신 쪽으로 갱신
  const lessonIds = new Map<string, string>()
  for (const l of e.lessons) {
    const local: Lesson | null = getLesson(db, l.id)
    if (!local) {
      insertLesson(db, l, l.id, targetId)
      lessonIds.set(l.id, l.id)
    } else if (local.customerId === targetId) {
      lessonIds.set(l.id, l.id)
      if (isNewer(l.updatedAt, local.updatedAt)) {
        db.prepare(
          'UPDATE lessons SET lesson_date = ?, memo = ?, practice = ?, homework = ?, deduct_pass = ?, updated_at = ? WHERE id = ?'
        ).run(l.lessonDate, l.memo, l.practice, l.homework, l.deductPass ? 1 : 0, l.updatedAt, l.id)
      }
    } else {
      const id = newId()
      insertLesson(db, l, id, targetId)
      lessonIds.set(l.id, id)
    }
  }

  // 목표: 같은 id → 최신 쪽, 제목이 같으면 하나로(어느 쪽이든 완료면 완료, 이른 완료일), 그 밖에는 추가
  const localGoals: Goal[] = listGoals(db, targetId)
  for (const g of e.goals) {
    const lessonId = g.completedLessonId ? (lessonIds.get(g.completedLessonId) ?? null) : null
    const byId = getGoal(db, g.id)
    if (byId && byId.customerId === targetId) {
      if (isNewer(g.updatedAt, byId.updatedAt)) {
        db.prepare('UPDATE goals SET title = ?, done_at = ?, completed_lesson_id = ?, updated_at = ? WHERE id = ?').run(
          g.title,
          g.doneAt,
          lessonId,
          g.updatedAt,
          g.id
        )
      }
      continue
    }
    const match = localGoals.find((lg) => sameTitle(lg.title, g.title))
    if (match) {
      if (g.doneAt && (match.doneAt === null || g.doneAt < match.doneAt)) {
        db.prepare('UPDATE goals SET done_at = ?, completed_lesson_id = ?, updated_at = ? WHERE id = ?').run(
          g.doneAt,
          lessonId,
          ts,
          match.id
        )
      }
      continue
    }
    insertGoal(db, g, freeId(db, 'goals', g.id), targetId, lessonId)
  }

  // 수강권·상태 이력: 없는 id 만 추가
  for (const p of e.passes) if (!exists(db, 'passes', p.id)) insertPass(db, p, p.id, targetId)
  for (const s of e.statusLogs) if (!exists(db, 'status_logs', s.id)) insertStatusLog(db, { ...s, customerId: targetId })

  // 공통메모 이어 붙이기 + 빈 칸만 채우기
  const info = fillEmptyInfo(target, e.customer)
  db.prepare(
    `UPDATE customers SET pinned_note = @pinnedNote, phone = @phone, birth_date = @birthDate, gender = @gender,
       purpose = @purpose, vocal_range = @vocalRange, preferred_music = @preferredMusic, updated_at = @updatedAt
     WHERE id = @id`
  ).run({
    ...info,
    pinnedNote: mergePinnedNote(target.pinnedNote, e.customer.pinnedNote, sourceBranch, today),
    updatedAt: ts,
    id: targetId
  })

  addAliases(db, targetId, [e.customer.id, ...e.aliases])

  // 이력 + 수강중이 아니면 수강중으로
  logMovedIn(db, target, movedInReason(sourceBranch), today, now)
  if (target.status !== 'active') {
    db.prepare("UPDATE customers SET status = 'active', pause_until = NULL, updated_at = ? WHERE id = ?").run(ts, targetId)
  }
}

/** 고객마다 고른 처리 방법을 하나의 트랜잭션으로 적용한다 */
export function applyImport(
  db: DB,
  file: VcrmFile,
  decisions: ImportDecision[],
  today: string,
  now: Date
): ImportResult {
  const byId = new Map(decisions.map((d) => [d.incomingId, d]))
  if (file.customers.some((e) => !byId.has(e.customer.id))) {
    throw validation('모든 고객의 처리 방법을 선택해 주세요.')
  }
  const result: ImportResult = { added: 0, merged: 0, skipped: 0 }
  db.transaction(() => {
    for (const e of file.customers) {
      const d = byId.get(e.customer.id) as ImportDecision
      if (d.action === 'skip') {
        result.skipped++
      } else if (d.action === 'new') {
        addAsNew(db, e, file.sourceBranch, today, now)
        result.added++
      } else {
        mergeInto(db, e, d.targetId, file.sourceBranch, today, now)
        result.merged++
      }
    }
  })()
  return result
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  31 passed`, `Tests  120 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "feat: .vcrm 가져오기 (미리보기, 신규 추가·합치기·건너뛰기)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 엑셀 — 고객 목록 내보내기, 명단 양식, 명단 읽기

**Files:**
- Create: `src/shared/domain/roster.ts`, `src/main/transfer/excel.ts`
- Test: `tests/unit/roster.test.ts`, `tests/transfer/excel.test.ts`

**Interfaces:**
- Produces:
  - `ROSTER_HEADERS` (이름, 연락처, 생년월일, 성별, 수강 목적, 등록일, 음역대, 선호 장르·목표곡, 공통메모), `RosterCell = string | number | Date | null`, `RosterRow = { rowNumber, cells }`, `RosterRowResult = { rowNumber, input: CustomerInput | null, errors, warnings }`
  - `rosterDate(v)` — 엑셀 날짜 칸은 **UTC** 기준으로 읽는다(exceljs 가 UTC 자정 Date 를 준다), 문자열은 `-` `.` `/` 구분 허용, 없는 날짜는 null
  - `rosterPhone(v)` — 숫자 칸에서 빠진 앞자리 0 을 되살린다 (9~10자리이고 0 으로 시작하지 않으면 앞에 0)
  - `isBlankRow(cells)`, `parseRosterRow(row, today)` — 이름 없으면 오류 `이름이 없습니다.`; 형식이 틀린 칸은 비우고 경고(`생년월일 형식이 달라 비웠습니다.`, `성별은 여/남으로 입력해 주세요. 비웠습니다.`, `수강 목적을 알 수 없어 비웠습니다.`, `등록일 형식이 달라 오늘로 넣었습니다.`), 등록일이 비면 오늘
  - `buildCustomersWorkbook(db, customerIds): Promise<Buffer>` — 시트 `고객 목록`(13열), `회차 기록`(회차 오름차순), `수강권`(결제일 오름차순)
  - `buildRosterTemplate(): Promise<Buffer>` — 시트 `명단`(머리글만), `안내`
  - `toRosterCell(v)`, `readRosterRows(data): Promise<RosterRow[]>` — 첫 시트 2번째 줄부터, 빈 줄 제외. 엑셀이 아니면 `엑셀 파일을 읽을 수 없습니다. .xlsx 파일인지 확인해 주세요.`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/roster.test.ts`

```ts
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
```

`tests/transfer/excel.test.ts`

```ts
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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/unit/roster.test.ts tests/transfer/excel.test.ts`
Expected: FAIL — `Failed to resolve import "@shared/domain/roster"` / `"@main/transfer/excel"`.

- [ ] **Step 3: 구현**

`src/shared/domain/roster.ts`

```ts
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
```

`src/main/transfer/excel.ts`

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  33 passed`, `Tests  130 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "feat: 엑셀 고객 목록 내보내기, 명단 양식, 명단 읽기" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 엑셀 명단 미리보기와 등록

**Files:**
- Modify: `src/shared/transferTypes.ts` (명단 타입 추가 — 전체 내용으로 교체)
- Create: `src/main/transfer/roster.ts`
- Test: `tests/transfer/roster.test.ts`

**Interfaces:**
- Consumes: Task 6 의 `isBlankRow`, `parseRosterRow`, `RosterRow`; Task 4 의 `findHints`; 계획 1 의 `createCustomer`.
- Produces:
  - 타입 `RosterPreviewRow = RosterRowResult & { similar: HintCustomer[] }`, `RosterPreview = { token, rows }`
  - `previewRoster(db, rows, today): RosterPreviewRow[]` — 빈 행 제외, 이름·연락처가 같은 이 PC 고객을 힌트로
  - `applyRoster(db, rows, rowNumbers, now): { added }` — 고른 행만 한 트랜잭션으로 등록. 이름 없는 행을 고르면 `추가할 수 없는 행이 있습니다: 4행` 처럼 거부하고 아무것도 등록하지 않는다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/transfer/roster.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { applyRoster, previewRoster } from '@main/transfer/roster'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

const rows = [
  { rowNumber: 2, cells: ['김민지', '010-1234-5678', '2003-05-12', '여', '입시', null, null, null, '메모'] },
  { rowNumber: 3, cells: [null, null, null, null, null, null, null, null, null] },
  { rowNumber: 4, cells: [null, '010-0000-0000', null, null, null, null, null, null, null] },
  { rowNumber: 5, cells: ['한지우', null, null, null, null, null, null, null, null] }
]

describe('previewRoster', () => {
  it('빈 행은 빼고, 이름·연락처가 같은 고객을 힌트로 붙인다', () => {
    const db = createTestDb()
    const existing = seedCustomer(db, { name: '김민지' })
    const preview = previewRoster(db, rows, TODAY)
    expect(preview.map((r) => r.rowNumber)).toEqual([2, 4, 5])
    expect(preview[0].similar.map((h) => h.id)).toEqual([existing])
    expect(preview[1]).toMatchObject({ input: null, errors: ['이름이 없습니다.'], similar: [] })
    expect(preview[2].similar).toEqual([])
  })
})

describe('applyRoster', () => {
  it('고른 행만 새 고객으로 등록하고, 이름 없는 행을 고르면 아무것도 등록하지 않고 거부', () => {
    const db = createTestDb()
    const preview = previewRoster(db, rows, TODAY)
    expect(() => applyRoster(db, preview, [2, 4], NOW)).toThrow('추가할 수 없는 행이 있습니다: 4행')
    expect(db.prepare('SELECT COUNT(*) FROM customers').pluck().get()).toBe(0)
    expect(applyRoster(db, preview, [2, 5], NOW)).toEqual({ added: 2 })
    const names = db.prepare('SELECT name, purpose, registered_at FROM customers ORDER BY name').all()
    expect(names).toEqual([
      { name: '김민지', purpose: 'exam', registered_at: TODAY },
      { name: '한지우', purpose: null, registered_at: TODAY }
    ])
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/transfer/roster.test.ts`
Expected: FAIL — `Failed to resolve import "@main/transfer/roster"`.

- [ ] **Step 3: 구현**

`src/shared/transferTypes.ts` — 아래 전체 내용으로 교체

```ts
import type { HintCustomer } from './domain/merge'
import type { RosterRowResult } from './domain/roster'

export interface ImportPreviewRow {
  incomingId: string
  name: string
  phone: string | null
  lessonCount: number
  goalCount: number
  passCount: number
  same: HintCustomer[]
  similar: HintCustomer[]
}

export interface ImportPreview {
  /** Main 에 잠시 보관한 파일을 가리키는 값. 적용할 때 돌려준다 */
  token: string
  sourceBranch: string
  exportedAt: string
  rows: ImportPreviewRow[]
}

export type ImportDecision =
  | { incomingId: string; action: 'new' }
  | { incomingId: string; action: 'skip' }
  | { incomingId: string; action: 'merge'; targetId: string }

export interface ImportResult {
  added: number
  merged: number
  skipped: number
}

export interface RosterPreviewRow extends RosterRowResult {
  /** 이 PC 에서 이름 또는 연락처가 같은 고객 */
  similar: HintCustomer[]
}

export interface RosterPreview {
  token: string
  rows: RosterPreviewRow[]
}
```

`src/main/transfer/roster.ts`

```ts
import type { Customer } from '@shared/types'
import { findHints } from '@shared/domain/merge'
import { isBlankRow, parseRosterRow, type RosterRow } from '@shared/domain/roster'
import type { RosterPreviewRow } from '@shared/transferTypes'
import type { DB } from '../db/connection'
import { customerColumns } from '../store/columns'
import { createCustomer } from '../store/customers'
import { validation } from '../store/util'

/** 빈 행은 빼고, 행마다 검증 결과와 이름·연락처가 같은 고객 힌트를 붙인다 */
export function previewRoster(db: DB, rows: RosterRow[], today: string): RosterPreviewRow[] {
  const locals = db.prepare(`SELECT ${customerColumns()} FROM customers`).all() as Customer[]
  return rows
    .filter((r) => !isBlankRow(r.cells))
    .map((r) => {
      const parsed = parseRosterRow(r, today)
      const similar = parsed.input
        ? findHints({ id: '', name: parsed.input.name, phone: parsed.input.phone, aliases: [] }, locals, []).similar
        : []
      return { ...parsed, similar }
    })
}

/** 고른 행을 하나의 트랜잭션으로 새 고객 등록한다 */
export function applyRoster(db: DB, rows: RosterPreviewRow[], rowNumbers: number[], now: Date): { added: number } {
  const selected = rows.filter((r) => rowNumbers.includes(r.rowNumber))
  const invalid = selected.filter((r) => r.input === null)
  if (invalid.length > 0) {
    throw validation(`추가할 수 없는 행이 있습니다: ${invalid.map((r) => `${r.rowNumber}행`).join(', ')}`)
  }
  db.transaction(() => {
    for (const r of selected) if (r.input) createCustomer(db, r.input, now)
  })()
  return { added: selected.length }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  34 passed`, `Tests  132 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "feat: 엑셀 명단 미리보기와 등록" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: IPC 채널과 파일 대화상자

**Files:**
- Create: `src/main/transfer/files.ts`, `src/main/transfer/electronFiles.ts`, `src/main/ipc/transferHandlers.ts`
- Modify: `src/shared/api.ts`, `src/main/ipc/handlers.ts`, `src/main/index.ts` (각각 전체 내용으로 교체)
- Test: `tests/support/files.ts`, `tests/transfer/transferHandlers.test.ts`

**Interfaces:**
- Consumes: Task 2~7 전부, 계획 1 의 `getSettings`, `newId`.
- Produces:
  - `FileFilter`, `FileAccess`(`chooseSavePath(defaultName, filters)`, `chooseOpenPath(filters)` — 취소하면 null, `readFile`, `writeFile`), `VCRM_FILTERS`, `EXCEL_FILTERS`, `noFileAccess`(모두 `파일을 열거나 저장할 수 없습니다.`)
  - `createElectronFileAccess(getWindow)` — 저장 창은 '문서' 폴더에서 시작, fs 오류는 `파일을 읽거나 쓰지 못했습니다. 위치와 권한(USB 연결 등)을 확인해 주세요.`
  - `createHandlers(db, clock = () => new Date(), files = noFileAccess)` — 세 번째 인자 추가 (기존 호출은 그대로 동작)
  - 새 채널 7개 (`ApiSpec`·`CHANNEL_MAP` 에 추가):
    - `transfer.exportVcrm({ customerIds, targetBranch, markMoved })` → `{ saved, count, moved }` — 저장 창 취소 시 `{ saved: false, count: 0, moved: 0 }` 이고 상태를 바꾸지 않는다. 이동 처리는 **파일을 쓴 뒤에만** 한다
    - `transfer.openVcrm()` → `ImportPreview | null`, `transfer.applyVcrm(token, decisions)` → `ImportResult`
    - `excel.exportCustomers(customerIds)` → `{ saved }`, `excel.saveRosterTemplate()` → `{ saved }`
    - `excel.openRoster()` → `RosterPreview | null`, `excel.applyRoster(token, rowNumbers)` → `{ added }`
    - token 이 다르거나 이미 적용했으면 `AppError('IMPORT_EXPIRED', '가져오기 정보가 만료되었습니다. 파일을 다시 열어 주세요.')`. 열어 둔 파일은 종류별로 하나만 보관한다
  - 테스트 도우미 `memoryFiles()` — `nextSavePath`/`nextOpenPath` 를 null 로 두면 대화상자 취소, `lastDefaultName` 으로 제안한 파일 이름 확인

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/support/files.ts`

```ts
import type { FileAccess } from '@main/transfer/files'

/** 메모리에 파일을 두는 가짜 파일 접근. nextSavePath/nextOpenPath 가 null 이면 대화상자 취소 */
export function memoryFiles(): FileAccess & {
  store: Map<string, Buffer>
  nextSavePath: string | null
  nextOpenPath: string | null
  lastDefaultName: string | null
} {
  const store = new Map<string, Buffer>()
  const files = {
    store,
    nextSavePath: '/out/file' as string | null,
    nextOpenPath: '/in/file' as string | null,
    lastDefaultName: null as string | null,
    async chooseSavePath(defaultName: string) {
      files.lastDefaultName = defaultName
      return files.nextSavePath
    },
    async chooseOpenPath() {
      return files.nextOpenPath
    },
    async readFile(path: string) {
      const data = store.get(path)
      if (!data) throw new Error(`no file ${path}`)
      return data
    },
    async writeFile(path: string, data: Buffer | string) {
      store.set(path, typeof data === 'string' ? Buffer.from(data, 'utf-8') : data)
    }
  }
  return files
}
```

`tests/transfer/transferHandlers.test.ts`

```ts
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
    expect(r).toEqual({ saved: true, count: 1, moved: 1 })
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
      moved: 0
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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/transfer/transferHandlers.test.ts`
Expected: FAIL — `TypeError: h['transfer.exportVcrm'] is not a function` 등 (채널이 아직 없다. `tests/support/files.ts` 는 타입만 import 하므로 해석 오류는 나지 않는다).

- [ ] **Step 3: 파일 접근과 채널 구현**

`src/main/transfer/files.ts`

```ts
import { AppError } from '@shared/result'

export interface FileFilter {
  name: string
  extensions: string[]
}

/** 파일 대화상자와 읽기·쓰기. Main 에서는 Electron 구현, 테스트에서는 메모리 구현을 쓴다 */
export interface FileAccess {
  /** 저장 위치를 고른다. 취소하면 null */
  chooseSavePath(defaultName: string, filters: FileFilter[]): Promise<string | null>
  /** 열 파일을 고른다. 취소하면 null */
  chooseOpenPath(filters: FileFilter[]): Promise<string | null>
  readFile(path: string): Promise<Buffer>
  writeFile(path: string, data: Buffer | string): Promise<void>
}

export const VCRM_FILTERS: FileFilter[] = [{ name: 'VOCAL CRM 고객 파일', extensions: ['vcrm'] }]
export const EXCEL_FILTERS: FileFilter[] = [{ name: '엑셀 파일', extensions: ['xlsx'] }]

const unavailable = (): never => {
  throw new AppError('NO_FILE_ACCESS', '파일을 열거나 저장할 수 없습니다.')
}

/** 파일 접근을 주지 않았을 때의 기본값 */
export const noFileAccess: FileAccess = {
  chooseSavePath: async () => unavailable(),
  chooseOpenPath: async () => unavailable(),
  readFile: async () => unavailable(),
  writeFile: async () => unavailable()
}
```

`src/main/transfer/electronFiles.ts`

```ts
import { app, dialog, type BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '@shared/result'
import type { FileAccess } from './files'

const fileError = (err: unknown): AppError => {
  console.error(err)
  return new AppError('FILE_ERROR', '파일을 읽거나 쓰지 못했습니다. 위치와 권한(USB 연결 등)을 확인해 주세요.')
}

/** Electron 대화상자 + fs. 저장 창은 '문서' 폴더에서 시작한다 */
export function createElectronFileAccess(getWindow: () => BrowserWindow | null): FileAccess {
  return {
    async chooseSavePath(defaultName, filters) {
      const options = { defaultPath: join(app.getPath('documents'), defaultName), filters }
      const win = getWindow()
      const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      return result.canceled || !result.filePath ? null : result.filePath
    },
    async chooseOpenPath(filters) {
      const options = { properties: ['openFile' as const], filters }
      const win = getWindow()
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    },
    async readFile(path) {
      try {
        return await readFile(path)
      } catch (err) {
        throw fileError(err)
      }
    },
    async writeFile(path, data) {
      try {
        await writeFile(path, data)
      } catch (err) {
        throw fileError(err)
      }
    }
  }
}
```

`src/main/ipc/transferHandlers.ts`

```ts
import { toDateString } from '@shared/domain/dates'
import { customersExcelFileName, ROSTER_TEMPLATE_FILE_NAME, vcrmFileName } from '@shared/domain/transferNames'
import { AppError } from '@shared/result'
import type { RosterPreviewRow } from '@shared/transferTypes'
import { parseVcrm, serializeVcrm, type VcrmFile } from '@shared/vcrm'
import type { DB } from '../db/connection'
import { getSettings } from '../store/settings'
import { newId } from '../store/util'
import { buildCustomersWorkbook, buildRosterTemplate, readRosterRows } from '../transfer/excel'
import { buildVcrm, markMoved } from '../transfer/exportVcrm'
import { EXCEL_FILTERS, VCRM_FILTERS, type FileAccess } from '../transfer/files'
import { applyImport, previewRows } from '../transfer/importVcrm'
import { applyRoster, previewRoster } from '../transfer/roster'
import type { Handlers } from './handlers'

type TransferChannel =
  | 'transfer.exportVcrm'
  | 'transfer.openVcrm'
  | 'transfer.applyVcrm'
  | 'excel.exportCustomers'
  | 'excel.saveRosterTemplate'
  | 'excel.openRoster'
  | 'excel.applyRoster'

const expired = (): AppError =>
  new AppError('IMPORT_EXPIRED', '가져오기 정보가 만료되었습니다. 파일을 다시 열어 주세요.')

/**
 * 지점 이동(.vcrm)·엑셀 채널. 열어 둔 파일은 미리보기와 적용 사이에 Main 메모리에 한 개만 보관한다.
 */
export function createTransferHandlers(
  db: DB,
  clock: () => Date,
  files: FileAccess
): Pick<Handlers, TransferChannel> {
  const today = (): string => toDateString(clock())
  const branch = (): string => getSettings(db).branchName ?? ''
  let pendingVcrm: { token: string; file: VcrmFile } | null = null
  let pendingRoster: { token: string; rows: RosterPreviewRow[] } | null = null

  return {
    'transfer.exportVcrm': async ({ customerIds, targetBranch, markMoved: move }) => {
      const file = buildVcrm(db, customerIds, { sourceBranch: branch(), targetBranch }, clock())
      const names = file.customers.map((e) => e.customer.name)
      const path = await files.chooseSavePath(vcrmFileName(names, branch(), today()), VCRM_FILTERS)
      if (!path) return { saved: false, count: 0, moved: 0 }
      await files.writeFile(path, serializeVcrm(file))
      const moved = move ? markMoved(db, customerIds, targetBranch, today(), clock()) : 0
      return { saved: true, count: customerIds.length, moved }
    },

    'transfer.openVcrm': async () => {
      const path = await files.chooseOpenPath(VCRM_FILTERS)
      if (!path) return null
      const file = parseVcrm((await files.readFile(path)).toString('utf-8'))
      pendingVcrm = { token: newId(), file }
      return {
        token: pendingVcrm.token,
        sourceBranch: file.sourceBranch,
        exportedAt: file.exportedAt,
        rows: previewRows(db, file)
      }
    },

    'transfer.applyVcrm': (token, decisions) => {
      if (!pendingVcrm || pendingVcrm.token !== token) throw expired()
      const result = applyImport(db, pendingVcrm.file, decisions, today(), clock())
      pendingVcrm = null
      return result
    },

    'excel.exportCustomers': async (customerIds) => {
      const data = await buildCustomersWorkbook(db, customerIds)
      const path = await files.chooseSavePath(customersExcelFileName(branch(), today()), EXCEL_FILTERS)
      if (!path) return { saved: false }
      await files.writeFile(path, data)
      return { saved: true }
    },

    'excel.saveRosterTemplate': async () => {
      const path = await files.chooseSavePath(ROSTER_TEMPLATE_FILE_NAME, EXCEL_FILTERS)
      if (!path) return { saved: false }
      await files.writeFile(path, await buildRosterTemplate())
      return { saved: true }
    },

    'excel.openRoster': async () => {
      const path = await files.chooseOpenPath(EXCEL_FILTERS)
      if (!path) return null
      const rows = previewRoster(db, await readRosterRows(await files.readFile(path)), today())
      pendingRoster = { token: newId(), rows }
      return { token: pendingRoster.token, rows }
    },

    'excel.applyRoster': (token, rowNumbers) => {
      if (!pendingRoster || pendingRoster.token !== token) throw expired()
      const result = applyRoster(db, pendingRoster.rows, rowNumbers, clock())
      pendingRoster = null
      return result
    }
  }
}
```

`src/shared/api.ts` — 아래 전체 내용으로 교체

```ts
import type {
  Customer,
  CustomerDetail,
  CustomerInput,
  CustomerSummary,
  Goal,
  HomeData,
  Lesson,
  LessonInput,
  Pass,
  PassInput,
  Reservation,
  ReservationInput,
  ReservationWithCustomer,
  Settings,
  StatusChangeInput
} from './types'
import type { ImportDecision, ImportPreview, ImportResult, RosterPreview } from './transferTypes'

export interface ExportVcrmRequest {
  customerIds: string[]
  targetBranch: string | null
  /** 저장한 뒤 고른 고객을 '타지점 이동' 으로 바꾼다 */
  markMoved: boolean
}

/** 파일 저장 결과. 저장 창에서 취소하면 saved: false */
export interface SaveResult {
  saved: boolean
}

/** IPC 계약: 채널 이름 → 인자 튜플과 결과 타입 */
export interface ApiSpec {
  'settings.get': { args: []; result: Settings }
  'settings.update': { args: [patch: { branchName?: string; lessonMinutes?: number }]; result: Settings }

  'home.get': { args: []; result: HomeData }

  'customers.list': { args: []; result: CustomerSummary[] }
  'customers.detail': { args: [id: string]; result: CustomerDetail | null }
  'customers.create': { args: [input: CustomerInput]; result: Customer }
  'customers.update': { args: [id: string, input: CustomerInput]; result: Customer }
  'customers.setPinnedNote': { args: [id: string, note: string]; result: void }
  'customers.remove': { args: [id: string]; result: void }
  'customers.countOpenReservations': { args: [id: string]; result: number }
  'customers.changeStatus': { args: [input: StatusChangeInput]; result: { canceledReservations: number } }

  'goals.add': { args: [customerId: string, title: string]; result: Goal }
  'goals.rename': { args: [id: string, title: string]; result: void }
  'goals.setDone': { args: [id: string, done: boolean]; result: void }
  'goals.remove': { args: [id: string]; result: void }

  'lessons.save': { args: [input: LessonInput]; result: Lesson }
  'lessons.remove': { args: [id: string]; result: void }

  'passes.save': { args: [input: PassInput]; result: Pass }
  'passes.remove': { args: [id: string]; result: void }

  'reservations.range': { args: [from: string, to: string]; result: ReservationWithCustomer[] }
  'reservations.save': { args: [input: ReservationInput]; result: Reservation }
  'reservations.cancel': { args: [id: string]; result: void }

  'transfer.exportVcrm': { args: [request: ExportVcrmRequest]; result: SaveResult & { count: number; moved: number } }
  'transfer.openVcrm': { args: []; result: ImportPreview | null }
  'transfer.applyVcrm': { args: [token: string, decisions: ImportDecision[]]; result: ImportResult }

  'excel.exportCustomers': { args: [customerIds: string[]]; result: SaveResult }
  'excel.saveRosterTemplate': { args: []; result: SaveResult }
  'excel.openRoster': { args: []; result: RosterPreview | null }
  'excel.applyRoster': { args: [token: string, rowNumbers: number[]]; result: { added: number } }
}

export type Channel = keyof ApiSpec
export type ArgsOf<C extends Channel> = ApiSpec[C]['args']
export type ResultOf<C extends Channel> = ApiSpec[C]['result']

/** 채널을 빠뜨리면 컴파일 오류가 나도록 Record로 선언한다 */
const CHANNEL_MAP: Record<Channel, true> = {
  'settings.get': true,
  'settings.update': true,
  'home.get': true,
  'customers.list': true,
  'customers.detail': true,
  'customers.create': true,
  'customers.update': true,
  'customers.setPinnedNote': true,
  'customers.remove': true,
  'customers.countOpenReservations': true,
  'customers.changeStatus': true,
  'goals.add': true,
  'goals.rename': true,
  'goals.setDone': true,
  'goals.remove': true,
  'lessons.save': true,
  'lessons.remove': true,
  'passes.save': true,
  'passes.remove': true,
  'reservations.range': true,
  'reservations.save': true,
  'reservations.cancel': true,
  'transfer.exportVcrm': true,
  'transfer.openVcrm': true,
  'transfer.applyVcrm': true,
  'excel.exportCustomers': true,
  'excel.saveRosterTemplate': true,
  'excel.openRoster': true,
  'excel.applyRoster': true
}

export const CHANNELS = Object.keys(CHANNEL_MAP) as Channel[]
```

`src/main/ipc/handlers.ts` — 아래 전체 내용으로 교체

```ts
import type { ArgsOf, Channel, ResultOf } from '@shared/api'
import { toDateString } from '@shared/domain/dates'
import type { DB } from '../db/connection'
import { createCustomer, deleteCustomer, setPinnedNote, updateCustomer } from '../store/customers'
import { addGoal, deleteGoal, renameGoal, setGoalDone } from '../store/goals'
import { deleteLesson, saveLesson } from '../store/lessons'
import { deletePass, savePass } from '../store/passes'
import { getCustomerDetail, getHome, listReservationsInRange, listSummaries } from '../store/queries'
import { cancelReservation, saveReservation } from '../store/reservations'
import { getSettings, updateSettings } from '../store/settings'
import { changeStatus, countOpenReservations } from '../store/status'
import { noFileAccess, type FileAccess } from '../transfer/files'
import { createTransferHandlers } from './transferHandlers'

export type Handlers = {
  [C in Channel]: (...args: ArgsOf<C>) => ResultOf<C> | Promise<ResultOf<C>>
}

/** 채널별 처리 함수. clock 은 테스트에서 시각을, files 는 파일 대화상자·읽기·쓰기를 바꿔 끼우기 위한 것 */
export function createHandlers(
  db: DB,
  clock: () => Date = () => new Date(),
  files: FileAccess = noFileAccess
): Handlers {
  const today = (): string => toDateString(clock())
  return {
    ...createTransferHandlers(db, clock, files),
    'settings.get': () => getSettings(db),
    'settings.update': (patch) => updateSettings(db, patch),

    'home.get': () => getHome(db, today()),

    'customers.list': () => listSummaries(db, today()),
    'customers.detail': (id) => getCustomerDetail(db, id, today()),
    'customers.create': (input) => createCustomer(db, input, clock()),
    'customers.update': (id, input) => updateCustomer(db, id, input, clock()),
    'customers.setPinnedNote': (id, note) => setPinnedNote(db, id, note, clock()),
    'customers.remove': (id) => deleteCustomer(db, id),
    'customers.countOpenReservations': (id) => countOpenReservations(db, id),
    'customers.changeStatus': (input) => changeStatus(db, input, clock()),

    'goals.add': (customerId, title) => addGoal(db, customerId, title, clock()),
    'goals.rename': (id, title) => renameGoal(db, id, title, clock()),
    'goals.setDone': (id, done) => setGoalDone(db, id, done, today(), clock()),
    'goals.remove': (id) => deleteGoal(db, id),

    'lessons.save': (input) => saveLesson(db, input, clock()),
    'lessons.remove': (id) => deleteLesson(db, id, clock()),

    'passes.save': (input) => savePass(db, input, clock()),
    'passes.remove': (id) => deletePass(db, id),

    'reservations.range': (from, to) => listReservationsInRange(db, from, to),
    'reservations.save': (input) => saveReservation(db, input, clock()),
    'reservations.cancel': (id) => cancelReservation(db, id, clock())
  }
}
```

`src/main/index.ts` — 아래 전체 내용으로 교체

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { openDatabase } from './db/connection'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { createElectronFileAccess } from './transfer/electronFiles'

// 개발 중에는 실제 데이터와 섞이지 않게 별도 폴더를 쓴다
if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'VOCAL_CRM-dev'))
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'VOCAL CRM',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    const db = openDatabase(join(app.getPath('userData'), 'vocal_crm.db'))
    registerIpc(createHandlers(db, () => new Date(), createElectronFileAccess(() => mainWindow)))
    createWindow()
  })

  app.on('window-all-closed', () => app.quit())
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  35 passed`, `Tests  138 passed`. (계획 1 의 `tests/db/ipc.test.ts` "모든 채널에 처리 함수가 있다" 도 새 채널까지 통과해야 한다)

- [ ] **Step 5: 타입 검사·빌드**

Run: `npm run typecheck && npx electron-vite build && grep -o 'require("[^"]*")' out/main/index.js | sort -u`
Expected: 오류 없음. 외부 모듈은 `better-sqlite3`, `electron`, `exceljs`, `node:crypto`, `node:fs/promises`, `node:path`, `zod` 일곱 개.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "feat: 가져오기·내보내기 IPC 채널과 파일 대화상자" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 가져오기·내보내기 화면 — 고객 선택 창, .vcrm 내보내기, 엑셀 내보내기

**Files:**
- Create: `src/renderer/src/components/transfer/CustomerPickerModal.tsx`, `src/renderer/src/components/transfer/ExportVcrmModal.tsx`, `src/renderer/src/pages/TransferPage.tsx` (이 Task 버전 — Task 10·11 에서 카드 추가)
- Modify: `src/renderer/src/layout/AppLayout.tsx` (메뉴 "가져오기·내보내기" 추가), `src/renderer/src/App.tsx` (`transfer` 경로 추가) — 각각 전체 내용으로 교체
- Test: `tests/support/summaries.ts`, `tests/renderer/TransferExport.test.tsx`

**Interfaces:**
- Consumes: Task 8 의 채널, 계획 1 의 `useCustomers`, `useSettings`, `useApiMutation`, `filterCustomers`, `sortCustomers`, `notifySuccess`, `todayString`.
- Produces:
  - `CustomerPickerModal({ title, confirmLabel, onConfirm(customers), onClose })` — 상태 필터(기본 수강중) + 검색 + 맨 위 체크박스(aria-label `보이는 고객 전체 선택`)로 지금 보이는 고객 전체 선택/해제, 행 체크박스 aria-label `<이름> 선택`, "N명 선택됨"
  - `ExportVcrmModal({ customers, onClose })` — 보낼 지점(선택), "내보낸 고객을 '타지점 이동' 상태로 바꾸기"(기본 꺼짐), 파일 이름 미리보기, `파일로 저장`. 저장 창에서 취소하면 창을 닫지 않는다
  - `TransferPage` — 이 Task 에서는 카드 2개 (고객 내보내기 / 엑셀로 내보내기)
  - 테스트 도우미 `makeSummary(over)`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/support/summaries.ts`

```ts
import type { CustomerSummary } from '@shared/types'

export function makeSummary(over: Partial<CustomerSummary> = {}): CustomerSummary {
  return {
    id: 'c1',
    name: '김민지',
    phone: '01012345678',
    purpose: null,
    status: 'active',
    pinnedNote: '',
    goalsDone: 0,
    goalsTotal: 0,
    lessonCount: 0,
    lastLessonDate: null,
    nextReservation: null,
    remainingPasses: null,
    ...over
  }
}
```

`tests/renderer/TransferExport.test.tsx`

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransferPage } from '@renderer/pages/TransferPage'
import { makeSummary } from '../support/summaries'
import { mockApi, renderWithProviders } from './render'

const customers = [
  makeSummary({ id: 'a', name: '김민지' }),
  makeSummary({ id: 'b', name: '박서준' }),
  makeSummary({ id: 'c', name: '정유나', status: 'paused' })
]

describe('가져오기·내보내기 — 내보내기', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 28, 10, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('수강중 고객 전체 선택 → 보낼 지점·타지점 이동 → 파일로 저장', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({
      'customers.list': () => customers,
      'settings.get': () => ({ branchName: '강남점', lessonMinutes: 60 }),
      'transfer.exportVcrm': () => ({ saved: true, count: 2, moved: 2 })
    })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '고객 선택' }))
    await user.click(await screen.findByLabelText('보이는 고객 전체 선택'))
    expect(screen.getByText('2명 선택됨')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByText('고객2명_강남점_2026-09-28.vcrm')).toBeInTheDocument()
    await user.type(screen.getByLabelText('보낼 지점 (선택)'), '홍대점')
    await user.click(screen.getByLabelText("내보낸 고객을 '타지점 이동' 상태로 바꾸기"))
    await user.click(screen.getByRole('button', { name: '파일로 저장' }))

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('transfer.exportVcrm', {
        customerIds: ['a', 'b'],
        targetBranch: '홍대점',
        markMoved: true
      })
    )
    await waitFor(() => expect(screen.queryByRole('button', { name: '파일로 저장' })).not.toBeInTheDocument())
  })

  it('엑셀로 내보내기는 고른 고객 id 로 저장을 요청한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'customers.list': () => customers, 'excel.exportCustomers': () => ({ saved: true }) })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '엑셀 저장' }))
    await user.click(await screen.findByLabelText('박서준 선택'))
    await user.click(screen.getByRole('button', { name: '엑셀로 저장' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('excel.exportCustomers', ['b']))
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/renderer/TransferExport.test.tsx`
Expected: FAIL — `Failed to resolve import "@renderer/pages/TransferPage"`.

- [ ] **Step 3: 구현**

`src/renderer/src/components/transfer/CustomerPickerModal.tsx`

```tsx
import { useMemo, useState } from 'react'
import { Button, Checkbox, Group, Modal, ScrollArea, SegmentedControl, Stack, Table, Text, TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import type { CustomerSummary } from '@shared/types'
import { filterCustomers, sortCustomers, type StatusFilter } from '@shared/domain/customerList'
import { relativeDays } from '@shared/domain/dates'
import { PURPOSE_LABEL } from '@shared/domain/labels'
import { useCustomers } from '../../api/hooks'
import { todayString } from '../../lib/today'

interface Props {
  title: string
  confirmLabel: string
  onConfirm: (customers: CustomerSummary[]) => void
  onClose: () => void
}

/** 내보낼 고객 고르기: 상태 필터 + 검색 + 맨 위 체크박스로 지금 보이는 고객 전체 선택 */
export function CustomerPickerModal({ title, confirmLabel, onConfirm, onClose }: Props): React.JSX.Element {
  const customers = useCustomers()
  const [filter, setFilter] = useState<StatusFilter>('active')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const today = todayString()
  const all = customers.data ?? []
  const rows = useMemo(() => sortCustomers(filterCustomers(all, filter, query), 'name', 'asc'), [all, filter, query])
  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someVisibleSelected = rows.some((r) => selected.has(r.id))

  const toggle = (id: string): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAllVisible = (): void =>
    setSelected((s) => {
      const next = new Set(s)
      for (const r of rows) {
        if (allVisibleSelected) next.delete(r.id)
        else next.add(r.id)
      }
      return next
    })

  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>{title}</Text>} size="lg">
      <Stack gap="sm">
        <Group gap="sm">
          <SegmentedControl
            size="xs"
            value={filter}
            onChange={setFilter}
            data={[
              { value: 'active', label: '수강중' },
              { value: 'paused', label: '휴강' },
              { value: 'closed', label: '종료·이동' },
              { value: 'all', label: '전체' }
            ]}
          />
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            leftSection={<IconSearch size={14} />}
            placeholder="이름 · 연락처 검색"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
        </Group>
        <ScrollArea.Autosize mah={360}>
          <Table verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={36}>
                  <Checkbox
                    aria-label="보이는 고객 전체 선택"
                    checked={allVisibleSelected}
                    indeterminate={!allVisibleSelected && someVisibleSelected}
                    onChange={toggleAllVisible}
                  />
                </Table.Th>
                <Table.Th>이름</Table.Th>
                <Table.Th>목적</Table.Th>
                <Table.Th>최근 수업</Table.Th>
                <Table.Th>회차</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Checkbox aria-label={`${c.name} 선택`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  </Table.Td>
                  <Table.Td fw={600}>{c.name}</Table.Td>
                  <Table.Td>{c.purpose ? PURPOSE_LABEL[c.purpose] : '–'}</Table.Td>
                  <Table.Td>{c.lastLessonDate ? relativeDays(c.lastLessonDate, today) : '–'}</Table.Td>
                  <Table.Td>{c.lessonCount > 0 ? c.lessonCount : '–'}</Table.Td>
                </Table.Tr>
              ))}
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      해당하는 고객이 없습니다.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            {selected.size}명 선택됨
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              취소
            </Button>
            <Button disabled={selected.size === 0} onClick={() => onConfirm(all.filter((c) => selected.has(c.id)))}>
              {confirmLabel}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
```

`src/renderer/src/components/transfer/ExportVcrmModal.tsx`

```tsx
import { useState } from 'react'
import { Button, Checkbox, Group, Modal, Paper, Stack, Text, TextInput } from '@mantine/core'
import type { CustomerSummary } from '@shared/types'
import { vcrmFileName } from '@shared/domain/transferNames'
import { useApiMutation, useSettings } from '../../api/hooks'
import { notifySuccess } from '../../lib/notify'
import { todayString } from '../../lib/today'

/** .vcrm 내보내기: 보낼 지점(선택), '타지점 이동' 으로 바꾸기, 파일 이름 미리보기 */
export function ExportVcrmModal({ customers, onClose }: { customers: CustomerSummary[]; onClose: () => void }): React.JSX.Element {
  const settings = useSettings()
  const [targetBranch, setTargetBranch] = useState('')
  const [markMoved, setMarkMoved] = useState(false)
  const exportVcrm = useApiMutation('transfer.exportVcrm')
  const fileName = vcrmFileName(
    customers.map((c) => c.name),
    settings.data?.branchName ?? '',
    todayString()
  )

  const submit = async (): Promise<void> => {
    let result: { saved: boolean; count: number; moved: number }
    try {
      result = await exportVcrm.mutateAsync([
        { customerIds: customers.map((c) => c.id), targetBranch: targetBranch.trim() || null, markMoved }
      ])
    } catch {
      return
    }
    if (!result.saved) return // 저장 창에서 취소 — 창은 그대로 둔다
    const moved = result.moved > 0 ? ` ${result.moved}명을 타지점 이동으로 바꿨습니다.` : ''
    notifySuccess(`${result.count}명을 내보냈습니다.${moved}`)
    onClose()
  }

  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>고객 내보내기 (.vcrm)</Text>}>
      <Stack gap="sm">
        <div>
          <Text size="sm" fw={500} mb={4}>
            내보낼 고객 · {customers.length}명
          </Text>
          <Text size="sm" c="dimmed">
            {customers
              .slice(0, 5)
              .map((c) => c.name)
              .join(', ')}
            {customers.length > 5 ? ` 외 ${customers.length - 5}명` : ''}
          </Text>
        </div>
        <TextInput
          label="보낼 지점 (선택)"
          placeholder="예: 홍대점"
          value={targetBranch}
          onChange={(e) => setTargetBranch(e.currentTarget.value)}
        />
        <Checkbox
          label="내보낸 고객을 '타지점 이동' 상태로 바꾸기"
          description="홈 목록에서 빠지고 이력에 남습니다. 데이터는 지우지 않습니다."
          checked={markMoved}
          onChange={(e) => setMarkMoved(e.currentTarget.checked)}
        />
        <Paper bg="gray.0" p="sm" radius="md">
          <Text size="xs" c="dimmed">
            파일 이름
          </Text>
          <Text size="sm" ff="monospace">
            {fileName}
          </Text>
        </Paper>
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void submit()} loading={exportVcrm.isPending}>
            파일로 저장
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
```

`src/renderer/src/pages/TransferPage.tsx`

```tsx
import { useState } from 'react'
import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import type { CustomerSummary } from '@shared/types'
import { useApiMutation } from '../api/hooks'
import { CustomerPickerModal } from '../components/transfer/CustomerPickerModal'
import { ExportVcrmModal } from '../components/transfer/ExportVcrmModal'
import { notifySuccess } from '../lib/notify'

function TransferCard(props: {
  icon: string
  tag: string
  tagColor: string
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Card withBorder padding="md">
      <Stack gap={6} h="100%">
        <Text fz={24}>{props.icon}</Text>
        <Badge variant="light" color={props.tagColor} w="fit-content">
          {props.tag}
        </Badge>
        <Text fw={700}>{props.title}</Text>
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>
          {props.description}
        </Text>
        <Group gap="xs">{props.children}</Group>
      </Stack>
    </Card>
  )
}

export function TransferPage(): React.JSX.Element {
  const [picker, setPicker] = useState<'vcrm' | 'excel' | null>(null)
  const [exportTarget, setExportTarget] = useState<CustomerSummary[] | null>(null)
  const exportExcel = useApiMutation('excel.exportCustomers')

  const saveExcel = async (customers: CustomerSummary[]): Promise<void> => {
    setPicker(null)
    let result: { saved: boolean }
    try {
      result = await exportExcel.mutateAsync([customers.map((c) => c.id)])
    } catch {
      return
    }
    if (result.saved) notifySuccess(`${customers.length}명을 엑셀로 저장했습니다.`)
  }

  return (
    <Stack gap="md">
      <Title order={2}>가져오기 · 내보내기</Title>
      <SimpleGrid cols={4} spacing="md">
        <TransferCard
          icon="📤"
          tag="지점 이동용"
          tagColor="blue"
          title="고객 내보내기"
          description="고른 고객의 정보·공통메모·목표·회차 기록·수강권을 .vcrm 파일로 저장합니다."
        >
          <Button onClick={() => setPicker('vcrm')}>고객 선택</Button>
        </TransferCard>
        <TransferCard
          icon="📊"
          tag="엑셀"
          tagColor="teal"
          title="엑셀로 내보내기"
          description="보관·인쇄용입니다. 시트: 고객 목록 / 회차 기록 / 수강권. 다시 가져올 수는 없습니다."
        >
          <Button variant="light" onClick={() => setPicker('excel')} loading={exportExcel.isPending}>
            엑셀 저장
          </Button>
        </TransferCard>
      </SimpleGrid>

      {picker === 'vcrm' && (
        <CustomerPickerModal
          title="내보낼 고객 선택"
          confirmLabel="다음"
          onClose={() => setPicker(null)}
          onConfirm={(customers) => {
            setPicker(null)
            setExportTarget(customers)
          }}
        />
      )}
      {picker === 'excel' && (
        <CustomerPickerModal
          title="엑셀로 내보낼 고객 선택"
          confirmLabel="엑셀로 저장"
          onClose={() => setPicker(null)}
          onConfirm={(customers) => void saveExcel(customers)}
        />
      )}
      {exportTarget && <ExportVcrmModal customers={exportTarget} onClose={() => setExportTarget(null)} />}
    </Stack>
  )
}
```

`src/renderer/src/layout/AppLayout.tsx` — 아래 전체 내용으로 교체

```tsx
import { useEffect } from 'react'
import { AppShell, NavLink, Stack, Text, Title } from '@mantine/core'
import { IconArrowsExchange, IconCalendarWeek, IconHome, IconSettings } from '@tabler/icons-react'
import { Link, Outlet, useLocation } from 'react-router'
import { useDayRollover } from '../lib/useDayRollover'

interface Props {
  branchName: string
}

export function AppLayout({ branchName }: Props): React.JSX.Element {
  const { pathname } = useLocation()
  // 앱을 밤새 켜 둬도 자정이 지나면 홈 화면이 자동으로 갱신되게 한다
  useDayRollover()
  // 화면을 옮기면 맨 위부터 보이게 한다
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  const isHome = pathname === '/' || pathname.startsWith('/customers')
  return (
    <AppShell navbar={{ width: 200, breakpoint: 'xs' }} padding="lg">
      <AppShell.Navbar p="sm" bg="gray.0">
        <Stack gap={2} mb="md" px="xs" pt="xs">
          <Title order={4}>🎤 VOCAL CRM</Title>
          <Text size="xs" c="dimmed">
            {branchName}
          </Text>
        </Stack>
        <NavLink component={Link} to="/" label="홈" leftSection={<IconHome size={18} />} active={isHome} />
        <NavLink
          component={Link}
          to="/schedule"
          label="일정"
          leftSection={<IconCalendarWeek size={18} />}
          active={pathname === '/schedule'}
        />
        <NavLink
          component={Link}
          to="/transfer"
          label="가져오기·내보내기"
          leftSection={<IconArrowsExchange size={18} />}
          active={pathname === '/transfer'}
        />
        <NavLink
          component={Link}
          to="/settings"
          label="설정"
          leftSection={<IconSettings size={18} />}
          active={pathname === '/settings'}
        />
      </AppShell.Navbar>
      <AppShell.Main bg="white">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
```

`src/renderer/src/App.tsx` — 아래 전체 내용으로 교체

```tsx
import { Center, Loader, MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Route, Routes } from 'react-router'
import { useSettings } from './api/hooks'
import { AppLayout } from './layout/AppLayout'
import { notifyError } from './lib/notify'
import { AppModalsProvider } from './modals/AppModals'
import { CustomerDetailPage } from './pages/CustomerDetailPage'
import { HomePage } from './pages/HomePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { SchedulePage } from './pages/SchedulePage'
import { SettingsPage } from './pages/SettingsPage'
import { TransferPage } from './pages/TransferPage'
import { theme } from './theme'

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: notifyError }),
  mutationCache: new MutationCache({ onError: notifyError }),
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } }
})

function Root(): React.JSX.Element {
  const settings = useSettings()
  if (!settings.data) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }
  if (!settings.data.branchName) return <OnboardingPage />
  return (
    <AppModalsProvider>
      <Routes>
        <Route element={<AppLayout branchName={settings.data.branchName} />}>
          <Route index element={<HomePage />} />
          <Route path="customers/:id" element={<CustomerDetailPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="transfer" element={<TransferPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </AppModalsProvider>
  )
}

export function App(): React.JSX.Element {
  return (
    <MantineProvider theme={theme}>
      <DatesProvider settings={{ locale: 'ko', firstDayOfWeek: 1 }}>
        <QueryClientProvider client={queryClient}>
          <ModalsProvider labels={{ confirm: '확인', cancel: '취소' }}>
            <Notifications position="bottom-right" limit={3} />
            <HashRouter>
              <Root />
            </HashRouter>
          </ModalsProvider>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  36 passed`, `Tests  140 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "feat: 가져오기·내보내기 화면 — 고객 선택, .vcrm·엑셀 내보내기" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 가져오기 미리보기 창

**Files:**
- Create: `src/renderer/src/components/transfer/ImportPreviewModal.tsx`
- Modify: `src/renderer/src/pages/TransferPage.tsx` ("고객 가져오기" 카드 추가 — 전체 내용으로 교체)
- Test: `tests/renderer/TransferImport.test.tsx`

**Interfaces:**
- Produces:
  - `toDecision(incomingId, choice)` — 선택 값 `'new'` / `'skip'` / `'merge:<고객 id>'` 을 `ImportDecision` 으로
  - `ImportPreviewModal({ preview, onClose })` — 제목 `<보낸 지점>에서 보낸 파일 · 고객 N명`; 행마다 가져올 고객(이름·연락처, `회차 기록 N건 · 목표 N개 · 수강권 N건`), 힌트(🔗 같은 고객 / 이름·연락처 같음 + `이 고객에 합치기` 버튼 / `비슷한 고객 없음`), 처리 방법 Select(기본 "선택하세요", 신규 추가 / 건너뛰기 / `합치기 → <이 PC 고객>` 검색 가능). 한 번에 지정 버튼 2개: `🔗 같은 고객 힌트가 있는 고객(N) → 그 고객에 합치기`(해당 행을 덮어씀), `선택 안 된 나머지 → 신규 추가`(빈 행만). 모두 고르기 전에는 `적용하기` 비활성 + 남은 인원 안내. 적용 후 `신규 N명, 합침 N명, 건너뜀 N명` + `닫기`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/renderer/TransferImport.test.tsx`

```tsx
import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ImportPreview } from '@shared/transferTypes'
import { toDecision } from '@renderer/components/transfer/ImportPreviewModal'
import { TransferPage } from '@renderer/pages/TransferPage'
import { makeSummary } from '../support/summaries'
import { mockApi, renderWithProviders } from './render'

const hint = (id: string, name: string) => ({ id, name, phone: null, status: 'active' as const })

const preview: ImportPreview = {
  token: 't1',
  sourceBranch: '홍대점',
  exportedAt: '2026-09-27T06:00:00.000Z',
  rows: [
    { incomingId: 'x1', name: '김민지', phone: null, lessonCount: 12, goalCount: 7, passCount: 2, same: [hint('a', '김민지')], similar: [] },
    { incomingId: 'x2', name: '박서준', phone: null, lessonCount: 5, goalCount: 3, passCount: 0, same: [], similar: [hint('b', '박서준')] },
    { incomingId: 'x3', name: '한지우', phone: null, lessonCount: 1, goalCount: 0, passCount: 0, same: [], similar: [] }
  ]
}

describe('toDecision', () => {
  it('선택 값을 처리 방법으로 바꾼다', () => {
    expect(toDecision('x', 'new')).toEqual({ incomingId: 'x', action: 'new' })
    expect(toDecision('x', 'skip')).toEqual({ incomingId: 'x', action: 'skip' })
    expect(toDecision('x', 'merge:a')).toEqual({ incomingId: 'x', action: 'merge', targetId: 'a' })
  })
})

describe('가져오기 미리보기', () => {
  it('모두 고를 때까지 적용할 수 없고, 한 번에 지정·힌트 버튼으로 채운 뒤 적용 결과를 보여준다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({
      'customers.list': () => [makeSummary({ id: 'a', name: '김민지' }), makeSummary({ id: 'b', name: '박서준' })],
      'transfer.openVcrm': () => preview,
      'transfer.applyVcrm': () => ({ added: 1, merged: 2, skipped: 0 })
    })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '파일 열기' }))

    expect(await screen.findByText('홍대점에서 보낸 파일 · 고객 3명')).toBeInTheDocument()
    expect(screen.getByText('회차 기록 12건 · 목표 7개 · 수강권 2건')).toBeInTheDocument()
    const apply = screen.getByRole('button', { name: '적용하기' })
    expect(apply).toBeDisabled()
    expect(screen.getByText('아직 처리 방법을 고르지 않은 고객이 3명 있습니다.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /같은 고객 힌트가 있는 고객\(1\)/ }))
    await user.click(screen.getByRole('button', { name: '이 고객에 합치기' }))
    await user.click(screen.getByRole('button', { name: '선택 안 된 나머지 → 신규 추가' }))
    expect(apply).toBeEnabled()
    await user.click(apply)

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('transfer.applyVcrm', 't1', [
        { incomingId: 'x1', action: 'merge', targetId: 'a' },
        { incomingId: 'x2', action: 'merge', targetId: 'b' },
        { incomingId: 'x3', action: 'new' }
      ])
    )
    expect(await screen.findByText('신규 1명, 합침 2명, 건너뜀 0명')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument()
  })

  it('파일 열기를 취소하면 아무 창도 뜨지 않는다', async () => {
    const user = userEvent.setup()
    mockApi({ 'transfer.openVcrm': () => null })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '파일 열기' }))
    await waitFor(() => expect(screen.queryByText(/보낸 파일/)).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/renderer/TransferImport.test.tsx`
Expected: FAIL — `Failed to resolve import "@renderer/components/transfer/ImportPreviewModal"`.

- [ ] **Step 3: 구현**

`src/renderer/src/components/transfer/ImportPreviewModal.tsx`

```tsx
import { useState } from 'react'
import { Alert, Badge, Button, Group, Modal, ScrollArea, Select, Stack, Table, Text } from '@mantine/core'
import type { HintCustomer } from '@shared/domain/merge'
import { formatPhone } from '@shared/domain/phone'
import type { ImportDecision, ImportPreview, ImportResult } from '@shared/transferTypes'
import { useApiMutation, useCustomers } from '../../api/hooks'

/** 처리 방법 값: 'new' | 'skip' | 'merge:<고객 id>' */
type Choice = string | null

export function toDecision(incomingId: string, choice: string): ImportDecision {
  if (choice === 'new') return { incomingId, action: 'new' }
  if (choice === 'skip') return { incomingId, action: 'skip' }
  return { incomingId, action: 'merge', targetId: choice.slice('merge:'.length) }
}

const who = (h: HintCustomer): string => [h.name, h.phone ? formatPhone(h.phone) : null].filter(Boolean).join(' · ')

/** .vcrm 가져오기 미리보기: 고객마다 신규 추가 / 합치기 / 건너뛰기를 직접 고른다 (설계 5.8) */
export function ImportPreviewModal({ preview, onClose }: { preview: ImportPreview; onClose: () => void }): React.JSX.Element {
  const customers = useCustomers()
  const apply = useApiMutation('transfer.applyVcrm')
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(preview.rows.map((r) => [r.incomingId, null]))
  )
  const [result, setResult] = useState<ImportResult | null>(null)
  const set = (id: string, choice: Choice): void => setChoices((c) => ({ ...c, [id]: choice }))

  const options = [
    { value: 'new', label: '신규 추가' },
    { value: 'skip', label: '건너뛰기' },
    ...(customers.data ?? []).map((c) => ({
      value: `merge:${c.id}`,
      label: `합치기 → ${[c.name, c.phone ? formatPhone(c.phone) : null].filter(Boolean).join(' · ')}`
    }))
  ]
  const pending = preview.rows.filter((r) => !choices[r.incomingId]).length
  const withSame = preview.rows.filter((r) => r.same.length > 0)

  const mergeAllSame = (): void =>
    setChoices((c) => ({ ...c, ...Object.fromEntries(withSame.map((r) => [r.incomingId, `merge:${r.same[0].id}`])) }))
  const restAsNew = (): void =>
    setChoices((c) => Object.fromEntries(Object.entries(c).map(([id, v]) => [id, v ?? 'new'])))

  const submit = async (): Promise<void> => {
    const decisions = preview.rows.map((r) => toDecision(r.incomingId, choices[r.incomingId] as string))
    try {
      setResult(await apply.mutateAsync([preview.token, decisions]))
    } catch {
      return
    }
  }

  if (result) {
    return (
      <Modal opened onClose={onClose} title={<Text fw={700}>가져오기 완료</Text>}>
        <Stack>
          <Text>
            신규 {result.added}명, 합침 {result.merged}명, 건너뜀 {result.skipped}명
          </Text>
          <Group justify="flex-end">
            <Button onClick={onClose}>닫기</Button>
          </Group>
        </Stack>
      </Modal>
    )
  }

  return (
    <Modal
      opened
      onClose={onClose}
      size="80rem"
      title={
        <Text fw={700}>
          {preview.sourceBranch}에서 보낸 파일 · 고객 {preview.rows.length}명
        </Text>
      }
    >
      <Stack gap="sm">
        <Group gap="xs">
          <Text size="sm" fw={600}>
            한 번에 지정:
          </Text>
          <Button size="compact-sm" variant="light" disabled={withSame.length === 0} onClick={mergeAllSame}>
            🔗 같은 고객 힌트가 있는 고객({withSame.length}) → 그 고객에 합치기
          </Button>
          <Button size="compact-sm" variant="light" disabled={pending === 0} onClick={restAsNew}>
            선택 안 된 나머지 → 신규 추가
          </Button>
        </Group>
        <ScrollArea.Autosize mah={480}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w="26%">가져올 고객</Table.Th>
                <Table.Th w="38%">이 PC 에서 찾은 비슷한 고객</Table.Th>
                <Table.Th>처리 방법</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {preview.rows.map((r) => (
                <Table.Tr key={r.incomingId}>
                  <Table.Td>
                    <Text fw={600}>
                      {r.name}
                      {r.phone ? ` ${formatPhone(r.phone)}` : ''}
                    </Text>
                    <Text size="xs" c="dimmed">
                      회차 기록 {r.lessonCount}건 · 목표 {r.goalCount}개 · 수강권 {r.passCount}건
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      {r.same.map((h) => (
                        <Group key={h.id} gap={6}>
                          <Badge variant="light" color="blue">
                            🔗 같은 고객
                          </Badge>
                          <Text size="sm">{who(h)}</Text>
                        </Group>
                      ))}
                      {r.similar.map((h) => (
                        <Group key={h.id} gap={6}>
                          <Badge variant="light" color="orange">
                            이름·연락처 같음
                          </Badge>
                          <Text size="sm">{who(h)}</Text>
                          <Button size="compact-xs" variant="subtle" onClick={() => set(r.incomingId, `merge:${h.id}`)}>
                            이 고객에 합치기
                          </Button>
                        </Group>
                      ))}
                      {r.same.length === 0 && r.similar.length === 0 && (
                        <Text size="sm" c="dimmed">
                          비슷한 고객 없음
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      aria-label={`${r.name} 처리 방법`}
                      placeholder="선택하세요"
                      searchable
                      data={options}
                      value={choices[r.incomingId]}
                      onChange={(v) => set(r.incomingId, v)}
                      error={choices[r.incomingId] ? undefined : true}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        {pending > 0 && (
          <Alert color="orange" variant="light" p="xs">
            아직 처리 방법을 고르지 않은 고객이 {pending}명 있습니다.
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            취소
          </Button>
          <Button disabled={pending > 0} loading={apply.isPending} onClick={() => void submit()}>
            적용하기
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
```

`src/renderer/src/pages/TransferPage.tsx` — 아래 전체 내용으로 교체

```tsx
import { useState } from 'react'
import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import type { CustomerSummary } from '@shared/types'
import type { ImportPreview } from '@shared/transferTypes'
import { useApiMutation } from '../api/hooks'
import { CustomerPickerModal } from '../components/transfer/CustomerPickerModal'
import { ExportVcrmModal } from '../components/transfer/ExportVcrmModal'
import { ImportPreviewModal } from '../components/transfer/ImportPreviewModal'
import { notifySuccess } from '../lib/notify'

function TransferCard(props: {
  icon: string
  tag: string
  tagColor: string
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Card withBorder padding="md">
      <Stack gap={6} h="100%">
        <Text fz={24}>{props.icon}</Text>
        <Badge variant="light" color={props.tagColor} w="fit-content">
          {props.tag}
        </Badge>
        <Text fw={700}>{props.title}</Text>
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>
          {props.description}
        </Text>
        <Group gap="xs">{props.children}</Group>
      </Stack>
    </Card>
  )
}

export function TransferPage(): React.JSX.Element {
  const [picker, setPicker] = useState<'vcrm' | 'excel' | null>(null)
  const [exportTarget, setExportTarget] = useState<CustomerSummary[] | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const exportExcel = useApiMutation('excel.exportCustomers')
  const openVcrm = useApiMutation('transfer.openVcrm')

  const openImport = async (): Promise<void> => {
    try {
      const preview = await openVcrm.mutateAsync([])
      if (preview) setImportPreview(preview)
    } catch {
      return
    }
  }

  const saveExcel = async (customers: CustomerSummary[]): Promise<void> => {
    setPicker(null)
    let result: { saved: boolean }
    try {
      result = await exportExcel.mutateAsync([customers.map((c) => c.id)])
    } catch {
      return
    }
    if (result.saved) notifySuccess(`${customers.length}명을 엑셀로 저장했습니다.`)
  }

  return (
    <Stack gap="md">
      <Title order={2}>가져오기 · 내보내기</Title>
      <SimpleGrid cols={4} spacing="md">
        <TransferCard
          icon="📤"
          tag="지점 이동용"
          tagColor="blue"
          title="고객 내보내기"
          description="고른 고객의 정보·공통메모·목표·회차 기록·수강권을 .vcrm 파일로 저장합니다."
        >
          <Button onClick={() => setPicker('vcrm')}>고객 선택</Button>
        </TransferCard>
        <TransferCard
          icon="📥"
          tag="지점 이동용"
          tagColor="blue"
          title="고객 가져오기"
          description="다른 지점에서 받은 .vcrm 파일을 열어 고객마다 신규 추가 / 합치기 / 건너뛰기를 고릅니다."
        >
          <Button onClick={() => void openImport()} loading={openVcrm.isPending}>
            파일 열기
          </Button>
        </TransferCard>
        <TransferCard
          icon="📊"
          tag="엑셀"
          tagColor="teal"
          title="엑셀로 내보내기"
          description="보관·인쇄용입니다. 시트: 고객 목록 / 회차 기록 / 수강권. 다시 가져올 수는 없습니다."
        >
          <Button variant="light" onClick={() => setPicker('excel')} loading={exportExcel.isPending}>
            엑셀 저장
          </Button>
        </TransferCard>
      </SimpleGrid>

      {picker === 'vcrm' && (
        <CustomerPickerModal
          title="내보낼 고객 선택"
          confirmLabel="다음"
          onClose={() => setPicker(null)}
          onConfirm={(customers) => {
            setPicker(null)
            setExportTarget(customers)
          }}
        />
      )}
      {picker === 'excel' && (
        <CustomerPickerModal
          title="엑셀로 내보낼 고객 선택"
          confirmLabel="엑셀로 저장"
          onClose={() => setPicker(null)}
          onConfirm={(customers) => void saveExcel(customers)}
        />
      )}
      {exportTarget && <ExportVcrmModal customers={exportTarget} onClose={() => setExportTarget(null)} />}
      {importPreview && <ImportPreviewModal preview={importPreview} onClose={() => setImportPreview(null)} />}
    </Stack>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  37 passed`, `Tests  143 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "feat: .vcrm 가져오기 미리보기 창 (고객마다 처리 방법 선택)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 엑셀 명단 등록 창

**Files:**
- Create: `src/renderer/src/components/transfer/RosterImportModal.tsx`
- Modify: `src/renderer/src/pages/TransferPage.tsx` ("엑셀 명단 등록" 카드 추가 — 전체 내용으로 교체)
- Test: `tests/renderer/TransferRoster.test.tsx`

**Interfaces:**
- Produces: `RosterImportModal({ preview, onClose })` — 제목 `엑셀 명단 등록 · N행`; 행마다 추가 체크박스(aria-label `<행>행 추가`, 이름 없는 행은 비활성, 나머지는 기본 체크), 행 번호·이름·연락처·목적, 확인할 점(오류 빨강 / 경고 주황 / `이미 있는 고객과 이름·연락처가 같습니다: <이름>` 파랑), 버튼 `N명 등록`. 카드 버튼은 `양식 받기`, `명단 열기`.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/renderer/TransferRoster.test.tsx`

```tsx
import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RosterPreview } from '@shared/transferTypes'
import { TransferPage } from '@renderer/pages/TransferPage'
import { mockApi, renderWithProviders } from './render'

const input = (name: string) => ({
  name,
  phone: '01012345678',
  birthDate: null,
  gender: null,
  purpose: 'exam' as const,
  registeredAt: '2026-09-28',
  vocalRange: null,
  preferredMusic: null,
  pinnedNote: ''
})

const preview: RosterPreview = {
  token: 'r1',
  rows: [
    { rowNumber: 2, input: input('김민지'), errors: [], warnings: [], similar: [{ id: 'a', name: '김민지', phone: null, status: 'active' }] },
    { rowNumber: 3, input: null, errors: ['이름이 없습니다.'], warnings: [], similar: [] },
    { rowNumber: 4, input: input('한지우'), errors: [], warnings: ['성별은 여/남으로 입력해 주세요. 비웠습니다.'], similar: [] }
  ]
}

describe('엑셀 명단 등록', () => {
  it('양식 받기는 저장을 요청한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'excel.saveRosterTemplate': () => ({ saved: true }) })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '양식 받기' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('excel.saveRosterTemplate'))
  })

  it('이름 없는 행은 고를 수 없고, 경고·힌트를 보여주며, 고른 행만 등록한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'excel.openRoster': () => preview, 'excel.applyRoster': () => ({ added: 1 }) })
    renderWithProviders(<TransferPage />)
    await user.click(screen.getByRole('button', { name: '명단 열기' }))

    expect(await screen.findByText('엑셀 명단 등록 · 3행')).toBeInTheDocument()
    expect(screen.getByLabelText('3행 추가')).toBeDisabled()
    expect(screen.getByText('이름이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('성별은 여/남으로 입력해 주세요. 비웠습니다.')).toBeInTheDocument()
    expect(screen.getByText('이미 있는 고객과 이름·연락처가 같습니다: 김민지')).toBeInTheDocument()

    await user.click(screen.getByLabelText('2행 추가'))
    await user.click(screen.getByRole('button', { name: '1명 등록' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('excel.applyRoster', 'r1', [4]))
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/renderer/TransferRoster.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "양식 받기"`.

- [ ] **Step 3: 구현**

`src/renderer/src/components/transfer/RosterImportModal.tsx`

```tsx
import { useState } from 'react'
import { Button, Checkbox, Group, Modal, ScrollArea, Stack, Table, Text } from '@mantine/core'
import { PURPOSE_LABEL } from '@shared/domain/labels'
import { formatPhone } from '@shared/domain/phone'
import type { RosterPreview } from '@shared/transferTypes'
import { useApiMutation } from '../../api/hooks'
import { notifySuccess } from '../../lib/notify'

/** 엑셀 명단 미리보기: 행마다 추가(기본) / 건너뛰기. 이름 없는 행은 추가할 수 없다 */
export function RosterImportModal({ preview, onClose }: { preview: RosterPreview; onClose: () => void }): React.JSX.Element {
  const apply = useApiMutation('excel.applyRoster')
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(preview.rows.filter((r) => r.input !== null).map((r) => r.rowNumber))
  )
  const toggle = (row: number): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(row)) next.delete(row)
      else next.add(row)
      return next
    })

  const submit = async (): Promise<void> => {
    let result: { added: number }
    try {
      result = await apply.mutateAsync([preview.token, [...selected].sort((a, b) => a - b)])
    } catch {
      return
    }
    notifySuccess(`${result.added}명을 등록했습니다.`)
    onClose()
  }

  return (
    <Modal opened onClose={onClose} size="70rem" title={<Text fw={700}>엑셀 명단 등록 · {preview.rows.length}행</Text>}>
      <Stack gap="sm">
        {preview.rows.length === 0 ? (
          <Text c="dimmed">등록할 행이 없습니다. 양식의 2번째 줄부터 입력했는지 확인해 주세요.</Text>
        ) : (
          <ScrollArea.Autosize mah={480}>
            <Table verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={60}>추가</Table.Th>
                  <Table.Th w={50}>행</Table.Th>
                  <Table.Th>이름</Table.Th>
                  <Table.Th>연락처</Table.Th>
                  <Table.Th>목적</Table.Th>
                  <Table.Th>확인할 점</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {preview.rows.map((r) => (
                  <Table.Tr key={r.rowNumber}>
                    <Table.Td>
                      <Checkbox
                        aria-label={`${r.rowNumber}행 추가`}
                        disabled={r.input === null}
                        checked={selected.has(r.rowNumber)}
                        onChange={() => toggle(r.rowNumber)}
                      />
                    </Table.Td>
                    <Table.Td>{r.rowNumber}</Table.Td>
                    <Table.Td fw={600}>{r.input?.name ?? '–'}</Table.Td>
                    <Table.Td>{r.input?.phone ? formatPhone(r.input.phone) : '–'}</Table.Td>
                    <Table.Td>{r.input?.purpose ? PURPOSE_LABEL[r.input.purpose] : '–'}</Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        {r.errors.map((e) => (
                          <Text key={e} size="xs" c="red">
                            {e}
                          </Text>
                        ))}
                        {r.warnings.map((w) => (
                          <Text key={w} size="xs" c="orange">
                            {w}
                          </Text>
                        ))}
                        {r.similar.length > 0 && (
                          <Text size="xs" c="blue">
                            이미 있는 고객과 이름·연락처가 같습니다: {r.similar.map((h) => h.name).join(', ')}
                          </Text>
                        )}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            취소
          </Button>
          <Button disabled={selected.size === 0} loading={apply.isPending} onClick={() => void submit()}>
            {selected.size}명 등록
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
```

`src/renderer/src/pages/TransferPage.tsx` — 아래 전체 내용으로 교체

```tsx
import { useState } from 'react'
import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import type { CustomerSummary } from '@shared/types'
import type { ImportPreview, RosterPreview } from '@shared/transferTypes'
import { useApiMutation } from '../api/hooks'
import { CustomerPickerModal } from '../components/transfer/CustomerPickerModal'
import { ExportVcrmModal } from '../components/transfer/ExportVcrmModal'
import { ImportPreviewModal } from '../components/transfer/ImportPreviewModal'
import { RosterImportModal } from '../components/transfer/RosterImportModal'
import { notifySuccess } from '../lib/notify'

function TransferCard(props: {
  icon: string
  tag: string
  tagColor: string
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Card withBorder padding="md">
      <Stack gap={6} h="100%">
        <Text fz={24}>{props.icon}</Text>
        <Badge variant="light" color={props.tagColor} w="fit-content">
          {props.tag}
        </Badge>
        <Text fw={700}>{props.title}</Text>
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>
          {props.description}
        </Text>
        <Group gap="xs">{props.children}</Group>
      </Stack>
    </Card>
  )
}

export function TransferPage(): React.JSX.Element {
  const [picker, setPicker] = useState<'vcrm' | 'excel' | null>(null)
  const [exportTarget, setExportTarget] = useState<CustomerSummary[] | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const exportExcel = useApiMutation('excel.exportCustomers')
  const openVcrm = useApiMutation('transfer.openVcrm')
  const [rosterPreview, setRosterPreview] = useState<RosterPreview | null>(null)
  const saveTemplate = useApiMutation('excel.saveRosterTemplate')
  const openRoster = useApiMutation('excel.openRoster')

  const downloadTemplate = async (): Promise<void> => {
    try {
      const result = await saveTemplate.mutateAsync([])
      if (result.saved) notifySuccess('명단 양식을 저장했습니다.')
    } catch {
      return
    }
  }

  const openRosterFile = async (): Promise<void> => {
    try {
      const preview = await openRoster.mutateAsync([])
      if (preview) setRosterPreview(preview)
    } catch {
      return
    }
  }

  const openImport = async (): Promise<void> => {
    try {
      const preview = await openVcrm.mutateAsync([])
      if (preview) setImportPreview(preview)
    } catch {
      return
    }
  }

  const saveExcel = async (customers: CustomerSummary[]): Promise<void> => {
    setPicker(null)
    let result: { saved: boolean }
    try {
      result = await exportExcel.mutateAsync([customers.map((c) => c.id)])
    } catch {
      return
    }
    if (result.saved) notifySuccess(`${customers.length}명을 엑셀로 저장했습니다.`)
  }

  return (
    <Stack gap="md">
      <Title order={2}>가져오기 · 내보내기</Title>
      <SimpleGrid cols={4} spacing="md">
        <TransferCard
          icon="📤"
          tag="지점 이동용"
          tagColor="blue"
          title="고객 내보내기"
          description="고른 고객의 정보·공통메모·목표·회차 기록·수강권을 .vcrm 파일로 저장합니다."
        >
          <Button onClick={() => setPicker('vcrm')}>고객 선택</Button>
        </TransferCard>
        <TransferCard
          icon="📥"
          tag="지점 이동용"
          tagColor="blue"
          title="고객 가져오기"
          description="다른 지점에서 받은 .vcrm 파일을 열어 고객마다 신규 추가 / 합치기 / 건너뛰기를 고릅니다."
        >
          <Button onClick={() => void openImport()} loading={openVcrm.isPending}>
            파일 열기
          </Button>
        </TransferCard>
        <TransferCard
          icon="📊"
          tag="엑셀"
          tagColor="teal"
          title="엑셀로 내보내기"
          description="보관·인쇄용입니다. 시트: 고객 목록 / 회차 기록 / 수강권. 다시 가져올 수는 없습니다."
        >
          <Button variant="light" onClick={() => setPicker('excel')} loading={exportExcel.isPending}>
            엑셀 저장
          </Button>
        </TransferCard>
        <TransferCard
          icon="🗂️"
          tag="엑셀"
          tagColor="teal"
          title="엑셀 명단 등록"
          description="처음 시작할 때 기존 명단(이름·연락처 등)을 양식에 채워 한 번에 새 고객으로 등록합니다."
        >
          <Button variant="light" onClick={() => void downloadTemplate()} loading={saveTemplate.isPending}>
            양식 받기
          </Button>
          <Button variant="light" onClick={() => void openRosterFile()} loading={openRoster.isPending}>
            명단 열기
          </Button>
        </TransferCard>
      </SimpleGrid>

      {picker === 'vcrm' && (
        <CustomerPickerModal
          title="내보낼 고객 선택"
          confirmLabel="다음"
          onClose={() => setPicker(null)}
          onConfirm={(customers) => {
            setPicker(null)
            setExportTarget(customers)
          }}
        />
      )}
      {picker === 'excel' && (
        <CustomerPickerModal
          title="엑셀로 내보낼 고객 선택"
          confirmLabel="엑셀로 저장"
          onClose={() => setPicker(null)}
          onConfirm={(customers) => void saveExcel(customers)}
        />
      )}
      {exportTarget && <ExportVcrmModal customers={exportTarget} onClose={() => setExportTarget(null)} />}
      {importPreview && <ImportPreviewModal preview={importPreview} onClose={() => setImportPreview(null)} />}
      {rosterPreview && <RosterImportModal preview={rosterPreview} onClose={() => setRosterPreview(null)} />}
    </Stack>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  38 passed`, `Tests  145 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "feat: 엑셀 명단 등록 창" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 전체 확인

**Files:** 없음 (확인만. 문제가 나오면 해당 Task 의 파일을 고치고 그 Task 의 테스트부터 다시 돌린다)

- [ ] **Step 1: 자동 검사**

Run: `npm test && npm run build`
Expected: `Test Files  38 passed`, `Tests  145 passed`; typecheck 오류 없음; `✓ built in …` 3번.

- [ ] **Step 2: 실제 앱 흐름 확인** (`npm run dev`, 개발 데이터는 `~/Library/Application Support/VOCAL_CRM-dev`)

1. 메뉴에 "가져오기·내보내기" 가 보이고 카드 4개가 있다.
2. 고객 2명 등록 → `고객 선택` → 맨 위 체크박스로 전체 선택 → `다음` → 보낼 지점 `홍대점`, 타지점 이동 체크 → 파일 이름 `고객2명_<지점>_<오늘>.vcrm` → `파일로 저장` → 저장 창에서 '문서' 폴더에 저장 → 알림 "2명을 내보냈습니다. 2명을 타지점 이동으로 바꿨습니다." → 홈 수강중 목록에서 빠짐.
3. `파일 열기` → 방금 파일 → "…에서 보낸 파일 · 고객 2명", 두 행 모두 🔗 같은 고객 → `적용하기` 비활성 → `🔗 같은 고객 힌트가 있는 고객(2) → 그 고객에 합치기` → `적용하기` → "신규 0명, 합침 2명, 건너뜀 0명" → 두 고객이 다시 수강중, 타임라인에 "…에서 이동해 옴".
4. `엑셀 저장` → 고객 선택 → 저장한 .xlsx 를 엑셀/Numbers 로 열면 시트 3개.
5. `양식 받기` → 저장한 양식의 명단 시트에 3줄 입력(정상 1, 이름 없음 1, 성별 "여자" 1) → `명단 열기` → 이름 없는 행은 체크 불가·빨간 오류, "여자" 행은 주황 경고 → `2명 등록` → 홈에 추가됨.
6. 저장·열기 창에서 `취소` 하면 아무것도 바뀌지 않는다.

- [ ] **Step 3: 개발 데이터 정리**

Run: `rm -rf "$HOME/Library/Application Support/VOCAL_CRM-dev"`

- [ ] **Step 4: 마무리 커밋** (고친 것이 있을 때만)

```bash
git add -A
git commit -m "fix: 계획 2 전체 확인에서 발견한 문제 수정" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
