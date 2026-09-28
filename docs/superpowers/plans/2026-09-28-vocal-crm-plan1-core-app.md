# VOCAL_CRM 계획 1: 핵심 앱 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계 문서(`docs/superpowers/specs/2026-09-28-vocal-crm-design.md`)의 핵심 기능 — 첫 실행 지점 설정, 홈(오늘 수업·예약 없는 수강생·전체 고객 표), 고객 상세(공통 정보·공통메모·목표·수강권·회차 기록), 메모 중심 수업 기록, 10분 단위 예약(겹침 경고), 주간 일정, 상태 변경(휴강·종료·타지점 이동·재등록), 기본 설정 — 을 Mac 에서 `npm run dev` 로 쓸 수 있는 Electron 앱으로 만든다.

**Architecture:** Electron Main 프로세스가 better-sqlite3 로 `vocal_crm.db` 를 다루고, 채널 이름 기반 IPC(`window.api.invoke('customers.detail', id)`)로 화면에 데이터를 준다. 계산 규칙(회차, 남은 수강권, 예약 겹침, 홈 집계, 목록 필터·정렬)은 `src/shared/domain` 의 순수 함수로 두어 Electron 없이 테스트한다. 화면은 React + Mantine 9 + TanStack Query 이며, 수업 기록·예약·고객·수강권·상태 변경 창은 한 곳(`AppModalsProvider`)에서 관리해 어느 화면에서든 연다.

**Tech Stack:** Electron 44, electron-vite 5 (Vite 7), React 19, TypeScript 5.9, Mantine 9 (core·dates·modals·notifications), TanStack Query 5, React Router 7 (HashRouter), better-sqlite3 13, dayjs, Pretendard, Vitest 5 + Testing Library + jsdom 27.

**이 계획의 범위:** 3단계 중 1단계. 계획 2(.vcrm 지점 이동·엑셀)와 계획 3(자동·외부 백업과 복원, 외부 백업 알림, 데이터 폴더 열기, DB 무결성 검사, 앱 종료 시 작성 중 확인, 로그 파일, E2E, Windows exe 빌드)은 이 계획의 코드가 생긴 뒤 작성한다. 이 계획에서 오류는 `console.error` 로만 남긴다.

## Global Constraints

- 모든 명령은 저장소 루트 `/Users/jeongbaul/Dev/SIDE_PROJECT/VOCAL_CRM` 에서 실행한다.
- Node.js **22.12 이상** (개발 PC: v22.14 확인). `package.json` 의 `engines` 에 기록한다.
- 패키지 버전은 Task 1 의 `package.json` 그대로 쓴다. 특히 **vite 7**(electron-vite 5 가 vite 8 을 지원하지 않음), **@vitejs/plugin-react 5**, **TypeScript ~5.9**, **react-router 7**, **jsdom 27**(jsdom 30 은 Node 22.22 이상 필요). 임의로 올리지 않는다.
- better-sqlite3 13 은 모든 OS 용 N-API 바이너리를 패키지에 포함한다. **Electron 용 재빌드(electron-rebuild, install-app-deps)를 하지 않는다.** DB 테스트도 일반 Node 에서 그대로 돈다.
- Electron 44 는 첫 `npm run dev` 때 실행 파일을 내려받는다(설치 시 postinstall 없음).
- 화면 문구·오류 메시지는 모두 **한국어**. 사용자에게 보이는 오류는 `AppError(code, message)` 의 message 를 그대로 쓴다.
- 날짜 `YYYY-MM-DD`(로컬 기준), 시각 `HH:mm`(**10분 단위**), 생성·수정 시각은 ISO 8601(`Date#toISOString`). 모든 id 는 `crypto.randomUUID()`.
- Electron 보안: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. 화면은 `window.api.invoke` 로만 Main 을 부른다(preload 가 허용 채널만 통과).
- 데이터 위치: 배포판 `%APPDATA%\VOCAL_CRM\vocal_crm.db`(`productName: "VOCAL_CRM"`), 개발 중(`app.isPackaged === false`)에는 `…/VOCAL_CRM-dev/`.
- `useEffect` 콜백은 **항상 중괄호 블록**으로 쓴다. Electron 44 의 Chromium 에서 `window.scrollTo()` 가 Promise 를 돌려주므로 `useEffect(() => window.scrollTo(0, 0))` 처럼 값을 반환하면 React 가 정리 함수로 착각해 화면이 통째로 사라진다.
- 커밋 메시지는 한국어 한 줄 요약 + 마지막 줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (각 Task 의 커밋 명령에 포함).

## 설계 문서와 달라진 점 (구현 시 결정)

| 설계 문서 | 이 계획 | 이유 |
|---|---|---|
| `main/db/repositories/`, `main/services/` | `main/db/`(연결·마이그레이션) + `main/store/`(테이블·기능별 모듈) | 기능 단위로 파일을 나누면 각 Task 가 새 파일만 만든다. 계획 2 에서 `main/services/transfer.ts` 를 추가한다 |
| `window.api.<도메인>.<동작>()` | `window.api.invoke('<도메인>.<동작>', ...)` + 화면 쪽 타입 래퍼 `call()` | 채널 목록 하나(`src/shared/api.ts`)로 preload 허용 목록·Main 처리 함수·타입을 모두 맞춘다 |
| 종료 시 "앞으로 잡힌 예약" 취소 | 종료·타지점 이동 시 **열린(scheduled) 예약 전부** 취소 (지난 미기록 포함) | 종료한 고객의 지난 미기록 예약이 홈에 계속 경고로 남지 않게 |
| 수업일 변경 "✎" | 수업 기록 창 제목 줄 오른쪽의 작은 날짜 선택 | 같은 동작, 한 번 덜 클릭 |
| better-sqlite3 는 Windows 빌드 서버 필요, DB 테스트는 `ELECTRON_RUN_AS_NODE` | 둘 다 불필요 (13 버전이 N-API 바이너리 포함) | 계획 3 의 빌드도 단순해진다 |
| 메뉴: 홈/일정/가져오기·내보내기/설정·백업 | 이 계획은 홈/일정/설정 | 가져오기·내보내기는 계획 2, 백업은 계획 3 에서 메뉴와 함께 추가 |

## 파일 구조

```
package.json · electron.vite.config.ts · vitest.config.ts · tsconfig(.node|.web).json
src/
  shared/                       Main·화면이 함께 쓰는 코드 (Node/DOM 의존 없음)
    types.ts                    도메인 타입, 입력 타입, 화면용 조회 타입
    result.ts                   Result<T>, AppError, toErrorPayload
    api.ts                      IPC 계약 ApiSpec + CHANNELS
    domain/
      dates.ts                  날짜 계산·한국어 날짜 표기
      phone.ts                  연락처 숫자화·하이픈 표기
      lessons.ts                회차 번호, 타임라인, 지난 과제
      passes.ts                 남은 수강권
      schedule.ts               10분 단위 시각, 예약 겹침
      labels.ts                 상태·목적·성별 표기, 이력 문구, 조사(으로/로)
      home.ts                   홈 화면 집계(오늘 수업·미기록·예약 없음·요약)
      customerList.ts           고객 표 필터·정렬
  main/
    index.ts                    창 생성, 단일 실행, DB 열기, IPC 등록
    db/connection.ts            DB 열기 + foreign_keys + 마이그레이션
    db/migrations.ts            스키마 v1 (PRAGMA user_version)
    store/util.ts               id·시각·검증 도우미
    store/columns.ts            SELECT 컬럼 목록(camelCase 별칭)
    store/settings.ts           지점 이름·수업 길이
    store/customers.ts          고객 등록·수정·공통메모·삭제, 상태 이력 기록
    store/goals.ts              목표 체크리스트
    store/passes.ts             수강권 구매 기록
    store/reservations.ts       예약 저장·취소
    store/lessons.ts            수업 기록 저장(예약 연결·목표 완료)·삭제
    store/status.ts             상태 변경(휴강·종료·이동·재등록)
    store/queries.ts            화면용 조회(홈, 고객 요약, 고객 상세, 기간 예약)
    ipc/handlers.ts             채널 → store 함수
    ipc/invoke.ts               처리 함수 호출 + Result 로 감싸기
    ipc/register.ts             ipcMain.handle 등록
  preload/index.ts · index.d.ts window.api.invoke 노출 + 타입
  renderer/
    index.html
    src/main.tsx · App.tsx · theme.ts · env.d.ts
    src/api/client.ts · hooks.ts              IPC 호출, TanStack Query 훅
    src/lib/today.ts · notify.ts · confirm.tsx 오늘 날짜, 알림, 확인 창
    src/layout/AppLayout.tsx                  왼쪽 메뉴 + 본문
    src/modals/                               AppModals(열기 관리), CustomerForm, Reservation, Lesson, Pass, StatusChange
    src/components/PinnedDot.tsx
    src/components/home/                      StatsRow, TodayPanel, UnbookedPanel, CustomerTable
    src/components/customer/                  Section, InfoSection, PinnedNoteSection, GoalsSection, PassesSection, Timeline
    src/pages/                                Onboarding, Home, CustomerDetail, Schedule, Settings
tests/
  support/factories.ts · db.ts                테스트 데이터·메모리 DB
  unit/*.test.ts                              shared/domain
  db/*.test.ts                                store·ipc (메모리 SQLite)
  renderer/setup.ts · render.tsx · *.test.tsx 화면 (jsdom)
```

---

### Task 1: 프로젝트 뼈대 + 날짜·연락처 도메인

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `src/main/index.ts`(창만 띄우는 버전, Task 8 에서 교체), `src/preload/index.ts`(빈 버전, Task 8 에서 교체)
- Create: `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`(임시, Task 9 에서 교체), `src/renderer/src/theme.ts`, `src/renderer/src/env.d.ts`
- Create: `src/shared/domain/dates.ts`, `src/shared/domain/phone.ts`
- Test: `tests/unit/dates.test.ts`, `tests/unit/phone.test.ts`, `tests/renderer/setup.ts`

**Interfaces:**
- Produces: `toDateString(d: Date): string`, `addDays(date, days)`, `daysBetween(from, to): number`(to−from), `startOfWeek(date)`(월요일), `weekdayLabel`, `formatMonthDay`("10/6 (화)"), `formatFullDate`("2026-10-02 (금)"), `formatKoreanDate`("9월 28일 (월)"), `relativeDays(date, today)`, `ageOn(birthDate, today)`; `normalizePhone(input): string | null`, `formatPhone(value): string`.
- 경로 별칭: `@shared/*` → `src/shared/*`, `@main/*` → `src/main/*`(테스트 전용), `@renderer/*` → `src/renderer/src/*`.
- Vitest 프로젝트 2개: `node`(`tests/unit`, `tests/db`), `renderer`(jsdom, `tests/renderer`, setup 파일 사용).

- [ ] **Step 1: 설정 파일 작성**

`package.json`

```json
{
  "name": "vocal-crm",
  "productName": "VOCAL_CRM",
  "version": "0.1.0",
  "description": "보컬 트레이너용 고객·수업 관리 프로그램",
  "private": true,
  "main": "./out/main/index.js",
  "engines": {
    "node": ">=22.12"
  },
  "scripts": {
    "dev": "electron-vite dev",
    "build": "npm run typecheck && electron-vite build",
    "start": "electron-vite preview",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json --composite false",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^13.0.3"
  },
  "devDependencies": {
    "@electron-toolkit/tsconfig": "^2.0.0",
    "@mantine/core": "^9.6.3",
    "@mantine/dates": "^9.6.3",
    "@mantine/hooks": "^9.6.3",
    "@mantine/modals": "^9.6.3",
    "@mantine/notifications": "^9.6.3",
    "@tabler/icons-react": "^3.48.0",
    "@tanstack/react-query": "^5.104.0",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.3",
    "@testing-library/user-event": "^14.6.1",
    "@types/better-sqlite3": "^9.6.0",
    "@types/node": "^24.9.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^5.2.0",
    "dayjs": "^1.11.23",
    "electron": "^44.4.5",
    "electron-vite": "^5.0.0",
    "jsdom": "^27.4.0",
    "pretendard": "^1.3.9",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-router": "^7.18.4",
    "typescript": "~5.9.3",
    "vite": "^7.3.6",
    "vitest": "^5.0.2"
  }
}
```

`electron.vite.config.ts`

```ts
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias }
  },
  preload: {
    resolve: { alias: sharedAlias }
  },
  renderer: {
    resolve: {
      alias: { ...sharedAlias, '@renderer': resolve('src/renderer/src') }
    },
    plugins: [react()]
  }
})
```

`vitest.config.ts`

```ts
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

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
          include: ['tests/unit/**/*.test.ts', 'tests/db/**/*.test.ts']
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

`tsconfig.json`

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```

`tsconfig.node.json`

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
    "tests/db/**/*"
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

`tsconfig.web.json`

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": [
    "src/renderer/src/**/*",
    "src/shared/**/*",
    "src/preload/index.d.ts",
    "tests/renderer/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "paths": {
      "@renderer/*": ["./src/renderer/src/*"],
      "@shared/*": ["./src/shared/*"]
    }
  }
}
```

- [ ] **Step 2: 의존성 설치**

Run: `npm install`
Expected: `added … packages`. `EBADENGINE` 경고가 나와도 오류(`npm error`)가 없으면 된다.

- [ ] **Step 3: 실패하는 테스트 작성**

`tests/unit/dates.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  addDays,
  ageOn,
  daysBetween,
  formatFullDate,
  formatKoreanDate,
  formatMonthDay,
  relativeDays,
  startOfWeek,
  toDateString
} from '@shared/domain/dates'

describe('dates', () => {
  it('toDateString은 로컬 날짜를 YYYY-MM-DD로 만든다', () => {
    expect(toDateString(new Date(2026, 8, 28, 23, 59))).toBe('2026-09-28')
  })

  it('addDays와 daysBetween', () => {
    expect(addDays('2026-09-28', 8)).toBe('2026-10-06')
    expect(daysBetween('2026-09-12', '2026-09-28')).toBe(16)
  })

  it('startOfWeek는 월요일을 돌려준다 (일요일은 앞 주)', () => {
    expect(startOfWeek('2026-09-28')).toBe('2026-09-28')
    expect(startOfWeek('2026-10-02')).toBe('2026-09-28')
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28')
  })

  it('한국어 날짜 표기', () => {
    expect(formatMonthDay('2026-10-06')).toBe('10/6 (화)')
    expect(formatFullDate('2026-10-02')).toBe('2026-10-02 (금)')
    expect(formatKoreanDate('2026-09-28')).toBe('9월 28일 (월)')
  })

  it('relativeDays', () => {
    const today = '2026-09-28'
    expect(relativeDays('2026-09-28', today)).toBe('오늘')
    expect(relativeDays('2026-09-27', today)).toBe('어제')
    expect(relativeDays('2026-09-12', today)).toBe('16일 전')
    expect(relativeDays('2026-09-29', today)).toBe('내일')
    expect(relativeDays('2026-10-02', today)).toBe('4일 후')
  })

  it('ageOn은 만 나이', () => {
    expect(ageOn('2003-05-12', '2026-09-28')).toBe(23)
    expect(ageOn('2003-10-12', '2026-09-28')).toBe(22)
  })
})
```

`tests/unit/phone.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone } from '@shared/domain/phone'

describe('phone', () => {
  it('normalizePhone은 숫자만 남기고 비면 null', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678')
    expect(normalizePhone('  ')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })

  it.each([
    ['01012345678', '010-1234-5678'],
    ['0101234567', '010-123-4567'],
    ['0311234567', '031-123-4567'],
    ['0212345678', '02-1234-5678'],
    ['021234567', '02-123-4567'],
    ['0101', '010-1'],
    ['010', '010'],
    ['', '']
  ])('formatPhone(%s) = %s', (input, expected) => {
    expect(formatPhone(input)).toBe(expected)
  })
})
```

`tests/renderer/setup.ts`

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => cleanup())

// Mantine 이 쓰는 브라우저 API 를 jsdom 에 채워 넣는다
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
window.HTMLElement.prototype.scrollIntoView = vi.fn()
Object.defineProperty(document, 'fonts', {
  value: { addEventListener: vi.fn(), removeEventListener: vi.fn(), ready: Promise.resolve() }
})
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/unit`
Expected: FAIL — `Failed to resolve import "@shared/domain/dates"` / `"@shared/domain/phone"`.

- [ ] **Step 5: 도메인 구현**

`src/shared/domain/dates.ts`

```ts
import dayjs from 'dayjs'

export const DATE_FORMAT = 'YYYY-MM-DD'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 로컬 시간 기준 YYYY-MM-DD */
export function toDateString(d: Date): string {
  return dayjs(d).format(DATE_FORMAT)
}

export function addDays(date: string, days: number): string {
  return dayjs(date).add(days, 'day').format(DATE_FORMAT)
}

/** to - from (일). from이 과거면 양수 */
export function daysBetween(from: string, to: string): number {
  return dayjs(to).diff(dayjs(from), 'day')
}

/** 그 주의 월요일 */
export function startOfWeek(date: string): string {
  const d = dayjs(date)
  const dow = d.day()
  const diff = dow === 0 ? -6 : 1 - dow
  return d.add(diff, 'day').format(DATE_FORMAT)
}

export function weekdayLabel(date: string): string {
  return WEEKDAYS[dayjs(date).day()]
}

/** "10/6 (화)" */
export function formatMonthDay(date: string): string {
  const d = dayjs(date)
  return `${d.month() + 1}/${d.date()} (${weekdayLabel(date)})`
}

/** "2026-10-02 (금)" */
export function formatFullDate(date: string): string {
  return `${date} (${weekdayLabel(date)})`
}

/** "9월 28일 (월)" */
export function formatKoreanDate(date: string): string {
  const d = dayjs(date)
  return `${d.month() + 1}월 ${d.date()}일 (${weekdayLabel(date)})`
}

/** 오늘 / 어제 / N일 전 / 내일 / N일 후 */
export function relativeDays(date: string, today: string): string {
  const n = daysBetween(date, today)
  if (n === 0) return '오늘'
  if (n === 1) return '어제'
  if (n > 1) return `${n}일 전`
  if (n === -1) return '내일'
  return `${-n}일 후`
}

/** 만 나이 */
export function ageOn(birthDate: string, today: string): number {
  return dayjs(today).diff(dayjs(birthDate), 'year')
}
```

`src/shared/domain/phone.ts`

```ts
/** 숫자만 남긴다. 비어 있으면 null */
export function normalizePhone(input: string | null | undefined): string | null {
  const digits = (input ?? '').replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

/** 입력 중인 값에도 쓸 수 있게 자릿수에 따라 하이픈을 넣는다 */
export function formatPhone(value: string | null | undefined): string {
  const d = (value ?? '').replace(/\D/g, '').slice(0, 11)
  if (d.startsWith('02')) {
    if (d.length <= 2) return d
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`
  }
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run tests/unit`
Expected: PASS — `Test Files  2 passed`, `Tests  15 passed`.

- [ ] **Step 7: 앱 뼈대 작성**

`src/main/index.ts`

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

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
    createWindow()
  })

  app.on('window-all-closed', () => app.quit())
}
```

`src/preload/index.ts`

```ts
// Task 8 에서 IPC 연결(window.api)로 교체한다
export {}
```

`src/renderer/index.html`

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>VOCAL CRM</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/main.tsx`

```tsx
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/notifications/styles.css'
import 'pretendard/dist/web/variable/pretendardvariable.css'
import 'dayjs/locale/ko'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

`src/renderer/src/theme.ts`

```ts
import { createTheme } from '@mantine/core'

export const theme = createTheme({
  fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Malgun Gothic', sans-serif",
  headings: { fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Malgun Gothic', sans-serif" },
  primaryColor: 'blue',
  defaultRadius: 'md'
})
```

`src/renderer/src/env.d.ts`

```ts
/// <reference types="vite/client" />
```

`src/renderer/src/App.tsx`

```tsx
import { MantineProvider, Stack, Text, Title } from '@mantine/core'
import { theme } from './theme'

export function App(): React.JSX.Element {
  return (
    <MantineProvider theme={theme}>
      <Stack p="xl">
        <Title order={2}>🎤 VOCAL CRM</Title>
        <Text c="dimmed">프로젝트 뼈대가 준비되었습니다.</Text>
      </Stack>
    </MantineProvider>
  )
}
```

- [ ] **Step 8: 타입 검사·빌드·실행 확인**

Run: `npm run typecheck && npx electron-vite build`
Expected: 오류 없이 `✓ built in …` 3번(main, preload, renderer).

Run: `npm run dev` (처음 한 번은 `Downloading Electron binary...` 후 실행)
Expected: 창에 "🎤 VOCAL CRM / 프로젝트 뼈대가 준비되었습니다." 가 Pretendard 글꼴로 보인다. 확인 후 창을 닫는다.

- [ ] **Step 9: 커밋**

```bash
git add package.json package-lock.json electron.vite.config.ts vitest.config.ts tsconfig.json tsconfig.node.json tsconfig.web.json src tests
git commit -m "feat: 프로젝트 뼈대와 날짜·연락처 도메인" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 공통 타입과 회차·수강권·예약·표기 규칙

**Files:**
- Create: `src/shared/types.ts`, `src/shared/result.ts`
- Create: `src/shared/domain/lessons.ts`, `passes.ts`, `schedule.ts`, `labels.ts`
- Test: `tests/support/factories.ts`, `tests/unit/lessons.test.ts`, `passes.test.ts`, `schedule.test.ts`, `labels.test.ts`

**Interfaces:**
- Consumes: 없음 (dayjs 는 dates.ts 만 사용)
- Produces:
  - 타입: `Customer`, `Goal`, `Lesson`, `Pass`, `Reservation`, `StatusLog`, `Settings`, 입력 `CustomerInput`·`LessonInput`(`completedGoalIds: string[]`)·`ReservationInput`·`PassInput`·`StatusChangeInput`, 조회 `CustomerSummary`·`ReservationWithCustomer`(`lessonNumber: number | null`)·`HomeData`·`NumberedLesson`·`TimelineEntry`(kind `'lesson' | 'status'` 구분 합집합)·`CustomerDetail`.
  - `AppError(code, message)`, `Result<T>`, `toErrorPayload(err)`, `UNKNOWN_ERROR_MESSAGE`.
  - `numberLessons(lessons)`(오름차순 + `number`), `buildTimeline(lessons, logs)`(최신순, 같은 날짜는 createdAt 늦은 것이 위), `previousHomework(lessonsAscending, beforeNumber?)`.
  - `remainingPasses({ records, total, deducted }): number | null`, `isPassExhausted`, `formatRemaining`.
  - `timeToMinutes`, `minutesToTime`, `buildTimeOptions(start='07:00', end='23:50')`(10분 단위 102개), `isValidTime`, `findConflicts(target, others, lessonMinutes)`.
  - `STATUS_LABEL`, `PURPOSE_LABEL`, `GENDER_LABEL`, `END_REASONS`, `statusLogText(log)`, `withEuro(word)`.
  - 테스트 도우미 `makeCustomer`, `makeLesson`, `makeReservation`, `makeStatusLog`.

- [ ] **Step 1: 공통 타입 작성** (테스트가 import 하므로 먼저 만든다)

`src/shared/types.ts`

```ts
export type CustomerStatus = 'active' | 'paused' | 'ended' | 'moved'
export type Purpose = 'hobby' | 'exam' | 'audition' | 'pro' | 'other'
export type Gender = 'F' | 'M'
export type ReservationStatus = 'scheduled' | 'done' | 'canceled'

export interface Customer {
  id: string
  name: string
  phone: string | null
  birthDate: string | null
  gender: Gender | null
  purpose: Purpose | null
  status: CustomerStatus
  registeredAt: string
  vocalRange: string | null
  preferredMusic: string | null
  pinnedNote: string
  pauseUntil: string | null
  createdAt: string
  updatedAt: string
}

export interface Goal {
  id: string
  customerId: string
  title: string
  doneAt: string | null
  completedLessonId: string | null
  createdAt: string
  updatedAt: string
}

export interface Lesson {
  id: string
  customerId: string
  lessonDate: string
  memo: string
  practice: string | null
  homework: string | null
  deductPass: boolean
  reservationId: string | null
  createdAt: string
  updatedAt: string
}

export interface Pass {
  id: string
  customerId: string
  count: number
  purchasedAt: string
  amount: number | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface Reservation {
  id: string
  customerId: string
  date: string
  time: string
  status: ReservationStatus
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface StatusLog {
  id: string
  customerId: string
  date: string
  fromStatus: CustomerStatus | null
  toStatus: CustomerStatus
  reason: string | null
  createdAt: string
}

export interface Settings {
  branchName: string | null
  lessonMinutes: number
}

/** 고객 등록·수정 창에서 보내는 값 */
export interface CustomerInput {
  name: string
  phone: string | null
  birthDate: string | null
  gender: Gender | null
  purpose: Purpose | null
  registeredAt: string
  vocalRange: string | null
  preferredMusic: string | null
  pinnedNote: string
}

/** 수업 기록 창에서 보내는 값. id가 있으면 수정 */
export interface LessonInput {
  id?: string
  customerId: string
  lessonDate: string
  memo: string
  practice: string | null
  homework: string | null
  deductPass: boolean
  reservationId: string | null
  completedGoalIds: string[]
}

/** 예약 창에서 보내는 값. id가 있으면 수정 */
export interface ReservationInput {
  id?: string
  customerId: string
  date: string
  time: string
  note: string | null
}

export interface PassInput {
  id?: string
  customerId: string
  count: number
  purchasedAt: string
  amount: number | null
  note: string | null
}

export interface StatusChangeInput {
  customerId: string
  toStatus: CustomerStatus
  date: string
  reason: string | null
  pauseUntil: string | null
}

/** 홈 표와 고객 선택에 쓰는 고객 요약 */
export interface CustomerSummary {
  id: string
  name: string
  phone: string | null
  purpose: Purpose | null
  status: CustomerStatus
  pinnedNote: string
  goalsDone: number
  goalsTotal: number
  lessonCount: number
  lastLessonDate: string | null
  nextReservation: { date: string; time: string } | null
  remainingPasses: number | null
}

export interface ReservationWithCustomer {
  reservation: Reservation
  customerName: string
  hasPinnedNote: boolean
  /** 아직 기록 안 된 예약이면 이번에 기록될 회차, 기록 완료·취소면 null */
  lessonNumber: number | null
  remainingPasses: number | null
}

export interface HomeData {
  today: string
  stats: { active: number; today: number; unbooked: number; passExhausted: number }
  todayReservations: ReservationWithCustomer[]
  missedReservations: ReservationWithCustomer[]
  unbooked: { id: string; name: string; lastLessonDate: string | null }[]
  customers: CustomerSummary[]
}

export interface NumberedLesson extends Lesson {
  number: number
}

export type TimelineEntry =
  | { kind: 'lesson'; date: string; createdAt: string; lesson: NumberedLesson }
  | { kind: 'status'; date: string; createdAt: string; statusLog: StatusLog }

export interface CustomerDetail {
  customer: Customer
  goals: Goal[]
  lessons: NumberedLesson[]
  timeline: TimelineEntry[]
  passes: Pass[]
  totalPassCount: number
  remainingPasses: number | null
  nextReservation: Reservation | null
}
```

`src/shared/result.ts`

```ts
export interface ErrorPayload {
  code: string
  message: string
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorPayload }

/** 사용자에게 그대로 보여줄 수 있는 한국어 메시지를 가진 오류 */
export class AppError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export const UNKNOWN_ERROR_MESSAGE = '처리 중 오류가 발생했습니다. 다시 시도해 주세요.'

export function toErrorPayload(err: unknown): ErrorPayload {
  if (err instanceof AppError) return { code: err.code, message: err.message }
  return { code: 'UNKNOWN', message: UNKNOWN_ERROR_MESSAGE }
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/support/factories.ts`

```ts
import type { Customer, Lesson, Reservation, StatusLog } from '@shared/types'

const TS = '2026-09-01T00:00:00.000Z'

export function makeCustomer(over: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: '김민지',
    phone: '01012345678',
    birthDate: null,
    gender: null,
    purpose: null,
    status: 'active',
    registeredAt: '2026-03-02',
    vocalRange: null,
    preferredMusic: null,
    pinnedNote: '',
    pauseUntil: null,
    createdAt: TS,
    updatedAt: TS,
    ...over
  }
}

export function makeLesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    customerId: 'c1',
    lessonDate: '2026-09-28',
    memo: '',
    practice: null,
    homework: null,
    deductPass: true,
    reservationId: null,
    createdAt: TS,
    updatedAt: TS,
    ...over
  }
}

export function makeReservation(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    customerId: 'c1',
    date: '2026-09-28',
    time: '15:00',
    status: 'scheduled',
    note: null,
    createdAt: TS,
    updatedAt: TS,
    ...over
  }
}

export function makeStatusLog(over: Partial<StatusLog> = {}): StatusLog {
  return {
    id: 's1',
    customerId: 'c1',
    date: '2026-03-02',
    fromStatus: null,
    toStatus: 'active',
    reason: null,
    createdAt: TS,
    ...over
  }
}
```

`tests/unit/lessons.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { buildTimeline, numberLessons, previousHomework } from '@shared/domain/lessons'
import { makeLesson, makeStatusLog } from '../support/factories'

describe('numberLessons', () => {
  it('수업일 순으로, 같은 날이면 생성 순으로 회차를 매긴다', () => {
    const lessons = [
      makeLesson({ id: 'b', lessonDate: '2026-09-21' }),
      makeLesson({ id: 'c', lessonDate: '2026-09-28', createdAt: '2026-09-28T10:00:00.000Z' }),
      makeLesson({ id: 'a', lessonDate: '2026-09-14' }),
      makeLesson({ id: 'd', lessonDate: '2026-09-28', createdAt: '2026-09-28T09:00:00.000Z' })
    ]
    expect(numberLessons(lessons).map((l) => [l.id, l.number])).toEqual([
      ['a', 1],
      ['b', 2],
      ['d', 3],
      ['c', 4]
    ])
  })

  it('지난 수업을 끼워 넣으면 뒤 회차가 밀린다', () => {
    const before = numberLessons([
      makeLesson({ id: 'x', lessonDate: '2026-09-10' }),
      makeLesson({ id: 'y', lessonDate: '2026-09-20' })
    ])
    expect(before.find((l) => l.id === 'y')?.number).toBe(2)
    const after = numberLessons([...before, makeLesson({ id: 'z', lessonDate: '2026-09-15' })])
    expect(after.find((l) => l.id === 'y')?.number).toBe(3)
  })
})

describe('buildTimeline', () => {
  it('최신순, 같은 날짜면 나중에 만든 것이 위', () => {
    const lessons = numberLessons([
      makeLesson({ id: 'l1', lessonDate: '2026-03-02', createdAt: '2026-03-02T10:00:00.000Z' }),
      makeLesson({ id: 'l2', lessonDate: '2026-09-28', createdAt: '2026-09-28T10:00:00.000Z' })
    ])
    const logs = [
      makeStatusLog({ id: 'start', date: '2026-03-02', createdAt: '2026-03-02T09:00:00.000Z' }),
      makeStatusLog({
        id: 'end',
        date: '2026-09-28',
        fromStatus: 'active',
        toStatus: 'ended',
        createdAt: '2026-09-28T11:00:00.000Z'
      })
    ]
    const ids = buildTimeline(lessons, logs).map((e) =>
      e.kind === 'lesson' ? e.lesson.id : e.statusLog.id
    )
    expect(ids).toEqual(['end', 'l2', 'l1', 'start'])
  })
})

describe('previousHomework', () => {
  it('직전 회차 과제, 비어 있으면 null', () => {
    const lessons = numberLessons([
      makeLesson({ id: 'a', lessonDate: '2026-09-14', homework: '립트릴 5분' }),
      makeLesson({ id: 'b', lessonDate: '2026-09-21', homework: '  ' })
    ])
    expect(previousHomework(lessons)).toBeNull()
    expect(previousHomework(lessons, 2)).toBe('립트릴 5분')
    expect(previousHomework([])).toBeNull()
  })
})
```

`tests/unit/passes.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { formatRemaining, isPassExhausted, remainingPasses } from '@shared/domain/passes'

describe('passes', () => {
  it('구매 기록이 없으면 null', () => {
    expect(remainingPasses({ records: 0, total: 0, deducted: 3 })).toBeNull()
  })

  it('총 횟수 - 차감 수업 수, 음수 가능', () => {
    expect(remainingPasses({ records: 2, total: 20, deducted: 14 })).toBe(6)
    expect(remainingPasses({ records: 1, total: 4, deducted: 5 })).toBe(-1)
  })

  it('소진 판단과 표시', () => {
    expect(isPassExhausted(null)).toBe(false)
    expect(isPassExhausted(0)).toBe(true)
    expect(isPassExhausted(-1)).toBe(true)
    expect(isPassExhausted(2)).toBe(false)
    expect(formatRemaining(null)).toBe('–')
    expect(formatRemaining(-2)).toBe('-2회')
  })
})
```

`tests/unit/schedule.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { buildTimeOptions, findConflicts, isValidTime } from '@shared/domain/schedule'
import { makeReservation } from '../support/factories'

describe('schedule', () => {
  it('10분 단위 시각 목록', () => {
    const options = buildTimeOptions('14:30', '15:10')
    expect(options).toEqual(['14:30', '14:40', '14:50', '15:00', '15:10'])
    expect(buildTimeOptions()).toHaveLength(102)
  })

  it('isValidTime은 10분 단위만 허용', () => {
    expect(isValidTime('15:00')).toBe(true)
    expect(isValidTime('09:50')).toBe(true)
    expect(isValidTime('15:05')).toBe(false)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('9:00')).toBe(false)
  })

  it('수업 길이보다 가까우면 겹침, 취소·자기 자신·다른 날은 제외', () => {
    const others = [
      makeReservation({ id: 'a', time: '15:00' }),
      makeReservation({ id: 'b', time: '16:00' }),
      makeReservation({ id: 'c', time: '15:30', status: 'canceled' }),
      makeReservation({ id: 'd', time: '15:10', date: '2026-09-29' }),
      makeReservation({ id: 'self', time: '15:20' })
    ]
    const hits = findConflicts({ id: 'self', date: '2026-09-28', time: '15:20' }, others, 60)
    expect(hits.map((r) => r.id)).toEqual(['a', 'b'])
    expect(findConflicts({ date: '2026-09-28', time: '14:00' }, others, 60)).toEqual([])
  })
})
```

`tests/unit/labels.test.ts`

```ts
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
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/unit/lessons.test.ts tests/unit/passes.test.ts tests/unit/schedule.test.ts tests/unit/labels.test.ts`
Expected: FAIL — `Failed to resolve import "@shared/domain/lessons"` 등.

- [ ] **Step 4: 규칙 구현**

`src/shared/domain/lessons.ts`

```ts
import type { NumberedLesson, StatusLog, TimelineEntry } from '../types'

/** 수업일 → 생성 시각 순으로 정렬해 1부터 회차를 매긴다 (오름차순으로 돌려준다) */
export function numberLessons<T extends { lessonDate: string; createdAt: string }>(
  lessons: T[]
): (T & { number: number })[] {
  const sorted = [...lessons].sort(
    (a, b) => a.lessonDate.localeCompare(b.lessonDate) || a.createdAt.localeCompare(b.createdAt)
  )
  return sorted.map((lesson, i) => ({ ...lesson, number: i + 1 }))
}

/** 회차 기록과 상태 이력을 최신순으로 섞는다. 같은 날짜면 나중에 만든 것이 위 */
export function buildTimeline(lessons: NumberedLesson[], logs: StatusLog[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...lessons.map(
      (lesson): TimelineEntry => ({
        kind: 'lesson',
        date: lesson.lessonDate,
        createdAt: lesson.createdAt,
        lesson
      })
    ),
    ...logs.map(
      (statusLog): TimelineEntry => ({
        kind: 'status',
        date: statusLog.date,
        createdAt: statusLog.createdAt,
        statusLog
      })
    )
  ]
  return entries.sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  )
}

/** 직전 회차의 과제 (비어 있으면 null) */
export function previousHomework(lessonsAscending: NumberedLesson[], beforeNumber?: number): string | null {
  const candidates =
    beforeNumber === undefined
      ? lessonsAscending
      : lessonsAscending.filter((l) => l.number < beforeNumber)
  const last = candidates[candidates.length - 1]
  const homework = last?.homework?.trim()
  return homework ? homework : null
}
```

`src/shared/domain/passes.ts`

```ts
export interface PassTotals {
  /** 수강권 구매 기록 수 */
  records: number
  /** 구매한 총 횟수 */
  total: number
  /** 수강권을 차감한 수업 수 */
  deducted: number
}

/** 남은 수강권. 구매 기록이 없으면 null (표시: "–") */
export function remainingPasses({ records, total, deducted }: PassTotals): number | null {
  if (records === 0) return null
  return total - deducted
}

export function isPassExhausted(remaining: number | null): boolean {
  return remaining !== null && remaining <= 0
}

/** "6회", "-1회", "–" */
export function formatRemaining(remaining: number | null): string {
  return remaining === null ? '–' : `${remaining}회`
}
```

`src/shared/domain/schedule.ts`

```ts
import type { ReservationStatus } from '../types'

export const TIME_STEP_MINUTES = 10

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 10분 단위 시각 목록 (기본 07:00 ~ 23:50) */
export function buildTimeOptions(start = '07:00', end = '23:50'): string[] {
  const options: string[] = []
  for (let t = timeToMinutes(start); t <= timeToMinutes(end); t += TIME_STEP_MINUTES) {
    options.push(minutesToTime(t))
  }
  return options
}

/** HH:mm 이고 10분 단위인지 */
export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]0$/.test(time)
}

interface SlotLike {
  id: string
  date: string
  time: string
  status: ReservationStatus
}

/**
 * 같은 날짜에서 시작 시각 차이가 수업 길이보다 작으면 겹침.
 * 취소된 예약과 자기 자신(target.id)은 제외한다.
 */
export function findConflicts<T extends SlotLike>(
  target: { id?: string; date: string; time: string },
  others: T[],
  lessonMinutes: number
): T[] {
  const start = timeToMinutes(target.time)
  return others.filter(
    (o) =>
      o.id !== target.id &&
      o.status !== 'canceled' &&
      o.date === target.date &&
      Math.abs(timeToMinutes(o.time) - start) < lessonMinutes
  )
}
```

`src/shared/domain/labels.ts`

```ts
import type { CustomerStatus, Gender, Purpose, StatusLog } from '../types'

export const STATUS_LABEL: Record<CustomerStatus, string> = {
  active: '수강중',
  paused: '휴강',
  ended: '종료',
  moved: '타지점 이동'
}

export const PURPOSE_LABEL: Record<Purpose, string> = {
  hobby: '취미',
  exam: '입시',
  audition: '오디션',
  pro: '직업',
  other: '기타'
}

export const GENDER_LABEL: Record<Gender, string> = { F: '여', M: '남' }

export const END_REASONS = ['목표 달성', '개인 사정', '이사', '기타'] as const

/** 타임라인 구분선 문구. 예: "수강 종료 (이사)", "수강 시작", "재등록" */
export function statusLogText(log: Pick<StatusLog, 'fromStatus' | 'toStatus' | 'reason'>): string {
  const reason = log.reason?.trim() || null
  if (log.toStatus === 'active') {
    if (reason) return reason
    return log.fromStatus === null ? '수강 시작' : '재등록'
  }
  const base = log.toStatus === 'paused' ? '휴강' : log.toStatus === 'ended' ? '수강 종료' : '타지점 이동'
  return reason ? `${base} (${reason})` : base
}

/** 받침 유무에 따라 "으로"/"로". 예: 홍대점 → "홍대점으로", 서울 → "서울로" */
export function withEuro(word: string): string {
  const last = word.trim().charCodeAt(word.trim().length - 1)
  const isHangul = last >= 0xac00 && last <= 0xd7a3
  if (!isHangul) return `${word}(으)로`
  const jong = (last - 0xac00) % 28
  return jong === 0 || jong === 8 ? `${word}로` : `${word}으로`
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/unit`
Expected: PASS — `Test Files  6 passed`, `Tests  36 passed`.

- [ ] **Step 6: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 7: 커밋**

```bash
git add src/shared tests
git commit -m "feat: 공통 타입과 회차·수강권·예약 겹침·표기 규칙" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 홈 집계와 고객 표 필터·정렬

**Files:**
- Create: `src/shared/domain/home.ts`, `src/shared/domain/customerList.ts`
- Modify: `tests/support/factories.ts` (`makeAggregate` 추가 — 아래 전체 내용으로 교체)
- Test: `tests/unit/home.test.ts`, `tests/unit/customerList.test.ts`

**Interfaces:**
- Consumes: Task 2 의 타입, `remainingPasses`, `isPassExhausted`.
- Produces:
  - `CustomerAggregate` = `{ customer, goalsDone, goalsTotal, lessonCount, lastLessonDate, deducted, passRecords, passTotal }` (DB 집계 결과, Task 7 이 채운다)
  - `nextReservationsByCustomer(reservations, today): Map<customerId, Reservation>`, `remainingOf(a)`, `toSummary(a, next?)`, `withCustomer(r, a): ReservationWithCustomer`, `buildHome({ today, aggregates, reservations }): HomeData`
  - `StatusFilter = 'active' | 'paused' | 'closed' | 'all'`, `SortKey`, `SortDir`, `filterCustomers(list, filter, query)`, `sortCustomers(list, key, dir)` (값 없는 항목은 항상 맨 뒤)

규칙(설계 4장): 오늘 수업 = 오늘 날짜·취소 제외·시간순, 미기록이면 `lessonNumber = lessonCount + 1`. 지난 미기록 = scheduled 이면서 날짜 < 오늘. 예약 없는 수강생 = 수강중이면서 오늘(포함) 이후 scheduled 예약 없음, 수업 기록 없는 사람 먼저 그다음 마지막 수업 오래된 순. 수강권 소진 = 수강중이면서 남은 수강권이 null 이 아니고 0 이하.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/support/factories.ts`

```ts
import type { Customer, Lesson, Reservation, StatusLog } from '@shared/types'
import type { CustomerAggregate } from '@shared/domain/home'

const TS = '2026-09-01T00:00:00.000Z'

export function makeCustomer(over: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: '김민지',
    phone: '01012345678',
    birthDate: null,
    gender: null,
    purpose: null,
    status: 'active',
    registeredAt: '2026-03-02',
    vocalRange: null,
    preferredMusic: null,
    pinnedNote: '',
    pauseUntil: null,
    createdAt: TS,
    updatedAt: TS,
    ...over
  }
}

export function makeLesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    customerId: 'c1',
    lessonDate: '2026-09-28',
    memo: '',
    practice: null,
    homework: null,
    deductPass: true,
    reservationId: null,
    createdAt: TS,
    updatedAt: TS,
    ...over
  }
}

export function makeReservation(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    customerId: 'c1',
    date: '2026-09-28',
    time: '15:00',
    status: 'scheduled',
    note: null,
    createdAt: TS,
    updatedAt: TS,
    ...over
  }
}

export function makeStatusLog(over: Partial<StatusLog> = {}): StatusLog {
  return {
    id: 's1',
    customerId: 'c1',
    date: '2026-03-02',
    fromStatus: null,
    toStatus: 'active',
    reason: null,
    createdAt: TS,
    ...over
  }
}

export function makeAggregate(over: Partial<CustomerAggregate> & { customer?: Customer } = {}): CustomerAggregate {
  return {
    customer: makeCustomer(),
    goalsDone: 0,
    goalsTotal: 0,
    lessonCount: 0,
    lastLessonDate: null,
    deducted: 0,
    passRecords: 0,
    passTotal: 0,
    ...over
  }
}
```

`tests/unit/home.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { buildHome, nextReservationsByCustomer } from '@shared/domain/home'
import { makeAggregate, makeCustomer, makeReservation } from '../support/factories'

const today = '2026-09-28'

describe('nextReservationsByCustomer', () => {
  it('오늘 포함 이후의 가장 이른 scheduled 예약', () => {
    const map = nextReservationsByCustomer(
      [
        makeReservation({ id: 'past', date: '2026-09-27' }),
        makeReservation({ id: 'later', date: '2026-10-02', time: '13:00' }),
        makeReservation({ id: 'soon', date: '2026-09-28', time: '18:00' }),
        makeReservation({ id: 'done', date: '2026-09-28', time: '09:00', status: 'done' })
      ],
      today
    )
    expect(map.get('c1')?.id).toBe('soon')
  })
})

describe('buildHome', () => {
  const minji = makeAggregate({
    customer: makeCustomer({ id: 'minji', name: '김민지', pinnedNote: '성대결절 이력' }),
    lessonCount: 11,
    lastLessonDate: '2026-09-21',
    passRecords: 2,
    passTotal: 20,
    deducted: 14
  })
  const seojun = makeAggregate({
    customer: makeCustomer({ id: 'seojun', name: '박서준' }),
    lessonCount: 5,
    lastLessonDate: '2026-09-25',
    passRecords: 1,
    passTotal: 4,
    deducted: 5
  })
  const doyun = makeAggregate({
    customer: makeCustomer({ id: 'doyun', name: '최도윤' }),
    lastLessonDate: '2026-09-12'
  })
  const newbie = makeAggregate({ customer: makeCustomer({ id: 'newbie', name: '한지우' }) })
  const paused = makeAggregate({ customer: makeCustomer({ id: 'paused', name: '정유나', status: 'paused' }) })

  const home = buildHome({
    today,
    aggregates: [minji, seojun, doyun, newbie, paused],
    reservations: [
      makeReservation({ id: 'r-minji', customerId: 'minji', time: '13:00', status: 'done' }),
      makeReservation({ id: 'r-seojun', customerId: 'seojun', time: '18:30' }),
      makeReservation({ id: 'r-cancel', customerId: 'doyun', time: '10:00', status: 'canceled' }),
      makeReservation({ id: 'r-missed', customerId: 'doyun', date: '2026-09-26' })
    ]
  })

  it('오늘 수업: 취소 제외, 시간순, 미기록이면 다음 회차', () => {
    expect(home.todayReservations.map((r) => r.reservation.id)).toEqual(['r-minji', 'r-seojun'])
    expect(home.todayReservations[0].lessonNumber).toBeNull()
    expect(home.todayReservations[0].hasPinnedNote).toBe(true)
    expect(home.todayReservations[1].lessonNumber).toBe(6)
    expect(home.todayReservations[1].remainingPasses).toBe(-1)
  })

  it('지난 미기록 예약', () => {
    expect(home.missedReservations.map((r) => r.reservation.id)).toEqual(['r-missed'])
  })

  it('예약 없는 수강생: 수강중만, 수업 기록 없는 사람이 먼저, 그다음 오래된 순', () => {
    expect(home.unbooked.map((u) => u.id)).toEqual(['newbie', 'doyun', 'minji'])
  })

  it('요약 숫자', () => {
    expect(home.stats).toEqual({ active: 4, today: 2, unbooked: 3, passExhausted: 1 })
  })

  it('고객 요약은 이름순, 다음 예약과 남은 수강권 포함', () => {
    expect(home.customers.map((c) => c.name)).toEqual(['김민지', '박서준', '정유나', '최도윤', '한지우'])
    const s = home.customers.find((c) => c.id === 'seojun')
    expect(s?.nextReservation).toEqual({ date: today, time: '18:30' })
    expect(home.customers.find((c) => c.id === 'minji')?.remainingPasses).toBe(6)
    expect(home.customers.find((c) => c.id === 'newbie')?.remainingPasses).toBeNull()
  })
})
```

`tests/unit/customerList.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { CustomerSummary } from '@shared/types'
import { filterCustomers, sortCustomers } from '@shared/domain/customerList'

const summary = (over: Partial<CustomerSummary>): CustomerSummary => ({
  id: over.name ?? 'x',
  name: 'x',
  phone: null,
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
})

const list = [
  summary({ name: '김민지', phone: '01012345678', lastLessonDate: '2026-09-28', remainingPasses: 6 }),
  summary({ name: '박서준', phone: '01055551212', lastLessonDate: '2026-09-25', remainingPasses: -1 }),
  summary({ name: '정유나', status: 'paused', lastLessonDate: '2026-08-28' }),
  summary({ name: '오세린', status: 'moved' }),
  summary({ name: '윤서아', status: 'ended' })
]

describe('filterCustomers', () => {
  it('상태 필터', () => {
    expect(filterCustomers(list, 'active', '').map((c) => c.name)).toEqual(['김민지', '박서준'])
    expect(filterCustomers(list, 'paused', '').map((c) => c.name)).toEqual(['정유나'])
    expect(filterCustomers(list, 'closed', '').map((c) => c.name)).toEqual(['오세린', '윤서아'])
    expect(filterCustomers(list, 'all', '')).toHaveLength(5)
  })

  it('이름 또는 연락처 숫자로 검색', () => {
    expect(filterCustomers(list, 'all', '민지').map((c) => c.name)).toEqual(['김민지'])
    expect(filterCustomers(list, 'all', '5555').map((c) => c.name)).toEqual(['박서준'])
    expect(filterCustomers(list, 'all', '010-1234').map((c) => c.name)).toEqual(['김민지'])
  })
})

describe('sortCustomers', () => {
  it('최근 수업 내림차순, 값 없는 사람은 맨 뒤', () => {
    expect(sortCustomers(list, 'lastLesson', 'desc').map((c) => c.name)).toEqual([
      '김민지',
      '박서준',
      '정유나',
      '오세린',
      '윤서아'
    ])
  })

  it('남은 수강권 오름차순 (부족한 사람 먼저)', () => {
    expect(sortCustomers(list, 'remaining', 'asc').map((c) => c.name).slice(0, 2)).toEqual(['박서준', '김민지'])
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/unit/home.test.ts tests/unit/customerList.test.ts`
Expected: FAIL — `Failed to resolve import "@shared/domain/home"` / `"@shared/domain/customerList"`.

- [ ] **Step 3: 구현**

`src/shared/domain/home.ts`

```ts
import type {
  Customer,
  CustomerSummary,
  HomeData,
  Reservation,
  ReservationWithCustomer
} from '../types'
import { isPassExhausted, remainingPasses } from './passes'

/** DB에서 고객별로 집계해 온 값 */
export interface CustomerAggregate {
  customer: Customer
  goalsDone: number
  goalsTotal: number
  lessonCount: number
  lastLessonDate: string | null
  deducted: number
  passRecords: number
  passTotal: number
}

const byTime = (a: Reservation, b: Reservation): number =>
  a.date.localeCompare(b.date) || a.time.localeCompare(b.time)

/** 고객별로 오늘(포함) 이후 가장 이른 예정(scheduled) 예약 */
export function nextReservationsByCustomer(
  reservations: Reservation[],
  today: string
): Map<string, Reservation> {
  const result = new Map<string, Reservation>()
  const upcoming = reservations
    .filter((r) => r.status === 'scheduled' && r.date >= today)
    .sort(byTime)
  for (const r of upcoming) {
    if (!result.has(r.customerId)) result.set(r.customerId, r)
  }
  return result
}

export function remainingOf(a: CustomerAggregate): number | null {
  return remainingPasses({ records: a.passRecords, total: a.passTotal, deducted: a.deducted })
}

export function toSummary(a: CustomerAggregate, next: Reservation | undefined): CustomerSummary {
  return {
    id: a.customer.id,
    name: a.customer.name,
    phone: a.customer.phone,
    purpose: a.customer.purpose,
    status: a.customer.status,
    pinnedNote: a.customer.pinnedNote,
    goalsDone: a.goalsDone,
    goalsTotal: a.goalsTotal,
    lessonCount: a.lessonCount,
    lastLessonDate: a.lastLessonDate,
    nextReservation: next ? { date: next.date, time: next.time } : null,
    remainingPasses: remainingOf(a)
  }
}

export function withCustomer(r: Reservation, a: CustomerAggregate): ReservationWithCustomer {
  return {
    reservation: r,
    customerName: a.customer.name,
    hasPinnedNote: a.customer.pinnedNote.trim() !== '',
    lessonNumber: r.status === 'scheduled' ? a.lessonCount + 1 : null,
    remainingPasses: remainingOf(a)
  }
}

export function buildHome(input: {
  today: string
  aggregates: CustomerAggregate[]
  reservations: Reservation[]
}): HomeData {
  const { today, aggregates, reservations } = input
  const byId = new Map(aggregates.map((a) => [a.customer.id, a]))
  const next = nextReservationsByCustomer(reservations, today)
  const attach = (list: Reservation[]): ReservationWithCustomer[] =>
    list.flatMap((r) => {
      const a = byId.get(r.customerId)
      return a ? [withCustomer(r, a)] : []
    })

  const todayReservations = attach(
    reservations.filter((r) => r.date === today && r.status !== 'canceled').sort(byTime)
  )
  const missedReservations = attach(
    reservations.filter((r) => r.status === 'scheduled' && r.date < today).sort(byTime)
  )

  const active = aggregates.filter((a) => a.customer.status === 'active')
  const unbooked = active
    .filter((a) => !next.has(a.customer.id))
    .sort((x, y) => {
      if (x.lastLessonDate === y.lastLessonDate) return x.customer.name.localeCompare(y.customer.name, 'ko')
      if (x.lastLessonDate === null) return -1
      if (y.lastLessonDate === null) return 1
      return x.lastLessonDate.localeCompare(y.lastLessonDate)
    })
    .map((a) => ({ id: a.customer.id, name: a.customer.name, lastLessonDate: a.lastLessonDate }))

  const customers = aggregates
    .map((a) => toSummary(a, next.get(a.customer.id)))
    .sort((x, y) => x.name.localeCompare(y.name, 'ko'))

  return {
    today,
    stats: {
      active: active.length,
      today: todayReservations.length,
      unbooked: unbooked.length,
      passExhausted: active.filter((a) => isPassExhausted(remainingOf(a))).length
    },
    todayReservations,
    missedReservations,
    unbooked,
    customers
  }
}
```

`src/shared/domain/customerList.ts`

```ts
import type { CustomerStatus, CustomerSummary } from '../types'

export type StatusFilter = 'active' | 'paused' | 'closed' | 'all'
export type SortKey = 'name' | 'purpose' | 'goals' | 'lastLesson' | 'nextReservation' | 'lessonCount' | 'remaining'
export type SortDir = 'asc' | 'desc'

const FILTER_STATUSES: Record<StatusFilter, CustomerStatus[] | null> = {
  active: ['active'],
  paused: ['paused'],
  closed: ['ended', 'moved'],
  all: null
}

/** 상태 필터 + 이름/연락처 검색 */
export function filterCustomers(list: CustomerSummary[], filter: StatusFilter, query: string): CustomerSummary[] {
  const statuses = FILTER_STATUSES[filter]
  const q = query.trim()
  const digits = q.replace(/\D/g, '')
  return list.filter((c) => {
    if (statuses && !statuses.includes(c.status)) return false
    if (!q) return true
    if (c.name.includes(q)) return true
    return digits.length > 0 && (c.phone ?? '').includes(digits)
  })
}

/** 값이 없는 항목(null)은 방향과 상관없이 항상 맨 뒤 */
export function sortCustomers(list: CustomerSummary[], key: SortKey, dir: SortDir): CustomerSummary[] {
  const value = (c: CustomerSummary): string | number | null => {
    switch (key) {
      case 'name':
        return c.name
      case 'purpose':
        return c.purpose
      case 'goals':
        return c.goalsTotal === 0 ? null : c.goalsDone / c.goalsTotal
      case 'lastLesson':
        return c.lastLessonDate
      case 'nextReservation':
        return c.nextReservation ? `${c.nextReservation.date} ${c.nextReservation.time}` : null
      case 'lessonCount':
        return c.lessonCount
      case 'remaining':
        return c.remainingPasses
    }
  }
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === null && vb === null) return a.name.localeCompare(b.name, 'ko')
    if (va === null) return 1
    if (vb === null) return -1
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ko')
    return cmp === 0 ? a.name.localeCompare(b.name, 'ko') : cmp * sign
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/unit`
Expected: PASS — `Test Files  8 passed`, `Tests  46 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/shared/domain tests
git commit -m "feat: 홈 집계와 고객 표 필터·정렬 규칙" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: DB 연결·스키마 v1·설정 저장

**Files:**
- Create: `src/main/db/connection.ts`, `src/main/db/migrations.ts`
- Create: `src/main/store/util.ts`, `src/main/store/columns.ts`, `src/main/store/settings.ts`
- Test: `tests/support/db.ts`(이 Task 버전), `tests/db/migrations.test.ts`, `tests/db/settings.test.ts`

**Interfaces:**
- Produces:
  - `type DB = Database.Database`, `openDatabase(filename): DB` (foreign_keys ON + 마이그레이션). 테스트는 `':memory:'`.
  - `MIGRATIONS`, `SCHEMA_VERSION`, `migrate(db)` — `PRAGMA user_version` 으로 적용 여부 판단. **배포 후에는 기존 항목을 고치지 말고 뒤에 추가한다.**
  - `newId()`, `iso(date)`, `blankToNull(v)`, `requireDate(v, message)`, `optionalDate(v, message)`, `validation(message)`, `notFound(message)` (모두 `AppError`)
  - `customerColumns(prefix?)`, `GOAL_COLUMNS`, `LESSON_COLUMNS`, `PASS_COLUMNS`, `RESERVATION_COLUMNS`, `STATUS_LOG_COLUMNS` — `snake_case AS camelCase` 별칭이라 SELECT 결과가 바로 도메인 객체가 된다.
  - `getSetting(db, key)`, `setSetting(db, key, value)`, `getSettings(db): Settings`(수업 길이 기본 60), `updateSettings(db, { branchName?, lessonMinutes? })`(지점 이름 필수, 수업 길이 10~240 정수), `DEFAULT_LESSON_MINUTES`
  - 테스트 도우미 `NOW`(2026-09-28T06:00Z), `TODAY`('2026-09-28'), `createTestDb()`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/support/db.ts`

```ts
import { openDatabase, type DB } from '@main/db/connection'

export const NOW = new Date('2026-09-28T06:00:00.000Z')
export const TODAY = '2026-09-28'

export function createTestDb(): DB {
  return openDatabase(':memory:')
}
```

`tests/db/migrations.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { SCHEMA_VERSION } from '@main/db/migrations'

describe('migrations', () => {
  it('빈 DB에 모든 테이블을 만들고 user_version을 올린다', () => {
    const db = openDatabase(':memory:')
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .pluck()
      .all()
    expect(tables).toEqual([
      'customer_aliases',
      'customers',
      'goals',
      'lessons',
      'passes',
      'reservations',
      'settings',
      'status_logs'
    ])
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
  })

  it('외래 키가 켜져 있다', () => {
    const db = openDatabase(':memory:')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})
```

`tests/db/settings.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { getSettings, updateSettings } from '@main/store/settings'
import { createTestDb } from '../support/db'

describe('settings store', () => {
  it('처음에는 지점 이름이 없고 수업 길이는 60분', () => {
    expect(getSettings(createTestDb())).toEqual({ branchName: null, lessonMinutes: 60 })
  })

  it('지점 이름과 수업 길이를 저장한다', () => {
    const db = createTestDb()
    updateSettings(db, { branchName: '  강남점 ' })
    expect(updateSettings(db, { lessonMinutes: 50 })).toEqual({ branchName: '강남점', lessonMinutes: 50 })
  })

  it('빈 지점 이름과 범위 밖 수업 길이는 거부', () => {
    const db = createTestDb()
    expect(() => updateSettings(db, { branchName: ' ' })).toThrow('지점 이름을 입력해 주세요.')
    expect(() => updateSettings(db, { lessonMinutes: 5 })).toThrow('10~240분')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/db`
Expected: FAIL — `Failed to resolve import "@main/db/connection"`.

- [ ] **Step 3: 구현**

`src/main/db/migrations.ts`

```ts
import type { DB } from './connection'

/** 순서대로 적용. 이미 배포된 항목은 절대 수정하지 말고 새 항목을 뒤에 추가한다 */
export const MIGRATIONS: ((db: DB) => void)[] = [
  (db) => {
    db.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        birth_date TEXT,
        gender TEXT CHECK (gender IN ('F', 'M')),
        purpose TEXT CHECK (purpose IN ('hobby', 'exam', 'audition', 'pro', 'other')),
        status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'ended', 'moved')),
        registered_at TEXT NOT NULL,
        vocal_range TEXT,
        preferred_music TEXT,
        pinned_note TEXT NOT NULL DEFAULT '',
        pause_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE reservations (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('scheduled', 'done', 'canceled')),
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_reservations_date ON reservations(date, time);
      CREATE INDEX idx_reservations_customer ON reservations(customer_id, date);

      CREATE TABLE lessons (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        lesson_date TEXT NOT NULL,
        memo TEXT NOT NULL DEFAULT '',
        practice TEXT,
        homework TEXT,
        deduct_pass INTEGER NOT NULL DEFAULT 1,
        reservation_id TEXT REFERENCES reservations(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_lessons_customer ON lessons(customer_id, lesson_date);

      CREATE TABLE goals (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        done_at TEXT,
        completed_lesson_id TEXT REFERENCES lessons(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_goals_customer ON goals(customer_id);

      CREATE TABLE passes (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        count INTEGER NOT NULL CHECK (count > 0),
        purchased_at TEXT NOT NULL,
        amount INTEGER,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_passes_customer ON passes(customer_id);

      CREATE TABLE status_logs (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_status_logs_customer ON status_logs(customer_id);

      CREATE TABLE customer_aliases (
        alias_id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE
      );
    `)
  }
]

export const SCHEMA_VERSION = MIGRATIONS.length

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      MIGRATIONS[version](db)
      db.pragma(`user_version = ${version + 1}`)
    })()
  }
}
```

`src/main/db/connection.ts`

```ts
import Database from 'better-sqlite3'
import { migrate } from './migrations'

export type DB = Database.Database

/** DB 파일을 열고(없으면 만들고) 마이그레이션까지 적용한다. 테스트는 ':memory:' */
export function openDatabase(filename: string): DB {
  const db = new Database(filename)
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}
```

`src/main/store/util.ts`

```ts
import { randomUUID } from 'node:crypto'
import { AppError } from '@shared/result'

export const newId = (): string => randomUUID()

export const iso = (d: Date): string => d.toISOString()

/** 앞뒤 공백을 지우고 비어 있으면 null */
export function blankToNull(value: string | null | undefined): string | null {
  const t = (value ?? '').trim()
  return t ? t : null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function requireDate(value: string | null | undefined, message: string): string {
  if (!value || !DATE_RE.test(value)) throw new AppError('VALIDATION', message)
  return value
}

export function optionalDate(value: string | null | undefined, message: string): string | null {
  if (value === null || value === undefined || value === '') return null
  return requireDate(value, message)
}

export function validation(message: string): AppError {
  return new AppError('VALIDATION', message)
}

export function notFound(message: string): AppError {
  return new AppError('NOT_FOUND', message)
}
```

`src/main/store/columns.ts`

```ts
/** SELECT 결과를 바로 camelCase 객체로 받기 위한 컬럼 목록 */
export const customerColumns = (p = ''): string =>
  [
    `${p}id AS id`,
    `${p}name AS name`,
    `${p}phone AS phone`,
    `${p}birth_date AS birthDate`,
    `${p}gender AS gender`,
    `${p}purpose AS purpose`,
    `${p}status AS status`,
    `${p}registered_at AS registeredAt`,
    `${p}vocal_range AS vocalRange`,
    `${p}preferred_music AS preferredMusic`,
    `${p}pinned_note AS pinnedNote`,
    `${p}pause_until AS pauseUntil`,
    `${p}created_at AS createdAt`,
    `${p}updated_at AS updatedAt`
  ].join(', ')

export const GOAL_COLUMNS =
  'id, customer_id AS customerId, title, done_at AS doneAt, completed_lesson_id AS completedLessonId, created_at AS createdAt, updated_at AS updatedAt'

/** deduct_pass는 0/1 이므로 읽은 뒤 boolean으로 바꾼다 (toLesson) */
export const LESSON_COLUMNS =
  'id, customer_id AS customerId, lesson_date AS lessonDate, memo, practice, homework, deduct_pass AS deductPass, reservation_id AS reservationId, created_at AS createdAt, updated_at AS updatedAt'

export const PASS_COLUMNS =
  'id, customer_id AS customerId, count, purchased_at AS purchasedAt, amount, note, created_at AS createdAt, updated_at AS updatedAt'

export const RESERVATION_COLUMNS =
  'id, customer_id AS customerId, date, time, status, note, created_at AS createdAt, updated_at AS updatedAt'

export const STATUS_LOG_COLUMNS =
  'id, customer_id AS customerId, date, from_status AS fromStatus, to_status AS toStatus, reason, created_at AS createdAt'
```

`src/main/store/settings.ts`

```ts
import type { Settings } from '@shared/types'
import type { DB } from '../db/connection'
import { validation } from './util'

export const DEFAULT_LESSON_MINUTES = 60

export function getSetting(db: DB, key: string): string | null {
  const value = db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(key) as
    | string
    | null
    | undefined
  return value ?? null
}

export function setSetting(db: DB, key: string, value: string | null): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

export function getSettings(db: DB): Settings {
  const minutes = Number(getSetting(db, 'lesson_minutes'))
  return {
    branchName: getSetting(db, 'branch_name'),
    lessonMinutes: Number.isInteger(minutes) && minutes > 0 ? minutes : DEFAULT_LESSON_MINUTES
  }
}

export interface SettingsPatch {
  branchName?: string
  lessonMinutes?: number
}

export function updateSettings(db: DB, patch: SettingsPatch): Settings {
  if (patch.branchName !== undefined) {
    const name = patch.branchName.trim()
    if (!name) throw validation('지점 이름을 입력해 주세요.')
    setSetting(db, 'branch_name', name)
  }
  if (patch.lessonMinutes !== undefined) {
    const m = patch.lessonMinutes
    if (!Number.isInteger(m) || m < 10 || m > 240) {
      throw validation('수업 길이는 10~240분 사이로 입력해 주세요.')
    }
    setSetting(db, 'lesson_minutes', String(m))
  }
  return getSettings(db)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/db`
Expected: PASS — `Test Files  2 passed`, `Tests  5 passed`. (better-sqlite3 가 일반 Node 에서 바로 로드된다. 재빌드하지 않는다.)

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/main tests
git commit -m "feat: SQLite 연결, 스키마 v1, 설정 저장" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 고객·목표·수강권 저장

**Files:**
- Create: `src/main/store/customers.ts`, `src/main/store/goals.ts`, `src/main/store/passes.ts`
- Modify: `tests/support/db.ts` (`customerInput`, `seedCustomer` 추가 — 아래 전체 내용으로 교체)
- Test: `tests/db/customers.test.ts`, `tests/db/goals-passes.test.ts`

**Interfaces:**
- Consumes: Task 4 의 `DB`, util, columns; Task 1 의 `normalizePhone`.
- Produces:
  - `getCustomer(db, id)`, `createCustomer(db, input, now)`(상태 active + 이력 "수강 시작" from NULL, 날짜 = 등록일), `updateCustomer(db, id, input, now)`, `setPinnedNote(db, id, note, now)`, `deleteCustomer(db, id)`(CASCADE), `insertStatusLog(db, log)`, `listStatusLogs(db, customerId)`(date, created_at 순)
  - `listGoals(db, customerId)`(created_at, rowid 순), `getGoal`, `addGoal(db, customerId, title, now)`, `renameGoal(db, id, title, now)`, `setGoalDone(db, id, done, today, now)`(완료일 = 오늘, 수업 연결 해제), `deleteGoal(db, id)`
  - `listPasses(db, customerId)`(결제일 최신순), `savePass(db, input, now)`(id 있으면 수정; 횟수 ≥1 정수, 금액 null 또는 ≥0 정수), `deletePass(db, id)`
  - 테스트 도우미 `customerInput(over)`, `seedCustomer(db, over): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/support/db.ts`

```ts
import type { CustomerInput } from '@shared/types'
import { openDatabase, type DB } from '@main/db/connection'
import { createCustomer } from '@main/store/customers'

export const NOW = new Date('2026-09-28T06:00:00.000Z')
export const TODAY = '2026-09-28'

export function createTestDb(): DB {
  return openDatabase(':memory:')
}

export function customerInput(over: Partial<CustomerInput> = {}): CustomerInput {
  return {
    name: '김민지',
    phone: '010-1234-5678',
    birthDate: null,
    gender: null,
    purpose: null,
    registeredAt: '2026-03-02',
    vocalRange: null,
    preferredMusic: null,
    pinnedNote: '',
    ...over
  }
}

export function seedCustomer(db: DB, over: Partial<CustomerInput> = {}): string {
  return createCustomer(db, customerInput(over), NOW).id
}
```

`tests/db/customers.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listStatusLogs,
  setPinnedNote,
  updateCustomer
} from '@main/store/customers'
import { addGoal } from '@main/store/goals'
import { savePass } from '@main/store/passes'
import { createTestDb, customerInput, NOW, seedCustomer, TODAY } from '../support/db'

describe('customers store', () => {
  it('등록하면 수강중 + "수강 시작" 이력, 연락처는 숫자만 저장', () => {
    const db = createTestDb()
    const c = createCustomer(db, customerInput({ name: ' 김민지 ', vocalRange: ' ' }), NOW)
    expect(c).toMatchObject({ name: '김민지', phone: '01012345678', status: 'active', vocalRange: null })
    expect(getCustomer(db, c.id)).toEqual(c)
    expect(listStatusLogs(db, c.id)).toMatchObject([{ fromStatus: null, toStatus: 'active', date: '2026-03-02' }])
  })

  it('이름이 없거나 날짜 형식이 틀리면 거부', () => {
    const db = createTestDb()
    expect(() => createCustomer(db, customerInput({ name: '  ' }), NOW)).toThrow('이름을 입력해 주세요.')
    expect(() => createCustomer(db, customerInput({ birthDate: '2003.05.12' }), NOW)).toThrow('생년월일')
  })

  it('정보 수정과 공통메모 저장', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    updateCustomer(db, id, customerInput({ name: '김민지', purpose: 'exam', vocalRange: 'F3 ~ C5' }), NOW)
    setPinnedNote(db, id, ' 성대결절 이력 \n', NOW)
    expect(getCustomer(db, id)).toMatchObject({ purpose: 'exam', vocalRange: 'F3 ~ C5', pinnedNote: '성대결절 이력' })
  })

  it('없는 고객 수정은 거부', () => {
    const db = createTestDb()
    expect(() => updateCustomer(db, 'nope', customerInput(), NOW)).toThrow('고객을 찾을 수 없습니다.')
  })

  it('삭제하면 관련 기록이 모두 지워진다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    addGoal(db, id, '복식호흡', NOW)
    savePass(db, { customerId: id, count: 10, purchasedAt: TODAY, amount: null, note: null }, NOW)
    deleteCustomer(db, id)
    for (const table of ['customers', 'goals', 'passes', 'status_logs']) {
      expect(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()).toBe(0)
    }
  })
})
```

`tests/db/goals-passes.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { addGoal, deleteGoal, listGoals, renameGoal, setGoalDone } from '@main/store/goals'
import { deletePass, listPasses, savePass } from '@main/store/passes'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

describe('goals store', () => {
  it('추가 순서대로, 체크하면 완료일 = 오늘, 해제·이름변경·삭제', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const a = addGoal(db, id, ' 복식호흡 ', new Date('2026-09-01T00:00:00Z'))
    const b = addGoal(db, id, '두성 연결', new Date('2026-09-02T00:00:00Z'))
    setGoalDone(db, a.id, true, TODAY, NOW)
    renameGoal(db, b.id, '두성-흉성 연결', NOW)
    expect(listGoals(db, id).map((g) => [g.title, g.doneAt])).toEqual([
      ['복식호흡', TODAY],
      ['두성-흉성 연결', null]
    ])
    setGoalDone(db, a.id, false, TODAY, NOW)
    deleteGoal(db, b.id)
    expect(listGoals(db, id).map((g) => [g.title, g.doneAt])).toEqual([['복식호흡', null]])
  })

  it('빈 목표는 거부', () => {
    const db = createTestDb()
    expect(() => addGoal(db, seedCustomer(db), ' ', NOW)).toThrow('목표 내용을 입력해 주세요.')
  })
})

describe('passes store', () => {
  it('구매 추가·수정·삭제, 최근 결제일 순', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const p1 = savePass(db, { customerId: id, count: 10, purchasedAt: '2026-03-02', amount: 500000, note: null }, NOW)
    savePass(db, { customerId: id, count: 10, purchasedAt: '2026-09-01', amount: null, note: ' 이벤트 ' }, NOW)
    savePass(db, { id: p1.id, customerId: id, count: 8, purchasedAt: '2026-03-02', amount: 400000, note: null }, NOW)
    expect(listPasses(db, id).map((p) => [p.purchasedAt, p.count, p.note])).toEqual([
      ['2026-09-01', 10, '이벤트'],
      ['2026-03-02', 8, null]
    ])
    deletePass(db, p1.id)
    expect(listPasses(db, id)).toHaveLength(1)
  })

  it('횟수 0 이하와 음수 금액은 거부', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    expect(() => savePass(db, { customerId: id, count: 0, purchasedAt: TODAY, amount: null, note: null }, NOW)).toThrow(
      '횟수는 1 이상'
    )
    expect(() => savePass(db, { customerId: id, count: 1, purchasedAt: TODAY, amount: -1, note: null }, NOW)).toThrow(
      '금액을 확인해 주세요.'
    )
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/db`
Expected: FAIL — `Failed to resolve import "@main/store/customers"`.

- [ ] **Step 3: 구현**

`src/main/store/customers.ts`

```ts
import type { Customer, CustomerInput, StatusLog } from '@shared/types'
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
  const r = db
    .prepare(
      `UPDATE customers SET name = @name, phone = @phone, birth_date = @birthDate, gender = @gender,
         purpose = @purpose, registered_at = @registeredAt, vocal_range = @vocalRange,
         preferred_music = @preferredMusic, pinned_note = @pinnedNote, updated_at = @updatedAt
       WHERE id = @id`
    )
    .run({ ...clean, id, updatedAt: iso(now) })
  if (r.changes === 0) throw notFound('고객을 찾을 수 없습니다.')
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

`src/main/store/goals.ts`

```ts
import type { Goal } from '@shared/types'
import type { DB } from '../db/connection'
import { GOAL_COLUMNS } from './columns'
import { iso, newId, notFound, validation } from './util'

export function listGoals(db: DB, customerId: string): Goal[] {
  return db
    .prepare(`SELECT ${GOAL_COLUMNS} FROM goals WHERE customer_id = ? ORDER BY created_at, rowid`)
    .all(customerId) as Goal[]
}

export function getGoal(db: DB, id: string): Goal | null {
  return (db.prepare(`SELECT ${GOAL_COLUMNS} FROM goals WHERE id = ?`).get(id) as Goal | undefined) ?? null
}

export function addGoal(db: DB, customerId: string, title: string, now: Date): Goal {
  const t = title.trim()
  if (!t) throw validation('목표 내용을 입력해 주세요.')
  const exists = db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)
  if (!exists) throw notFound('고객을 찾을 수 없습니다.')
  const goal: Goal = {
    id: newId(),
    customerId,
    title: t,
    doneAt: null,
    completedLessonId: null,
    createdAt: iso(now),
    updatedAt: iso(now)
  }
  db.prepare(
    `INSERT INTO goals (id, customer_id, title, done_at, completed_lesson_id, created_at, updated_at)
     VALUES (@id, @customerId, @title, @doneAt, @completedLessonId, @createdAt, @updatedAt)`
  ).run(goal)
  return goal
}

export function renameGoal(db: DB, id: string, title: string, now: Date): void {
  const t = title.trim()
  if (!t) throw validation('목표 내용을 입력해 주세요.')
  const r = db.prepare('UPDATE goals SET title = ?, updated_at = ? WHERE id = ?').run(t, iso(now), id)
  if (r.changes === 0) throw notFound('목표를 찾을 수 없습니다.')
}

/** 왼쪽 목록에서 직접 체크: 완료일 = 오늘, 수업 연결 없음 */
export function setGoalDone(db: DB, id: string, done: boolean, today: string, now: Date): void {
  const r = db
    .prepare('UPDATE goals SET done_at = ?, completed_lesson_id = NULL, updated_at = ? WHERE id = ?')
    .run(done ? today : null, iso(now), id)
  if (r.changes === 0) throw notFound('목표를 찾을 수 없습니다.')
}

export function deleteGoal(db: DB, id: string): void {
  db.prepare('DELETE FROM goals WHERE id = ?').run(id)
}
```

`src/main/store/passes.ts`

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
      .prepare('UPDATE passes SET count = ?, purchased_at = ?, amount = ?, note = ?, updated_at = ? WHERE id = ?')
      .run(input.count, purchasedAt, input.amount, blankToNull(input.note), ts, input.id)
    if (r.changes === 0) throw notFound('수강권 기록을 찾을 수 없습니다.')
    return db.prepare(`SELECT ${PASS_COLUMNS} FROM passes WHERE id = ?`).get(input.id) as Pass
  }
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

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/db`
Expected: PASS — `Test Files  4 passed`, `Tests  14 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/main/store tests
git commit -m "feat: 고객·목표·수강권 저장" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 예약·수업 기록·상태 변경

**Files:**
- Create: `src/main/store/reservations.ts`, `src/main/store/lessons.ts`, `src/main/store/status.ts`
- Test: `tests/db/reservations.test.ts`, `tests/db/lessons.test.ts`, `tests/db/status.test.ts`

**Interfaces:**
- Consumes: Task 5 의 `getCustomer`, `insertStatusLog`; Task 2 의 `isValidTime`.
- Produces:
  - `getReservation(db, id)`, `saveReservation(db, input, now)`(10분 단위만, 새 예약은 scheduled, 수정은 scheduled 인 것만), `cancelReservation(db, id, now)`(scheduled → canceled)
  - `listLessons(db, customerId)`(수업일·생성순), `getLesson`, `saveLesson(db, input, now)`, `deleteLesson(db, id, now)`
  - `countOpenReservations(db, customerId)`(scheduled 수), `changeStatus(db, input, now): { canceledReservations }`

`saveLesson` 규칙 (설계 5.4):
1. 새 기록이고 `reservationId` 가 없으면 같은 고객·같은 수업일의 scheduled 예약(가장 이른 시각)에 자동 연결한다. 연결된 예약은 `done`.
2. `completedGoalIds` 의 목표는 `done_at = 수업일`, `completed_lesson_id = 이 수업`. 단, 다른 수업으로 이미 완료된 목표는 덮어쓰지 않는다.
3. 수정할 때 선택에서 빠진, 이 수업으로 완료됐던 목표는 미완료로 되돌린다. 수업일을 바꾸면 이 수업으로 완료된 목표의 완료일도 바뀐다.
4. 수정은 `reservationId` 를 바꾸지 않는다.

`deleteLesson`: 연결된 예약을 `scheduled` 로 되돌리고 삭제한다. 이 수업으로 완료한 목표는 완료 상태를 유지한다(FK `ON DELETE SET NULL`).

`changeStatus`: 같은 상태로는 바꿀 수 없다. 휴강이면 `pause_until` 저장, 그 밖에는 NULL. 이력을 남기고, 종료·타지점 이동이면 열린(scheduled) 예약을 모두 취소한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/db/reservations.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { cancelReservation, getReservation, saveReservation } from '@main/store/reservations'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

describe('reservations store', () => {
  it('10분 단위가 아니면 거부, 변경·취소', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    expect(() => saveReservation(db, { customerId: id, date: TODAY, time: '15:05', note: null }, NOW)).toThrow(
      '10분 단위'
    )
    const r = saveReservation(db, { customerId: id, date: TODAY, time: '15:00', note: ' MR 준비 ' }, NOW)
    expect(r).toMatchObject({ status: 'scheduled', note: 'MR 준비' })
    saveReservation(db, { id: r.id, customerId: id, date: '2026-10-06', time: '15:10', note: null }, NOW)
    expect(getReservation(db, r.id)).toMatchObject({ date: '2026-10-06', time: '15:10', note: null })
    cancelReservation(db, r.id, NOW)
    expect(getReservation(db, r.id)?.status).toBe('canceled')
    expect(() => cancelReservation(db, r.id, NOW)).toThrow('이미 취소된')
    expect(() => saveReservation(db, { id: r.id, customerId: id, date: TODAY, time: '16:00', note: null }, NOW)).toThrow(
      '변경할 수 없습니다'
    )
  })

  it('없는 고객에게는 예약할 수 없다', () => {
    const db = createTestDb()
    expect(() => saveReservation(db, { customerId: 'nope', date: TODAY, time: '15:00', note: null }, NOW)).toThrow(
      '고객을 찾을 수 없습니다.'
    )
  })
})
```

`tests/db/lessons.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { LessonInput } from '@shared/types'
import { addGoal, listGoals } from '@main/store/goals'
import { deleteLesson, getLesson, saveLesson } from '@main/store/lessons'
import { getReservation, saveReservation } from '@main/store/reservations'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

const base = (customerId: string, over: Partial<LessonInput> = {}): LessonInput => ({
  customerId,
  lessonDate: TODAY,
  memo: '브릿지 고음에서 후두가 올라감',
  practice: ' 밤편지 2절 ',
  homework: '',
  deductPass: true,
  reservationId: null,
  completedGoalIds: [],
  ...over
})

describe('lessons store', () => {
  it('새 기록은 같은 날 예정 예약에 자동 연결되고 예약은 done', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const r = saveReservation(db, { customerId: id, date: TODAY, time: '15:00', note: null }, NOW)
    const lesson = saveLesson(db, base(id), NOW)
    expect(lesson).toMatchObject({ reservationId: r.id, practice: '밤편지 2절', homework: null })
    expect(getReservation(db, r.id)?.status).toBe('done')
  })

  it('완료한 목표는 완료일 = 수업일, 수정에서 빼면 미완료로 되돌린다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const g1 = addGoal(db, id, '두성 연결', NOW)
    const g2 = addGoal(db, id, '믹스보이스', NOW)
    const lesson = saveLesson(db, base(id, { lessonDate: '2026-09-21', completedGoalIds: [g1.id, g2.id] }), NOW)
    expect(listGoals(db, id).map((g) => [g.doneAt, g.completedLessonId])).toEqual([
      ['2026-09-21', lesson.id],
      ['2026-09-21', lesson.id]
    ])
    saveLesson(db, base(id, { id: lesson.id, lessonDate: '2026-09-22', completedGoalIds: [g1.id] }), NOW)
    expect(listGoals(db, id).map((g) => [g.title, g.doneAt])).toEqual([
      ['두성 연결', '2026-09-22'],
      ['믹스보이스', null]
    ])
  })

  it('이미 다른 날 완료된 목표는 덮어쓰지 않는다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const g = addGoal(db, id, '호흡', NOW)
    const first = saveLesson(db, base(id, { lessonDate: '2026-09-14', completedGoalIds: [g.id] }), NOW)
    saveLesson(db, base(id, { lessonDate: '2026-09-21', completedGoalIds: [g.id] }), NOW)
    expect(listGoals(db, id)[0]).toMatchObject({ doneAt: '2026-09-14', completedLessonId: first.id })
  })

  it('삭제하면 연결된 예약은 다시 예정, 목표는 완료 유지', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    const g = addGoal(db, id, '호흡', NOW)
    const r = saveReservation(db, { customerId: id, date: TODAY, time: '15:00', note: null }, NOW)
    const lesson = saveLesson(db, base(id, { reservationId: r.id, completedGoalIds: [g.id] }), NOW)
    deleteLesson(db, lesson.id, NOW)
    expect(getLesson(db, lesson.id)).toBeNull()
    expect(getReservation(db, r.id)?.status).toBe('scheduled')
    expect(listGoals(db, id)[0]).toMatchObject({ doneAt: TODAY, completedLessonId: null })
  })

  it('수업일 형식이 틀리면 거부', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    expect(() => saveLesson(db, base(id, { lessonDate: '9/28' }), NOW)).toThrow('수업일을 확인해 주세요.')
  })
})
```

`tests/db/status.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { getCustomer, listStatusLogs } from '@main/store/customers'
import { saveReservation } from '@main/store/reservations'
import { changeStatus, countOpenReservations } from '@main/store/status'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

describe('status store', () => {
  it('종료하면 열린 예약(지난 미기록 포함)을 모두 취소하고 이력을 남긴다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    saveReservation(db, { customerId: id, date: '2026-09-20', time: '15:00', note: null }, NOW)
    saveReservation(db, { customerId: id, date: '2026-10-02', time: '13:00', note: null }, NOW)
    expect(countOpenReservations(db, id)).toBe(2)
    const result = changeStatus(db, { customerId: id, toStatus: 'ended', date: TODAY, reason: '이사', pauseUntil: null }, NOW)
    expect(result.canceledReservations).toBe(2)
    expect(countOpenReservations(db, id)).toBe(0)
    expect(getCustomer(db, id)?.status).toBe('ended')
    expect(listStatusLogs(db, id).at(-1)).toMatchObject({ fromStatus: 'active', toStatus: 'ended', reason: '이사' })
  })

  it('휴강은 예약을 유지하고 종료 예정일을 저장, 같은 상태로는 바꿀 수 없다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    saveReservation(db, { customerId: id, date: '2026-10-02', time: '13:00', note: null }, NOW)
    const r = changeStatus(db, { customerId: id, toStatus: 'paused', date: TODAY, reason: null, pauseUntil: '2026-11-01' }, NOW)
    expect(r.canceledReservations).toBe(0)
    expect(getCustomer(db, id)?.pauseUntil).toBe('2026-11-01')
    expect(() =>
      changeStatus(db, { customerId: id, toStatus: 'paused', date: TODAY, reason: null, pauseUntil: null }, NOW)
    ).toThrow('이미 같은 상태입니다.')
  })

  it('재등록하면 수강중으로 돌아오고 휴강 종료일은 지운다', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    changeStatus(db, { customerId: id, toStatus: 'paused', date: TODAY, reason: null, pauseUntil: '2026-11-01' }, NOW)
    changeStatus(db, { customerId: id, toStatus: 'active', date: '2026-10-05', reason: null, pauseUntil: null }, NOW)
    expect(getCustomer(db, id)).toMatchObject({ status: 'active', pauseUntil: null })
    expect(listStatusLogs(db, id).map((l) => l.toStatus)).toEqual(['active', 'paused', 'active'])
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/db`
Expected: FAIL — `Failed to resolve import "@main/store/reservations"` 등.

- [ ] **Step 3: 구현**

`src/main/store/reservations.ts`

```ts
import type { Reservation, ReservationInput } from '@shared/types'
import { isValidTime } from '@shared/domain/schedule'
import type { DB } from '../db/connection'
import { RESERVATION_COLUMNS } from './columns'
import { blankToNull, iso, newId, notFound, requireDate, validation } from './util'

export function getReservation(db: DB, id: string): Reservation | null {
  return (
    (db.prepare(`SELECT ${RESERVATION_COLUMNS} FROM reservations WHERE id = ?`).get(id) as Reservation | undefined) ??
    null
  )
}

export function saveReservation(db: DB, input: ReservationInput, now: Date): Reservation {
  const date = requireDate(input.date, '날짜를 확인해 주세요.')
  if (!isValidTime(input.time)) throw validation('시간은 10분 단위로 선택해 주세요.')
  const ts = iso(now)
  if (input.id) {
    const existing = getReservation(db, input.id)
    if (!existing) throw notFound('예약을 찾을 수 없습니다.')
    if (existing.status !== 'scheduled') throw validation('기록되었거나 취소된 예약은 변경할 수 없습니다.')
    db.prepare('UPDATE reservations SET date = ?, time = ?, note = ?, updated_at = ? WHERE id = ?').run(
      date,
      input.time,
      blankToNull(input.note),
      ts,
      input.id
    )
    return getReservation(db, input.id) as Reservation
  }
  const exists = db.prepare('SELECT 1 FROM customers WHERE id = ?').get(input.customerId)
  if (!exists) throw notFound('고객을 찾을 수 없습니다.')
  const reservation: Reservation = {
    id: newId(),
    customerId: input.customerId,
    date,
    time: input.time,
    status: 'scheduled',
    note: blankToNull(input.note),
    createdAt: ts,
    updatedAt: ts
  }
  db.prepare(
    `INSERT INTO reservations (id, customer_id, date, time, status, note, created_at, updated_at)
     VALUES (@id, @customerId, @date, @time, @status, @note, @createdAt, @updatedAt)`
  ).run(reservation)
  return reservation
}

export function cancelReservation(db: DB, id: string, now: Date): void {
  const existing = getReservation(db, id)
  if (!existing) throw notFound('예약을 찾을 수 없습니다.')
  if (existing.status !== 'scheduled') throw validation('기록되었거나 이미 취소된 예약입니다.')
  db.prepare("UPDATE reservations SET status = 'canceled', updated_at = ? WHERE id = ?").run(iso(now), id)
}
```

`src/main/store/lessons.ts`

```ts
import type { Lesson, LessonInput } from '@shared/types'
import type { DB } from '../db/connection'
import { LESSON_COLUMNS } from './columns'
import { blankToNull, iso, newId, notFound, requireDate } from './util'

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

/** 수업 기록 삭제. 연결된 예약은 다시 예정(scheduled)으로 돌아간다. 완료한 목표는 완료 상태를 유지한다 */
export function deleteLesson(db: DB, id: string, now: Date): void {
  db.transaction(() => {
    const lesson = getLesson(db, id)
    if (!lesson) return
    if (lesson.reservationId) {
      db.prepare("UPDATE reservations SET status = 'scheduled', updated_at = ? WHERE id = ? AND status = 'done'").run(
        iso(now),
        lesson.reservationId
      )
    }
    db.prepare('DELETE FROM lessons WHERE id = ?').run(id)
  })()
}
```

`src/main/store/status.ts`

```ts
import type { CustomerStatus, StatusChangeInput } from '@shared/types'
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

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/db`
Expected: PASS — `Test Files  7 passed`, `Tests  24 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/main/store tests
git commit -m "feat: 예약·수업 기록·상태 변경 저장" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 화면용 조회 (홈·고객 요약·고객 상세·기간 예약)

**Files:**
- Create: `src/main/store/queries.ts`
- Test: `tests/db/queries.test.ts`

**Interfaces:**
- Consumes: Task 3 의 `buildHome`, `nextReservationsByCustomer`, `toSummary`, `withCustomer`; Task 2 의 `numberLessons`, `buildTimeline`, `remainingPasses`; Task 5·6 의 list 함수.
- Produces:
  - `listAggregates(db): CustomerAggregate[]` (고객별 서브쿼리 집계)
  - `listSummaries(db, today): CustomerSummary[]` (이름순, 다음 예약 포함)
  - `getCustomerDetail(db, id, today): CustomerDetail | null`
  - `attachCustomers(db, reservations): ReservationWithCustomer[]`
  - `listReservationsInRange(db, from, to)` (양 끝 포함, 날짜·시간순, 취소 포함)
  - `listReservationsForHome(db, today)` (오늘 이후 전부 + 지난 scheduled)
  - `getHome(db, today): HomeData`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/db/queries.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { LessonInput } from '@shared/types'
import { saveLesson } from '@main/store/lessons'
import { savePass } from '@main/store/passes'
import { getCustomerDetail, getHome, listReservationsInRange, listSummaries } from '@main/store/queries'
import { saveReservation } from '@main/store/reservations'
import { changeStatus } from '@main/store/status'
import { createTestDb, NOW, seedCustomer, TODAY } from '../support/db'

const lesson = (customerId: string, over: Partial<LessonInput> = {}): LessonInput => ({
  customerId,
  lessonDate: TODAY,
  memo: '',
  practice: null,
  homework: null,
  deductPass: true,
  reservationId: null,
  completedGoalIds: [],
  ...over
})

describe('queries', () => {
  it('상세: 회차, 남은 수강권, 다음 예약, 타임라인', () => {
    const db = createTestDb()
    const id = seedCustomer(db)
    savePass(db, { customerId: id, count: 10, purchasedAt: '2026-09-01', amount: 550000, note: null }, NOW)
    saveLesson(db, lesson(id, { lessonDate: '2026-09-14' }), NOW)
    saveLesson(db, lesson(id, { lessonDate: '2026-09-21', deductPass: false }), NOW)
    saveLesson(db, lesson(id, { lessonDate: '2026-09-07' }), NOW)
    saveReservation(db, { customerId: id, date: '2026-10-02', time: '13:00', note: null }, NOW)
    const d = getCustomerDetail(db, id, TODAY)
    expect(d?.lessons.map((l) => [l.lessonDate, l.number])).toEqual([
      ['2026-09-07', 1],
      ['2026-09-14', 2],
      ['2026-09-21', 3]
    ])
    expect(d?.totalPassCount).toBe(10)
    expect(d?.remainingPasses).toBe(8)
    expect(d?.nextReservation).toMatchObject({ date: '2026-10-02', time: '13:00' })
    expect(d?.timeline.map((e) => e.kind)).toEqual(['lesson', 'lesson', 'lesson', 'status'])
    expect(getCustomerDetail(db, 'nope', TODAY)).toBeNull()
  })

  it('요약 목록은 이름순이고 다음 예약을 포함한다', () => {
    const db = createTestDb()
    const b = seedCustomer(db, { name: '박서준' })
    seedCustomer(db, { name: '김민지' })
    saveReservation(db, { customerId: b, date: TODAY, time: '18:30', note: null }, NOW)
    const list = listSummaries(db, TODAY)
    expect(list.map((s) => s.name)).toEqual(['김민지', '박서준'])
    expect(list[1].nextReservation).toEqual({ date: TODAY, time: '18:30' })
  })

  it('기간 조회는 날짜·시간순이고 고객 이름과 회차를 붙인다', () => {
    const db = createTestDb()
    const a = seedCustomer(db, { name: '김민지' })
    const b = seedCustomer(db, { name: '이하은' })
    saveReservation(db, { customerId: b, date: '2026-10-02', time: '16:00', note: null }, NOW)
    saveReservation(db, { customerId: a, date: '2026-09-28', time: '13:00', note: null }, NOW)
    saveReservation(db, { customerId: a, date: '2026-10-05', time: '13:00', note: null }, NOW)
    const week = listReservationsInRange(db, '2026-09-28', '2026-10-04')
    expect(week.map((w) => [w.reservation.date, w.customerName, w.lessonNumber])).toEqual([
      ['2026-09-28', '김민지', 1],
      ['2026-10-02', '이하은', 1]
    ])
  })

  it('홈: 오늘 수업, 지난 미기록, 예약 없음, 요약 숫자', () => {
    const db = createTestDb()
    const a = seedCustomer(db, { name: '김민지' })
    const b = seedCustomer(db, { name: '최도윤' })
    const c = seedCustomer(db, { name: '정유나' })
    changeStatus(db, { customerId: c, toStatus: 'paused', date: TODAY, reason: null, pauseUntil: null }, NOW)
    saveReservation(db, { customerId: a, date: TODAY, time: '13:00', note: null }, NOW)
    saveReservation(db, { customerId: b, date: '2026-09-26', time: '19:00', note: null }, NOW)
    saveLesson(db, lesson(a), NOW)
    const home = getHome(db, TODAY)
    expect(home.todayReservations).toHaveLength(1)
    expect(home.todayReservations[0].reservation.status).toBe('done')
    expect(home.missedReservations.map((m) => m.customerName)).toEqual(['최도윤'])
    expect(home.unbooked.map((u) => u.name)).toEqual(['최도윤', '김민지'])
    expect(home.stats).toEqual({ active: 2, today: 1, unbooked: 2, passExhausted: 0 })
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/db/queries.test.ts`
Expected: FAIL — `Failed to resolve import "@main/store/queries"`.

- [ ] **Step 3: 구현**

`src/main/store/queries.ts`

```ts
import type {
  Customer,
  CustomerDetail,
  CustomerSummary,
  HomeData,
  Reservation,
  ReservationWithCustomer
} from '@shared/types'
import type { CustomerAggregate } from '@shared/domain/home'
import { buildHome, nextReservationsByCustomer, toSummary, withCustomer } from '@shared/domain/home'
import { buildTimeline, numberLessons } from '@shared/domain/lessons'
import { remainingPasses } from '@shared/domain/passes'
import type { DB } from '../db/connection'
import { customerColumns, RESERVATION_COLUMNS } from './columns'
import { getCustomer, listStatusLogs } from './customers'
import { listGoals } from './goals'
import { listLessons } from './lessons'
import { listPasses } from './passes'

type AggregateRow = Customer & Omit<CustomerAggregate, 'customer'>

export function listAggregates(db: DB): CustomerAggregate[] {
  const rows = db
    .prepare(
      `SELECT ${customerColumns('c.')},
         (SELECT COUNT(*) FROM goals g WHERE g.customer_id = c.id) AS goalsTotal,
         (SELECT COUNT(*) FROM goals g WHERE g.customer_id = c.id AND g.done_at IS NOT NULL) AS goalsDone,
         (SELECT COUNT(*) FROM lessons l WHERE l.customer_id = c.id) AS lessonCount,
         (SELECT MAX(l.lesson_date) FROM lessons l WHERE l.customer_id = c.id) AS lastLessonDate,
         (SELECT COUNT(*) FROM lessons l WHERE l.customer_id = c.id AND l.deduct_pass = 1) AS deducted,
         (SELECT COUNT(*) FROM passes p WHERE p.customer_id = c.id) AS passRecords,
         (SELECT COALESCE(SUM(p.count), 0) FROM passes p WHERE p.customer_id = c.id) AS passTotal
       FROM customers c`
    )
    .all() as AggregateRow[]
  return rows.map(
    ({ goalsTotal, goalsDone, lessonCount, lastLessonDate, deducted, passRecords, passTotal, ...customer }) => ({
      customer,
      goalsTotal,
      goalsDone,
      lessonCount,
      lastLessonDate,
      deducted,
      passRecords,
      passTotal
    })
  )
}

export function listSummaries(db: DB, today: string): CustomerSummary[] {
  const upcoming = db
    .prepare(`SELECT ${RESERVATION_COLUMNS} FROM reservations WHERE status = 'scheduled' AND date >= ?`)
    .all(today) as Reservation[]
  const next = nextReservationsByCustomer(upcoming, today)
  return listAggregates(db)
    .map((a) => toSummary(a, next.get(a.customer.id)))
    .sort((x, y) => x.name.localeCompare(y.name, 'ko'))
}

export function getCustomerDetail(db: DB, id: string, today: string): CustomerDetail | null {
  const customer = getCustomer(db, id)
  if (!customer) return null
  const lessons = numberLessons(listLessons(db, id))
  const passes = listPasses(db, id)
  const totalPassCount = passes.reduce((sum, p) => sum + p.count, 0)
  const nextReservation =
    (db
      .prepare(
        `SELECT ${RESERVATION_COLUMNS} FROM reservations
         WHERE customer_id = ? AND status = 'scheduled' AND date >= ? ORDER BY date, time LIMIT 1`
      )
      .get(id, today) as Reservation | undefined) ?? null
  return {
    customer,
    goals: listGoals(db, id),
    lessons,
    timeline: buildTimeline(lessons, listStatusLogs(db, id)),
    passes,
    totalPassCount,
    remainingPasses: remainingPasses({
      records: passes.length,
      total: totalPassCount,
      deducted: lessons.filter((l) => l.deductPass).length
    }),
    nextReservation
  }
}

export function attachCustomers(db: DB, reservations: Reservation[]): ReservationWithCustomer[] {
  const byId = new Map(listAggregates(db).map((a) => [a.customer.id, a]))
  return reservations.flatMap((r) => {
    const a = byId.get(r.customerId)
    return a ? [withCustomer(r, a)] : []
  })
}

/** from ~ to (둘 다 포함), 날짜·시간순. 취소 포함 */
export function listReservationsInRange(db: DB, from: string, to: string): ReservationWithCustomer[] {
  const rows = db
    .prepare(`SELECT ${RESERVATION_COLUMNS} FROM reservations WHERE date BETWEEN ? AND ? ORDER BY date, time`)
    .all(from, to) as Reservation[]
  return attachCustomers(db, rows)
}

/** 홈 계산용: 오늘 이후 전부 + 지난 미기록(scheduled) */
export function listReservationsForHome(db: DB, today: string): Reservation[] {
  return db
    .prepare(
      `SELECT ${RESERVATION_COLUMNS} FROM reservations
       WHERE date >= ? OR (status = 'scheduled' AND date < ?) ORDER BY date, time`
    )
    .all(today, today) as Reservation[]
}

export function getHome(db: DB, today: string): HomeData {
  return buildHome({
    today,
    aggregates: listAggregates(db),
    reservations: listReservationsForHome(db, today)
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  16 passed`, `Tests  74 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/main/store tests
git commit -m "feat: 홈·고객 상세·기간 예약 조회" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: IPC 계약과 Main·preload 연결

**Files:**
- Create: `src/shared/api.ts`, `src/main/ipc/handlers.ts`, `src/main/ipc/invoke.ts`, `src/main/ipc/register.ts`, `src/preload/index.d.ts`
- Modify: `src/main/index.ts`(DB 열기·IPC 등록 추가 — 아래 전체 내용으로 교체), `src/preload/index.ts`(아래 전체 내용으로 교체)
- Test: `tests/db/ipc.test.ts`

**Interfaces:**
- Consumes: Task 4~7 의 store 함수, Task 2 의 `toErrorPayload`.
- Produces:
  - `ApiSpec`(채널 → `{ args, result }`), `Channel`, `ArgsOf<C>`, `ResultOf<C>`, `CHANNELS`
  - 채널: `settings.get|update`, `home.get`, `customers.list|detail|create|update|setPinnedNote|remove|countOpenReservations|changeStatus`, `goals.add|rename|setDone|remove`, `lessons.save|remove`, `passes.save|remove`, `reservations.range|save|cancel`
  - `createHandlers(db, clock = () => new Date()): Handlers`, `invokeHandler(handlers, channel, args, logError?): Promise<Result<unknown>>`, `registerIpc(handlers)`
  - 화면에서 쓰는 `window.api.invoke<C>(channel, ...args): Promise<Result<ResultOf<C>>>`
- 새 채널을 추가할 때는 `ApiSpec`, `CHANNEL_MAP`, `createHandlers` 세 곳을 함께 고친다(`CHANNEL_MAP`·`Handlers` 가 Record/매핑 타입이라 빠뜨리면 컴파일 오류).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/db/ipc.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { CHANNELS } from '@shared/api'
import { createHandlers } from '@main/ipc/handlers'
import { invokeHandler } from '@main/ipc/invoke'
import { createTestDb, customerInput, NOW } from '../support/db'

describe('ipc handlers', () => {
  it('모든 채널에 처리 함수가 있다', () => {
    const handlers = createHandlers(createTestDb(), () => NOW)
    for (const channel of CHANNELS) expect(typeof handlers[channel]).toBe('function')
  })

  it('성공은 ok:true, AppError 는 메시지를 그대로, 그 밖의 오류는 일반 메시지', async () => {
    const handlers = createHandlers(createTestDb(), () => NOW)
    const logError = vi.fn()
    const created = await invokeHandler(handlers, 'customers.create', [customerInput()], logError)
    expect(created.ok).toBe(true)

    const invalid = await invokeHandler(handlers, 'customers.create', [customerInput({ name: '' })], logError)
    expect(invalid).toEqual({ ok: false, error: { code: 'VALIDATION', message: '이름을 입력해 주세요.' } })

    const broken = await invokeHandler(handlers, 'customers.detail', [undefined], logError)
    expect(broken.ok).toBe(true)

    const crash = await invokeHandler(
      { ...handlers, 'home.get': () => { throw new Error('boom') } },
      'home.get',
      [],
      logError
    )
    expect(crash).toEqual({
      ok: false,
      error: { code: 'UNKNOWN', message: '처리 중 오류가 발생했습니다. 다시 시도해 주세요.' }
    })
    expect(logError).toHaveBeenCalledTimes(2)
  })

  it('home.get 은 clock 의 날짜를 오늘로 쓴다', async () => {
    const handlers = createHandlers(createTestDb(), () => NOW)
    const home = await handlers['home.get']()
    expect(home.today).toBe('2026-09-28')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/db/ipc.test.ts`
Expected: FAIL — `Failed to resolve import "@shared/api"`.

- [ ] **Step 3: 계약과 처리 함수 구현**

`src/shared/api.ts`

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
  'reservations.cancel': true
}

export const CHANNELS = Object.keys(CHANNEL_MAP) as Channel[]
```

`src/main/ipc/handlers.ts`

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

export type Handlers = {
  [C in Channel]: (...args: ArgsOf<C>) => ResultOf<C> | Promise<ResultOf<C>>
}

/** 채널별 처리 함수. clock 은 테스트에서 시각을 고정하기 위한 것 */
export function createHandlers(db: DB, clock: () => Date = () => new Date()): Handlers {
  const today = (): string => toDateString(clock())
  return {
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

`src/main/ipc/invoke.ts`

```ts
import type { Channel } from '@shared/api'
import { toErrorPayload, type Result } from '@shared/result'
import type { Handlers } from './handlers'

/** 처리 함수를 호출해 Result 로 감싼다. 예외는 기록하고 사용자용 메시지로 바꾼다 */
export async function invokeHandler(
  handlers: Handlers,
  channel: Channel,
  args: unknown[],
  logError: (err: unknown) => void = (err) => console.error(err)
): Promise<Result<unknown>> {
  const handler = handlers[channel] as ((...a: unknown[]) => unknown) | undefined
  if (!handler) return { ok: false, error: { code: 'NO_CHANNEL', message: `알 수 없는 요청: ${channel}` } }
  try {
    return { ok: true, data: await handler(...args) }
  } catch (err) {
    logError(err)
    return { ok: false, error: toErrorPayload(err) }
  }
}
```

`src/main/ipc/register.ts`

```ts
import { ipcMain } from 'electron'
import { CHANNELS } from '@shared/api'
import type { Handlers } from './handlers'
import { invokeHandler } from './invoke'

export function registerIpc(handlers: Handlers): void {
  for (const channel of CHANNELS) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => invokeHandler(handlers, channel, args))
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  17 passed`, `Tests  77 passed`.

- [ ] **Step 5: Main·preload 연결**

`src/main/index.ts`

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { openDatabase } from './db/connection'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'

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
    registerIpc(createHandlers(db))
    createWindow()
  })

  app.on('window-all-closed', () => app.quit())
}
```

`src/preload/index.ts`

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type Channel } from '@shared/api'

const allowed = new Set<string>(CHANNELS)

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: Channel, ...args: unknown[]) => {
    if (!allowed.has(channel)) return Promise.reject(new Error(`허용되지 않은 요청: ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  }
})
```

`src/preload/index.d.ts`

```ts
import type { ArgsOf, Channel, ResultOf } from '@shared/api'
import type { Result } from '@shared/result'

declare global {
  interface Window {
    api: {
      invoke<C extends Channel>(channel: C, ...args: ArgsOf<C>): Promise<Result<ResultOf<C>>>
    }
  }
}

export {}
```

- [ ] **Step 6: 타입 검사·빌드·실행 확인**

Run: `npm run typecheck && npx electron-vite build && grep -o 'require("[^"]*")' out/main/index.js | sort -u`
Expected: 오류 없음. 마지막 출력은 `require("better-sqlite3")`, `require("electron")`, `require("node:crypto")`, `require("node:path")` 네 줄 (dayjs 는 번들에 포함, better-sqlite3 만 외부 모듈).

Run: `npm run dev` → 개발자 도구(Mac `Cmd+Option+I`, Windows `Ctrl+Shift+I`)를 열고 Console 에 입력:
`await window.api.invoke('settings.get')`
Expected: `{ok: true, data: {branchName: null, lessonMinutes: 60}}`.
`await window.api.invoke('nope')` → `Error: 허용되지 않은 요청: nope`. 확인 후 창을 닫는다.

- [ ] **Step 7: 커밋**

```bash
git add src tests
git commit -m "feat: IPC 계약과 Main·preload 연결" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 화면 기반 — Provider·메뉴·첫 실행 지점 설정·설정 화면

**Files:**
- Create: `src/renderer/src/api/client.ts`, `src/renderer/src/api/hooks.ts`, `src/renderer/src/lib/today.ts`, `src/renderer/src/lib/notify.ts`, `src/renderer/src/lib/confirm.tsx`, `src/renderer/src/layout/AppLayout.tsx`, `src/renderer/src/pages/OnboardingPage.tsx`, `src/renderer/src/pages/SettingsPage.tsx`
- Create (임시, 뒤 Task 에서 교체): `src/renderer/src/pages/HomePage.tsx`(Task 12), `src/renderer/src/pages/CustomerDetailPage.tsx`(Task 13), `src/renderer/src/pages/SchedulePage.tsx`(Task 14)
- Modify: `src/renderer/src/App.tsx` (아래 전체 내용으로 교체, Task 10 에서 한 번 더 교체)
- Test: `tests/renderer/render.tsx`(이 Task 버전), `tests/renderer/OnboardingPage.test.tsx`

**Interfaces:**
- Consumes: Task 8 의 `window.api`, `Channel`/`ArgsOf`/`ResultOf`.
- Produces:
  - `call(channel, ...args)`(실패 시 `AppError` throw)
  - 훅: `useSettings`, `useHome`, `useCustomers`, `useCustomerDetail(id)`, `useReservationsRange(from, to)`, `useOpenReservationCount(customerId)`, `useApiMutation(channel)` — `mutateAsync([...args])`, 성공하면 **모든 조회 무효화**
  - `todayString()`, `notifySuccess(message)`, `notifyError(error)`(AppError 면 그 메시지, 아니면 일반 메시지 — QueryCache·MutationCache onError 에 연결)
  - `confirm({ title, message, confirmLabel, cancelLabel?, danger? }): Promise<boolean>`, `confirmDiscard(message?)`
  - `AppLayout({ branchName })` — 메뉴 홈/일정/설정, 화면 이동 시 맨 위로 스크롤
  - 테스트 도우미 `mockApi(responses): Mock`, `renderWithProviders(ui, { route?, path? })`
- 주의: 저장 버튼 핸들러는 `try { await m.mutateAsync(...) } catch { return }` 패턴을 쓴다. 오류 알림은 MutationCache 가 띄우므로 여기서는 삼키기만 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/renderer/render.tsx`

```tsx
import { render, type RenderResult } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi, type Mock } from 'vitest'
import type { Channel } from '@shared/api'

type Responses = Partial<Record<Channel, (...args: unknown[]) => unknown>>

/** window.api.invoke 를 가짜로 바꾼다. 응답이 없는 채널은 undefined 를 돌려준다 */
export function mockApi(responses: Responses): Mock {
  const invoke = vi.fn(async (channel: Channel, ...args: unknown[]) => ({
    ok: true,
    data: responses[channel]?.(...args)
  }))
  window.api = { invoke } as unknown as Window['api']
  return invoke
}

/** 앱과 같은 Provider 로 감싸서 그린다. route/path 를 주면 그 주소의 Route 로 그린다 */
export function renderWithProviders(ui: React.ReactNode, options: { route?: string; path?: string } = {}): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const content = options.path ? (
    <Routes>
      <Route path={options.path} element={ui} />
    </Routes>
  ) : (
    ui
  )
  return render(
    <MantineProvider>
      <DatesProvider settings={{ locale: 'ko', firstDayOfWeek: 1 }}>
        <QueryClientProvider client={queryClient}>
          <ModalsProvider>
            <MemoryRouter initialEntries={[options.route ?? '/']}>{content}</MemoryRouter>
          </ModalsProvider>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  )
}
```

`tests/renderer/OnboardingPage.test.tsx`

```tsx
import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingPage } from '@renderer/pages/OnboardingPage'
import { mockApi, renderWithProviders } from './render'

describe('OnboardingPage', () => {
  it('지점 이름을 입력하면 저장한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'settings.update': () => ({ branchName: '강남점', lessonMinutes: 60 }) })
    renderWithProviders(<OnboardingPage />)
    const button = screen.getByRole('button', { name: '시작하기' })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText('지점 이름'), '강남점')
    await user.click(button)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('settings.update', { branchName: '강남점' }))
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run --project renderer`
Expected: FAIL — `Failed to resolve import "@renderer/pages/OnboardingPage"`.

- [ ] **Step 3: 화면 기반 구현**

`src/renderer/src/api/client.ts`

```ts
import type { ArgsOf, Channel, ResultOf } from '@shared/api'
import { AppError } from '@shared/result'

/** Main 프로세스 호출. 실패하면 AppError 를 던진다 */
export async function call<C extends Channel>(channel: C, ...args: ArgsOf<C>): Promise<ResultOf<C>> {
  const res = await window.api.invoke(channel, ...args)
  if (!res.ok) throw new AppError(res.error.code, res.error.message)
  return res.data
}
```

`src/renderer/src/api/hooks.ts`

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ArgsOf, Channel, ResultOf } from '@shared/api'
import { call } from './client'

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => call('settings.get') })

export const useHome = () => useQuery({ queryKey: ['home'], queryFn: () => call('home.get') })

export const useCustomers = () => useQuery({ queryKey: ['customers'], queryFn: () => call('customers.list') })

export const useCustomerDetail = (id: string | undefined) =>
  useQuery({
    queryKey: ['customer', id],
    queryFn: () => call('customers.detail', id as string),
    enabled: Boolean(id)
  })

export const useReservationsRange = (from: string | null, to: string | null) =>
  useQuery({
    queryKey: ['reservations', from, to],
    queryFn: () => call('reservations.range', from as string, to as string),
    enabled: Boolean(from && to)
  })

export const useOpenReservationCount = (customerId: string) =>
  useQuery({
    queryKey: ['openReservations', customerId],
    queryFn: () => call('customers.countOpenReservations', customerId)
  })

/**
 * 저장·삭제용. 성공하면 모든 조회를 다시 불러온다 (데이터가 작아서 전부 갱신해도 충분히 빠르다).
 * 사용: const save = useApiMutation('lessons.save'); await save.mutateAsync([input])
 */
export function useApiMutation<C extends Channel>(channel: C) {
  const queryClient = useQueryClient()
  return useMutation<ResultOf<C>, Error, ArgsOf<C>>({
    mutationFn: (args) => call(channel, ...args),
    onSuccess: () => queryClient.invalidateQueries()
  })
}
```

`src/renderer/src/lib/today.ts`

```ts
import { toDateString } from '@shared/domain/dates'

/** 화면에서 쓰는 오늘 날짜 (로컬 기준) */
export const todayString = (): string => toDateString(new Date())
```

`src/renderer/src/lib/notify.ts`

```ts
import { notifications } from '@mantine/notifications'
import { UNKNOWN_ERROR_MESSAGE } from '@shared/result'

export function notifySuccess(message: string): void {
  notifications.show({ color: 'teal', message })
}

export function notifyError(error: unknown): void {
  const message = error instanceof Error && error.name === 'AppError' ? error.message : UNKNOWN_ERROR_MESSAGE
  notifications.show({ color: 'red', title: '저장하지 못했습니다', message })
}
```

`src/renderer/src/lib/confirm.tsx`

```tsx
import { Text } from '@mantine/core'
import { modals } from '@mantine/modals'

interface ConfirmOptions {
  title: string
  message: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
}

/** 확인 창. 확인을 누르면 true, 취소·닫기는 false */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    modals.openConfirmModal({
      title: options.title,
      centered: true,
      children: typeof options.message === 'string' ? <Text size="sm">{options.message}</Text> : options.message,
      labels: { confirm: options.confirmLabel, cancel: options.cancelLabel ?? '취소' },
      confirmProps: options.danger ? { color: 'red' } : undefined,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    })
  })
}

/** 작성 중인 내용이 있을 때 닫기 확인 */
export function confirmDiscard(message = '작성 중인 내용이 있습니다. 닫을까요?'): Promise<boolean> {
  return confirm({ title: '닫기', message, confirmLabel: '닫기', cancelLabel: '계속 작성', danger: true })
}
```

`src/renderer/src/layout/AppLayout.tsx`

```tsx
import { useEffect } from 'react'
import { AppShell, NavLink, Stack, Text, Title } from '@mantine/core'
import { IconCalendarWeek, IconHome, IconSettings } from '@tabler/icons-react'
import { Link, Outlet, useLocation } from 'react-router'

interface Props {
  branchName: string
}

export function AppLayout({ branchName }: Props): React.JSX.Element {
  const { pathname } = useLocation()
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

`src/renderer/src/pages/OnboardingPage.tsx`

```tsx
import { useState } from 'react'
import { Button, Center, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useApiMutation } from '../api/hooks'

export function OnboardingPage(): React.JSX.Element {
  const [name, setName] = useState('')
  const save = useApiMutation('settings.update')
  const submit = (): void => {
    if (name.trim()) save.mutate([{ branchName: name }])
  }
  return (
    <Center h="100vh" bg="gray.0">
      <Paper withBorder shadow="sm" p="xl" w={420}>
        <Stack>
          <Title order={3}>🎤 VOCAL CRM 시작하기</Title>
          <Text c="dimmed" size="sm">
            이 PC는 어느 지점인가요? 한 번만 입력하면 되고, 나중에 설정에서 바꿀 수 있습니다.
          </Text>
          <TextInput
            label="지점 이름"
            placeholder="예: 강남점"
            data-autofocus
            autoFocus
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <Button onClick={submit} disabled={!name.trim()} loading={save.isPending}>
            시작하기
          </Button>
        </Stack>
      </Paper>
    </Center>
  )
}
```

`src/renderer/src/pages/SettingsPage.tsx`

```tsx
import { useState } from 'react'
import { Button, Group, NumberInput, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import type { Settings } from '@shared/types'
import { useApiMutation, useSettings } from '../api/hooks'
import { notifySuccess } from '../lib/notify'

export function SettingsPage(): React.JSX.Element {
  const settings = useSettings()
  if (!settings.data) return <></>
  return (
    <Stack maw={640}>
      <Title order={2}>설정</Title>
      <BasicSettings key={JSON.stringify(settings.data)} settings={settings.data} />
    </Stack>
  )
}

function BasicSettings({ settings }: { settings: Settings }): React.JSX.Element {
  const [branchName, setBranchName] = useState(settings.branchName ?? '')
  const [lessonMinutes, setLessonMinutes] = useState<number | string>(settings.lessonMinutes)
  const save = useApiMutation('settings.update')
  const submit = async (): Promise<void> => {
    try {
      await save.mutateAsync([{ branchName, lessonMinutes: Number(lessonMinutes) }])
    } catch {
      return
    }
    notifySuccess('설정을 저장했습니다.')
  }
  return (
    <Paper withBorder p="lg">
      <Stack>
        <Text fw={700}>기본</Text>
        <TextInput label="이 PC의 지점 이름" value={branchName} onChange={(e) => setBranchName(e.currentTarget.value)} />
        <NumberInput
          label="기본 수업 길이"
          description="예약 시간이 겹치는지 판단할 때 씁니다"
          min={10}
          max={240}
          step={10}
          suffix="분"
          value={lessonMinutes}
          onChange={setLessonMinutes}
        />
        <Group justify="flex-end">
          <Button onClick={() => void submit()} loading={save.isPending}>
            저장
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}
```

`src/renderer/src/pages/HomePage.tsx`

```tsx
import { Title } from '@mantine/core'

// Task 12 에서 실제 홈 화면으로 교체한다
export function HomePage(): React.JSX.Element {
  return <Title order={2}>홈</Title>
}
```

`src/renderer/src/pages/CustomerDetailPage.tsx`

```tsx
import { Title } from '@mantine/core'

// Task 13 에서 실제 고객 상세 화면으로 교체한다
export function CustomerDetailPage(): React.JSX.Element {
  return <Title order={2}>고객 상세</Title>
}
```

`src/renderer/src/pages/SchedulePage.tsx`

```tsx
import { Title } from '@mantine/core'

// Task 14 에서 실제 주간 일정 화면으로 교체한다
export function SchedulePage(): React.JSX.Element {
  return <Title order={2}>일정</Title>
}
```

`src/renderer/src/App.tsx`

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
import { CustomerDetailPage } from './pages/CustomerDetailPage'
import { HomePage } from './pages/HomePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { SchedulePage } from './pages/SchedulePage'
import { SettingsPage } from './pages/SettingsPage'
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
    <Routes>
      <Route element={<AppLayout branchName={settings.data.branchName} />}>
        <Route index element={<HomePage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export function App(): React.JSX.Element {
  return (
    <MantineProvider theme={theme}>
      <DatesProvider settings={{ locale: 'ko', firstDayOfWeek: 1 }}>
        <QueryClientProvider client={queryClient}>
          <ModalsProvider labels={{ confirm: '확인', cancel: '취소' }}>
            <Notifications position="bottom-right" />
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
Expected: PASS — `Test Files  18 passed`, `Tests  78 passed`.

- [ ] **Step 5: 타입 검사·실행 확인**

Run: `npm run typecheck`
Expected: 오류 없음.

Run: `npm run dev`
Expected: "🎤 VOCAL CRM 시작하기" 창 → 지점 이름에 `강남점` 입력 후 Enter → 왼쪽 메뉴(🎤 VOCAL CRM / 강남점 / 홈·일정·설정)와 본문 "홈". 설정 메뉴에서 수업 길이를 50 으로 저장하면 오른쪽 아래에 "설정을 저장했습니다." 알림. 창을 닫았다 다시 `npm run dev` 해도 시작 화면 없이 바로 홈이 나온다.

- [ ] **Step 6: 커밋**

```bash
git add src/renderer tests
git commit -m "feat: 화면 기반, 첫 실행 지점 설정, 설정 화면" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 창 관리 + 고객 등록·수정 창 + 예약 창

**Files:**
- Create: `src/renderer/src/modals/CustomerFormModal.tsx`, `src/renderer/src/modals/ReservationModal.tsx`, `src/renderer/src/modals/AppModals.tsx`(이 Task 버전, Task 11 에서 교체)
- Modify: `src/renderer/src/App.tsx`(AppModalsProvider 로 감싸기 — 아래 전체 내용으로 교체), `tests/renderer/render.tsx`(AppModalsProvider 추가 — 아래 전체 내용으로 교체)
- Test: `tests/renderer/CustomerFormModal.test.tsx`, `tests/renderer/ReservationModal.test.tsx`

**Interfaces:**
- Consumes: Task 9 의 훅·confirm·notify, Task 2 의 `findConflicts`, `buildTimeOptions`, `formatPhone`, `PURPOSE_LABEL`.
- Produces:
  - `CustomerFormTarget = { customer?: Customer }`, `CustomerFormModal({ customer?, onClose })` — 새로 만들면 저장 후 `/customers/:id` 로 이동. 수정 창에는 "고객 삭제"(확인 후 삭제, 홈으로 이동). 입력 중 닫으면 `confirmDiscard()`.
  - `ReservationTarget = { customerId?, reservation?, date? }`, `ReservationModal({ ..., onClose })` — 고객 Select(수강중·휴강만, 수정 시 비활성), 날짜, 10분 단위 시간 Select(검색 가능), 이날 예약 목록, 겹침 빨간 안내 → 저장 시 "⚠ 예약 시간이 겹칩니다" 확인 → "그래도 저장".
  - `AppModalsProvider`, `useAppModals()` → `{ openReservation(target?), openCustomerForm(target?) }` (Task 11 에서 `openLesson`, `openPass`, `openStatusChange` 추가)
- 테스트 참고: Mantine Select 드롭다운 옵션은 jsdom 에서 '숨김'으로 계산되므로 `findByRole('option', { name, hidden: true })` 로 찾는다.

- [ ] **Step 1: 실패하는 테스트 작성** (render.tsx 가 AppModals 를 import 하게 바뀌므로 기존 Onboarding 테스트도 이 단계에서는 실패한다)

`tests/renderer/render.tsx`

```tsx
import { render, type RenderResult } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi, type Mock } from 'vitest'
import type { Channel } from '@shared/api'
import { AppModalsProvider } from '@renderer/modals/AppModals'

type Responses = Partial<Record<Channel, (...args: unknown[]) => unknown>>

/** window.api.invoke 를 가짜로 바꾼다. 응답이 없는 채널은 undefined 를 돌려준다 */
export function mockApi(responses: Responses): Mock {
  const invoke = vi.fn(async (channel: Channel, ...args: unknown[]) => ({
    ok: true,
    data: responses[channel]?.(...args)
  }))
  window.api = { invoke } as unknown as Window['api']
  return invoke
}

/** 앱과 같은 Provider 로 감싸서 그린다. route/path 를 주면 그 주소의 Route 로 그린다 */
export function renderWithProviders(ui: React.ReactNode, options: { route?: string; path?: string } = {}): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const content = options.path ? (
    <Routes>
      <Route path={options.path} element={ui} />
    </Routes>
  ) : (
    ui
  )
  return render(
    <MantineProvider>
      <DatesProvider settings={{ locale: 'ko', firstDayOfWeek: 1 }}>
        <QueryClientProvider client={queryClient}>
          <ModalsProvider>
            <MemoryRouter initialEntries={[options.route ?? '/']}>
              <AppModalsProvider>{content}</AppModalsProvider>
            </MemoryRouter>
          </ModalsProvider>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  )
}
```

`tests/renderer/CustomerFormModal.test.tsx`

```tsx
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomerFormModal } from '@renderer/modals/CustomerFormModal'
import { makeCustomer } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

describe('CustomerFormModal', () => {
  it('이름이 없으면 저장하지 않고, 연락처는 입력하면서 하이픈이 들어간다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'customers.create': () => makeCustomer({ id: 'new', name: '김민지' }) })
    const onClose = vi.fn()
    renderWithProviders(<CustomerFormModal onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('이름을 입력해 주세요.')).toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalledWith('customers.create', expect.anything())

    await user.type(screen.getByLabelText(/이름/), '김민지')
    await user.type(screen.getByLabelText('연락처'), '01012345678')
    expect(screen.getByLabelText('연락처')).toHaveValue('010-1234-5678')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(invoke).toHaveBeenCalledWith(
      'customers.create',
      expect.objectContaining({ name: '김민지', phone: '010-1234-5678', pinnedNote: '' })
    )
  })
})
```

`tests/renderer/ReservationModal.test.tsx`

```tsx
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomerSummary, ReservationWithCustomer } from '@shared/types'
import { ReservationModal } from '@renderer/modals/ReservationModal'
import { makeReservation } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

const minji: CustomerSummary = {
  id: 'c1',
  name: '김민지',
  phone: '01012345678',
  purpose: 'exam',
  status: 'active',
  pinnedNote: '',
  goalsDone: 0,
  goalsTotal: 0,
  lessonCount: 0,
  lastLessonDate: null,
  nextReservation: null,
  remainingPasses: null
}
const existing: ReservationWithCustomer = {
  reservation: makeReservation({ id: 'r-haeun', customerId: 'c2', date: '2026-10-06', time: '15:00' }),
  customerName: '이하은',
  hasPinnedNote: false,
  lessonNumber: 3,
  remainingPasses: null
}

describe('ReservationModal', () => {
  it('겹치면 안내하고, 저장할 때 확인을 받은 뒤 저장한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({
      'settings.get': () => ({ branchName: '강남점', lessonMinutes: 60 }),
      'customers.list': () => [minji],
      'reservations.range': () => [existing],
      'reservations.save': () => existing.reservation
    })
    const onClose = vi.fn()
    renderWithProviders(<ReservationModal customerId="c1" date="2026-10-06" onClose={onClose} />)

    await user.click(await screen.findByPlaceholderText('예: 15:00'))
    // 드롭다운은 전환 효과 때문에 jsdom 에서 '숨김'으로 계산되므로 hidden: true 로 찾는다
    await user.click(await screen.findByRole('option', { name: '15:30', hidden: true }))
    expect(await screen.findByText('⚠ 15:00 이하은 예약과 겹칩니다')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '예약 저장' }))
    expect(await screen.findByText('⚠ 예약 시간이 겹칩니다')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '그래도 저장' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(invoke).toHaveBeenCalledWith('reservations.save', {
      id: undefined,
      customerId: 'c1',
      date: '2026-10-06',
      time: '15:30',
      note: null
    })
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run --project renderer`
Expected: FAIL — `Failed to resolve import "@renderer/modals/AppModals"`.

- [ ] **Step 3: 구현**

`src/renderer/src/modals/CustomerFormModal.tsx`

```tsx
import { useEffect, useState } from 'react'
import { Button, Group, Modal, SegmentedControl, Select, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useNavigate } from 'react-router'
import type { Customer, CustomerInput, Gender, Purpose } from '@shared/types'
import { PURPOSE_LABEL } from '@shared/domain/labels'
import { formatPhone } from '@shared/domain/phone'
import { useApiMutation } from '../api/hooks'
import { confirm, confirmDiscard } from '../lib/confirm'
import { notifySuccess } from '../lib/notify'
import { todayString } from '../lib/today'

export interface CustomerFormTarget {
  customer?: Customer
}

const PURPOSE_OPTIONS = (Object.keys(PURPOSE_LABEL) as Purpose[]).map((p) => ({ value: p, label: PURPOSE_LABEL[p] }))

function toInput(c?: Customer): CustomerInput {
  return {
    name: c?.name ?? '',
    phone: c?.phone ? formatPhone(c.phone) : '',
    birthDate: c?.birthDate ?? null,
    gender: c?.gender ?? null,
    purpose: c?.purpose ?? null,
    registeredAt: c?.registeredAt ?? todayString(),
    vocalRange: c?.vocalRange ?? '',
    preferredMusic: c?.preferredMusic ?? '',
    pinnedNote: c?.pinnedNote ?? ''
  }
}

export function CustomerFormModal({ customer, onClose }: CustomerFormTarget & { onClose: () => void }): React.JSX.Element {
  const navigate = useNavigate()
  const [initial] = useState(() => toInput(customer))
  const [values, setValues] = useState(initial)
  const [nameError, setNameError] = useState<string | null>(null)
  const set = (patch: Partial<CustomerInput>): void => setValues((v) => ({ ...v, ...patch }))
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)
  const create = useApiMutation('customers.create')
  const update = useApiMutation('customers.update')
  const remove = useApiMutation('customers.remove')

  useEffect(() => {
    if (values.name.trim()) setNameError(null)
  }, [values.name])

  const requestClose = async (): Promise<void> => {
    if (!dirty || (await confirmDiscard())) onClose()
  }

  const submit = async (): Promise<void> => {
    if (!values.name.trim()) {
      setNameError('이름을 입력해 주세요.')
      return
    }
    try {
      if (customer) {
        await update.mutateAsync([customer.id, values])
        notifySuccess('고객 정보를 저장했습니다.')
        onClose()
      } else {
        const created = await create.mutateAsync([values])
        notifySuccess(`${created.name} 님을 등록했습니다.`)
        onClose()
        void navigate(`/customers/${created.id}`)
      }
    } catch {
      return
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!customer) return
    const ok = await confirm({
      title: '고객 삭제',
      message: `${customer.name} 님과 모든 기록(수업, 목표, 수강권, 예약, 이력)을 삭제합니다. 되돌릴 수 없습니다.`,
      confirmLabel: '삭제',
      danger: true
    })
    if (!ok) return
    try {
      await remove.mutateAsync([customer.id])
    } catch {
      return
    }
    notifySuccess('고객을 삭제했습니다.')
    onClose()
    void navigate('/')
  }

  return (
    <Modal
      opened
      onClose={() => void requestClose()}
      title={<Text fw={700}>{customer ? '고객 정보 수정' : '새 고객 등록'}</Text>}
      size="lg"
      closeOnClickOutside={false}
    >
      <Stack gap="sm">
        <Group grow align="flex-start">
          <TextInput
            label="이름"
            withAsterisk
            data-autofocus
            value={values.name}
            error={nameError}
            onChange={(e) => set({ name: e.currentTarget.value })}
          />
          <TextInput
            label="연락처"
            placeholder="010-0000-0000"
            value={values.phone ?? ''}
            onChange={(e) => set({ phone: formatPhone(e.currentTarget.value) })}
          />
        </Group>
        <Group grow align="flex-start">
          <DatePickerInput
            label="생년월일"
            clearable
            defaultLevel="decade"
            valueFormat="YYYY-MM-DD"
            value={values.birthDate}
            onChange={(v) => set({ birthDate: v })}
          />
          <div>
            <Text size="sm" fw={500} mb={3}>
              성별
            </Text>
            <SegmentedControl
              fullWidth
              value={values.gender ?? ''}
              onChange={(v) => set({ gender: v === '' ? null : (v as Gender) })}
              data={[
                { value: '', label: '미입력' },
                { value: 'F', label: '여' },
                { value: 'M', label: '남' }
              ]}
            />
          </div>
        </Group>
        <Group grow align="flex-start">
          <Select
            label="수강 목적"
            clearable
            data={PURPOSE_OPTIONS}
            value={values.purpose}
            onChange={(v) => set({ purpose: v as Purpose | null })}
          />
          <DatePickerInput
            label="등록일"
            valueFormat="YYYY-MM-DD"
            value={values.registeredAt}
            onChange={(v) => v && set({ registeredAt: v })}
          />
        </Group>
        <Group grow align="flex-start">
          <TextInput
            label="음역대"
            placeholder="예: F3 ~ C5"
            value={values.vocalRange ?? ''}
            onChange={(e) => set({ vocalRange: e.currentTarget.value })}
          />
          <TextInput
            label="선호 장르 · 목표곡"
            value={values.preferredMusic ?? ''}
            onChange={(e) => set({ preferredMusic: e.currentTarget.value })}
          />
        </Group>
        <Textarea
          label="📌 공통메모"
          description="고객 화면 상단에 항상 보입니다. 예: 성대결절 이력, 입시 일정"
          autosize
          minRows={2}
          value={values.pinnedNote}
          onChange={(e) => set({ pinnedNote: e.currentTarget.value })}
        />
        <Group justify="space-between" mt="xs">
          {customer ? (
            <Button variant="subtle" color="red" onClick={() => void handleDelete()}>
              고객 삭제
            </Button>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={() => void requestClose()}>
              취소
            </Button>
            <Button onClick={() => void submit()} loading={create.isPending || update.isPending}>
              저장
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
```

`src/renderer/src/modals/ReservationModal.tsx`

```tsx
import { useState } from 'react'
import { Button, Group, Modal, Paper, Select, Stack, Text, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import type { Reservation } from '@shared/types'
import { formatMonthDay } from '@shared/domain/dates'
import { PURPOSE_LABEL } from '@shared/domain/labels'
import { formatPhone } from '@shared/domain/phone'
import { buildTimeOptions, findConflicts } from '@shared/domain/schedule'
import { useApiMutation, useCustomers, useReservationsRange, useSettings } from '../api/hooks'
import { confirm } from '../lib/confirm'
import { notifySuccess } from '../lib/notify'
import { todayString } from '../lib/today'

export interface ReservationTarget {
  customerId?: string
  reservation?: Reservation
  date?: string
}

const TIME_OPTIONS = buildTimeOptions()

export function ReservationModal({ customerId, reservation, date, onClose }: ReservationTarget & { onClose: () => void }): React.JSX.Element {
  const settings = useSettings()
  const customers = useCustomers()
  const [values, setValues] = useState({
    customerId: reservation?.customerId ?? customerId ?? null,
    date: reservation?.date ?? date ?? todayString(),
    time: reservation?.time ?? null,
    note: reservation?.note ?? ''
  })
  const set = (patch: Partial<typeof values>): void => setValues((v) => ({ ...v, ...patch }))
  const day = useReservationsRange(values.date, values.date)
  const save = useApiMutation('reservations.save')

  const lessonMinutes = settings.data?.lessonMinutes ?? 60
  const dayList = (day.data ?? []).filter((d) => d.reservation.status !== 'canceled')
  const conflicts = values.time
    ? findConflicts(
        { id: reservation?.id, date: values.date, time: values.time },
        dayList.map((d) => d.reservation),
        lessonMinutes
      )
    : []
  const conflictIds = new Set(conflicts.map((c) => c.id))
  const conflictText = dayList
    .filter((d) => conflictIds.has(d.reservation.id))
    .map((d) => `${d.reservation.time} ${d.customerName}`)
    .join(', ')

  const customerOptions = (customers.data ?? [])
    .filter((c) => c.status === 'active' || c.status === 'paused' || c.id === values.customerId)
    .map((c) => ({
      value: c.id,
      label: [c.name, c.purpose ? PURPOSE_LABEL[c.purpose] : null, c.phone ? formatPhone(c.phone) : null]
        .filter(Boolean)
        .join(' · ')
    }))

  const submit = async (): Promise<void> => {
    if (!values.customerId || !values.time) return
    if (conflicts.length > 0) {
      const ok = await confirm({
        title: '⚠ 예약 시간이 겹칩니다',
        message: `${formatMonthDay(values.date)} ${values.time} 근처에 이미 예약이 있습니다 (${conflictText}). 그래도 저장할까요?`,
        confirmLabel: '그래도 저장',
        cancelLabel: '돌아가기'
      })
      if (!ok) return
    }
    try {
      await save.mutateAsync([
        { id: reservation?.id, customerId: values.customerId, date: values.date, time: values.time, note: values.note || null }
      ])
    } catch {
      return
    }
    notifySuccess('예약을 저장했습니다.')
    onClose()
  }

  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>{reservation ? '예약 변경' : '수업 예약'}</Text>}>
      <Stack gap="sm">
        <Select
          label="고객"
          placeholder="이름으로 검색"
          searchable
          data={customerOptions}
          value={values.customerId}
          onChange={(v) => set({ customerId: v })}
          disabled={Boolean(reservation)}
          nothingFoundMessage="고객이 없습니다"
        />
        <Group grow>
          <DatePickerInput
            label="날짜"
            valueFormat="YYYY-MM-DD (dd)"
            value={values.date}
            onChange={(v) => v && set({ date: v })}
          />
          <Select
            label="시간"
            placeholder="예: 15:00"
            searchable
            data={TIME_OPTIONS}
            value={values.time}
            onChange={(v) => set({ time: v })}
            maxDropdownHeight={220}
          />
        </Group>
        {conflicts.length > 0 && (
          <Text size="xs" c="red">
            ⚠ {conflictText} 예약과 겹칩니다
          </Text>
        )}
        <Paper bg="gray.0" p="sm" radius="md">
          <Text size="xs" c="dimmed" fw={600} mb={4}>
            이날 예약 ({settings.data?.branchName ?? ''})
          </Text>
          {dayList.length === 0 ? (
            <Text size="sm" c="dimmed">
              예약 없음
            </Text>
          ) : (
            dayList.map((d) => (
              <Text key={d.reservation.id} size="sm" c={conflictIds.has(d.reservation.id) ? 'red' : undefined}>
                <Text span fw={700} ff="monospace">
                  {d.reservation.time}
                </Text>{' '}
                {d.customerName}
              </Text>
            ))
          )}
        </Paper>
        <TextInput
          label="비고"
          placeholder="예: 입시곡 MR 준비해오기"
          value={values.note}
          onChange={(e) => set({ note: e.currentTarget.value })}
        />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={!values.customerId || !values.time} loading={save.isPending}>
            예약 저장
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
```

`src/renderer/src/modals/AppModals.tsx`

```tsx
import { createContext, useContext, useMemo, useRef, useState } from 'react'
import { CustomerFormModal, type CustomerFormTarget } from './CustomerFormModal'
import { ReservationModal, type ReservationTarget } from './ReservationModal'

interface AppModalsApi {
  openReservation: (target?: ReservationTarget) => void
  openCustomerForm: (target?: CustomerFormTarget) => void
}

type Opened<T> = { key: number; target: T } | null

const AppModalsContext = createContext<AppModalsApi | null>(null)

/** 어느 화면에서든 같은 창을 열 수 있게 한 곳에서 관리한다 (Task 11 에서 수업 기록·수강권·상태 변경 창 추가) */
export function AppModalsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const seq = useRef(0)
  const [reservation, setReservation] = useState<Opened<ReservationTarget>>(null)
  const [customerForm, setCustomerForm] = useState<Opened<CustomerFormTarget>>(null)

  const api = useMemo<AppModalsApi>(
    () => ({
      openReservation: (target = {}) => setReservation({ key: ++seq.current, target }),
      openCustomerForm: (target = {}) => setCustomerForm({ key: ++seq.current, target })
    }),
    []
  )

  return (
    <AppModalsContext.Provider value={api}>
      {children}
      {reservation && <ReservationModal key={reservation.key} {...reservation.target} onClose={() => setReservation(null)} />}
      {customerForm && (
        <CustomerFormModal key={customerForm.key} {...customerForm.target} onClose={() => setCustomerForm(null)} />
      )}
    </AppModalsContext.Provider>
  )
}

export function useAppModals(): AppModalsApi {
  const ctx = useContext(AppModalsContext)
  if (!ctx) throw new Error('AppModalsProvider 안에서만 사용할 수 있습니다')
  return ctx
}
```

`src/renderer/src/App.tsx`

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
            <Notifications position="bottom-right" />
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
Expected: PASS — `Test Files  20 passed`, `Tests  80 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/renderer tests
git commit -m "feat: 고객 등록·수정 창과 예약 창(겹침 확인)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 수업 기록 창(메모 중심) · 수강권 창 · 상태 변경 창

**Files:**
- Create: `src/renderer/src/modals/LessonModal.tsx`, `src/renderer/src/modals/PassModal.tsx`, `src/renderer/src/modals/StatusChangeModal.tsx`
- Modify: `src/renderer/src/modals/AppModals.tsx` (아래 전체 내용으로 교체)
- Test: `tests/renderer/LessonModal.test.tsx`

**Interfaces:**
- Consumes: Task 10 의 `AppModalsProvider` 구조, Task 2 의 `previousHomework`, `END_REASONS`, `withEuro`, `formatRemaining`.
- Produces:
  - `LessonTarget = { customerId, lessonId?, reservationId?, date? }` — `lessonId` 가 있으면 수정. 창이 열리면 **메모 칸에 커서**, `Ctrl/Cmd+Enter` 저장, 지난 과제 한 줄, 회차(새 기록은 선택한 수업일 이전 기록 수 + 1), 완료 목표 칩(미완료 + 이 수업으로 완료된 것), 수강권 차감 스위치와 "저장 후 N회 남음", 버튼 취소 / 저장 후 다음 예약(새 기록만) / 저장. 입력 중 닫으면 "작성 중인 메모가 있습니다. 닫을까요?".
  - `PassTarget = { customerId, pass? }`, `StatusTarget = { customer, toStatus, remainingPasses }`
  - 상태 변경 사유: 종료 = `"<사유> · <메모>"` 또는 `"<사유>"`, 타지점 이동 = `"<지점>으로 이동"`(조사 자동), 휴강·재등록 = 메모. 종료·이동이면 열린 예약 수와 남은 수강권(참고)을 보여준다.
  - `useAppModals()` → `{ openLesson, openReservation, openCustomerForm, openPass, openStatusChange }`. "저장 후 다음 예약"은 수업 창을 닫고 같은 고객으로 예약 창을 연다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/renderer/LessonModal.test.tsx`

```tsx
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomerDetail } from '@shared/types'
import { numberLessons } from '@shared/domain/lessons'
import { LessonModal } from '@renderer/modals/LessonModal'
import { makeCustomer, makeLesson } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

const lessons = numberLessons([makeLesson({ id: 'l1', lessonDate: '2026-09-21', homework: '립트릴 매일 5분' })])
const detail: CustomerDetail = {
  customer: makeCustomer({ id: 'c1', name: '김민지' }),
  goals: [
    { id: 'g1', customerId: 'c1', title: '믹스보이스 안정화', doneAt: null, completedLessonId: null, createdAt: '', updatedAt: '' }
  ],
  lessons,
  timeline: [],
  passes: [],
  totalPassCount: 10,
  remainingPasses: 6,
  nextReservation: null
}

describe('LessonModal', () => {
  it('지난 과제·회차·차감 후 남은 횟수를 보여주고, 메모와 완료 목표를 저장한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'customers.detail': () => detail, 'lessons.save': () => lessons[0] })
    const onClose = vi.fn()
    renderWithProviders(<LessonModal customerId="c1" date="2026-09-28" reservationId="r1" onClose={onClose} onBookNext={vi.fn()} />)

    expect(await screen.findByText('2회차')).toBeInTheDocument()
    expect(screen.getByText('립트릴 매일 5분')).toBeInTheDocument()
    expect(screen.getByText('저장 후 5회 남음')).toBeInTheDocument()

    await user.type(screen.getByLabelText('메모'), '브릿지 고음 개선')
    await user.click(screen.getByText('믹스보이스 안정화'))
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(invoke).toHaveBeenCalledWith(
      'lessons.save',
      expect.objectContaining({
        customerId: 'c1',
        lessonDate: '2026-09-28',
        memo: '브릿지 고음 개선',
        deductPass: true,
        reservationId: 'r1',
        completedGoalIds: ['g1']
      })
    )
  })

  it('메모를 쓰다 닫으면 확인을 받는다', async () => {
    const user = userEvent.setup()
    mockApi({ 'customers.detail': () => detail })
    const onClose = vi.fn()
    renderWithProviders(<LessonModal customerId="c1" onClose={onClose} onBookNext={vi.fn()} />)

    await user.type(await screen.findByLabelText('메모'), '작성 중')
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(await screen.findByText('작성 중인 메모가 있습니다. 닫을까요?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '닫기' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/renderer/LessonModal.test.tsx`
Expected: FAIL — `Failed to resolve import "@renderer/modals/LessonModal"`.

- [ ] **Step 3: 구현**

`src/renderer/src/modals/LessonModal.tsx`

```tsx
import { useEffect, useState } from 'react'
import { Badge, Button, Center, Chip, Group, Loader, Modal, Paper, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { getHotkeyHandler } from '@mantine/hooks'
import type { CustomerDetail } from '@shared/types'
import { previousHomework } from '@shared/domain/lessons'
import { useApiMutation, useCustomerDetail } from '../api/hooks'
import { confirmDiscard } from '../lib/confirm'
import { notifySuccess } from '../lib/notify'
import { todayString } from '../lib/today'

export interface LessonTarget {
  customerId: string
  lessonId?: string
  reservationId?: string
  date?: string
}

interface Props extends LessonTarget {
  onClose: () => void
  onBookNext: (customerId: string) => void
}

export function LessonModal({ customerId, lessonId, reservationId, date, onClose, onBookNext }: Props): React.JSX.Element {
  const detail = useCustomerDetail(customerId)
  const [dirty, setDirty] = useState(false)

  const requestClose = async (): Promise<void> => {
    if (!dirty || (await confirmDiscard('작성 중인 메모가 있습니다. 닫을까요?'))) onClose()
  }

  const name = detail.data?.customer.name
  return (
    <Modal
      opened
      onClose={() => void requestClose()}
      title={<Text fw={700}>{name ? `${name} · ${lessonId ? '수업 기록 수정' : '수업 기록'}` : '수업 기록'}</Text>}
      size="lg"
      closeOnClickOutside={false}
    >
      {detail.data ? (
        <LessonForm
          detail={detail.data}
          lessonId={lessonId}
          reservationId={reservationId}
          initialDate={date}
          onDirtyChange={setDirty}
          onCancel={() => void requestClose()}
          onDone={(bookNext) => {
            onClose()
            if (bookNext) onBookNext(customerId)
          }}
        />
      ) : (
        <Center p="xl">
          <Loader />
        </Center>
      )}
    </Modal>
  )
}

interface FormProps {
  detail: CustomerDetail
  lessonId?: string
  reservationId?: string
  initialDate?: string
  onDirtyChange: (dirty: boolean) => void
  onCancel: () => void
  onDone: (bookNext: boolean) => void
}

function LessonForm({ detail, lessonId, reservationId, initialDate, onDirtyChange, onCancel, onDone }: FormProps): React.JSX.Element {
  const editing = lessonId ? (detail.lessons.find((l) => l.id === lessonId) ?? null) : null
  // 창이 열릴 때의 값. 이후 detail 이 다시 불려와도 입력 중인 값은 유지한다
  const [initial] = useState(() => ({
    lessonDate: editing?.lessonDate ?? initialDate ?? todayString(),
    memo: editing?.memo ?? '',
    practice: editing?.practice ?? '',
    homework: editing?.homework ?? '',
    deductPass: editing?.deductPass ?? true,
    goalIds: editing ? detail.goals.filter((g) => g.completedLessonId === editing.id).map((g) => g.id) : []
  }))
  const [values, setValues] = useState(initial)
  const set = (patch: Partial<typeof values>): void => setValues((v) => ({ ...v, ...patch }))
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  const save = useApiMutation('lessons.save')

  const before = detail.lessons.filter((l) => l.lessonDate <= values.lessonDate)
  const number = editing ? editing.number : before.length + 1
  const lastHomework = editing ? previousHomework(detail.lessons, editing.number) : previousHomework(before)
  const goalOptions = detail.goals.filter((g) => g.doneAt === null || (editing && g.completedLessonId === editing.id))
  const base = detail.remainingPasses === null ? null : detail.remainingPasses + (editing?.deductPass ? 1 : 0)
  const after = base === null ? null : base - (values.deductPass ? 1 : 0)

  const submit = async (bookNext: boolean): Promise<void> => {
    try {
      await save.mutateAsync([
        {
          id: editing?.id,
          customerId: detail.customer.id,
          lessonDate: values.lessonDate,
          memo: values.memo,
          practice: values.practice || null,
          homework: values.homework || null,
          deductPass: values.deductPass,
          reservationId: editing ? editing.reservationId : (reservationId ?? null),
          completedGoalIds: values.goalIds
        }
      ])
    } catch {
      return // 오류 알림은 전역에서 띄운다
    }
    notifySuccess('수업 기록을 저장했습니다.')
    onDone(bookNext)
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Badge size="lg" variant="light">
          {number}회차
        </Badge>
        <DatePickerInput
          aria-label="수업일"
          size="xs"
          w={170}
          valueFormat="YYYY-MM-DD (dd)"
          value={values.lessonDate}
          onChange={(v) => v && set({ lessonDate: v })}
        />
      </Group>

      {lastHomework && (
        <Paper bg="gray.0" px="sm" py={6} radius="sm">
          <Text size="xs" c="dimmed">
            지난 과제 ·{' '}
            <Text span size="xs" fw={600} c="dark">
              {lastHomework}
            </Text>
          </Text>
        </Paper>
      )}

      <Textarea
        label="메모"
        description="Ctrl+Enter 로 바로 저장"
        data-autofocus
        autosize
        minRows={7}
        maxRows={16}
        styles={{ input: { fontSize: 15, lineHeight: 1.65 } }}
        value={values.memo}
        onChange={(e) => set({ memo: e.currentTarget.value })}
        onKeyDown={getHotkeyHandler([['mod+Enter', () => void submit(false)]])}
      />

      <Group grow>
        <TextInput
          label="연습 곡 · 내용 (선택)"
          value={values.practice}
          onChange={(e) => set({ practice: e.currentTarget.value })}
        />
        <TextInput
          label="다음 과제 (선택)"
          placeholder="예: 믹스 스케일 매일 10분"
          value={values.homework}
          onChange={(e) => set({ homework: e.currentTarget.value })}
        />
      </Group>

      {goalOptions.length > 0 && (
        <div>
          <Text size="sm" fw={500} mb={6}>
            이번 수업에서 완료한 목표
          </Text>
          <Chip.Group multiple value={values.goalIds} onChange={(goalIds) => set({ goalIds })}>
            <Group gap="xs">
              {goalOptions.map((g) => (
                <Chip key={g.id} value={g.id} size="sm">
                  {g.title}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </div>
      )}

      <Paper bg="gray.0" p="sm" radius="md">
        <Switch
          label="수강권 1회 차감"
          description={after === null ? '수강권 구매 기록 없음' : `저장 후 ${after}회 남음`}
          checked={values.deductPass}
          onChange={(e) => set({ deductPass: e.currentTarget.checked })}
        />
      </Paper>

      <Group justify="flex-end" mt="xs">
        <Button variant="default" onClick={onCancel}>
          취소
        </Button>
        {!editing && (
          <Button variant="light" onClick={() => void submit(true)} loading={save.isPending}>
            저장 후 다음 예약
          </Button>
        )}
        <Button onClick={() => void submit(false)} loading={save.isPending}>
          저장
        </Button>
      </Group>
    </Stack>
  )
}
```

`src/renderer/src/modals/PassModal.tsx`

```tsx
import { useState } from 'react'
import { Button, Group, Modal, NumberInput, Stack, Text, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import type { Pass } from '@shared/types'
import { useApiMutation } from '../api/hooks'
import { notifySuccess } from '../lib/notify'
import { todayString } from '../lib/today'

export interface PassTarget {
  customerId: string
  pass?: Pass
}

export function PassModal({ customerId, pass, onClose }: PassTarget & { onClose: () => void }): React.JSX.Element {
  const [count, setCount] = useState<number | string>(pass?.count ?? 10)
  const [purchasedAt, setPurchasedAt] = useState(pass?.purchasedAt ?? todayString())
  const [amount, setAmount] = useState<number | string>(pass?.amount ?? '')
  const [note, setNote] = useState(pass?.note ?? '')
  const save = useApiMutation('passes.save')

  const submit = async (): Promise<void> => {
    try {
      await save.mutateAsync([
        {
          id: pass?.id,
          customerId,
          count: Number(count),
          purchasedAt,
          amount: amount === '' ? null : Number(amount),
          note: note || null
        }
      ])
    } catch {
      return
    }
    notifySuccess('수강권을 저장했습니다.')
    onClose()
  }

  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>{pass ? '수강권 수정' : '수강권 구매 추가'}</Text>}>
      <Stack gap="sm">
        <Group grow>
          <NumberInput label="횟수" min={1} suffix="회" value={count} onChange={setCount} data-autofocus />
          <DatePickerInput
            label="결제일"
            valueFormat="YYYY-MM-DD"
            value={purchasedAt}
            onChange={(v) => v && setPurchasedAt(v)}
          />
        </Group>
        <NumberInput
          label="금액 (선택)"
          min={0}
          thousandSeparator=","
          suffix="원"
          value={amount}
          onChange={setAmount}
        />
        <TextInput label="비고 (선택)" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending} disabled={!count}>
            저장
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
```

`src/renderer/src/modals/StatusChangeModal.tsx`

```tsx
import { useState } from 'react'
import { Alert, Button, Group, Modal, SegmentedControl, Stack, Text, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import type { Customer, CustomerStatus } from '@shared/types'
import { END_REASONS, withEuro } from '@shared/domain/labels'
import { formatRemaining } from '@shared/domain/passes'
import { useApiMutation, useOpenReservationCount } from '../api/hooks'
import { notifySuccess } from '../lib/notify'
import { todayString } from '../lib/today'

export interface StatusTarget {
  customer: Customer
  toStatus: CustomerStatus
  remainingPasses: number | null
}

const TITLE: Record<CustomerStatus, string> = {
  active: '재등록 (수강중으로)',
  paused: '휴강 처리',
  ended: '수강 종료',
  moved: '타지점 이동'
}

export function StatusChangeModal({
  customer,
  toStatus,
  remainingPasses,
  onClose
}: StatusTarget & { onClose: () => void }): React.JSX.Element {
  const [date, setDate] = useState(todayString())
  const [endReason, setEndReason] = useState<string>(END_REASONS[0])
  const [memo, setMemo] = useState('')
  const [pauseUntil, setPauseUntil] = useState<string | null>(null)
  const [branch, setBranch] = useState('')
  const openCount = useOpenReservationCount(customer.id)
  const change = useApiMutation('customers.changeStatus')
  const closing = toStatus === 'ended' || toStatus === 'moved'

  const reason = (): string | null => {
    if (toStatus === 'ended') return memo.trim() ? `${endReason} · ${memo.trim()}` : endReason
    if (toStatus === 'moved') return branch.trim() ? `${withEuro(branch.trim())} 이동` : null
    return memo.trim() || null
  }

  const submit = async (): Promise<void> => {
    let result: { canceledReservations: number }
    try {
      result = await change.mutateAsync([
        { customerId: customer.id, toStatus, date, reason: reason(), pauseUntil: toStatus === 'paused' ? pauseUntil : null }
      ])
    } catch {
      return
    }
    const canceled = result.canceledReservations > 0 ? ` 예약 ${result.canceledReservations}건을 취소했습니다.` : ''
    notifySuccess(`${customer.name} 님: ${TITLE[toStatus]} 완료.${canceled}`)
    onClose()
  }

  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>{`${customer.name} 님 ${TITLE[toStatus]}`}</Text>}>
      <Stack gap="sm">
        <DatePickerInput label="날짜" valueFormat="YYYY-MM-DD" value={date} onChange={(v) => v && setDate(v)} />

        {toStatus === 'ended' && (
          <div>
            <Text size="sm" fw={500} mb={3}>
              사유
            </Text>
            <SegmentedControl fullWidth value={endReason} onChange={setEndReason} data={[...END_REASONS]} />
          </div>
        )}
        {toStatus === 'moved' && (
          <TextInput label="이동할 지점 (선택)" placeholder="예: 홍대점" value={branch} onChange={(e) => setBranch(e.currentTarget.value)} />
        )}
        {toStatus === 'paused' && (
          <DatePickerInput
            label="휴강 종료 예정일 (선택)"
            clearable
            valueFormat="YYYY-MM-DD"
            value={pauseUntil}
            onChange={setPauseUntil}
          />
        )}
        {toStatus !== 'moved' && (
          <TextInput label="메모 (선택)" value={memo} onChange={(e) => setMemo(e.currentTarget.value)} />
        )}

        {closing && (openCount.data ?? 0) > 0 && (
          <Alert color="orange" variant="light">
            잡혀 있는 예약 {openCount.data}건을 함께 취소합니다.
          </Alert>
        )}
        {closing && remainingPasses !== null && remainingPasses > 0 && (
          <Text size="sm" c="dimmed">
            ℹ 남은 수강권 {formatRemaining(remainingPasses)} (참고용)
          </Text>
        )}
        {toStatus === 'paused' && (
          <Text size="sm" c="dimmed">
            홈 화면 목록에서 빠지고, 잡혀 있는 예약은 그대로 둡니다.
          </Text>
        )}

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            취소
          </Button>
          <Button color={closing ? 'red' : undefined} onClick={() => void submit()} loading={change.isPending}>
            {TITLE[toStatus]}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
```

`src/renderer/src/modals/AppModals.tsx`

```tsx
import { createContext, useContext, useMemo, useRef, useState } from 'react'
import { CustomerFormModal, type CustomerFormTarget } from './CustomerFormModal'
import { LessonModal, type LessonTarget } from './LessonModal'
import { PassModal, type PassTarget } from './PassModal'
import { ReservationModal, type ReservationTarget } from './ReservationModal'
import { StatusChangeModal, type StatusTarget } from './StatusChangeModal'

interface AppModalsApi {
  openLesson: (target: LessonTarget) => void
  openReservation: (target?: ReservationTarget) => void
  openCustomerForm: (target?: CustomerFormTarget) => void
  openPass: (target: PassTarget) => void
  openStatusChange: (target: StatusTarget) => void
}

type Opened<T> = { key: number; target: T } | null

const AppModalsContext = createContext<AppModalsApi | null>(null)

/** 어느 화면에서든 같은 창(수업 기록·예약·고객·수강권·상태 변경)을 열 수 있게 한 곳에서 관리한다 */
export function AppModalsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const seq = useRef(0)
  const [lesson, setLesson] = useState<Opened<LessonTarget>>(null)
  const [reservation, setReservation] = useState<Opened<ReservationTarget>>(null)
  const [customerForm, setCustomerForm] = useState<Opened<CustomerFormTarget>>(null)
  const [pass, setPass] = useState<Opened<PassTarget>>(null)
  const [status, setStatus] = useState<Opened<StatusTarget>>(null)

  const api = useMemo<AppModalsApi>(() => {
    const open = <T,>(setter: (o: Opened<T>) => void) => (target: T) => setter({ key: ++seq.current, target })
    return {
      openLesson: open(setLesson),
      openReservation: (target = {}) => setReservation({ key: ++seq.current, target }),
      openCustomerForm: (target = {}) => setCustomerForm({ key: ++seq.current, target }),
      openPass: open(setPass),
      openStatusChange: open(setStatus)
    }
  }, [])

  return (
    <AppModalsContext.Provider value={api}>
      {children}
      {lesson && (
        <LessonModal
          key={lesson.key}
          {...lesson.target}
          onClose={() => setLesson(null)}
          onBookNext={(customerId) => api.openReservation({ customerId })}
        />
      )}
      {reservation && <ReservationModal key={reservation.key} {...reservation.target} onClose={() => setReservation(null)} />}
      {customerForm && (
        <CustomerFormModal key={customerForm.key} {...customerForm.target} onClose={() => setCustomerForm(null)} />
      )}
      {pass && <PassModal key={pass.key} {...pass.target} onClose={() => setPass(null)} />}
      {status && <StatusChangeModal key={status.key} {...status.target} onClose={() => setStatus(null)} />}
    </AppModalsContext.Provider>
  )
}

export function useAppModals(): AppModalsApi {
  const ctx = useContext(AppModalsContext)
  if (!ctx) throw new Error('AppModalsProvider 안에서만 사용할 수 있습니다')
  return ctx
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  21 passed`, `Tests  82 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/renderer tests
git commit -m "feat: 메모 중심 수업 기록 창, 수강권 창, 상태 변경 창" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 홈 화면

**Files:**
- Create: `src/renderer/src/components/PinnedDot.tsx`, `src/renderer/src/components/home/StatsRow.tsx`, `src/renderer/src/components/home/TodayPanel.tsx`, `src/renderer/src/components/home/UnbookedPanel.tsx`, `src/renderer/src/components/home/CustomerTable.tsx`
- Modify: `src/renderer/src/pages/HomePage.tsx` (임시 버전을 아래 전체 내용으로 교체)
- Test: `tests/renderer/HomePage.test.tsx`

**Interfaces:**
- Consumes: `useHome()`, `useAppModals()`, Task 3 의 `filterCustomers`/`sortCustomers`, Task 1·2 의 표기 함수.
- Produces: `PinnedDot({ note })`(공통메모가 있으면 주황 점 + 마우스 올리면 내용) — Task 13 에서도 쓴다.
- 화면 (설계 5.2): 제목 "홈 · 9월 28일 (월)", `+ 예약`/`+ 새 고객` → 요약 숫자 4칸 → [오늘 수업 | 예약 없는 수강생] 2단 → 전체 고객 표(필터 수강중/휴강/종료·이동/전체, 검색, 열 제목 정렬, 행 클릭 → 상세). 오늘 수업의 기록 안 된 예약은 `수업 기록` 버튼(예약·날짜가 채워진 수업 기록 창), 지난 미기록이 있으면 빨간 줄 + `보기`(수업 기록/취소 목록). 마지막 수업 14일 이상이면 빨간색.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/renderer/HomePage.test.tsx`

```tsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomerSummary, HomeData } from '@shared/types'
import { HomePage } from '@renderer/pages/HomePage'
import { makeReservation } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

const summary = (over: Partial<CustomerSummary>): CustomerSummary => ({
  id: 'x',
  name: 'x',
  phone: null,
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
})

const home: HomeData = {
  today: '2026-09-28',
  stats: { active: 2, today: 2, unbooked: 1, passExhausted: 1 },
  todayReservations: [
    {
      reservation: makeReservation({ id: 'r1', customerId: 'minji', time: '13:00', status: 'done' }),
      customerName: '김민지',
      hasPinnedNote: true,
      lessonNumber: null,
      remainingPasses: 6
    },
    {
      reservation: makeReservation({ id: 'r2', customerId: 'seojun', time: '18:30' }),
      customerName: '박서준',
      hasPinnedNote: false,
      lessonNumber: 6,
      remainingPasses: -1
    }
  ],
  missedReservations: [],
  unbooked: [{ id: 'doyun', name: '최도윤', lastLessonDate: '2026-09-12' }],
  customers: [
    summary({ id: 'minji', name: '김민지', pinnedNote: '성대결절 이력', lastLessonDate: '2026-09-28', remainingPasses: 6 }),
    summary({ id: 'seojun', name: '박서준', lastLessonDate: '2026-09-25', remainingPasses: -1 }),
    summary({ id: 'yuna', name: '정유나', status: 'paused' })
  ]
}

describe('HomePage', () => {
  it('오늘 수업, 예약 없는 수강생, 수강중 고객 표를 보여준다', async () => {
    mockApi({ 'home.get': () => home })
    renderWithProviders(<HomePage />)
    expect(await screen.findByText('오늘 수업 2')).toBeInTheDocument()
    expect(screen.getByText('✓ 기록됨')).toBeInTheDocument()
    expect(screen.getByText('6회차')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '수업 기록' })).toBeInTheDocument()
    expect(screen.getByText('마지막 수업 16일 전')).toBeInTheDocument()
    expect(screen.getByText('-1회')).toBeInTheDocument()
    expect(screen.queryByText('정유나')).not.toBeInTheDocument()
  })

  it('필터를 "전체"로 바꾸면 휴강 고객도 보인다', async () => {
    const user = userEvent.setup()
    mockApi({ 'home.get': () => home })
    renderWithProviders(<HomePage />)
    await user.click(await screen.findByText('전체'))
    expect(screen.getByText('정유나')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/renderer/HomePage.test.tsx`
Expected: FAIL — `Unable to find an element with the text: 오늘 수업 2` (임시 HomePage 는 제목만 있다).

- [ ] **Step 3: 구현**

`src/renderer/src/components/PinnedDot.tsx`

```tsx
import { Text, Tooltip } from '@mantine/core'

/** 공통메모가 있으면 주황 점. 마우스를 올리면 내용을 보여준다 */
export function PinnedDot({ note }: { note: string }): React.JSX.Element | null {
  if (!note.trim()) return null
  return (
    <Tooltip label={<Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>{note}</Text>} multiline maw={320} withArrow>
      <Text span c="orange" ml={4} aria-label="공통메모 있음">
        ●
      </Text>
    </Tooltip>
  )
}
```

`src/renderer/src/components/home/StatsRow.tsx`

```tsx
import { Paper, SimpleGrid, Text } from '@mantine/core'
import type { HomeData } from '@shared/types'

export function StatsRow({ stats }: { stats: HomeData['stats'] }): React.JSX.Element {
  const items = [
    { label: '수강중', value: stats.active, color: undefined },
    { label: '오늘 수업', value: stats.today, color: 'blue' },
    { label: '예약 없음', value: stats.unbooked, color: stats.unbooked > 0 ? 'red' : undefined },
    { label: '수강권 소진', value: stats.passExhausted, color: stats.passExhausted > 0 ? 'red' : undefined }
  ]
  return (
    <SimpleGrid cols={4} spacing="sm">
      {items.map((item) => (
        <Paper key={item.label} withBorder p="sm">
          <Text fz={24} fw={700} c={item.color}>
            {item.value}
          </Text>
          <Text size="xs" c="dimmed">
            {item.label}
          </Text>
        </Paper>
      ))}
    </SimpleGrid>
  )
}
```

`src/renderer/src/components/home/TodayPanel.tsx`

```tsx
import { useState } from 'react'
import { Alert, Anchor, Badge, Button, Group, Modal, Paper, Stack, Text } from '@mantine/core'
import { useNavigate } from 'react-router'
import type { ReservationWithCustomer } from '@shared/types'
import { formatMonthDay } from '@shared/domain/dates'
import { isPassExhausted } from '@shared/domain/passes'
import { useApiMutation } from '../../api/hooks'
import { confirm } from '../../lib/confirm'
import { useAppModals } from '../../modals/AppModals'
import { PinnedDot } from '../PinnedDot'

interface Props {
  today: ReservationWithCustomer[]
  missed: ReservationWithCustomer[]
  pinnedNotes: Map<string, string>
}

export function TodayPanel({ today, missed, pinnedNotes }: Props): React.JSX.Element {
  const [showMissed, setShowMissed] = useState(false)
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <Text fw={700}>오늘 수업 {today.length}</Text>
        <Text size="xs" c="dimmed">
          시간순
        </Text>
      </Group>
      {today.length === 0 ? (
        <Text size="sm" c="dimmed" py="sm">
          오늘 예약이 없습니다.
        </Text>
      ) : (
        <Stack gap={0}>
          {today.map((item) => (
            <ReservationRow key={item.reservation.id} item={item} note={pinnedNotes.get(item.reservation.customerId) ?? ''} />
          ))}
        </Stack>
      )}
      {missed.length > 0 && (
        <Alert color="red" variant="light" mt="sm" p="xs">
          <Group justify="space-between">
            <Text size="sm">
              ⚠ 지난 예약 중 기록 안 된 수업 {missed.length}건 ({missed.map((m) => `${formatMonthDay(m.reservation.date)} ${m.customerName}`).slice(0, 2).join(', ')}
              {missed.length > 2 ? ' 외' : ''})
            </Text>
            <Anchor size="sm" c="red" onClick={() => setShowMissed(true)}>
              보기
            </Anchor>
          </Group>
        </Alert>
      )}
      {showMissed && <MissedModal missed={missed} onClose={() => setShowMissed(false)} />}
    </Paper>
  )
}

function ReservationRow({ item, note }: { item: ReservationWithCustomer; note: string }): React.JSX.Element {
  const navigate = useNavigate()
  const { openLesson } = useAppModals()
  const r = item.reservation
  return (
    <Group gap="sm" py={8} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }} wrap="nowrap">
      <Text fw={700} w={48} ff="monospace" size="sm">
        {r.time}
      </Text>
      <Group gap={6} style={{ flex: 1 }} wrap="nowrap">
        <Anchor fw={600} c="dark" onClick={() => void navigate(`/customers/${r.customerId}`)}>
          {item.customerName}
        </Anchor>
        <PinnedDot note={note} />
        {item.lessonNumber !== null && (
          <Text size="xs" c="dimmed">
            {item.lessonNumber}회차
          </Text>
        )}
        {isPassExhausted(item.remainingPasses) && (
          <Text size="xs" c="red" fw={600}>
            수강권 {item.remainingPasses}
          </Text>
        )}
      </Group>
      {r.status === 'done' ? (
        <Badge color="teal" variant="light">
          ✓ 기록됨
        </Badge>
      ) : (
        <Button size="compact-sm" onClick={() => openLesson({ customerId: r.customerId, reservationId: r.id, date: r.date })}>
          수업 기록
        </Button>
      )}
    </Group>
  )
}

function MissedModal({ missed, onClose }: { missed: ReservationWithCustomer[]; onClose: () => void }): React.JSX.Element {
  const { openLesson } = useAppModals()
  const cancel = useApiMutation('reservations.cancel')
  const handleCancel = async (item: ReservationWithCustomer): Promise<void> => {
    const ok = await confirm({
      title: '예약 취소',
      message: `${formatMonthDay(item.reservation.date)} ${item.reservation.time} ${item.customerName} 예약을 취소할까요?`,
      confirmLabel: '예약 취소',
      danger: true
    })
    if (ok) cancel.mutate([item.reservation.id])
  }
  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>기록 안 된 지난 예약</Text>} size="lg">
      <Stack gap={0}>
        {missed.length === 0 && <Text c="dimmed">모두 정리했습니다.</Text>}
        {missed.map((item) => (
          <Group key={item.reservation.id} py={8} justify="space-between" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Text size="sm">
              <Text span fw={700} ff="monospace">
                {formatMonthDay(item.reservation.date)} {item.reservation.time}
              </Text>{' '}
              {item.customerName}
            </Text>
            <Group gap="xs">
              <Button
                size="compact-sm"
                onClick={() => {
                  onClose()
                  openLesson({ customerId: item.reservation.customerId, reservationId: item.reservation.id, date: item.reservation.date })
                }}
              >
                수업 기록
              </Button>
              <Button size="compact-sm" variant="default" onClick={() => void handleCancel(item)}>
                취소
              </Button>
            </Group>
          </Group>
        ))}
      </Stack>
    </Modal>
  )
}
```

`src/renderer/src/components/home/UnbookedPanel.tsx`

```tsx
import { Anchor, Button, Group, Paper, ScrollArea, Stack, Text } from '@mantine/core'
import { useNavigate } from 'react-router'
import type { HomeData } from '@shared/types'
import { daysBetween, relativeDays } from '@shared/domain/dates'
import { useAppModals } from '../../modals/AppModals'

export function UnbookedPanel({ unbooked, today }: { unbooked: HomeData['unbooked']; today: string }): React.JSX.Element {
  const navigate = useNavigate()
  const { openReservation } = useAppModals()
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <Text fw={700}>예약 없는 수강생 {unbooked.length}</Text>
        <Text size="xs" c="dimmed">
          마지막 수업 오래된 순
        </Text>
      </Group>
      {unbooked.length === 0 ? (
        <Text size="sm" c="dimmed" py="sm">
          모든 수강생이 예약되어 있습니다.
        </Text>
      ) : (
        <ScrollArea.Autosize mah={260}>
          <Stack gap={0}>
            {unbooked.map((u) => {
              const old = u.lastLessonDate !== null && daysBetween(u.lastLessonDate, today) >= 14
              return (
                <Group key={u.id} py={8} gap="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }} wrap="nowrap">
                  <Anchor fw={600} c="dark" style={{ flex: 1 }} onClick={() => void navigate(`/customers/${u.id}`)}>
                    {u.name}
                  </Anchor>
                  <Text size="xs" c={old ? 'red' : 'dimmed'} fw={old ? 600 : undefined}>
                    {u.lastLessonDate ? `마지막 수업 ${relativeDays(u.lastLessonDate, today)}` : '수업 기록 없음'}
                  </Text>
                  <Button size="compact-sm" variant="light" onClick={() => openReservation({ customerId: u.id })}>
                    예약
                  </Button>
                </Group>
              )
            })}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Paper>
  )
}
```

`src/renderer/src/components/home/CustomerTable.tsx`

```tsx
import { useMemo, useState } from 'react'
import { Group, Paper, Progress, SegmentedControl, Table, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronUp, IconSearch } from '@tabler/icons-react'
import { useNavigate } from 'react-router'
import type { CustomerSummary } from '@shared/types'
import { filterCustomers, sortCustomers, type SortDir, type SortKey, type StatusFilter } from '@shared/domain/customerList'
import { daysBetween, formatMonthDay, relativeDays } from '@shared/domain/dates'
import { PURPOSE_LABEL } from '@shared/domain/labels'
import { formatRemaining, isPassExhausted } from '@shared/domain/passes'
import { PinnedDot } from '../PinnedDot'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: '이름' },
  { key: 'purpose', label: '목적' },
  { key: 'goals', label: '목표 진행' },
  { key: 'lastLesson', label: '최근 수업' },
  { key: 'nextReservation', label: '다음 예약' },
  { key: 'lessonCount', label: '회차' },
  { key: 'remaining', label: '남은 수강권' }
]

export function CustomerTable({ customers, today }: { customers: CustomerSummary[]; today: string }): React.JSX.Element {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<StatusFilter>('active')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })

  const rows = useMemo(
    () => sortCustomers(filterCustomers(customers, filter, query), sort.key, sort.dir),
    [customers, filter, query, sort]
  )

  const toggleSort = (key: SortKey): void =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  return (
    <Paper withBorder p="md">
      <Group mb="sm" gap="sm">
        <Text fw={700} mr="xs">
          전체 고객
        </Text>
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
      <Table highlightOnHover verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            {COLUMNS.map((col) => (
              <Table.Th key={col.key}>
                <UnstyledButton onClick={() => toggleSort(col.key)}>
                  <Group gap={2} wrap="nowrap">
                    <Text size="xs" c="dimmed" fw={500}>
                      {col.label}
                    </Text>
                    {sort.key === col.key &&
                      (sort.dir === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />)}
                  </Group>
                </UnstyledButton>
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={COLUMNS.length}>
                <Text c="dimmed" size="sm" ta="center" py="md">
                  해당하는 고객이 없습니다.
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
          {rows.map((c) => {
            const stale = c.lastLessonDate !== null && daysBetween(c.lastLessonDate, today) >= 14
            return (
              <Table.Tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => void navigate(`/customers/${c.id}`)}>
                <Table.Td>
                  <Text span fw={600}>
                    {c.name}
                  </Text>
                  <PinnedDot note={c.pinnedNote} />
                </Table.Td>
                <Table.Td>{c.purpose ? PURPOSE_LABEL[c.purpose] : '–'}</Table.Td>
                <Table.Td>
                  {c.goalsTotal === 0 ? (
                    <Text size="xs" c="dimmed">
                      –
                    </Text>
                  ) : (
                    <Group gap={6} wrap="nowrap">
                      <Progress value={(c.goalsDone / c.goalsTotal) * 100} w={70} size="sm" />
                      <Text size="xs" c="dimmed">
                        {c.goalsDone}/{c.goalsTotal}
                      </Text>
                    </Group>
                  )}
                </Table.Td>
                <Table.Td c={stale ? 'red' : undefined}>
                  {c.lastLessonDate ? relativeDays(c.lastLessonDate, today) : '–'}
                </Table.Td>
                <Table.Td>
                  {c.nextReservation ? (
                    `${c.nextReservation.date === today ? '오늘' : formatMonthDay(c.nextReservation.date)} ${c.nextReservation.time}`
                  ) : c.status === 'active' ? (
                    <Text size="xs" c="red" fw={600}>
                      예약 없음
                    </Text>
                  ) : (
                    '–'
                  )}
                </Table.Td>
                <Table.Td>{c.lessonCount > 0 ? `${c.lessonCount}회차` : '–'}</Table.Td>
                <Table.Td c={isPassExhausted(c.remainingPasses) ? 'red' : undefined} fw={isPassExhausted(c.remainingPasses) ? 600 : undefined}>
                  {formatRemaining(c.remainingPasses)}
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Paper>
  )
}
```

`src/renderer/src/pages/HomePage.tsx`

```tsx
import { Button, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { formatKoreanDate } from '@shared/domain/dates'
import { useHome } from '../api/hooks'
import { CustomerTable } from '../components/home/CustomerTable'
import { StatsRow } from '../components/home/StatsRow'
import { TodayPanel } from '../components/home/TodayPanel'
import { UnbookedPanel } from '../components/home/UnbookedPanel'
import { useAppModals } from '../modals/AppModals'

export function HomePage(): React.JSX.Element {
  const home = useHome()
  const { openReservation, openCustomerForm } = useAppModals()
  if (!home.data) {
    return (
      <Center h={300}>
        <Loader />
      </Center>
    )
  }
  const data = home.data
  const pinnedNotes = new Map(data.customers.map((c) => [c.id, c.pinnedNote]))
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="xs" align="baseline">
          <Title order={2}>홈</Title>
          <Text c="dimmed">{formatKoreanDate(data.today)}</Text>
        </Group>
        <Group gap="xs">
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => openReservation()}>
            예약
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => openCustomerForm()}>
            새 고객
          </Button>
        </Group>
      </Group>
      <StatsRow stats={data.stats} />
      <SimpleGrid cols={2} spacing="md">
        <TodayPanel today={data.todayReservations} missed={data.missedReservations} pinnedNotes={pinnedNotes} />
        <UnbookedPanel unbooked={data.unbooked} today={data.today} />
      </SimpleGrid>
      <CustomerTable customers={data.customers} today={data.today} />
    </Stack>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  22 passed`, `Tests  84 passed`.

- [ ] **Step 5: 타입 검사·실행 확인**

Run: `npm run typecheck`
Expected: 오류 없음.

Run: `npm run dev` → `+ 새 고객`으로 고객 2명 등록(저장하면 임시 상세 화면 "고객 상세"로 이동, 메뉴 "홈"으로 복귀) → `+ 예약`으로 한 명을 오늘 날짜로 예약.
Expected: 요약 "수강중 2 · 오늘 수업 1 · 예약 없음 1", 오늘 수업 패널에 시간·이름·`1회차`·`수업 기록` 버튼, 예약 없는 수강생에 나머지 1명("수업 기록 없음"). `수업 기록` → 메모 입력 → `Ctrl+Enter` → "✓ 기록됨".

- [ ] **Step 6: 커밋**

```bash
git add src/renderer tests
git commit -m "feat: 홈 화면 (오늘 수업, 예약 없는 수강생, 전체 고객 표)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 고객 상세 화면 (2단)

**Files:**
- Create: `src/renderer/src/components/customer/Section.tsx`, `InfoSection.tsx`, `PinnedNoteSection.tsx`, `GoalsSection.tsx`, `PassesSection.tsx`, `Timeline.tsx` (모두 `src/renderer/src/components/customer/`)
- Modify: `src/renderer/src/pages/CustomerDetailPage.tsx` (임시 버전을 아래 전체 내용으로 교체)
- Test: `tests/renderer/CustomerDetailPage.test.tsx`

**Interfaces:**
- Consumes: `useCustomerDetail(id)`, `useApiMutation`, `useAppModals()`, `statusLogText`, `formatRemaining`, `ageOn`, `formatPhone`.
- 화면 (설계 5.3): 상단 `← 홈` · 이름 · 상태 배지 메뉴(현재 상태에서 가능한 변경만: 수강중 → 휴강/종료/타지점 이동, 휴강 → 재등록/종료/이동, 종료·이동 → 재등록) · `정보 수정` `+ 예약` `+ 수업 기록`. 왼쪽 310px 고정 영역: 공통 고객정보 / 📌 공통메모(노란 박스, 바로 수정) / 목표(진행 막대, 체크, `+ 추가` 후 Enter, 메뉴: 이름 수정·삭제) / 수강권(남은 횟수, 총 구매, 최근 1건, `+ 구매 추가`, `내역 보기` 펼침 — Mantine 9 `Collapse` 는 `expanded` prop). 오른쪽: 다음 예약(변경/취소 또는 예약하기) + 타임라인(회차 카드: 메모가 가장 크게, 연습·과제 작은 글씨, 완료 목표 배지, 메뉴 수정·삭제 / 상태 이력은 가운데 구분선 `날짜 · 문구`).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/renderer/CustomerDetailPage.test.tsx`

```tsx
import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomerDetail } from '@shared/types'
import { buildTimeline, numberLessons } from '@shared/domain/lessons'
import { CustomerDetailPage } from '@renderer/pages/CustomerDetailPage'
import { makeCustomer, makeLesson, makeStatusLog } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

const lessons = numberLessons([
  makeLesson({ id: 'l1', lessonDate: '2026-09-21', memo: '감기 기운, 저음 위주', homework: '립트릴 5분' })
])
const detail: CustomerDetail = {
  customer: makeCustomer({ id: 'c1', name: '김민지', pinnedNote: '성대결절 이력', purpose: 'exam' }),
  goals: [
    { id: 'g1', customerId: 'c1', title: '두성 연결', doneAt: '2026-09-21', completedLessonId: 'l1', createdAt: '', updatedAt: '' },
    { id: 'g2', customerId: 'c1', title: '믹스보이스', doneAt: null, completedLessonId: null, createdAt: '', updatedAt: '' }
  ],
  lessons,
  timeline: buildTimeline(lessons, [makeStatusLog({ id: 's1', date: '2026-03-02' })]),
  passes: [],
  totalPassCount: 0,
  remainingPasses: null,
  nextReservation: null
}

describe('CustomerDetailPage', () => {
  it('공통메모, 회차 기록(메모), 완료 목표, 상태 이력을 보여준다', async () => {
    mockApi({ 'customers.detail': () => detail })
    renderWithProviders(<CustomerDetailPage />, { route: '/customers/c1', path: '/customers/:id' })
    expect(await screen.findByRole('heading', { name: '김민지' })).toBeInTheDocument()
    expect(screen.getByText('성대결절 이력')).toBeInTheDocument()
    expect(screen.getByText('1회차 · 2026-09-21 (월)')).toBeInTheDocument()
    expect(screen.getByText('감기 기운, 저음 위주')).toBeInTheDocument()
    expect(screen.getByText('과제 · 립트릴 5분')).toBeInTheDocument()
    expect(screen.getByText('✓ 목표 완료: 두성 연결')).toBeInTheDocument()
    expect(screen.getByText('2026-03-02 · 수강 시작')).toBeInTheDocument()
    expect(screen.getByText('다음 예약 없음')).toBeInTheDocument()
  })

  it('목표를 체크하면 완료 처리를 요청한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({ 'customers.detail': () => detail })
    renderWithProviders(<CustomerDetailPage />, { route: '/customers/c1', path: '/customers/:id' })
    await user.click(await screen.findByRole('checkbox', { name: '믹스보이스' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('goals.setDone', 'g2', true))
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/renderer/CustomerDetailPage.test.tsx`
Expected: FAIL — `Unable to find role="heading" and name "김민지"`.

- [ ] **Step 3: 구현**

`src/renderer/src/components/customer/Section.tsx`

```tsx
import { Group, Text } from '@mantine/core'

export function Section({
  title,
  action,
  children
}: {
  title: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <Group justify="space-between" mb={6}>
        <Text size="xs" fw={700} c="dimmed">
          {title}
        </Text>
        {action}
      </Group>
      {children}
    </div>
  )
}
```

`src/renderer/src/components/customer/InfoSection.tsx`

```tsx
import { SimpleGrid, Text } from '@mantine/core'
import type { Customer } from '@shared/types'
import { ageOn } from '@shared/domain/dates'
import { GENDER_LABEL, PURPOSE_LABEL } from '@shared/domain/labels'
import { formatPhone } from '@shared/domain/phone'
import { Section } from './Section'

export function InfoSection({ customer, today }: { customer: Customer; today: string }): React.JSX.Element {
  const birth = customer.birthDate
    ? `${customer.birthDate.replaceAll('-', '.')} (${ageOn(customer.birthDate, today)}세)`
    : null
  const rows: [string, string | null][] = [
    ['연락처', customer.phone ? formatPhone(customer.phone) : null],
    ['생년월일', [birth, customer.gender ? GENDER_LABEL[customer.gender] : null].filter(Boolean).join(' · ') || null],
    ['목적', customer.purpose ? PURPOSE_LABEL[customer.purpose] : null],
    ['등록일', customer.registeredAt],
    ['음역대', customer.vocalRange],
    ['선호/목표곡', customer.preferredMusic]
  ]
  if (customer.status === 'paused' && customer.pauseUntil) rows.push(['휴강 종료', customer.pauseUntil])
  return (
    <Section title="공통 고객정보">
      <SimpleGrid cols={2} spacing={4} verticalSpacing={4} style={{ gridTemplateColumns: '72px 1fr' }}>
        {rows.map(([label, value]) => [
          <Text key={`${label}-l`} size="sm" c="dimmed">
            {label}
          </Text>,
          <Text key={`${label}-v`} size="sm" c={value ? undefined : 'dimmed'}>
            {value ?? '–'}
          </Text>
        ])}
      </SimpleGrid>
    </Section>
  )
}
```

`src/renderer/src/components/customer/PinnedNoteSection.tsx`

```tsx
import { useState } from 'react'
import { Anchor, Button, Group, Paper, Text, Textarea } from '@mantine/core'
import { useApiMutation } from '../../api/hooks'
import { notifySuccess } from '../../lib/notify'
import { Section } from './Section'

export function PinnedNoteSection({ customerId, note }: { customerId: string; note: string }): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)
  const save = useApiMutation('customers.setPinnedNote')

  const submit = async (): Promise<void> => {
    try {
      await save.mutateAsync([customerId, draft])
    } catch {
      return
    }
    notifySuccess('공통메모를 저장했습니다.')
    setEditing(false)
  }

  return (
    <Section
      title="📌 공통메모"
      action={
        !editing && (
          <Anchor
            size="xs"
            onClick={() => {
              setDraft(note)
              setEditing(true)
            }}
          >
            수정
          </Anchor>
        )
      }
    >
      {editing ? (
        <>
          <Textarea autosize minRows={3} autoFocus value={draft} onChange={(e) => setDraft(e.currentTarget.value)} />
          <Group justify="flex-end" gap="xs" mt="xs">
            <Button size="compact-sm" variant="default" onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button size="compact-sm" onClick={() => void submit()} loading={save.isPending}>
              저장
            </Button>
          </Group>
        </>
      ) : (
        <Paper bg="yellow.0" withBorder p="sm" style={{ borderColor: 'var(--mantine-color-yellow-3)' }}>
          <Text size="sm" c={note ? 'yellow.9' : 'dimmed'} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {note || '공통메모가 없습니다.'}
          </Text>
        </Paper>
      )}
    </Section>
  )
}
```

`src/renderer/src/components/customer/GoalsSection.tsx`

```tsx
import { useState } from 'react'
import { ActionIcon, Anchor, Checkbox, Group, Menu, Progress, Stack, Text, TextInput } from '@mantine/core'
import { IconDots } from '@tabler/icons-react'
import type { Goal } from '@shared/types'
import { useApiMutation } from '../../api/hooks'
import { confirm } from '../../lib/confirm'
import { Section } from './Section'

export function GoalsSection({ customerId, goals }: { customerId: string; goals: Goal[] }): React.JSX.Element {
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const add = useApiMutation('goals.add')
  const setDone = useApiMutation('goals.setDone')
  const rename = useApiMutation('goals.rename')
  const remove = useApiMutation('goals.remove')
  const done = goals.filter((g) => g.doneAt !== null).length

  const submitNew = async (): Promise<void> => {
    if (!newTitle.trim()) return
    try {
      await add.mutateAsync([customerId, newTitle])
    } catch {
      return
    }
    setNewTitle('')
  }

  const submitRename = async (): Promise<void> => {
    if (!editingId) return
    try {
      await rename.mutateAsync([editingId, editTitle])
    } catch {
      return
    }
    setEditingId(null)
  }

  const handleRemove = async (goal: Goal): Promise<void> => {
    const ok = await confirm({ title: '목표 삭제', message: `"${goal.title}" 목표를 삭제할까요?`, confirmLabel: '삭제', danger: true })
    if (ok) remove.mutate([goal.id])
  }

  return (
    <Section
      title={`목표 ${done}/${goals.length}`}
      action={
        <Anchor size="xs" onClick={() => setAdding(true)}>
          + 추가
        </Anchor>
      }
    >
      {goals.length > 0 && <Progress value={(done / goals.length) * 100} size="sm" mb="xs" />}
      <Stack gap={6}>
        {goals.map((g) =>
          editingId === g.id ? (
            <TextInput
              key={g.id}
              size="xs"
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRename()
                if (e.key === 'Escape') setEditingId(null)
              }}
              onBlur={() => setEditingId(null)}
            />
          ) : (
            <Group key={g.id} justify="space-between" wrap="nowrap" gap={4}>
              <Checkbox
                size="xs"
                checked={g.doneAt !== null}
                onChange={(e) => setDone.mutate([g.id, e.currentTarget.checked])}
                label={
                  <Text size="sm" td={g.doneAt ? 'line-through' : undefined} c={g.doneAt ? 'dimmed' : undefined}>
                    {g.title}
                  </Text>
                }
              />
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label="목표 메뉴">
                    <IconDots size={14} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    onClick={() => {
                      setEditTitle(g.title)
                      setEditingId(g.id)
                    }}
                  >
                    이름 수정
                  </Menu.Item>
                  <Menu.Item color="red" onClick={() => void handleRemove(g)}>
                    삭제
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          )
        )}
        {(adding || goals.length === 0) && (
          <TextInput
            size="xs"
            placeholder="목표 입력 후 Enter (예: 믹스보이스 안정화)"
            autoFocus={adding}
            value={newTitle}
            onChange={(e) => setNewTitle(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitNew()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
        )}
      </Stack>
    </Section>
  )
}
```

`src/renderer/src/components/customer/PassesSection.tsx`

```tsx
import { useState } from 'react'
import { ActionIcon, Anchor, Collapse, Group, Stack, Text } from '@mantine/core'
import { IconPencil, IconTrash } from '@tabler/icons-react'
import type { Pass } from '@shared/types'
import { formatRemaining, isPassExhausted } from '@shared/domain/passes'
import { useApiMutation } from '../../api/hooks'
import { confirm } from '../../lib/confirm'
import { useAppModals } from '../../modals/AppModals'
import { Section } from './Section'

interface Props {
  customerId: string
  passes: Pass[]
  totalPassCount: number
  remainingPasses: number | null
}

const won = (n: number): string => `${n.toLocaleString('ko-KR')}원`

export function PassesSection({ customerId, passes, totalPassCount, remainingPasses }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { openPass } = useAppModals()
  const remove = useApiMutation('passes.remove')
  const latest = passes[0]

  const handleRemove = async (p: Pass): Promise<void> => {
    const ok = await confirm({
      title: '수강권 기록 삭제',
      message: `${p.purchasedAt} ${p.count}회 구매 기록을 삭제할까요?`,
      confirmLabel: '삭제',
      danger: true
    })
    if (ok) remove.mutate([p.id])
  }

  return (
    <Section
      title="수강권"
      action={
        <Anchor size="xs" onClick={() => openPass({ customerId })}>
          + 구매 추가
        </Anchor>
      }
    >
      <Group gap={6} align="baseline">
        <Text fz={22} fw={700} c={isPassExhausted(remainingPasses) ? 'red' : undefined}>
          {formatRemaining(remainingPasses)}
        </Text>
        <Text size="sm" c="dimmed">
          {remainingPasses === null ? '구매 기록 없음' : `남음 · 총 ${totalPassCount}회 구매`}
        </Text>
      </Group>
      {latest && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            최근 {latest.purchasedAt} · {latest.count}회{latest.amount !== null ? ` · ${won(latest.amount)}` : ''}
          </Text>
          <Anchor size="xs" onClick={() => setOpen((o) => !o)}>
            {open ? '접기' : '내역 보기'}
          </Anchor>
        </Group>
      )}
      <Collapse expanded={open}>
        <Stack gap={4} mt="xs">
          {passes.map((p) => (
            <Group key={p.id} justify="space-between" wrap="nowrap">
              <Text size="xs">
                {p.purchasedAt} · {p.count}회{p.amount !== null ? ` · ${won(p.amount)}` : ''}
                {p.note ? ` · ${p.note}` : ''}
              </Text>
              <Group gap={2} wrap="nowrap">
                <ActionIcon size="sm" variant="subtle" color="gray" aria-label="수정" onClick={() => openPass({ customerId, pass: p })}>
                  <IconPencil size={14} />
                </ActionIcon>
                <ActionIcon size="sm" variant="subtle" color="red" aria-label="삭제" onClick={() => void handleRemove(p)}>
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
      </Collapse>
    </Section>
  )
}
```

`src/renderer/src/components/customer/Timeline.tsx`

```tsx
import { ActionIcon, Badge, Divider, Group, Menu, Paper, Stack, Text } from '@mantine/core'
import { IconDots } from '@tabler/icons-react'
import type { Goal, NumberedLesson, TimelineEntry } from '@shared/types'
import { formatFullDate } from '@shared/domain/dates'
import { statusLogText } from '@shared/domain/labels'
import { useApiMutation } from '../../api/hooks'
import { confirm } from '../../lib/confirm'
import { useAppModals } from '../../modals/AppModals'

export function Timeline({ timeline, goals }: { timeline: TimelineEntry[]; goals: Goal[] }): React.JSX.Element {
  if (!timeline.some((e) => e.kind === 'lesson')) {
    return (
      <Stack>
        <Text c="dimmed" size="sm" ta="center" py="xl">
          아직 수업 기록이 없습니다. ‘+ 수업 기록’으로 첫 수업을 남겨 보세요.
        </Text>
        {timeline.map((e) =>
          e.kind === 'status' ? <StatusLine key={e.statusLog.id} date={e.date} text={statusLogText(e.statusLog)} /> : null
        )}
      </Stack>
    )
  }
  return (
    <Stack gap="sm">
      {timeline.map((e) =>
        e.kind === 'lesson' ? (
          <LessonCard key={e.lesson.id} lesson={e.lesson} goals={goals.filter((g) => g.completedLessonId === e.lesson.id)} />
        ) : (
          <StatusLine key={e.statusLog.id} date={e.date} text={statusLogText(e.statusLog)} />
        )
      )}
    </Stack>
  )
}

function StatusLine({ date, text }: { date: string; text: string }): React.JSX.Element {
  return <Divider label={`${date} · ${text}`} labelPosition="center" my={4} />
}

function LessonCard({ lesson, goals }: { lesson: NumberedLesson; goals: Goal[] }): React.JSX.Element {
  const { openLesson } = useAppModals()
  const remove = useApiMutation('lessons.remove')

  const handleRemove = async (): Promise<void> => {
    const ok = await confirm({
      title: '수업 기록 삭제',
      message: `${lesson.number}회차 (${lesson.lessonDate}) 기록을 삭제할까요?`,
      confirmLabel: '삭제',
      danger: true
    })
    if (ok) remove.mutate([lesson.id])
  }

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb={6}>
        <Text fw={700}>
          {lesson.number}회차 · {formatFullDate(lesson.lessonDate)}
        </Text>
        <Group gap={4}>
          {lesson.deductPass && (
            <Text size="xs" c="dimmed">
              수강권 차감
            </Text>
          )}
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label="수업 기록 메뉴">
                <IconDots size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => openLesson({ customerId: lesson.customerId, lessonId: lesson.id })}>수정</Menu.Item>
              <Menu.Item color="red" onClick={() => void handleRemove()}>
                삭제
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }} c={lesson.memo ? undefined : 'dimmed'}>
        {lesson.memo || '메모 없음'}
      </Text>
      {(lesson.practice || lesson.homework) && (
        <Stack gap={2} mt="xs">
          {lesson.practice && (
            <Text size="xs" c="dimmed">
              연습 · {lesson.practice}
            </Text>
          )}
          {lesson.homework && (
            <Text size="xs" c="dimmed">
              과제 · {lesson.homework}
            </Text>
          )}
        </Stack>
      )}
      {goals.length > 0 && (
        <Group gap={4} mt="xs">
          {goals.map((g) => (
            <Badge key={g.id} variant="light" size="sm">
              ✓ 목표 완료: {g.title}
            </Badge>
          ))}
        </Group>
      )}
    </Paper>
  )
}
```

`src/renderer/src/pages/CustomerDetailPage.tsx`

```tsx
import { Anchor, Badge, Box, Button, Center, Group, Loader, Menu, Paper, Stack, Text, Title } from '@mantine/core'
import { IconChevronDown, IconChevronLeft, IconPlus } from '@tabler/icons-react'
import { Link, useParams } from 'react-router'
import type { CustomerDetail, CustomerStatus } from '@shared/types'
import { formatMonthDay } from '@shared/domain/dates'
import { STATUS_LABEL } from '@shared/domain/labels'
import { useApiMutation, useCustomerDetail } from '../api/hooks'
import { GoalsSection } from '../components/customer/GoalsSection'
import { InfoSection } from '../components/customer/InfoSection'
import { PassesSection } from '../components/customer/PassesSection'
import { PinnedNoteSection } from '../components/customer/PinnedNoteSection'
import { Timeline } from '../components/customer/Timeline'
import { confirm } from '../lib/confirm'
import { todayString } from '../lib/today'
import { useAppModals } from '../modals/AppModals'

const STATUS_COLOR: Record<CustomerStatus, string> = { active: 'teal', paused: 'orange', ended: 'gray', moved: 'gray' }

/** 현재 상태에서 바꿀 수 있는 상태 */
const NEXT_STATUSES: Record<CustomerStatus, CustomerStatus[]> = {
  active: ['paused', 'ended', 'moved'],
  paused: ['active', 'ended', 'moved'],
  ended: ['active'],
  moved: ['active']
}
const MENU_LABEL: Record<CustomerStatus, string> = {
  active: '수강중으로 (재등록)',
  paused: '휴강',
  ended: '종료',
  moved: '타지점 이동'
}

export function CustomerDetailPage(): React.JSX.Element {
  const { id } = useParams()
  const detail = useCustomerDetail(id)
  if (detail.isPending) {
    return (
      <Center h={300}>
        <Loader />
      </Center>
    )
  }
  if (!detail.data) {
    return (
      <Stack align="center" py="xl">
        <Text>고객을 찾을 수 없습니다.</Text>
        <Anchor component={Link} to="/">
          홈으로
        </Anchor>
      </Stack>
    )
  }
  return <DetailView detail={detail.data} />
}

function DetailView({ detail }: { detail: CustomerDetail }): React.JSX.Element {
  const { customer } = detail
  const today = todayString()
  const { openLesson, openReservation, openCustomerForm, openStatusChange } = useAppModals()
  const cancel = useApiMutation('reservations.cancel')
  const next = detail.nextReservation

  const cancelNext = async (): Promise<void> => {
    if (!next) return
    const ok = await confirm({
      title: '예약 취소',
      message: `${formatMonthDay(next.date)} ${next.time} 예약을 취소할까요?`,
      confirmLabel: '예약 취소',
      danger: true
    })
    if (ok) cancel.mutate([next.id])
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="sm">
          <Anchor component={Link} to="/" c="dimmed" size="sm">
            <Group gap={2}>
              <IconChevronLeft size={16} /> 홈
            </Group>
          </Anchor>
          <Title order={2}>{customer.name}</Title>
          <Menu position="bottom-start">
            <Menu.Target>
              <Badge
                component="button"
                size="lg"
                variant="light"
                color={STATUS_COLOR[customer.status]}
                rightSection={<IconChevronDown size={12} />}
                style={{ cursor: 'pointer' }}
              >
                {STATUS_LABEL[customer.status]}
              </Badge>
            </Menu.Target>
            <Menu.Dropdown>
              {NEXT_STATUSES[customer.status].map((s) => (
                <Menu.Item
                  key={s}
                  onClick={() => openStatusChange({ customer, toStatus: s, remainingPasses: detail.remainingPasses })}
                >
                  {MENU_LABEL[s]}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Group>
        <Group gap="xs">
          <Button variant="default" onClick={() => openCustomerForm({ customer })}>
            정보 수정
          </Button>
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => openReservation({ customerId: customer.id })}>
            예약
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => openLesson({ customerId: customer.id })}>
            수업 기록
          </Button>
        </Group>
      </Group>

      <Group align="flex-start" gap="md" wrap="nowrap">
        <Paper bg="gray.0" p="md" w={310} style={{ flexShrink: 0 }}>
          <Stack gap="lg">
            <InfoSection customer={customer} today={today} />
            <PinnedNoteSection key={customer.pinnedNote} customerId={customer.id} note={customer.pinnedNote} />
            <GoalsSection customerId={customer.id} goals={detail.goals} />
            <PassesSection
              customerId={customer.id}
              passes={detail.passes}
              totalPassCount={detail.totalPassCount}
              remainingPasses={detail.remainingPasses}
            />
          </Stack>
        </Paper>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Paper withBorder p="sm" mb="md" style={{ borderStyle: 'dashed', borderColor: 'var(--mantine-color-blue-4)' }}>
            {next ? (
              <Group justify="space-between">
                <Text c="blue" fw={600}>
                  다음 예약 · {next.date === today ? '오늘' : formatMonthDay(next.date)} {next.time}
                </Text>
                <Group gap="xs">
                  <Anchor size="sm" onClick={() => openReservation({ reservation: next })}>
                    변경
                  </Anchor>
                  <Anchor size="sm" c="red" onClick={() => void cancelNext()}>
                    취소
                  </Anchor>
                </Group>
              </Group>
            ) : (
              <Group justify="space-between">
                <Text c="dimmed">다음 예약 없음</Text>
                <Anchor size="sm" onClick={() => openReservation({ customerId: customer.id })}>
                  예약하기
                </Anchor>
              </Group>
            )}
          </Paper>
          <Timeline timeline={detail.timeline} goals={detail.goals} />
        </Box>
      </Group>
    </Stack>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  23 passed`, `Tests  86 passed`.

- [ ] **Step 5: 타입 검사·실행 확인**

Run: `npm run typecheck`
Expected: 오류 없음.

Run: `npm run dev` → 홈의 고객 행 클릭.
Expected: 2단 화면. 목표 3개 추가 후 하나 체크 → 막대 1/3. `+ 구매 추가` 10회 → "10회 남음 · 총 10회 구매" (이미 수업 1회를 차감 기록했다면 9회). `+ 수업 기록`에서 목표 칩 선택 후 저장 → 카드에 "✓ 목표 완료: …". 상태 배지 → 종료 → 이사 → `수강 종료` → 배지 "종료", 타임라인 맨 위 `날짜 · 수강 종료 (이사)`, 잡혀 있던 예약 취소 알림.

- [ ] **Step 6: 커밋**

```bash
git add src/renderer tests
git commit -m "feat: 고객 상세 화면 (공통정보·공통메모·목표·수강권·회차 기록)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 주간 일정 화면

**Files:**
- Modify: `src/renderer/src/pages/SchedulePage.tsx` (임시 버전을 아래 전체 내용으로 교체)
- Test: `tests/renderer/SchedulePage.test.tsx`

**Interfaces:**
- Consumes: `useReservationsRange(from, to)`, `useAppModals()`, `startOfWeek`, `addDays`, `formatMonthDay`.
- 화면 (설계 5.6): 제목 "일정", `지난주 / 이번 주 / 다음 주 / + 예약`, 가운데 "2026년 9월 28일 – 10월 4일", 월~일 7칸(오늘 칸 강조, 날짜 머리글 클릭 → 그 날짜로 예약). 예약 칩 색: 예정 파랑, 기록 완료 초록 테두리 + ✓, 지났는데 미기록 빨강, 취소 취소선. 칩 클릭 메뉴: 수업 기록·변경·취소(예정인 것만), 고객 보기. 아래 범례.
- 테스트는 `vi.useFakeTimers({ toFake: ['Date'] })` 로 오늘을 2026-09-30 으로 고정한다(userEvent 의 타이머는 그대로 둔다).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/renderer/SchedulePage.test.tsx`

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReservationWithCustomer } from '@shared/types'
import { SchedulePage } from '@renderer/pages/SchedulePage'
import { makeReservation } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

const item = (over: Parameters<typeof makeReservation>[0], name: string): ReservationWithCustomer => ({
  reservation: makeReservation(over),
  customerName: name,
  hasPinnedNote: false,
  lessonNumber: 1,
  remainingPasses: null
})

describe('SchedulePage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 30, 10, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('이번 주(월~일) 예약을 날짜 칸에 보여주고, 지난주로 이동한다', async () => {
    const user = userEvent.setup()
    const invoke = mockApi({
      'reservations.range': () => [
        item({ id: 'a', date: '2026-09-28', time: '13:00', status: 'done' }, '김민지'),
        item({ id: 'b', date: '2026-10-02', time: '16:00' }, '정유나')
      ]
    })
    renderWithProviders(<SchedulePage />)
    expect(await screen.findByText('2026년 9월 28일 – 10월 4일')).toBeInTheDocument()
    expect(invoke).toHaveBeenCalledWith('reservations.range', '2026-09-28', '2026-10-04')
    expect(await screen.findByText('정유나')).toBeInTheDocument()
    expect(screen.getByText('9/30 (수) · 오늘')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /지난주/ }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('reservations.range', '2026-09-21', '2026-09-27'))
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/renderer/SchedulePage.test.tsx`
Expected: FAIL — `Unable to find an element with the text: 2026년 9월 28일 – 10월 4일`.

- [ ] **Step 3: 구현**

`src/renderer/src/pages/SchedulePage.tsx`

```tsx
import { useState } from 'react'
import { Box, Button, Group, Menu, Paper, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react'
import { useNavigate } from 'react-router'
import type { ReservationWithCustomer } from '@shared/types'
import { addDays, formatMonthDay, startOfWeek } from '@shared/domain/dates'
import { useApiMutation, useReservationsRange } from '../api/hooks'
import { confirm } from '../lib/confirm'
import { todayString } from '../lib/today'
import { useAppModals } from '../modals/AppModals'

type Tone = 'scheduled' | 'done' | 'missed' | 'canceled'

const TONE_STYLE: Record<Tone, { bg: string; border: string; color?: string; strike?: boolean }> = {
  scheduled: { bg: 'var(--mantine-color-blue-0)', border: 'var(--mantine-color-blue-5)' },
  done: { bg: 'var(--mantine-color-gray-0)', border: 'var(--mantine-color-teal-5)', color: 'var(--mantine-color-dimmed)' },
  missed: { bg: 'var(--mantine-color-red-0)', border: 'var(--mantine-color-red-5)' },
  canceled: { bg: 'transparent', border: 'var(--mantine-color-gray-3)', color: 'var(--mantine-color-gray-5)', strike: true }
}

function toneOf(item: ReservationWithCustomer, today: string): Tone {
  const r = item.reservation
  if (r.status === 'done') return 'done'
  if (r.status === 'canceled') return 'canceled'
  return r.date < today ? 'missed' : 'scheduled'
}

function weekTitle(start: string): string {
  const end = addDays(start, 6)
  const [y, m, d] = start.split('-').map(Number)
  const [, m2, d2] = end.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일 – ${m2}월 ${d2}일`
}

export function SchedulePage(): React.JSX.Element {
  const today = todayString()
  const [weekStart, setWeekStart] = useState(startOfWeek(today))
  const weekEnd = addDays(weekStart, 6)
  const range = useReservationsRange(weekStart, weekEnd)
  const { openReservation } = useAppModals()
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>일정</Title>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconChevronLeft size={16} />} onClick={() => setWeekStart(addDays(weekStart, -7))}>
            지난주
          </Button>
          <Button variant="default" onClick={() => setWeekStart(startOfWeek(today))}>
            이번 주
          </Button>
          <Button variant="default" rightSection={<IconChevronRight size={16} />} onClick={() => setWeekStart(addDays(weekStart, 7))}>
            다음 주
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => openReservation()}>
            예약
          </Button>
        </Group>
      </Group>
      <Text fw={700} ta="center">
        {weekTitle(weekStart)}
      </Text>
      <Paper withBorder style={{ overflow: 'hidden' }}>
        <SimpleGrid cols={7} spacing={0}>
          {days.map((day) => (
            <Box key={day} style={{ borderRight: '1px solid var(--mantine-color-gray-2)', minHeight: 360 }}>
              <UnstyledButton
                w="100%"
                py={6}
                bg={day === today ? 'blue.0' : undefined}
                style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', textAlign: 'center' }}
                onClick={() => openReservation({ date: day })}
                title="이 날짜로 예약"
              >
                <Text size="sm" fw={day === today ? 700 : 500} c={day === today ? 'blue' : 'dimmed'}>
                  {formatMonthDay(day)}
                  {day === today ? ' · 오늘' : ''}
                </Text>
              </UnstyledButton>
              <Stack gap={4} p={4}>
                {(range.data ?? [])
                  .filter((item) => item.reservation.date === day)
                  .map((item) => (
                    <ReservationChip key={item.reservation.id} item={item} tone={toneOf(item, today)} />
                  ))}
              </Stack>
            </Box>
          ))}
        </SimpleGrid>
        <Group gap="lg" px="md" py="xs" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
          {(
            [
              ['scheduled', '예정'],
              ['done', '기록 완료'],
              ['missed', '지났는데 기록 안 됨'],
              ['canceled', '취소']
            ] as [Tone, string][]
          ).map(([tone, label]) => (
            <Group key={tone} gap={6}>
              <Box w={10} h={10} style={{ borderRadius: 2, background: TONE_STYLE[tone].border }} />
              <Text size="xs" c="dimmed">
                {label}
              </Text>
            </Group>
          ))}
          <Text size="xs" c="dimmed" ml="auto">
            예약을 누르면 수업 기록 / 변경 / 취소
          </Text>
        </Group>
      </Paper>
    </Stack>
  )
}

function ReservationChip({ item, tone }: { item: ReservationWithCustomer; tone: Tone }): React.JSX.Element {
  const navigate = useNavigate()
  const { openLesson, openReservation } = useAppModals()
  const cancel = useApiMutation('reservations.cancel')
  const r = item.reservation
  const style = TONE_STYLE[tone]
  const open = r.status === 'scheduled'

  const handleCancel = async (): Promise<void> => {
    const ok = await confirm({
      title: '예약 취소',
      message: `${formatMonthDay(r.date)} ${r.time} ${item.customerName} 예약을 취소할까요?`,
      confirmLabel: '예약 취소',
      danger: true
    })
    if (ok) cancel.mutate([r.id])
  }

  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <UnstyledButton
          px={6}
          py={4}
          style={{
            background: style.bg,
            borderLeft: `3px solid ${style.border}`,
            borderRadius: 6,
            color: style.color,
            textDecoration: style.strike ? 'line-through' : undefined
          }}
        >
          <Text size="xs" inherit>
            <Text span fw={700} ff="monospace" inherit>
              {r.time}
            </Text>{' '}
            {item.customerName}
            {r.status === 'done' ? ' ✓' : ''}
          </Text>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {open && (
          <Menu.Item onClick={() => openLesson({ customerId: r.customerId, reservationId: r.id, date: r.date })}>
            수업 기록
          </Menu.Item>
        )}
        {open && <Menu.Item onClick={() => openReservation({ reservation: r })}>변경</Menu.Item>}
        {open && (
          <Menu.Item color="red" onClick={() => void handleCancel()}>
            취소
          </Menu.Item>
        )}
        <Menu.Item onClick={() => void navigate(`/customers/${r.customerId}`)}>고객 보기</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  24 passed`, `Tests  87 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/renderer tests
git commit -m "feat: 주간 일정 화면" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: 전체 확인

**Files:** 없음 (확인만. 문제가 나오면 해당 Task 의 파일을 고치고 그 Task 의 테스트부터 다시 돌린다)

- [ ] **Step 1: 자동 검사**

Run: `npm test && npm run build`
Expected: `Test Files  24 passed`, `Tests  87 passed`; typecheck 오류 없음; `✓ built in …` 3번.

- [ ] **Step 2: 개발 데이터 초기화 후 실제 사용 흐름 확인**

Run: `rm -rf "$HOME/Library/Application Support/VOCAL_CRM-dev" && npm run dev`

아래를 차례로 확인하고, 어긋나는 항목이 있으면 멈추고 보고한다.

1. 시작 화면에서 `강남점` 입력 → 홈. 왼쪽 메뉴에 "강남점".
2. `+ 새 고객`: 이름 없이 저장 → "이름을 입력해 주세요.". 연락처 `01012345678` 입력 → `010-1234-5678` 로 보임. 공통메모 입력 후 저장 → 상세 화면, 노란 공통메모.
3. 목표 2개 추가·1개 체크, `+ 구매 추가` 10회 → "10회 남음".
4. `+ 예약`: 오늘 15:00 저장. 다른 고객을 등록해 오늘 15:30 예약 → 빨간 안내 "15:00 … 예약과 겹칩니다" → 저장 → 확인 창 → `그래도 저장`.
5. 홈: 오늘 수업 2건. 첫 고객 `수업 기록` → 커서가 메모 칸, 메모 입력, 목표 칩 선택, `Ctrl+Enter`(Mac 은 `Cmd+Enter`) → "✓ 기록됨", 전체 고객 표의 남은 수강권 9회·회차 1회차.
6. 수업 기록 창에서 메모를 쓰다 `취소` → "작성 중인 메모가 있습니다. 닫을까요?" → `계속 작성`이면 유지, `닫기`면 닫힘.
7. `저장 후 다음 예약` → 수업이 저장되고 같은 고객으로 예약 창이 열림.
8. 일정: 오늘 칸에 초록(기록됨)·파랑(예정) 칩. `지난주`·`다음 주` 이동. 칩 → 취소 → 취소선.
9. 상세 → 상태 `종료` → 사유 선택 → `수강 종료` → 홈 수강중 목록·예약 없는 수강생에서 빠지고, 필터 `종료·이동`에 보임. 다시 `수강중으로 (재등록)` → 타임라인에 `재등록`.
10. 설정: 수업 길이 30 저장 → 예약 창에서 15:00 옆 15:30 이 더 이상 겹침으로 나오지 않음.
11. 앱을 두 번 실행(`npm run dev` 중 다른 터미널에서 `npx electron .`) → 새 창이 뜨지 않고 기존 창이 앞으로 온다.

- [ ] **Step 3: 개발 데이터 정리**

Run: `rm -rf "$HOME/Library/Application Support/VOCAL_CRM-dev"`

- [ ] **Step 4: 마무리 커밋** (Step 1~3 에서 고친 것이 있을 때만)

```bash
git add -A
git commit -m "fix: 전체 확인에서 발견한 문제 수정" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
