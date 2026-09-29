# VOCAL_CRM 계획 3: 안전장치·배포 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계 문서 5.9·7·8·9·10장의 안전장치와 배포를 만든다. 자동·수동·가져오기 전·복원 전 백업과 복원, 시작 시 DB 검사와 최근 백업 복원, 외부 백업 파일(.vcrmbak) 내보내기·불러오기와 30일 알림, 작성 중 창 닫기 확인, 오류 기록(electron-log), 창 이동 제한이 포함된다. 실제 앱 E2E, Windows portable exe·zip 빌드, GitHub Actions, 사용 안내도 만든다.

**Architecture:**
- **백업 로직:** `src/main/backup/` 가 맡는다. `backups.ts` 는 만들기·목록·정리·검사, `startup.ts` 는 시작 시 검사·복원·하루 한 번 자동 백업이다.
- **IPC:** 새 채널 `app.*` · `backup.*` 은 `backupHandlers.ts` 가 처리한다.
- **AppEnv:** 폴더 경로·폴더 열기·DB 다시 열기 같은 Electron 의존 부분은 `AppEnv` 인터페이스로 감싼다. 테스트는 임시 폴더와 가짜 함수를 넣는다.
- **복원:** 먼저 '복원 전' 백업을 만든다. 그다음 DB 를 닫고 파일을 바꾼 뒤, Main 이 DB 를 다시 열어 IPC 처리 함수를 새로 연결하고 화면을 새로 불러온다. 앱 프로세스는 다시 시작하지 않는다.
- **닫기 확인:** 화면의 `beforeunload` 가 창 닫기를 멈추면, Main 의 `will-prevent-unload` 가 Windows 확인 창을 띄운다.

**Tech Stack:** 계획 1·2 그대로 (Electron 44, electron-vite 5, React 19, Mantine 9, TanStack Query 5, better-sqlite3 13, zod 4, exceljs 4, Vitest 5). 새로 추가하는 것:
- **electron-log 5:** 오류 기록.
- **@playwright/test 1.63:** Electron E2E.
- **electron-builder 26:** Windows 배포.

**전제:**
- 시작 전: 계획 2 가 main 에 완료되어 있다 (테스트 38개 파일 149개 통과).
- 끝난 뒤: 테스트 47개 파일 190개가 통과하고, E2E 7개가 통과한다.

## Global Constraints

- **작업 위치:** 모든 명령은 저장소 루트 `/Users/jeongbaul/Dev/SIDE_PROJECT/VOCAL_CRM` 에서 실행한다.
- **패키지:** Node.js 22.12 이상. 기존 패키지 버전은 바꾸지 않는다. 새로 추가하는 것은 아래 셋뿐이다.
  - `dependencies`: `electron-log@^5.4.4`
  - `devDependencies`: `@playwright/test@^1.63.0`, `electron-builder@^26.15.3`
- **문구:** 화면 문구·오류 메시지는 모두 **한국어**다. 사용자에게 보이는 오류는 `AppError(code, message)` 로 던진다.
- **백업 파일:**
  - 파일 이름: `vocal_crm_YYYYMMDD_HHmmss_<종류>.db` (로컬 시각). 종류는 `auto` / `manual` / `before-import` / `before-restore`.
  - 보관: 종류와 상관없이 **최근 30개**.
- **외부 백업 파일:** 이름 `VOCAL_CRM_백업_<지점>_<YYYY-MM-DD>.vcrmbak`. 저장하면 설정 `last_external_backup_at` 에 ISO 시각을 기록한다.
- **데이터 보존:**
  - 사용자의 데이터 파일을 지우지 않는다. 손상된 DB 는 `vocal_crm.db.broken-<YYYYMMDD_HHmmss>` 로 옆에 남긴다.
  - 복원·불러오기는 반드시 먼저 `before-restore` 백업을 만든다.
- **데이터 폴더:** 환경 변수 `VOCAL_CRM_USER_DATA` 가 있으면 그 폴더를 데이터 폴더로 쓴다 (E2E 용). 개발 중에는 `VOCAL_CRM-dev` 를 쓴다 (계획 1 과 같음).
- **useEffect:** 콜백은 항상 중괄호 블록으로 쓴다 (계획 1 과 같음).
- **커밋 메시지:** 한국어 한 줄 요약에, 마지막 줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 하나만 붙인다. 다른 공동 작성자 줄은 붙이지 않는다.

## 설계 문서와 달라진 점

| 설계 문서 | 이 계획 | 이유 |
|---|---|---|
| 백업 종류: 자동 / 가져오기 전 / 복원 전 | `수동`(설정의 `지금 백업`) 추가 | 큰 작업 전에 직접 남길 수 있게 |
| 복원·불러오기: 교체 → 마이그레이션 → 화면 다시 불러오기 | DB 를 닫고 교체 → Main 이 DB 를 다시 열고(마이그레이션 포함) IPC 처리 함수를 바꿔 연결 → 화면 새로 불러오기. 앱 프로세스는 다시 시작하지 않는다 | portable exe 는 임시 폴더에 풀려 실행된다. `app.relaunch()` 로 다시 띄우면 임시 폴더 정리·중복 실행 잠금과 부딪힐 수 있다 |
| DB 무결성 실패 시 백업 목록을 보여준다 | 창을 띄우기 전이라 Windows 확인 창으로 **최근 백업 1개**로 복원할지 묻는다. 다른 시점은 앱이 열린 뒤 `설정·백업` 에서 복원한다 | 화면이 뜨기 전이라 목록 UI 를 쓸 수 없다 |
| 메뉴 `설정·백업` | 계획 1 의 메뉴 이름 `설정` 을 `설정·백업` 으로 바꾼다 | 설계 그대로 |
| 오류 기록 위치 `logs/` | electron-log 파일 경로를 `데이터 폴더/logs/main.log` 로 고정한다 (Mac 개발 환경도 같게) | `데이터 폴더 열기` 로 바로 찾을 수 있게 |
| E2E 스모크 | 스모크 1개에 백업·복원 4개와 닫기 확인 2개를 더한다. CI 는 빌드된 exe 로 돌린다 | 계획 2 후속 문서의 "Playwright `_electron`" 방식 |
| 앱 아이콘 | 이번 계획에서는 기본 Electron 아이콘 | 설계에 없음. 필요하면 `build/icon.ico` 만 넣으면 된다 |

계획 1·2 후속 문서에서 이 계획이 처리하는 것:
- `will-navigate` 차단과 https 만 여는 `shell.openExternal` (Task 1)
- DB 열기 실패·무결성 검사와 복원 안내, `DB_TOO_NEW` 안내 연결 (Task 3)
- **가져오기 전 자동 백업** (Task 4)
- 설정 조회 실패 시 로딩에 멈추는 시작 화면 (Task 7)

## 파일 구조

```
src/shared/
  backupTypes.ts                 BackupKind·BackupInfo·BackupStatus·AppInfo, BACKUP_KIND_LABEL
  domain/backupReminder.ts       외부 백업 안내 판단과 "34일 전" 문구
src/main/
  logger.ts                      electron-log 설정, logError
  security.ts                    isAllowedNavigation, isSafeExternalUrl
  backup/backups.ts              createBackup·listBackups·pruneBackups·validateBackupFile·replaceDatabaseFile
  backup/startup.ts              openWithRecovery(시작 시 검사·복원), runDailyBackup
  backup/env.ts                  AppEnv (폴더·버전·폴더 열기·DB 다시 열기)
  ipc/backupHandlers.ts          app.* · backup.* 채널
src/renderer/src/
  components/settings/           BackupSection, DataSection
  components/home/BackupReminder.tsx
  lib/useLeaveGuard.ts           작성 중 창 닫기 멈춤
e2e/                             Playwright Electron (app.ts 도우미, smoke·backup·closeGuard)
electron-builder.yml             Windows portable·zip
.github/workflows/build.yml      windows-latest 테스트·빌드·E2E·아티팩트
README.md, docs/user-guide.md    개발 안내, 트레이너용 사용 안내
```

---

### Task 1: 오류 기록과 창 이동 제한

**Files:**
- Create: `src/main/security.ts`, `src/main/logger.ts`
- Modify: `src/main/index.ts` (전체 내용으로 교체), `src/main/ipc/register.ts`, `src/main/transfer/electronFiles.ts`, `package.json` (npm 으로)
- Test: `tests/unit/security.test.ts`

**Interfaces:**
- Produces:
  - `isAllowedNavigation(targetUrl: string, appUrl: string): boolean`
    - 개발 서버면 같은 origin 만 허용한다.
    - `file:` 이면 같은 경로(index.html)만 허용한다.
    - 잘못된 주소는 false.
  - `isSafeExternalUrl(url: string): boolean` — https 만 true.
  - `initLogging(): void` — userData 경로를 정한 **뒤** 한 번 부른다.
  - `logError(err: unknown): void`
  - `registerIpc(handlers, logError)` — 두 번째 인자가 추가된다.
- Main 은 `VOCAL_CRM_USER_DATA` 가 있으면 그 폴더를 userData 로 쓴다. 배포판에서도 동작한다.

- [ ] **Step 1: 패키지 설치**

Run: `npm install electron-log@^5.4.4`
Expected: `package.json` 의 `dependencies` 에 `"electron-log": "^5.4.4"` 가 생긴다.

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/unit/security.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { isAllowedNavigation, isSafeExternalUrl } from '@main/security'

describe('isAllowedNavigation', () => {
  it('개발 서버는 같은 origin 만 허용', () => {
    expect(isAllowedNavigation('http://localhost:5173/#/customers/1', 'http://localhost:5173')).toBe(true)
    expect(isAllowedNavigation('https://example.com', 'http://localhost:5173')).toBe(false)
  })

  it('배포판은 같은 index.html 만 허용, 끌어다 놓은 파일은 막는다', () => {
    const app = 'file:///C:/app/resources/app.asar/out/renderer/index.html'
    expect(isAllowedNavigation(`${app}#/settings`, app)).toBe(true)
    expect(isAllowedNavigation('file:///C:/Users/me/Documents/김민지.vcrm', app)).toBe(false)
    expect(isAllowedNavigation('not a url', app)).toBe(false)
  })
})

describe('isSafeExternalUrl', () => {
  it('https 만 허용', () => {
    expect(isSafeExternalUrl('https://github.com')).toBe(true)
    expect(isSafeExternalUrl('http://example.com')).toBe(false)
    expect(isSafeExternalUrl('file:///C:/Windows/System32/cmd.exe')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
  })
})
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/unit/security.test.ts`
Expected: FAIL — `Cannot find package '@main/security'`.

- [ ] **Step 4: 구현**

`src/main/security.ts`

```ts
/**
 * 창이 앱 화면 밖으로 이동하려 하면 막는다 (파일을 창에 끌어다 놓는 경우 등).
 * 개발 서버면 같은 origin, 배포판(file://)이면 같은 index.html 경로만 허용한다.
 */
export function isAllowedNavigation(targetUrl: string, appUrl: string): boolean {
  try {
    const target = new URL(targetUrl)
    const app = new URL(appUrl)
    if (app.protocol === 'file:') return target.protocol === 'file:' && target.pathname === app.pathname
    return target.origin === app.origin
  } catch {
    return false
  }
}

/** 외부 브라우저로는 https 주소만 연다 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
```

`src/main/logger.ts`

```ts
import { join } from 'node:path'
import { app } from 'electron'
import log from 'electron-log/main'

/**
 * 파일 로그: 데이터 폴더의 logs\main.log (%APPDATA%\VOCAL_CRM\logs, 개발 중에는 VOCAL_CRM-dev).
 * 설정 화면의 "데이터 폴더 열기"로 찾을 수 있게 Mac 에서도 같은 자리에 둔다.
 * userData 경로를 정한 뒤, 창을 만들기 전에 한 번 부른다.
 */
export function initLogging(): void {
  log.initialize()
  log.transports.file.resolvePathFn = () => join(app.getPath('userData'), 'logs', 'main.log')
  log.transports.file.level = 'info'
  log.transports.console.level = app.isPackaged ? false : 'debug'
  log.errorHandler.startCatching({ showDialog: false })
  log.info(`VOCAL CRM ${app.getVersion()} 시작`)
}

export function logError(err: unknown): void {
  log.error(err)
}
```

`src/main/ipc/register.ts` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/main/ipc/register.ts
+++ b/src/main/ipc/register.ts
@@ -3,8 +3,8 @@ import { CHANNELS } from '@shared/api'
 import type { Handlers } from './handlers'
 import { invokeHandler } from './invoke'
 
-export function registerIpc(handlers: Handlers): void {
+export function registerIpc(handlers: Handlers, logError: (err: unknown) => void): void {
   for (const channel of CHANNELS) {
-    ipcMain.handle(channel, (_event, ...args: unknown[]) => invokeHandler(handlers, channel, args))
+    ipcMain.handle(channel, (_event, ...args: unknown[]) => invokeHandler(handlers, channel, args, logError))
   }
 }
```

`src/main/transfer/electronFiles.ts` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/main/transfer/electronFiles.ts
+++ b/src/main/transfer/electronFiles.ts
@@ -2,10 +2,11 @@ import { app, dialog, type BrowserWindow } from 'electron'
 import { readFile, writeFile } from 'node:fs/promises'
 import { join } from 'node:path'
 import { AppError } from '@shared/result'
+import { logError } from '../logger'
 import type { FileAccess } from './files'
 
 const fileError = (err: unknown): AppError => {
-  console.error(err)
+  logError(err)
   return new AppError('FILE_ERROR', '파일을 읽거나 쓰지 못했습니다. 위치와 권한(USB 연결 등)을 확인해 주세요.')
 }
 
```

`src/main/index.ts` — 아래 전체 내용으로 교체

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openDatabase } from './db/connection'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { initLogging, logError } from './logger'
import { isAllowedNavigation, isSafeExternalUrl } from './security'
import { createElectronFileAccess } from './transfer/electronFiles'

// 데이터 폴더: E2E 테스트는 VOCAL_CRM_USER_DATA 로 임시 폴더를 쓰고, 개발 중에는 실제 데이터와 섞이지 않게 별도 폴더를 쓴다
const userDataOverride = process.env['VOCAL_CRM_USER_DATA']
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
} else if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'VOCAL_CRM-dev'))
}
initLogging()

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
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const indexHtml = join(__dirname, '../renderer/index.html')
  const appUrl = devUrl ?? pathToFileURL(indexHtml).href
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, appUrl)) event.preventDefault()
  })

  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(indexHtml)
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
    registerIpc(createHandlers(db, () => new Date(), createElectronFileAccess(() => mainWindow)), logError)
    createWindow()
  })

  app.on('window-all-closed', () => app.quit())
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  39 passed`, `Tests  152 passed`.

- [ ] **Step 6: 타입 검사·빌드**

Run: `npm run build`
Expected: typecheck 오류 없음, `✓ built in …` 3번.

- [ ] **Step 7: 커밋**

```bash
git add package.json package-lock.json src tests
git commit -m "feat: 오류 기록(electron-log)과 창 이동·외부 링크 제한" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 백업 만들기·목록·정리·검사

**Files:**
- Create: `src/shared/backupTypes.ts`, `src/main/backup/backups.ts`, `tests/support/tempDir.ts`
- Modify: `src/main/db/connection.ts`, `vitest.config.ts`, `tsconfig.node.json`
- Test: `tests/backup/backups.test.ts`

**Interfaces:**
- Produces (`@shared/backupTypes`):
  - `BackupKind = 'auto' | 'manual' | 'before-import' | 'before-restore'`
  - `BACKUP_KIND_LABEL` — 자동 / 수동 / 가져오기 전 / 복원 전
  - `BackupInfo { fileName, kind, createdAt: 'YYYY-MM-DD HH:mm:ss', size }`
  - `BackupStatus { lastExternalBackupAt: string | null, backupCount }`
  - `AppInfo { version, dataDir }`
- Produces (`@main/backup/backups`):
  - `BACKUP_KEEP = 30`, `backupFileName(kind, now)`
  - `listBackups(dir): BackupInfo[]` — 최신순. 폴더가 없으면 `[]`.
  - `pruneBackups(dir, keep?)`
  - `createBackup(db, dir, kind, now): Promise<BackupInfo>`
    - `db.backup()` 을 쓴다. 폴더가 없으면 만든다.
    - 같은 초에 또 만들면 1초 뒤 이름을 쓴다.
    - 만든 뒤 오래된 백업을 정리한다.
  - `validateBackupFile(path): void`
    - 읽을 수 없거나 VOCAL CRM DB 가 아니거나 손상됐으면 `BACKUP_INVALID` (`백업 파일을 읽을 수 없습니다. VOCAL CRM 백업 파일인지 확인해 주세요.`).
    - 더 새 버전 앱의 DB 면 `DB_TOO_NEW`.
  - `replaceDatabaseFile(dbPath, sourcePath)` — 닫힌 DB 파일에 백업을 복사해 넣는다.
- Produces (`@main/db/connection`):
  - `checkIntegrity(db): boolean`
  - `openDatabase` 는 열다가 실패하면 파일을 닫고 오류를 다시 던진다. 열린 채로 두면 Windows 에서 손상 파일을 옮길 수 없다.
- Produces (테스트 도우미): `tempDir(): string` — 테스트가 끝나면 지워지는 임시 폴더.

- [ ] **Step 1: 테스트 범위에 `tests/backup` 추가**

`vitest.config.ts` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/vitest.config.ts
+++ b/vitest.config.ts
@@ -19,7 +19,7 @@ export default defineConfig({
         test: {
           name: 'node',
           environment: 'node',
-          include: ['tests/unit/**/*.test.ts', 'tests/db/**/*.test.ts', 'tests/transfer/**/*.test.ts']
+          include: ['tests/unit/**/*.test.ts', 'tests/db/**/*.test.ts', 'tests/transfer/**/*.test.ts', 'tests/backup/**/*.test.ts']
         }
       },
       {
```

`tsconfig.node.json` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/tsconfig.node.json
+++ b/tsconfig.node.json
@@ -8,7 +8,8 @@
     "src/shared/**/*",
     "tests/unit/**/*",
     "tests/db/**/*",
-    "tests/transfer/**/*"
+    "tests/transfer/**/*",
+    "tests/backup/**/*"
   ],
   "compilerOptions": {
     "composite": true,
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/support/tempDir.ts`

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'

const dirs: string[] = []

/** 테스트마다 새 임시 폴더. 테스트가 끝나면 지운다 */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vocal-crm-test-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true })
})
```

`tests/backup/backups.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { checkIntegrity, openDatabase } from '@main/db/connection'
import {
  backupFileName,
  createBackup,
  listBackups,
  pruneBackups,
  replaceDatabaseFile,
  validateBackupFile
} from '@main/backup/backups'
import { createCustomer } from '@main/store/customers'
import { customerInput, NOW } from '../support/db'
import { tempDir } from '../support/tempDir'

const at = (h: number, m: number, s = 0): Date => new Date(2026, 8, 28, h, m, s)

describe('backupFileName / listBackups', () => {
  it('로컬 시각과 종류로 이름을 만들고, 목록은 최신순이며 다른 파일은 무시한다', () => {
    expect(backupFileName('auto', at(15, 30))).toBe('vocal_crm_20260928_153000_auto.db')
    const dir = tempDir()
    writeFileSync(join(dir, 'vocal_crm_20260928_090000_auto.db'), 'x')
    writeFileSync(join(dir, 'vocal_crm_20260928_101500_before-import.db'), 'xy')
    writeFileSync(join(dir, 'notes.txt'), 'x')
    expect(listBackups(dir)).toEqual([
      { fileName: 'vocal_crm_20260928_101500_before-import.db', kind: 'before-import', createdAt: '2026-09-28 10:15:00', size: 2 },
      { fileName: 'vocal_crm_20260928_090000_auto.db', kind: 'auto', createdAt: '2026-09-28 09:00:00', size: 1 }
    ])
    expect(listBackups(join(dir, 'missing'))).toEqual([])
  })
})

describe('createBackup / pruneBackups', () => {
  it('열려 있는 DB 의 복사본을 만들고, 같은 초에 또 만들면 1초 뒤 이름을 쓴다', async () => {
    const dir = tempDir()
    const db = openDatabase(join(dir, 'vocal_crm.db'))
    createCustomer(db, customerInput(), NOW)
    const backups = join(dir, 'backups')
    const first = await createBackup(db, backups, 'auto', at(15, 30))
    const second = await createBackup(db, backups, 'manual', at(15, 30))
    const third = await createBackup(db, backups, 'auto', at(15, 30))
    expect([first.fileName, second.fileName, third.fileName]).toEqual([
      'vocal_crm_20260928_153000_auto.db',
      'vocal_crm_20260928_153000_manual.db',
      'vocal_crm_20260928_153001_auto.db'
    ])
    const copy = new Database(join(backups, first.fileName), { readonly: true })
    expect(copy.prepare('SELECT name FROM customers').pluck().all()).toEqual(['김민지'])
    copy.close()
  })

  it('최근 30개만 남긴다', () => {
    const dir = tempDir()
    for (let i = 0; i < 32; i++) writeFileSync(join(dir, backupFileName('auto', at(10, i))), 'x')
    expect(pruneBackups(dir)).toBe(2)
    const left = listBackups(dir)
    expect(left).toHaveLength(30)
    expect(left.at(-1)?.createdAt).toBe('2026-09-28 10:02:00')
  })
})

describe('validateBackupFile / replaceDatabaseFile', () => {
  it('정상 백업은 통과, SQLite 가 아니거나 VOCAL CRM 이 아니거나 더 새 버전이면 거부', async () => {
    const dir = tempDir()
    const db = openDatabase(join(dir, 'vocal_crm.db'))
    const backup = await createBackup(db, dir, 'manual', at(9, 0))
    expect(() => validateBackupFile(join(dir, backup.fileName))).not.toThrow()

    writeFileSync(join(dir, 'garbage.vcrmbak'), 'not sqlite at all')
    expect(() => validateBackupFile(join(dir, 'garbage.vcrmbak'))).toThrow('백업 파일을 읽을 수 없습니다.')

    const other = new Database(join(dir, 'other.db'))
    other.exec('CREATE TABLE notes (id TEXT)')
    other.close()
    expect(() => validateBackupFile(join(dir, 'other.db'))).toThrow('백업 파일을 읽을 수 없습니다.')

    const newer = openDatabase(join(dir, 'newer.db'))
    newer.pragma('user_version = 999')
    newer.close()
    expect(() => validateBackupFile(join(dir, 'newer.db'))).toThrow('더 새 버전의 앱에서 만든 데이터입니다.')
    expect(() => validateBackupFile(join(dir, 'nope.db'))).toThrow('백업 파일을 읽을 수 없습니다.')
  })

  it('닫은 DB 파일을 백업으로 바꿔 넣으면 백업 시점 데이터가 된다', async () => {
    const dir = tempDir()
    const dbPath = join(dir, 'vocal_crm.db')
    const db = openDatabase(dbPath)
    const backup = await createBackup(db, dir, 'manual', at(9, 0))
    createCustomer(db, customerInput({ name: '박서준' }), NOW)
    expect(checkIntegrity(db)).toBe(true)
    db.close()
    replaceDatabaseFile(dbPath, join(dir, backup.fileName))
    const reopened = openDatabase(dbPath)
    expect(reopened.prepare('SELECT COUNT(*) FROM customers').pluck().get()).toBe(0)
    reopened.close()
    expect(existsSync(dbPath)).toBe(true)
  })
})

describe('openDatabase', () => {
  it('열다가 실패하면 파일을 닫는다 (Windows 에서 손상 파일을 옆으로 옮길 수 있도록)', () => {
    const dir = tempDir()
    const dbPath = join(dir, 'vocal_crm.db')
    writeFileSync(dbPath, 'this is not a database')
    const close = vi.spyOn(Database.prototype, 'close')
    try {
      expect(() => openDatabase(dbPath)).toThrow()
      expect(close).toHaveBeenCalledTimes(1)
    } finally {
      close.mockRestore()
    }
  })
})
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/backup/backups.test.ts`
Expected: FAIL — `Cannot find package '@main/backup/backups'`.

- [ ] **Step 4: 구현**

`src/shared/backupTypes.ts`

```ts
export type BackupKind = 'auto' | 'manual' | 'before-import' | 'before-restore'

export const BACKUP_KIND_LABEL: Record<BackupKind, string> = {
  auto: '자동',
  manual: '수동',
  'before-import': '가져오기 전',
  'before-restore': '복원 전'
}

export interface BackupInfo {
  fileName: string
  kind: BackupKind
  /** 로컬 시각 "YYYY-MM-DD HH:mm:ss" */
  createdAt: string
  size: number
}

export interface BackupStatus {
  /** 마지막 외부 백업(백업 파일 내보내기) 시각, ISO. 없으면 null */
  lastExternalBackupAt: string | null
  backupCount: number
}

export interface AppInfo {
  version: string
  dataDir: string
}
```

`src/main/backup/backups.ts`

```ts
import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { BackupInfo, BackupKind } from '@shared/backupTypes'
import { AppError } from '@shared/result'
import type { DB } from '../db/connection'
import { SCHEMA_VERSION } from '../db/migrations'

/** 종류와 상관없이 최근 몇 개를 남길지 (설계 7장) */
export const BACKUP_KEEP = 30

const NAME_RE = /^vocal_crm_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(auto|manual|before-import|before-restore)\.db$/

const pad = (n: number): string => String(n).padStart(2, '0')

/** 로컬 시각 기준 "vocal_crm_20260928_153000_auto.db" */
export function backupFileName(kind: BackupKind, now: Date): string {
  const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const t = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `vocal_crm_${d}_${t}_${kind}.db`
}

function parseName(fileName: string): Omit<BackupInfo, 'size'> | null {
  const m = fileName.match(NAME_RE)
  if (!m) return null
  return { fileName, kind: m[7] as BackupKind, createdAt: `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` }
}

/** 최신순. 이름 규칙에 맞지 않는 파일은 무시한다 */
export function listBackups(dir: string): BackupInfo[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map(parseName)
    .filter((b): b is Omit<BackupInfo, 'size'> => b !== null)
    .map((b) => ({ ...b, size: statSync(join(dir, b.fileName)).size }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.fileName.localeCompare(a.fileName))
}

/** 최근 keep 개만 남기고 지운다. 지운 수를 돌려준다 */
export function pruneBackups(dir: string, keep = BACKUP_KEEP): number {
  const old = listBackups(dir).slice(keep)
  for (const b of old) unlinkSync(join(dir, b.fileName))
  return old.length
}

/** 앱을 쓰는 중에도 일관된 복사본을 만든다 (better-sqlite3 backup API). 만든 뒤 오래된 백업을 정리한다 */
export async function createBackup(db: DB, dir: string, kind: BackupKind, now: Date): Promise<BackupInfo> {
  mkdirSync(dir, { recursive: true })
  let at = now
  // 같은 초에 두 번 만들면 이름이 겹치므로 1초씩 뒤로 민다
  while (existsSync(join(dir, backupFileName(kind, at)))) at = new Date(at.getTime() + 1000)
  const fileName = backupFileName(kind, at)
  await db.backup(join(dir, fileName))
  pruneBackups(dir)
  const info = listBackups(dir).find((b) => b.fileName === fileName)
  if (!info) throw new AppError('BACKUP_FAILED', '백업을 만들지 못했습니다.')
  return info
}

const invalidBackup = (): AppError =>
  new AppError('BACKUP_INVALID', '백업 파일을 읽을 수 없습니다. VOCAL CRM 백업 파일인지 확인해 주세요.')

/** 복원 전에 파일을 검사한다: SQLite 이고, VOCAL CRM 테이블이 있고, 이 앱보다 새 버전이 아니며, 손상되지 않았는지 */
export function validateBackupFile(path: string): void {
  let probe: Database.Database
  try {
    probe = new Database(path, { readonly: true, fileMustExist: true })
  } catch {
    throw invalidBackup()
  }
  try {
    const version = probe.pragma('user_version', { simple: true }) as number
    if (version > SCHEMA_VERSION) {
      throw new AppError('DB_TOO_NEW', '더 새 버전의 앱에서 만든 데이터입니다. 앱을 새 버전으로 바꿔 주세요.')
    }
    const tables = probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all() as string[]
    if (!tables.includes('customers') || !tables.includes('settings')) throw invalidBackup()
    if (probe.pragma('integrity_check', { simple: true }) !== 'ok') throw invalidBackup()
  } catch (err) {
    if (err instanceof AppError) throw err
    throw invalidBackup()
  } finally {
    probe.close()
  }
}

/** DB 파일을 백업 파일로 바꿔 넣는다. 호출하는 쪽이 먼저 DB 를 닫아야 한다 */
export function replaceDatabaseFile(dbPath: string, sourcePath: string): void {
  copyFileSync(sourcePath, dbPath)
}
```

`src/main/db/connection.ts` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/main/db/connection.ts
+++ b/src/main/db/connection.ts
@@ -3,10 +3,23 @@ import { migrate } from './migrations'
 
 export type DB = Database.Database
 
-/** DB 파일을 열고(없으면 만들고) 마이그레이션까지 적용한다. 테스트는 ':memory:' */
+/**
+ * DB 파일을 열고(없으면 만들고) 마이그레이션까지 적용한다. 테스트는 ':memory:'.
+ * 실패하면 파일을 닫고 오류를 다시 던진다 (열린 채로 두면 Windows 에서 손상 파일을 옮길 수 없다)
+ */
 export function openDatabase(filename: string): DB {
   const db = new Database(filename)
-  db.pragma('foreign_keys = ON')
-  migrate(db)
+  try {
+    db.pragma('foreign_keys = ON')
+    migrate(db)
+  } catch (err) {
+    db.close()
+    throw err
+  }
   return db
 }
+
+/** SQLite 무결성 검사 결과가 ok 인지 */
+export function checkIntegrity(db: DB): boolean {
+  return db.pragma('integrity_check', { simple: true }) === 'ok'
+}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  40 passed`, `Tests  158 passed`.

- [ ] **Step 6: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 7: 커밋**

```bash
git add src tests vitest.config.ts tsconfig.node.json
git commit -m "feat: 백업 만들기·목록·정리·검사" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 시작 시 DB 검사·복원과 하루 한 번 자동 백업

**Files:**
- Create: `src/main/backup/startup.ts`
- Modify: `src/main/backup/backups.ts` (`fileTimestamp` 분리), `src/main/index.ts` (전체 내용으로 교체)
- Test: `tests/backup/startup.test.ts`

**Interfaces:**
- Consumes: Task 2 의 `createBackup`, `listBackups`, `replaceDatabaseFile`, `checkIntegrity`, `openDatabase`
- Produces:
  - `fileTimestamp(now): string` — `"20260928_153000"`
  - `RecoveryUi { askRestore(latest: BackupInfo): boolean; fatal(title, message): void }`
  - `openWithRecovery(dbPath, backupDir, ui, now): { db, restoredFrom } | null`
    - 정상이면 그대로 연다.
    - `DB_TOO_NEW` 면 `fatal` 로 안내하고 null.
    - 열 수 없거나 손상됐으면 최근 백업으로 복원할지 묻는다. 복원하면 원래 파일은 `.broken-<시각>` 으로 옆에 둔다.
    - 백업이 없거나 거절하면 null.
  - `runDailyBackup(db, backupDir, now): Promise<BackupInfo | null>` — 설정 `last_auto_backup_date` 가 오늘이 아니면 `auto` 백업을 만든다.
- Main 동작:
  - 확인 창 문구는 `데이터 파일에 문제가 있습니다. 최근 백업으로 복원할까요?`, 버튼은 `최근 백업으로 복원` / `종료`.
  - 시작 중 예외가 나면 `앱을 시작하지 못했습니다. 데이터 폴더의 logs 폴더에 기록을 남겼습니다.` 를 띄우고 종료한다.
  - 자동 백업 실패는 기록만 하고 앱은 연다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/backup/startup.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase } from '@main/db/connection'
import { createBackup, listBackups } from '@main/backup/backups'
import { openWithRecovery, runDailyBackup, type RecoveryUi } from '@main/backup/startup'
import { createCustomer } from '@main/store/customers'
import { customerInput, NOW } from '../support/db'
import { tempDir } from '../support/tempDir'

function ui(answer: boolean) {
  return {
    askRestore: vi.fn<RecoveryUi['askRestore']>(() => answer),
    fatal: vi.fn<RecoveryUi['fatal']>()
  }
}

async function setupWithBackup(): Promise<{ dir: string; dbPath: string; backupDir: string }> {
  const dir = tempDir()
  const dbPath = join(dir, 'vocal_crm.db')
  const backupDir = join(dir, 'backups')
  const db = openDatabase(dbPath)
  createCustomer(db, customerInput(), NOW)
  await createBackup(db, backupDir, 'auto', new Date(2026, 8, 28, 9, 0))
  db.close()
  return { dir, dbPath, backupDir }
}

describe('openWithRecovery', () => {
  it('정상 DB 는 그대로 연다', async () => {
    const { dbPath, backupDir } = await setupWithBackup()
    const u = ui(true)
    const r = openWithRecovery(dbPath, backupDir, u, NOW)
    expect(r?.restoredFrom).toBeNull()
    expect(u.askRestore).not.toHaveBeenCalled()
    r?.db.close()
  })

  it('손상된 DB 는 최근 백업으로 복원할지 묻고, 복원하면 원래 파일은 옆에 남긴다', async () => {
    const { dir, dbPath, backupDir } = await setupWithBackup()
    writeFileSync(dbPath, 'this is not a database')
    const u = ui(true)
    const r = openWithRecovery(dbPath, backupDir, u, new Date(2026, 8, 28, 10, 0))
    expect(u.askRestore).toHaveBeenCalledWith(expect.objectContaining({ kind: 'auto', createdAt: '2026-09-28 09:00:00' }))
    expect(r?.restoredFrom).toBe('vocal_crm_20260928_090000_auto.db')
    expect(r?.db.prepare('SELECT name FROM customers').pluck().all()).toEqual(['김민지'])
    expect(readdirSync(dir)).toContain('vocal_crm.db.broken-20260928_100000')
    r?.db.close()
  })

  it('복원을 거절하면 null, 백업이 없으면 알리고 null', async () => {
    const { dbPath, backupDir } = await setupWithBackup()
    writeFileSync(dbPath, 'broken')
    expect(openWithRecovery(dbPath, backupDir, ui(false), NOW)).toBeNull()

    const empty = tempDir()
    const lonely = join(empty, 'vocal_crm.db')
    writeFileSync(lonely, 'broken')
    const u = ui(true)
    expect(openWithRecovery(lonely, join(empty, 'backups'), u, NOW)).toBeNull()
    expect(u.fatal).toHaveBeenCalledWith('데이터 파일을 열 수 없습니다', expect.stringContaining('백업도 없습니다'))
  })

  it('더 새 버전 앱의 DB 면 복원을 묻지 않고 안내만 한다', async () => {
    const { dbPath, backupDir } = await setupWithBackup()
    const db = openDatabase(dbPath)
    db.pragma('user_version = 999')
    db.close()
    const u = ui(true)
    expect(openWithRecovery(dbPath, backupDir, u, NOW)).toBeNull()
    expect(u.askRestore).not.toHaveBeenCalled()
    expect(u.fatal).toHaveBeenCalledWith('VOCAL CRM', expect.stringContaining('더 새 버전'))
    expect(existsSync(dbPath)).toBe(true)
  })
})

describe('runDailyBackup', () => {
  it('하루에 한 번만 자동 백업을 만든다', async () => {
    const dir = tempDir()
    const db = openDatabase(join(dir, 'vocal_crm.db'))
    const backupDir = join(dir, 'backups')
    expect(await runDailyBackup(db, backupDir, new Date(2026, 8, 28, 9, 0))).toMatchObject({ kind: 'auto' })
    expect(await runDailyBackup(db, backupDir, new Date(2026, 8, 28, 18, 0))).toBeNull()
    expect(await runDailyBackup(db, backupDir, new Date(2026, 8, 29, 9, 0))).toMatchObject({ kind: 'auto' })
    expect(listBackups(backupDir)).toHaveLength(2)
    db.close()
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/backup/startup.test.ts`
Expected: FAIL — `Cannot find package '@main/backup/startup'`.

- [ ] **Step 3: 구현**

`src/main/backup/backups.ts` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/main/backup/backups.ts
+++ b/src/main/backup/backups.ts
@@ -13,11 +13,16 @@ const NAME_RE = /^vocal_crm_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(auto|ma
 
 const pad = (n: number): string => String(n).padStart(2, '0')
 
-/** 로컬 시각 기준 "vocal_crm_20260928_153000_auto.db" */
-export function backupFileName(kind: BackupKind, now: Date): string {
+/** 로컬 시각 "20260928_153000" */
+export function fileTimestamp(now: Date): string {
   const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
   const t = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
-  return `vocal_crm_${d}_${t}_${kind}.db`
+  return `${d}_${t}`
+}
+
+/** 로컬 시각 기준 "vocal_crm_20260928_153000_auto.db" */
+export function backupFileName(kind: BackupKind, now: Date): string {
+  return `vocal_crm_${fileTimestamp(now)}_${kind}.db`
 }
 
 function parseName(fileName: string): Omit<BackupInfo, 'size'> | null {
```

`src/main/backup/startup.ts`

```ts
import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { BackupInfo } from '@shared/backupTypes'
import { toDateString } from '@shared/domain/dates'
import { AppError } from '@shared/result'
import { checkIntegrity, openDatabase, type DB } from '../db/connection'
import { getSetting, setSetting } from '../store/settings'
import { createBackup, fileTimestamp, listBackups, replaceDatabaseFile } from './backups'

/** 시작할 때 사용자에게 묻거나 알리는 창 (Main 은 Electron 대화상자, 테스트는 가짜) */
export interface RecoveryUi {
  /** 최근 백업으로 복원할지 묻는다. true 면 복원 */
  askRestore(latest: BackupInfo): boolean
  /** 계속할 수 없는 오류를 알린다 (앱은 종료된다) */
  fatal(title: string, message: string): void
}

export interface OpenResult {
  db: DB
  /** 복원했다면 사용한 백업 파일 이름 */
  restoredFrom: string | null
}

/**
 * DB 를 열고 무결성을 검사한다 (설계 8장).
 * - 더 새 버전 앱의 DB 면 안내하고 null (앱 종료)
 * - 열 수 없거나 손상됐으면 최근 백업으로 복원할지 묻는다. 지금 파일은 지우지 않고 "<파일>.broken-<시각>" 으로 옆에 둔다
 * - 백업이 없거나 복원을 거절하면 null
 */
export function openWithRecovery(dbPath: string, backupDir: string, ui: RecoveryUi, now: Date): OpenResult | null {
  try {
    const db = openDatabase(dbPath)
    if (checkIntegrity(db)) return { db, restoredFrom: null }
    db.close()
    throw new AppError('DB_CORRUPT', '데이터 파일이 손상되었습니다.')
  } catch (err) {
    if (err instanceof AppError && err.code === 'DB_TOO_NEW') {
      ui.fatal('VOCAL CRM', err.message)
      return null
    }
    const latest = listBackups(backupDir)[0]
    if (!latest) {
      ui.fatal('데이터 파일을 열 수 없습니다', '데이터 파일에 문제가 있고 백업도 없습니다. 데이터 폴더를 확인해 주세요.')
      return null
    }
    if (!ui.askRestore(latest)) return null
    if (existsSync(dbPath)) renameSync(dbPath, `${dbPath}.broken-${fileTimestamp(now)}`)
    replaceDatabaseFile(dbPath, join(backupDir, latest.fileName))
    return { db: openDatabase(dbPath), restoredFrom: latest.fileName }
  }
}

/** 하루 첫 실행이면 자동 백업을 만든다. 만들었으면 그 정보를, 오늘 이미 만들었으면 null */
export async function runDailyBackup(db: DB, backupDir: string, now: Date): Promise<BackupInfo | null> {
  const today = toDateString(now)
  if (getSetting(db, 'last_auto_backup_date') === today) return null
  const info = await createBackup(db, backupDir, 'auto', now)
  setSetting(db, 'last_auto_backup_date', today)
  return info
}
```

`src/main/index.ts` — 아래 전체 내용으로 교체

```ts
import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BACKUP_KIND_LABEL } from '@shared/backupTypes'
import { openWithRecovery, runDailyBackup, type RecoveryUi } from './backup/startup'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { initLogging, logError } from './logger'
import { isAllowedNavigation, isSafeExternalUrl } from './security'
import { createElectronFileAccess } from './transfer/electronFiles'

// 데이터 폴더: E2E 테스트는 VOCAL_CRM_USER_DATA 로 임시 폴더를 쓰고, 개발 중에는 실제 데이터와 섞이지 않게 별도 폴더를 쓴다
const userDataOverride = process.env['VOCAL_CRM_USER_DATA']
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
} else if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'VOCAL_CRM-dev'))
}
initLogging()

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
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const indexHtml = join(__dirname, '../renderer/index.html')
  const appUrl = devUrl ?? pathToFileURL(indexHtml).href
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, appUrl)) event.preventDefault()
  })

  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(indexHtml)
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

  const recoveryUi: RecoveryUi = {
    askRestore: (latest) =>
      dialog.showMessageBoxSync({
        type: 'warning',
        buttons: ['최근 백업으로 복원', '종료'],
        defaultId: 0,
        cancelId: 1,
        title: 'VOCAL CRM',
        message: '데이터 파일에 문제가 있습니다. 최근 백업으로 복원할까요?',
        detail: `최근 백업: ${latest.createdAt} (${BACKUP_KIND_LABEL[latest.kind]})\n지금 파일은 지우지 않고 옆에 따로 보관합니다.`
      }) === 0,
    fatal: (title, message) => dialog.showErrorBox(title, message)
  }

  void app.whenReady().then(async () => {
    try {
      const userData = app.getPath('userData')
      const backupDir = join(userData, 'backups')
      const opened = openWithRecovery(join(userData, 'vocal_crm.db'), backupDir, recoveryUi, new Date())
      if (!opened) {
        app.quit()
        return
      }
      const { db } = opened
      try {
        await runDailyBackup(db, backupDir, new Date())
      } catch (err) {
        logError(err) // 자동 백업 실패로 앱을 막지는 않는다
      }
      registerIpc(createHandlers(db, () => new Date(), createElectronFileAccess(() => mainWindow)), logError)
      createWindow()
    } catch (err) {
      logError(err)
      dialog.showErrorBox('VOCAL CRM', '앱을 시작하지 못했습니다. 데이터 폴더의 logs 폴더에 기록을 남겼습니다.')
      app.quit()
    }
  })

  app.on('window-all-closed', () => app.quit())
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  41 passed`, `Tests  163 passed`.

- [ ] **Step 5: 타입 검사·빌드**

Run: `npm run build`
Expected: typecheck 오류 없음, `✓ built in …` 3번.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "feat: 시작 시 DB 검사와 최근 백업 복원, 하루 한 번 자동 백업" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 백업·앱 정보 채널과 가져오기 전 자동 백업

**Files:**
- Create: `src/main/backup/env.ts`, `src/main/ipc/backupHandlers.ts`
- Modify:
  - 전체 내용으로 교체: `src/main/ipc/handlers.ts`, `src/main/index.ts`
  - 변경만 적용: `src/shared/api.ts`, `src/main/ipc/transferHandlers.ts`, `src/main/ipc/register.ts`, `src/main/transfer/files.ts`
- Test: `tests/backup/backupHandlers.test.ts`

**Interfaces:**
- Consumes: Task 2·3 의 백업 함수들, 계획 2 의 `FileAccess`·`memoryFiles()`(테스트)·`createTransferHandlers`
- Produces:
  - `AppEnv { version, dataDir, dbPath, backupDir, openPath(path): Promise<void>, reload(): void }`
  - `createHandlers(db, clock, files, env: AppEnv | null = null)` — env 가 없으면 백업 채널은 `이 기능을 쓸 수 없습니다.`
  - `createTransferHandlers(db, clock, files, beforeApply)` — `transfer.applyVcrm`·`excel.applyRoster` 가 적용 직전에 `await beforeApply()`. env 가 있으면 `before-import` 백업을 만든다.
  - `registerIpc` 는 다시 부르면 기존 처리 함수를 지우고(`ipcMain.removeHandler`) 새로 연결한다.
- 새 채널:

| 채널 | 인자 | 결과 |
|---|---|---|
| `app.info` | – | `AppInfo` |
| `app.openDataFolder` | – | void (실패 시 `폴더를 열지 못했습니다.`) |
| `backup.status` | – | `BackupStatus` |
| `backup.list` | – | `BackupInfo[]` |
| `backup.create` | – | `BackupInfo` (종류 `manual`) |
| `backup.restore` | `fileName` | void. 목록에 없는 이름이면 `백업을 찾을 수 없습니다.` |
| `backup.exportFile` | – | `SaveResult`. 저장하면 `last_external_backup_at` 기록 |
| `backup.importFile` | – | `{ restored: boolean }`. 창에서 취소하면 false |

- 복원 순서 (`restore` · `importFile` 공통):
  1. 백업 파일을 `<dbPath>.restore-tmp` 로 복사한다.
  2. 복사본을 검사한다. 실패하면 tmp 를 지우고 오류를 던진다.
  3. `before-restore` 백업을 만든다.
  4. DB 를 닫고 tmp 를 dbPath 로 옮긴다.
  5. `env.reload()` 를 부른다. Main 은 DB 를 다시 열고 처리 함수를 바꿔 연결한 뒤 화면을 새로 불러온다.
- 1 에서 복사해 두는 이유: 3 에서 만든 백업이 오래된 백업을 정리하다 원본을 지워도 복원할 수 있다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/backup/backupHandlers.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { AppEnv } from '@main/backup/env'
import { listBackups } from '@main/backup/backups'
import { openDatabase } from '@main/db/connection'
import { createHandlers } from '@main/ipc/handlers'
import { createCustomer } from '@main/store/customers'
import { updateSettings } from '@main/store/settings'
import { serializeVcrm } from '@shared/vcrm'
import { customerInput, NOW } from '../support/db'
import { memoryFiles } from '../support/files'
import { tempDir } from '../support/tempDir'
import { sampleFile } from '../support/vcrm'

function setup() {
  const dir = tempDir()
  const env: AppEnv & { reload: ReturnType<typeof vi.fn<() => void>>; openPath: ReturnType<typeof vi.fn<(p: string) => Promise<void>>> } = {
    version: '0.1.0',
    dataDir: dir,
    dbPath: join(dir, 'vocal_crm.db'),
    backupDir: join(dir, 'backups'),
    openPath: vi.fn(async () => {}),
    reload: vi.fn()
  }
  const db = openDatabase(env.dbPath)
  updateSettings(db, { branchName: '강남점' })
  const files = memoryFiles()
  return { dir, env, db, files, h: createHandlers(db, () => NOW, files, env) }
}

const names = (dbPath: string): string[] => {
  const db = new Database(dbPath, { readonly: true })
  const rows = db.prepare('SELECT name FROM customers ORDER BY name').pluck().all() as string[]
  db.close()
  return rows
}

describe('app / backup channels', () => {
  it('앱 정보와 데이터 폴더 열기', async () => {
    const { env, h } = setup()
    expect(await h['app.info']()).toEqual({ version: '0.1.0', dataDir: env.dataDir })
    await h['app.openDataFolder']()
    expect(env.openPath).toHaveBeenCalledWith(env.dataDir)
  })

  it('지금 백업 → 목록 → 상태', async () => {
    const { h } = setup()
    const b = await h['backup.create']()
    expect(b).toMatchObject({ kind: 'manual' })
    expect((await h['backup.list']()).map((x) => x.fileName)).toEqual([b.fileName])
    expect(await h['backup.status']()).toEqual({ lastExternalBackupAt: null, backupCount: 1 })
  })

  it('백업으로 복원하면 복원 전 백업을 남기고 DB 를 바꾼 뒤 다시 연다', async () => {
    const { env, db, h } = setup()
    const b = await h['backup.create']()
    createCustomer(db, customerInput({ name: '박서준' }), NOW)
    await h['backup.restore'](b.fileName)
    expect(env.reload).toHaveBeenCalledTimes(1)
    expect(names(env.dbPath)).toEqual([])
    expect(listBackups(env.backupDir).map((x) => x.kind).sort()).toEqual(['before-restore', 'manual'])
    expect(existsSync(`${env.dbPath}.restore-tmp`)).toBe(false)
  })

  it('목록에 없는 이름으로는 복원할 수 없다 (경로 조작 방지)', async () => {
    const { env, h } = setup()
    await expect(h['backup.restore']('../vocal_crm.db')).rejects.toThrow('백업을 찾을 수 없습니다.')
    expect(env.reload).not.toHaveBeenCalled()
  })

  it('백업 파일 내보내기: 이름 제안, 저장, 마지막 외부 백업 시각 기록', async () => {
    const { db, dir, files, h } = setup()
    createCustomer(db, customerInput(), NOW)
    expect(await h['backup.exportFile']()).toEqual({ saved: true })
    expect(files.lastDefaultName).toBe('VOCAL_CRM_백업_강남점_2026-09-28.vcrmbak')
    const out = join(dir, 'exported.vcrmbak')
    writeFileSync(out, files.store.get('/out/file') as Buffer)
    expect(names(out)).toEqual(['김민지'])
    expect(await h['backup.status']()).toMatchObject({ lastExternalBackupAt: NOW.toISOString() })
    files.nextSavePath = null
    expect(await h['backup.exportFile']()).toEqual({ saved: false })
  })

  it('백업 파일 불러오기: 검사 후 복원하고 다시 연다, 잘못된 파일이면 아무것도 바꾸지 않는다', async () => {
    const { env, db, files, h } = setup()
    createCustomer(db, customerInput(), NOW)
    await h['backup.exportFile']()
    const exported = files.store.get('/out/file') as Buffer
    createCustomer(db, customerInput({ name: '박서준' }), NOW)

    files.store.set('/in/file', Buffer.from('not a backup'))
    await expect(h['backup.importFile']()).rejects.toThrow('백업 파일을 읽을 수 없습니다.')
    expect(env.reload).not.toHaveBeenCalled()
    expect(names(env.dbPath)).toEqual(['김민지', '박서준'])

    files.store.set('/in/file', exported)
    expect(await h['backup.importFile']()).toEqual({ restored: true })
    expect(env.reload).toHaveBeenCalledTimes(1)
    expect(names(env.dbPath)).toEqual(['김민지'])
    expect(readFileSync(env.dbPath).length).toBeGreaterThan(0)
  })

  it('가져오기를 적용하기 직전에 "가져오기 전" 백업을 만든다', async () => {
    const { env, files, h } = setup()
    files.store.set('/in/file', Buffer.from(serializeVcrm(sampleFile()), 'utf-8'))
    const preview = await h['transfer.openVcrm']()
    await h['transfer.applyVcrm'](preview!.token, [{ incomingId: 'x1', action: 'new' }])
    expect(listBackups(env.backupDir).map((b) => b.kind)).toEqual(['before-import'])
  })

  it('env 가 없으면 백업 기능은 쓸 수 없다고 안내한다', async () => {
    const h = createHandlers(openDatabase(':memory:'), () => NOW)
    expect(() => h['backup.list']()).toThrow('이 기능을 쓸 수 없습니다.')
    expect(await h['backup.status']()).toEqual({ lastExternalBackupAt: null, backupCount: 0 })
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/backup/backupHandlers.test.ts`
Expected: FAIL 8개 — 예: `TypeError: h.app.info is not a function`.

- [ ] **Step 3: 채널 정의와 파일 필터**

`src/shared/api.ts` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/shared/api.ts
+++ b/src/shared/api.ts
@@ -15,6 +15,7 @@ import type {
   Settings,
   StatusChangeInput
 } from './types'
+import type { AppInfo, BackupInfo, BackupStatus } from './backupTypes'
 import type { ImportDecision, ImportPreview, ImportResult, RosterPreview } from './transferTypes'
 
 export interface ExportVcrmRequest {
@@ -71,6 +72,17 @@ export interface ApiSpec {
   'excel.saveRosterTemplate': { args: []; result: SaveResult }
   'excel.openRoster': { args: []; result: RosterPreview | null }
   'excel.applyRoster': { args: [token: string, rowNumbers: number[]]; result: { added: number } }
+
+  'app.info': { args: []; result: AppInfo }
+  'app.openDataFolder': { args: []; result: void }
+  'backup.status': { args: []; result: BackupStatus }
+  'backup.list': { args: []; result: BackupInfo[] }
+  'backup.create': { args: []; result: BackupInfo }
+  /** 백업으로 되돌린 뒤 화면을 새로 불러온다 */
+  'backup.restore': { args: [fileName: string]; result: void }
+  'backup.exportFile': { args: []; result: SaveResult }
+  /** 고른 백업 파일로 되돌린 뒤 화면을 새로 불러온다. 창에서 취소하면 restored: false */
+  'backup.importFile': { args: []; result: { restored: boolean } }
 }
 
 export type Channel = keyof ApiSpec
@@ -107,7 +119,15 @@ const CHANNEL_MAP: Record<Channel, true> = {
   'excel.exportCustomers': true,
   'excel.saveRosterTemplate': true,
   'excel.openRoster': true,
-  'excel.applyRoster': true
+  'excel.applyRoster': true,
+  'app.info': true,
+  'app.openDataFolder': true,
+  'backup.status': true,
+  'backup.list': true,
+  'backup.create': true,
+  'backup.restore': true,
+  'backup.exportFile': true,
+  'backup.importFile': true
 }
 
 export const CHANNELS = Object.keys(CHANNEL_MAP) as Channel[]
```

`src/main/transfer/files.ts` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/main/transfer/files.ts
+++ b/src/main/transfer/files.ts
@@ -17,6 +17,7 @@ export interface FileAccess {
 
 export const VCRM_FILTERS: FileFilter[] = [{ name: 'VOCAL CRM 고객 파일', extensions: ['vcrm'] }]
 export const EXCEL_FILTERS: FileFilter[] = [{ name: '엑셀 파일', extensions: ['xlsx'] }]
+export const BACKUP_FILTERS: FileFilter[] = [{ name: 'VOCAL CRM 백업 파일', extensions: ['vcrmbak'] }]
 
 const unavailable = (): never => {
   throw new AppError('NO_FILE_ACCESS', '파일을 열거나 저장할 수 없습니다.')
```

- [ ] **Step 4: 처리 함수**

`src/main/backup/env.ts`

```ts
/** 백업·데이터 폴더 기능이 쓰는 앱 환경 (Main 은 Electron 값, 테스트는 임시 폴더) */
export interface AppEnv {
  version: string
  /** userData 폴더 (%APPDATA%\VOCAL_CRM) */
  dataDir: string
  dbPath: string
  backupDir: string
  /** 탐색기(파인더)로 폴더를 연다 */
  openPath(path: string): Promise<void>
  /** 복원한 DB 파일을 다시 열고 화면을 새로 불러온다 (앱은 켜진 그대로) */
  reload(): void
}
```

`src/main/ipc/backupHandlers.ts`

```ts
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { toDateString } from '@shared/domain/dates'
import { safeFileName } from '@shared/domain/transferNames'
import { AppError } from '@shared/result'
import { createBackup, listBackups, validateBackupFile } from '../backup/backups'
import type { AppEnv } from '../backup/env'
import type { DB } from '../db/connection'
import { getSetting, getSettings, setSetting } from '../store/settings'
import { iso, newId, notFound } from '../store/util'
import { BACKUP_FILTERS, type FileAccess } from '../transfer/files'
import type { Handlers } from './handlers'

type BackupChannel =
  | 'app.info'
  | 'app.openDataFolder'
  | 'backup.status'
  | 'backup.list'
  | 'backup.create'
  | 'backup.restore'
  | 'backup.exportFile'
  | 'backup.importFile'

/** 설정·백업 화면 채널 (설계 5.9, 7장) */
export function createBackupHandlers(
  db: DB,
  clock: () => Date,
  files: FileAccess,
  env: AppEnv | null
): Pick<Handlers, BackupChannel> {
  const requireEnv = (): AppEnv => {
    if (!env) throw new AppError('NO_APP_ENV', '이 기능을 쓸 수 없습니다.')
    return env
  }

  /**
   * 검사한 백업 파일(restoreSource)로 DB 를 바꾸고 다시 연다.
   * 먼저 '복원 전' 백업을 만든다. 그 백업이 오래된 백업을 정리하다 원본을 지워도 되도록 원본은 미리 복사해 둔다.
   * 파일을 바꾸지 못해도 DB 는 다시 열어 앱이 계속 동작하게 한다.
   */
  const restoreFrom = async (e: AppEnv, restoreSource: string): Promise<void> => {
    await createBackup(db, e.backupDir, 'before-restore', clock())
    db.close()
    try {
      renameSync(restoreSource, e.dbPath)
    } finally {
      e.reload()
    }
  }

  return {
    'app.info': () => {
      const e = requireEnv()
      return { version: e.version, dataDir: e.dataDir }
    },

    'app.openDataFolder': async () => {
      const e = requireEnv()
      await e.openPath(e.dataDir)
    },

    'backup.status': () => ({
      lastExternalBackupAt: getSetting(db, 'last_external_backup_at'),
      backupCount: env ? listBackups(env.backupDir).length : 0
    }),

    'backup.list': () => listBackups(requireEnv().backupDir),

    'backup.create': () => createBackup(db, requireEnv().backupDir, 'manual', clock()),

    'backup.restore': async (fileName) => {
      const e = requireEnv()
      if (!listBackups(e.backupDir).some((b) => b.fileName === fileName)) throw notFound('백업을 찾을 수 없습니다.')
      const source = `${e.dbPath}.restore-tmp`
      writeFileSync(source, readFileSync(join(e.backupDir, fileName)))
      try {
        validateBackupFile(source)
      } catch (err) {
        unlinkSync(source)
        throw err
      }
      await restoreFrom(e, source)
    },

    'backup.exportFile': async () => {
      const branch = safeFileName(getSettings(db).branchName ?? '')
      const path = await files.chooseSavePath(
        `VOCAL_CRM_백업_${branch}_${toDateString(clock())}.vcrmbak`,
        BACKUP_FILTERS
      )
      if (!path) return { saved: false }
      const tmp = join(tmpdir(), `vocal-crm-export-${newId()}.db`)
      try {
        await db.backup(tmp)
        await files.writeFile(path, readFileSync(tmp))
      } finally {
        unlinkSync(tmp)
      }
      setSetting(db, 'last_external_backup_at', iso(clock()))
      return { saved: true }
    },

    'backup.importFile': async () => {
      const e = requireEnv()
      const path = await files.chooseOpenPath(BACKUP_FILTERS)
      if (!path) return { restored: false }
      const source = `${e.dbPath}.restore-tmp`
      writeFileSync(source, await files.readFile(path))
      try {
        validateBackupFile(source)
      } catch (err) {
        unlinkSync(source)
        throw err
      }
      await restoreFrom(e, source)
      return { restored: true }
    }
  }
}
```

`src/main/ipc/transferHandlers.ts` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/main/ipc/transferHandlers.ts
+++ b/src/main/ipc/transferHandlers.ts
@@ -31,7 +31,9 @@ const expired = (): AppError =>
 export function createTransferHandlers(
   db: DB,
   clock: () => Date,
-  files: FileAccess
+  files: FileAccess,
+  /** 가져오기·명단 등록을 적용하기 직전에 부른다 (자동 백업) */
+  beforeApply: () => Promise<void> = async () => {}
 ): Pick<Handlers, TransferChannel> {
   const today = (): string => toDateString(clock())
   const branch = (): string => getSettings(db).branchName ?? ''
@@ -64,8 +66,9 @@ export function createTransferHandlers(
       }
     },
 
-    'transfer.applyVcrm': (token, decisions) => {
+    'transfer.applyVcrm': async (token, decisions) => {
       if (!pendingVcrm || pendingVcrm.token !== token) throw expired()
+      await beforeApply()
       const result = applyImport(db, pendingVcrm.file, decisions, today(), clock())
       pendingVcrm = null
       return result
@@ -94,8 +97,9 @@ export function createTransferHandlers(
       return { token: pendingRoster.token, rows }
     },
 
-    'excel.applyRoster': (token, rowNumbers) => {
+    'excel.applyRoster': async (token, rowNumbers) => {
       if (!pendingRoster || pendingRoster.token !== token) throw expired()
+      await beforeApply()
       const result = applyRoster(db, pendingRoster.rows, rowNumbers, clock())
       pendingRoster = null
       return result
```

`src/main/ipc/handlers.ts` — 아래 전체 내용으로 교체

```ts
import type { ArgsOf, Channel, ResultOf } from '@shared/api'
import { toDateString } from '@shared/domain/dates'
import { createBackup } from '../backup/backups'
import type { AppEnv } from '../backup/env'
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
import { createBackupHandlers } from './backupHandlers'
import { createTransferHandlers } from './transferHandlers'

export type Handlers = {
  [C in Channel]: (...args: ArgsOf<C>) => ResultOf<C> | Promise<ResultOf<C>>
}

/**
 * 채널별 처리 함수. clock 은 테스트에서 시각을, files 는 파일 대화상자·읽기·쓰기를,
 * env 는 백업·데이터 폴더를 바꿔 끼우기 위한 것 (env 가 없으면 가져오기 전 자동 백업도 하지 않는다)
 */
export function createHandlers(
  db: DB,
  clock: () => Date = () => new Date(),
  files: FileAccess = noFileAccess,
  env: AppEnv | null = null
): Handlers {
  const today = (): string => toDateString(clock())
  const backupBeforeImport = async (): Promise<void> => {
    if (env) await createBackup(db, env.backupDir, 'before-import', clock())
  }
  return {
    ...createTransferHandlers(db, clock, files, backupBeforeImport),
    ...createBackupHandlers(db, clock, files, env),
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

`src/main/ipc/register.ts` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/main/ipc/register.ts
+++ b/src/main/ipc/register.ts
@@ -3,8 +3,10 @@ import { CHANNELS } from '@shared/api'
 import type { Handlers } from './handlers'
 import { invokeHandler } from './invoke'
 
+/** 채널마다 처리 함수를 연결한다. 다시 부르면(복원 뒤 DB 를 새로 열 때) 새 처리 함수로 바꾼다 */
 export function registerIpc(handlers: Handlers, logError: (err: unknown) => void): void {
   for (const channel of CHANNELS) {
+    ipcMain.removeHandler(channel)
     ipcMain.handle(channel, (_event, ...args: unknown[]) => invokeHandler(handlers, channel, args, logError))
   }
 }
```

- [ ] **Step 5: Main 연결**

`src/main/index.ts` — 아래 전체 내용으로 교체

```ts
import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BACKUP_KIND_LABEL } from '@shared/backupTypes'
import { AppError } from '@shared/result'
import type { AppEnv } from './backup/env'
import { openWithRecovery, runDailyBackup, type RecoveryUi } from './backup/startup'
import { openDatabase } from './db/connection'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { initLogging, logError } from './logger'
import { isAllowedNavigation, isSafeExternalUrl } from './security'
import { createElectronFileAccess } from './transfer/electronFiles'

// 데이터 폴더: E2E 테스트는 VOCAL_CRM_USER_DATA 로 임시 폴더를 쓰고, 개발 중에는 실제 데이터와 섞이지 않게 별도 폴더를 쓴다
const userDataOverride = process.env['VOCAL_CRM_USER_DATA']
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
} else if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'VOCAL_CRM-dev'))
}
initLogging()

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
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const indexHtml = join(__dirname, '../renderer/index.html')
  const appUrl = devUrl ?? pathToFileURL(indexHtml).href
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, appUrl)) event.preventDefault()
  })

  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(indexHtml)
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

  const recoveryUi: RecoveryUi = {
    askRestore: (latest) =>
      dialog.showMessageBoxSync({
        type: 'warning',
        buttons: ['최근 백업으로 복원', '종료'],
        defaultId: 0,
        cancelId: 1,
        title: 'VOCAL CRM',
        message: '데이터 파일에 문제가 있습니다. 최근 백업으로 복원할까요?',
        detail: `최근 백업: ${latest.createdAt} (${BACKUP_KIND_LABEL[latest.kind]})\n지금 파일은 지우지 않고 옆에 따로 보관합니다.`
      }) === 0,
    fatal: (title, message) => dialog.showErrorBox(title, message)
  }

  void app.whenReady().then(async () => {
    try {
      const userData = app.getPath('userData')
      const clock = (): Date => new Date()
      const files = createElectronFileAccess(() => mainWindow)
      const env: AppEnv = {
        version: app.getVersion(),
        dataDir: userData,
        dbPath: join(userData, 'vocal_crm.db'),
        backupDir: join(userData, 'backups'),
        openPath: async (path) => {
          if (await shell.openPath(path)) throw new AppError('OPEN_FAILED', '폴더를 열지 못했습니다.')
        },
        reload: () => {
          try {
            registerIpc(createHandlers(openDatabase(env.dbPath), clock, files, env), logError)
          } catch (err) {
            logError(err)
            dialog.showErrorBox('VOCAL CRM', '복원한 데이터를 열지 못했습니다. 앱을 다시 실행해 주세요.')
            app.exit(1)
            return
          }
          mainWindow?.webContents.reload()
        }
      }
      const backupDir = env.backupDir
      const opened = openWithRecovery(env.dbPath, backupDir, recoveryUi, new Date())
      if (!opened) {
        app.quit()
        return
      }
      const { db } = opened
      try {
        await runDailyBackup(db, backupDir, new Date())
      } catch (err) {
        logError(err) // 자동 백업 실패로 앱을 막지는 않는다
      }
      registerIpc(createHandlers(db, clock, files, env), logError)
      createWindow()
    } catch (err) {
      logError(err)
      dialog.showErrorBox('VOCAL CRM', '앱을 시작하지 못했습니다. 데이터 폴더의 logs 폴더에 기록을 남겼습니다.')
      app.quit()
    }
  })

  app.on('window-all-closed', () => app.quit())
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  42 passed`, `Tests  171 passed`.

- [ ] **Step 7: 타입 검사·빌드**

Run: `npm run build`
Expected: typecheck 오류 없음, `✓ built in …` 3번.

- [ ] **Step 8: 커밋**

```bash
git add src tests
git commit -m "feat: 백업·앱 정보 채널과 가져오기 전 자동 백업" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 설정·백업 화면

**Files:**
- Create:
  - `src/shared/domain/backupReminder.ts`
  - `src/renderer/src/components/settings/BackupSection.tsx`
  - `src/renderer/src/components/settings/DataSection.tsx`
- Modify:
  - 전체 내용으로 교체: `src/renderer/src/pages/SettingsPage.tsx`
  - 변경만 적용: `src/renderer/src/api/hooks.ts`, `src/renderer/src/layout/AppLayout.tsx` (메뉴 이름 `설정·백업`)
- Test: `tests/unit/backupReminder.test.ts`, `tests/renderer/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: Task 4 의 채널, 계획 1 의 `confirm`·`notifySuccess`·`todayString`·`useApiMutation`
- Produces:
  - `EXTERNAL_BACKUP_REMIND_DAYS = 30`
  - `externalBackupDate(lastIso)` — 로컬 날짜, 없으면 null.
  - `externalBackupLabel(lastIso, today)` — `오늘` / `34일 전` / `없음`.
  - `needsBackupReminder(lastIso, today, dismissedOn)` — 없거나 30일 이상 지났고, 오늘 닫지 않았으면 true.
  - 훅 `useAppInfo()`, `useBackupStatus()`, `useBackups()`
- 화면 문구 (테스트가 확인한다):
  - 제목 `설정·백업`
  - 버튼: `지금 백업`, `백업 파일 내보내기`, `백업 파일 불러오기`, `데이터 폴더 열기`
  - 백업 목록의 버튼 이름은 `이 시점으로 복원` 이고, 접근성 이름은 `<만든 시각> 백업으로 복원` 이다.
  - 복원 확인 창: 버튼 `복원`. 불러오기 확인 창: 버튼 `파일 고르기`.
  - 백업이 없으면 `아직 백업이 없습니다.`
  - `앱 버전 <버전>`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/backupReminder.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { externalBackupDate, externalBackupLabel, needsBackupReminder } from '@shared/domain/backupReminder'

describe('backupReminder', () => {
  it('외부 백업 시각은 로컬 날짜로 본다', () => {
    expect(externalBackupDate('2026-08-25T15:30:00.000Z')).toBe('2026-08-26')
    expect(externalBackupDate(null)).toBeNull()
  })

  it('마지막 외부 백업 문구', () => {
    expect(externalBackupLabel(null, '2026-09-28')).toBe('없음')
    expect(externalBackupLabel('2026-09-28T01:00:00.000Z', '2026-09-28')).toBe('오늘')
    expect(externalBackupLabel('2026-08-25T01:00:00.000Z', '2026-09-28')).toBe('34일 전')
  })

  it('없거나 30일 이상 지나면 안내하고, 29일이면 안내하지 않는다', () => {
    expect(needsBackupReminder(null, '2026-09-28', null)).toBe(true)
    expect(needsBackupReminder('2026-08-29T01:00:00.000Z', '2026-09-28', null)).toBe(true)
    expect(needsBackupReminder('2026-08-30T01:00:00.000Z', '2026-09-28', null)).toBe(false)
  })

  it('오늘 닫았으면 안내하지 않고, 다음 날에는 다시 안내한다', () => {
    expect(needsBackupReminder(null, '2026-09-28', '2026-09-28')).toBe(false)
    expect(needsBackupReminder(null, '2026-09-29', '2026-09-28')).toBe(true)
  })
})
```

`tests/renderer/SettingsPage.test.tsx`

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BackupInfo } from '@shared/backupTypes'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { mockApi, renderWithProviders } from './render'

const backups: BackupInfo[] = [
  { fileName: 'vocal_crm_20260928_093000_before-import.db', kind: 'before-import', createdAt: '2026-09-28 09:30:00', size: 204800 },
  { fileName: 'vocal_crm_20260927_090000_auto.db', kind: 'auto', createdAt: '2026-09-27 09:00:00', size: 200000 }
]

const api = (over: Record<string, (...args: unknown[]) => unknown> = {}) =>
  mockApi({
    'settings.get': () => ({ branchName: '강남점', lessonMinutes: 60 }),
    'backup.status': () => ({ lastExternalBackupAt: '2026-08-25T01:00:00.000Z', backupCount: 2 }),
    'backup.list': () => backups,
    'app.info': () => ({ version: '0.1.0', dataDir: 'C:\\Users\\t\\AppData\\Roaming\\VOCAL_CRM' }),
    ...over
  })

describe('설정·백업', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 28, 10, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('백업 목록, 마지막 외부 백업, 데이터 폴더와 앱 버전을 보여준다', async () => {
    api()
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByText('2026-09-28 09:30:00')).toBeInTheDocument()
    expect(screen.getByText('가져오기 전')).toBeInTheDocument()
    expect(screen.getByText('자동')).toBeInTheDocument()
    expect(screen.getByText('200 KB')).toBeInTheDocument()
    expect(screen.getByText('34일 전')).toBeInTheDocument()
    expect(screen.getByText('C:\\Users\\t\\AppData\\Roaming\\VOCAL_CRM')).toBeInTheDocument()
    expect(screen.getByText('앱 버전 0.1.0')).toBeInTheDocument()
  })

  it('지금 백업 · 백업 파일 내보내기 · 데이터 폴더 열기', async () => {
    const user = userEvent.setup()
    const invoke = api({ 'backup.create': () => backups[0], 'backup.exportFile': () => ({ saved: true }) })
    renderWithProviders(<SettingsPage />)
    await user.click(await screen.findByRole('button', { name: '지금 백업' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('backup.create'))
    await user.click(screen.getByRole('button', { name: '백업 파일 내보내기' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('backup.exportFile'))
    await user.click(screen.getByRole('button', { name: '데이터 폴더 열기' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('app.openDataFolder'))
  })

  it('이 시점으로 복원은 확인한 뒤에만 요청한다', async () => {
    const user = userEvent.setup()
    const invoke = api()
    renderWithProviders(<SettingsPage />)
    await user.click(await screen.findByRole('button', { name: '2026-09-27 09:00:00 백업으로 복원' }))
    expect(await screen.findByText(/2026-09-27 09:00:00 \(자동\) 백업으로 되돌립니다/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByText(/백업으로 되돌립니다/)).not.toBeInTheDocument())
    expect(invoke).not.toHaveBeenCalledWith('backup.restore', expect.anything())

    await user.click(screen.getByRole('button', { name: '2026-09-27 09:00:00 백업으로 복원' }))
    await user.click(await screen.findByRole('button', { name: '복원' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('backup.restore', 'vocal_crm_20260927_090000_auto.db'))
  })

  it('백업 파일 불러오기는 확인한 뒤 파일을 고른다', async () => {
    const user = userEvent.setup()
    const invoke = api({ 'backup.importFile': () => ({ restored: false }) })
    renderWithProviders(<SettingsPage />)
    await user.click(await screen.findByRole('button', { name: '백업 파일 불러오기' }))
    await user.click(await screen.findByRole('button', { name: '파일 고르기' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('backup.importFile'))
  })

  it('백업이 없으면 안내 문구를 보여준다', async () => {
    api({ 'backup.list': () => [], 'backup.status': () => ({ lastExternalBackupAt: null, backupCount: 0 }) })
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByText('아직 백업이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('없음')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/unit/backupReminder.test.ts tests/renderer/SettingsPage.test.tsx`
Expected: FAIL
- `Cannot find package '@shared/domain/backupReminder'`
- `Unable to find role="button" and name "지금 백업"`

- [ ] **Step 3: 구현**

`src/shared/domain/backupReminder.ts`

```ts
import { daysBetween, relativeDays, toDateString } from './dates'

/** 외부 백업이 이 일수 이상 지나면 홈에 안내한다 (설계 7장) */
export const EXTERNAL_BACKUP_REMIND_DAYS = 30

/** 마지막 외부 백업 날짜(로컬 YYYY-MM-DD). 한 번도 안 했으면 null */
export function externalBackupDate(lastIso: string | null): string | null {
  return lastIso ? toDateString(new Date(lastIso)) : null
}

/** "오늘" / "34일 전" / "없음" */
export function externalBackupLabel(lastIso: string | null, today: string): string {
  const date = externalBackupDate(lastIso)
  return date ? relativeDays(date, today) : '없음'
}

/** 외부 백업이 없거나 30일이 지났고, 오늘 닫지 않았으면 안내한다 */
export function needsBackupReminder(lastIso: string | null, today: string, dismissedOn: string | null): boolean {
  if (dismissedOn === today) return false
  const date = externalBackupDate(lastIso)
  return date === null || daysBetween(date, today) >= EXTERNAL_BACKUP_REMIND_DAYS
}
```

`src/renderer/src/api/hooks.ts` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/renderer/src/api/hooks.ts
+++ b/src/renderer/src/api/hooks.ts
@@ -28,6 +28,12 @@ export const useOpenReservationCount = (customerId: string) =>
     queryFn: () => call('customers.countOpenReservations', customerId)
   })
 
+export const useAppInfo = () => useQuery({ queryKey: ['appInfo'], queryFn: () => call('app.info') })
+
+export const useBackupStatus = () => useQuery({ queryKey: ['backupStatus'], queryFn: () => call('backup.status') })
+
+export const useBackups = () => useQuery({ queryKey: ['backups'], queryFn: () => call('backup.list') })
+
 /**
  * 저장·삭제용. 성공하면 모든 조회를 다시 불러온다 (데이터가 작아서 전부 갱신해도 충분히 빠르다).
  * 사용: const save = useApiMutation('lessons.save'); await save.mutateAsync([input])
```

`src/renderer/src/components/settings/BackupSection.tsx`

```tsx
import { Badge, Button, Group, Paper, ScrollArea, Stack, Table, Text } from '@mantine/core'
import { BACKUP_KIND_LABEL, type BackupInfo } from '@shared/backupTypes'
import { externalBackupLabel } from '@shared/domain/backupReminder'
import { useApiMutation, useBackups, useBackupStatus } from '../../api/hooks'
import { confirm } from '../../lib/confirm'
import { notifySuccess } from '../../lib/notify'
import { todayString } from '../../lib/today'

const KIND_COLOR: Record<BackupInfo['kind'], string> = {
  auto: 'gray',
  manual: 'blue',
  'before-import': 'grape',
  'before-restore': 'orange'
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** 설정 화면의 백업 영역 (설계 5.9) */
export function BackupSection(): React.JSX.Element {
  const status = useBackupStatus()
  const backups = useBackups()
  const create = useApiMutation('backup.create')
  const exportFile = useApiMutation('backup.exportFile')
  const importFile = useApiMutation('backup.importFile')
  const restore = useApiMutation('backup.restore')

  const createNow = async (): Promise<void> => {
    try {
      await create.mutateAsync([])
    } catch {
      return
    }
    notifySuccess('백업을 만들었습니다.')
  }

  const saveFile = async (): Promise<void> => {
    try {
      const result = await exportFile.mutateAsync([])
      if (result.saved) notifySuccess('백업 파일을 저장했습니다.')
    } catch {
      return
    }
  }

  const loadFile = async (): Promise<void> => {
    const ok = await confirm({
      title: '백업 파일 불러오기',
      message: "고른 백업 파일로 이 PC의 데이터를 모두 바꿉니다. 지금 데이터는 '복원 전' 백업으로 남겨 둡니다. 불러온 뒤 화면을 새로 불러옵니다.",
      confirmLabel: '파일 고르기',
      danger: true
    })
    if (!ok) return
    try {
      await importFile.mutateAsync([])
    } catch {
      return
    }
  }

  const restoreTo = async (backup: BackupInfo): Promise<void> => {
    const ok = await confirm({
      title: '이 시점으로 복원',
      message: `${backup.createdAt} (${BACKUP_KIND_LABEL[backup.kind]}) 백업으로 되돌립니다. 지금 데이터는 '복원 전' 백업으로 남겨 둡니다. 복원한 뒤 화면을 새로 불러옵니다.`,
      confirmLabel: '복원',
      danger: true
    })
    if (!ok) return
    try {
      await restore.mutateAsync([backup.fileName])
    } catch {
      return
    }
  }

  const busy = restore.isPending || importFile.isPending
  return (
    <Paper withBorder p="lg">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={700}>백업</Text>
            <Text size="sm" c="dimmed">
              자동 백업은 하루 한 번, 가져오기 전, 복원 전에 만들어집니다. 최근 30개를 보관합니다.
            </Text>
          </div>
          <Button variant="light" onClick={() => void createNow()} loading={create.isPending} disabled={busy}>
            지금 백업
          </Button>
        </Group>

        <Paper withBorder p="md" bg="gray.0">
          <Stack gap="xs">
            <Text size="sm">
              마지막 외부 백업:{' '}
              <Text span fw={700}>
                {status.data ? externalBackupLabel(status.data.lastExternalBackupAt, todayString()) : '…'}
              </Text>
            </Text>
            <Text size="sm" c="dimmed">
              PC가 고장 나도 데이터를 지킬 수 있게 백업 파일을 USB나 클라우드 폴더에 저장해 두세요. PC를 바꿀 때는 새 PC에서
              백업 파일을 불러옵니다.
            </Text>
            <Group gap="xs">
              <Button onClick={() => void saveFile()} loading={exportFile.isPending} disabled={busy}>
                백업 파일 내보내기
              </Button>
              <Button variant="default" onClick={() => void loadFile()} loading={importFile.isPending} disabled={busy}>
                백업 파일 불러오기
              </Button>
            </Group>
          </Stack>
        </Paper>

        {backups.data && backups.data.length === 0 && (
          <Text size="sm" c="dimmed">
            아직 백업이 없습니다.
          </Text>
        )}
        {backups.data && backups.data.length > 0 && (
          <ScrollArea.Autosize mah={360}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>만든 시각</Table.Th>
                  <Table.Th>종류</Table.Th>
                  <Table.Th>크기</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {backups.data.map((b) => (
                  <Table.Tr key={b.fileName}>
                    <Table.Td>{b.createdAt}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={KIND_COLOR[b.kind]}>
                        {BACKUP_KIND_LABEL[b.kind]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formatSize(b.size)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Button
                        size="xs"
                        variant="subtle"
                        color="orange"
                        onClick={() => void restoreTo(b)}
                        disabled={busy}
                        aria-label={`${b.createdAt} 백업으로 복원`}
                      >
                        이 시점으로 복원
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </Paper>
  )
}
```

`src/renderer/src/components/settings/DataSection.tsx`

```tsx
import { Button, Code, Group, Paper, Stack, Text } from '@mantine/core'
import { useApiMutation, useAppInfo } from '../../api/hooks'

/** 설정 화면의 데이터·앱 정보 영역 (설계 5.9, 8장 로그) */
export function DataSection(): React.JSX.Element {
  const info = useAppInfo()
  const openFolder = useApiMutation('app.openDataFolder')
  return (
    <Paper withBorder p="lg">
      <Stack gap="sm">
        <Text fw={700}>데이터</Text>
        <Text size="sm" c="dimmed">
          고객 데이터, 자동 백업(backups), 오류 기록(logs)이 이 폴더에 있습니다.
        </Text>
        {info.data && <Code block>{info.data.dataDir}</Code>}
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            앱 버전 {info.data?.version ?? ''}
          </Text>
          <Button variant="default" onClick={() => openFolder.mutate([])}>
            데이터 폴더 열기
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}
```

`src/renderer/src/pages/SettingsPage.tsx` — 아래 전체 내용으로 교체

```tsx
import { useState } from 'react'
import { Button, Group, NumberInput, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import type { Settings } from '@shared/types'
import { useApiMutation, useSettings } from '../api/hooks'
import { BackupSection } from '../components/settings/BackupSection'
import { DataSection } from '../components/settings/DataSection'
import { notifySuccess } from '../lib/notify'

export function SettingsPage(): React.JSX.Element {
  const settings = useSettings()
  if (!settings.data) return <></>
  return (
    <Stack maw={720}>
      <Title order={2}>설정·백업</Title>
      <BasicSettings key={JSON.stringify(settings.data)} settings={settings.data} />
      <BackupSection />
      <DataSection />
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

`src/renderer/src/layout/AppLayout.tsx` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/renderer/src/layout/AppLayout.tsx
+++ b/src/renderer/src/layout/AppLayout.tsx
@@ -44,7 +44,7 @@ export function AppLayout({ branchName }: Props): React.JSX.Element {
         <NavLink
           component={Link}
           to="/settings"
-          label="설정"
+          label="설정·백업"
           leftSection={<IconSettings size={18} />}
           active={pathname === '/settings'}
         />
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  44 passed`, `Tests  180 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "feat: 설정·백업 화면" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 홈 외부 백업 안내

**Files:**
- Create: `src/renderer/src/components/home/BackupReminder.tsx`
- Modify: `src/renderer/src/pages/HomePage.tsx`
- Test: `tests/renderer/BackupReminder.test.tsx`

**Interfaces:**
- Consumes: Task 5 의 `needsBackupReminder`, `externalBackupLabel`, `useBackupStatus`
- Produces:
  - `BackupReminder({ today })` — 홈 제목 아래 노란 안내. `마지막 외부 백업: <문구>` 와 버튼 `백업하기`(설정으로 이동), 닫기 버튼 `오늘은 닫기`.
  - 닫으면 localStorage `vocal-crm.backupReminderDismissedOn` 에 오늘 날짜를 저장한다 (상수 `REMINDER_DISMISSED_KEY`).
  - localStorage 를 쓸 수 없어도 오류 없이 동작한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/renderer/BackupReminder.test.tsx`

```tsx
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { useBackupStatus } from '@renderer/api/hooks'
import { BackupReminder, REMINDER_DISMISSED_KEY } from '@renderer/components/home/BackupReminder'
import { mockApi, renderWithProviders } from './render'

const TODAY = '2026-09-28'

/** 백업 상태를 불러왔는지 알려 주는 표시. 안내가 "안 보임"을 확인하기 전에 기다린다 */
function Loaded(): React.JSX.Element | null {
  return useBackupStatus().data ? <p>불러옴</p> : null
}

function renderReminder(lastExternalBackupAt: string | null): void {
  mockApi({ 'backup.status': () => ({ lastExternalBackupAt, backupCount: 3 }) })
  renderWithProviders(
    <Routes>
      <Route
        path="/"
        element={
          <>
            <BackupReminder today={TODAY} />
            <Loaded />
          </>
        }
      />
      <Route path="/settings" element={<p>설정 화면</p>} />
    </Routes>
  )
}

describe('외부 백업 안내', () => {
  beforeEach(() => localStorage.clear())

  it('30일이 지나면 마지막 외부 백업 날짜와 함께 보인다', async () => {
    renderReminder('2026-08-25T01:00:00.000Z')
    expect(await screen.findByText('34일 전')).toBeInTheDocument()
  })

  it('한 번도 외부 백업을 안 했으면 "없음"으로 보인다', async () => {
    renderReminder(null)
    expect(await screen.findByText('없음')).toBeInTheDocument()
  })

  it('최근에 백업했으면 보이지 않는다', async () => {
    renderReminder('2026-09-20T01:00:00.000Z')
    await screen.findByText('불러옴')
    expect(screen.queryByText(/마지막 외부 백업/)).not.toBeInTheDocument()
  })

  it('백업하기를 누르면 설정 화면으로 간다', async () => {
    const user = userEvent.setup()
    renderReminder(null)
    await user.click(await screen.findByRole('button', { name: '백업하기' }))
    expect(screen.getByText('설정 화면')).toBeInTheDocument()
  })

  it('닫으면 오늘 날짜를 기억해 그날은 다시 보이지 않는다', async () => {
    const user = userEvent.setup()
    renderReminder(null)
    await user.click(await screen.findByRole('button', { name: '오늘은 닫기' }))
    expect(screen.queryByText(/마지막 외부 백업/)).not.toBeInTheDocument()
    expect(localStorage.getItem(REMINDER_DISMISSED_KEY)).toBe(TODAY)
  })

  it('오늘 이미 닫았으면 처음부터 보이지 않는다', async () => {
    localStorage.setItem(REMINDER_DISMISSED_KEY, TODAY)
    renderReminder(null)
    await screen.findByText('불러옴')
    expect(screen.queryByText(/마지막 외부 백업/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/renderer/BackupReminder.test.tsx`
Expected: FAIL — `Failed to resolve import "@renderer/components/home/BackupReminder"`.

- [ ] **Step 3: 구현**

`src/renderer/src/components/home/BackupReminder.tsx`

```tsx
import { useState } from 'react'
import { Alert, Button, CloseButton, Group, Text } from '@mantine/core'
import { IconDatabaseExport } from '@tabler/icons-react'
import { useNavigate } from 'react-router'
import { externalBackupLabel, needsBackupReminder } from '@shared/domain/backupReminder'
import { useBackupStatus } from '../../api/hooks'

export const REMINDER_DISMISSED_KEY = 'vocal-crm.backupReminderDismissedOn'

function readDismissed(): string | null {
  try {
    return localStorage.getItem(REMINDER_DISMISSED_KEY)
  } catch {
    return null
  }
}

function writeDismissed(today: string): void {
  try {
    localStorage.setItem(REMINDER_DISMISSED_KEY, today)
  } catch {
    // 저장하지 못해도 이번 화면에서는 닫힌다
  }
}

/** 외부 백업이 없거나 30일이 지나면 홈 상단에 보이는 안내 (설계 7장). 닫으면 그날은 다시 보이지 않는다 */
export function BackupReminder({ today }: { today: string }): React.JSX.Element | null {
  const status = useBackupStatus()
  const navigate = useNavigate()
  const [dismissedOn, setDismissedOn] = useState(readDismissed)
  if (!status.data || !needsBackupReminder(status.data.lastExternalBackupAt, today, dismissedOn)) return null
  const dismiss = (): void => {
    writeDismissed(today)
    setDismissedOn(today)
  }
  return (
    <Alert color="yellow" variant="light" py="xs" icon={<IconDatabaseExport size={18} />}>
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">
          마지막 외부 백업: <b>{externalBackupLabel(status.data.lastExternalBackupAt, today)}</b> · 백업 파일을 USB나 클라우드
          폴더에 저장해 두세요.
        </Text>
        <Group gap={4} wrap="nowrap">
          <Button size="xs" variant="light" color="yellow" onClick={() => void navigate('/settings')}>
            백업하기
          </Button>
          <CloseButton size="sm" aria-label="오늘은 닫기" onClick={dismiss} />
        </Group>
      </Group>
    </Alert>
  )
}
```

`src/renderer/src/pages/HomePage.tsx` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/renderer/src/pages/HomePage.tsx
+++ b/src/renderer/src/pages/HomePage.tsx
@@ -2,6 +2,7 @@ import { Button, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@
 import { IconPlus } from '@tabler/icons-react'
 import { formatKoreanDate } from '@shared/domain/dates'
 import { useHome } from '../api/hooks'
+import { BackupReminder } from '../components/home/BackupReminder'
 import { CustomerTable } from '../components/home/CustomerTable'
 import { StatsRow } from '../components/home/StatsRow'
 import { TodayPanel } from '../components/home/TodayPanel'
@@ -36,6 +37,7 @@ export function HomePage(): React.JSX.Element {
           </Button>
         </Group>
       </Group>
+      <BackupReminder today={data.today} />
       <StatsRow stats={data.stats} />
       <SimpleGrid cols={2} spacing="md">
         <TodayPanel today={data.todayReservations} missed={data.missedReservations} pinnedNotes={pinnedNotes} />
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  45 passed`, `Tests  186 passed`.

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "feat: 홈 외부 백업 안내" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 작성 중 창 닫기 확인과 시작 오류 화면

**Files:**
- Create: `src/renderer/src/lib/useLeaveGuard.ts`
- Modify:
  - 변경만 적용: `src/renderer/src/modals/LessonModal.tsx`, `src/renderer/src/modals/CustomerFormModal.tsx`, `src/renderer/src/App.tsx`
  - 전체 내용으로 교체: `src/main/index.ts`
- Test: `tests/renderer/useLeaveGuard.test.tsx`, `tests/renderer/App.test.tsx`

**Interfaces:**
- Produces:
  - `useLeaveGuard(active: boolean): void` — active 인 동안 `beforeunload` 를 `preventDefault()` 한다.
  - 수업 기록 창은 메모 등이 바뀌었을 때(`dirty`), 고객 정보 창은 입력이 바뀌었을 때 켠다.
- Main (`will-prevent-unload`):
  - `저장하지 않은 입력이 있습니다. 닫을까요?` 확인 창을 띄운다. 버튼은 `닫기` / `계속 작성`, 기본은 `계속 작성`.
  - `닫기` 면 `event.preventDefault()` 로 닫기를 계속한다.
- 시작 화면 (`App`):
  - 설정 조회가 실패하면 로딩에 멈추지 않는다.
  - `데이터를 불러오지 못했습니다.` 와 `다시 시도` 버튼을 보여준다 (계획 1 후속 문서).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/renderer/useLeaveGuard.test.tsx`

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomerDetail } from '@shared/types'
import { useLeaveGuard } from '@renderer/lib/useLeaveGuard'
import { CustomerFormModal } from '@renderer/modals/CustomerFormModal'
import { LessonModal } from '@renderer/modals/LessonModal'
import { makeCustomer } from '../support/factories'
import { mockApi, renderWithProviders } from './render'

const detail: CustomerDetail = {
  customer: makeCustomer({ id: 'c1', name: '김민지' }),
  goals: [],
  lessons: [],
  timeline: [],
  passes: [],
  totalPassCount: 0,
  remainingPasses: null,
  nextReservation: null
}

/** 창을 닫을 때 브라우저가 보내는 이벤트. 멈췄으면 true */
function tryLeave(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('useLeaveGuard', () => {
  it('켜져 있을 때만 창 닫기를 멈추고, 꺼지거나 사라지면 풀린다', () => {
    const { rerender, unmount } = renderHook(({ active }) => useLeaveGuard(active), { initialProps: { active: false } })
    expect(tryLeave()).toBe(false)
    rerender({ active: true })
    expect(tryLeave()).toBe(true)
    rerender({ active: false })
    expect(tryLeave()).toBe(false)
    rerender({ active: true })
    unmount()
    expect(tryLeave()).toBe(false)
  })

  it('고객 정보 창에 입력하면 창 닫기를 멈춘다', async () => {
    const user = userEvent.setup()
    mockApi({})
    renderWithProviders(<CustomerFormModal onClose={vi.fn()} />)
    expect(tryLeave()).toBe(false)
    await user.type(screen.getByLabelText(/이름/), '김')
    expect(tryLeave()).toBe(true)
  })

  it('수업 기록 창에 메모를 쓰면 창 닫기를 멈춘다', async () => {
    const user = userEvent.setup()
    mockApi({ 'customers.detail': () => detail })
    renderWithProviders(<LessonModal customerId="c1" onClose={vi.fn()} onBookNext={vi.fn()} />)
    const memo = await screen.findByLabelText('메모')
    expect(tryLeave()).toBe(false)
    await user.type(memo, '작성 중')
    expect(tryLeave()).toBe(true)
  })
})
```

`tests/renderer/App.test.tsx`

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@renderer/App'

describe('App', () => {
  it('설정을 불러오지 못하면 로딩에 멈추지 않고 다시 시도할 수 있다', async () => {
    const user = userEvent.setup()
    let fail = true
    const invoke = vi.fn(async () =>
      fail
        ? { ok: false, error: { code: 'DB_ERROR', message: '저장하지 못했습니다. 다시 시도해 주세요.' } }
        : { ok: true, data: { branchName: null, lessonMinutes: 60 } }
    )
    window.api = { invoke } as unknown as Window['api']
    render(<App />)
    expect(await screen.findByText('데이터를 불러오지 못했습니다.')).toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(screen.getByLabelText('지점 이름')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run tests/renderer/useLeaveGuard.test.tsx tests/renderer/App.test.tsx`
Expected: FAIL
- `Failed to resolve import "@renderer/lib/useLeaveGuard"`
- `Unable to find an element with the text: 데이터를 불러오지 못했습니다.`

- [ ] **Step 3: 구현**

`src/renderer/src/lib/useLeaveGuard.ts`

```ts
import { useEffect } from 'react'

/**
 * 저장하지 않은 입력이 있는 동안 창 닫기·앱 종료를 한 번 멈춘다.
 * 멈추면 Main 이 'will-prevent-unload' 에서 "닫을까요?" 확인 창을 띄운다 (설계 8장).
 */
export function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [active])
}
```

`src/renderer/src/modals/LessonModal.tsx` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/renderer/src/modals/LessonModal.tsx
+++ b/src/renderer/src/modals/LessonModal.tsx
@@ -6,6 +6,7 @@ import type { CustomerDetail } from '@shared/types'
 import { previousHomework } from '@shared/domain/lessons'
 import { useApiMutation, useCustomerDetail } from '../api/hooks'
 import { confirmDiscard } from '../lib/confirm'
+import { useLeaveGuard } from '../lib/useLeaveGuard'
 import { notifySuccess } from '../lib/notify'
 import { todayString } from '../lib/today'
 
@@ -24,6 +25,7 @@ interface Props extends LessonTarget {
 export function LessonModal({ customerId, lessonId, reservationId, date, onClose, onBookNext }: Props): React.JSX.Element {
   const detail = useCustomerDetail(customerId)
   const [dirty, setDirty] = useState(false)
+  useLeaveGuard(dirty)
 
   const requestClose = async (): Promise<void> => {
     if (!dirty || (await confirmDiscard('작성 중인 메모가 있습니다. 닫을까요?'))) onClose()
```

`src/renderer/src/modals/CustomerFormModal.tsx` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/renderer/src/modals/CustomerFormModal.tsx
+++ b/src/renderer/src/modals/CustomerFormModal.tsx
@@ -7,6 +7,7 @@ import { PURPOSE_LABEL } from '@shared/domain/labels'
 import { formatPhone } from '@shared/domain/phone'
 import { useApiMutation } from '../api/hooks'
 import { confirm, confirmDiscard } from '../lib/confirm'
+import { useLeaveGuard } from '../lib/useLeaveGuard'
 import { notifySuccess } from '../lib/notify'
 import { todayString } from '../lib/today'
 
@@ -37,6 +38,7 @@ export function CustomerFormModal({ customer, onClose }: CustomerFormTarget & {
   const [nameError, setNameError] = useState<string | null>(null)
   const set = (patch: Partial<CustomerInput>): void => setValues((v) => ({ ...v, ...patch }))
   const dirty = JSON.stringify(values) !== JSON.stringify(initial)
+  useLeaveGuard(dirty)
   const create = useApiMutation('customers.create')
   const update = useApiMutation('customers.update')
   const remove = useApiMutation('customers.remove')
```

`src/renderer/src/App.tsx` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/src/renderer/src/App.tsx
+++ b/src/renderer/src/App.tsx
@@ -1,4 +1,4 @@
-import { Center, Loader, MantineProvider } from '@mantine/core'
+import { Button, Center, Loader, MantineProvider, Stack, Text } from '@mantine/core'
 import { DatesProvider } from '@mantine/dates'
 import { ModalsProvider } from '@mantine/modals'
 import { Notifications } from '@mantine/notifications'
@@ -24,6 +24,18 @@ const queryClient = new QueryClient({
 
 function Root(): React.JSX.Element {
   const settings = useSettings()
+  if (settings.isError) {
+    return (
+      <Center h="100vh">
+        <Stack align="center" gap="sm">
+          <Text>데이터를 불러오지 못했습니다.</Text>
+          <Button variant="light" onClick={() => void settings.refetch()} loading={settings.isFetching}>
+            다시 시도
+          </Button>
+        </Stack>
+      </Center>
+    )
+  }
   if (!settings.data) {
     return (
       <Center h="100vh">
```

`src/main/index.ts` — 아래 전체 내용으로 교체

```ts
import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BACKUP_KIND_LABEL } from '@shared/backupTypes'
import { AppError } from '@shared/result'
import type { AppEnv } from './backup/env'
import { openWithRecovery, runDailyBackup, type RecoveryUi } from './backup/startup'
import { openDatabase } from './db/connection'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { initLogging, logError } from './logger'
import { isAllowedNavigation, isSafeExternalUrl } from './security'
import { createElectronFileAccess } from './transfer/electronFiles'

// 데이터 폴더: E2E 테스트는 VOCAL_CRM_USER_DATA 로 임시 폴더를 쓰고, 개발 중에는 실제 데이터와 섞이지 않게 별도 폴더를 쓴다
const userDataOverride = process.env['VOCAL_CRM_USER_DATA']
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
} else if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'VOCAL_CRM-dev'))
}
initLogging()

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
  // 화면에 저장하지 않은 입력이 있어 닫기가 멈추면(useLeaveGuard) 여기서 확인한다. preventDefault 는 "그래도 닫기"
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    if (!mainWindow) return
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['닫기', '계속 작성'],
      defaultId: 1,
      cancelId: 1,
      title: 'VOCAL CRM',
      message: '저장하지 않은 입력이 있습니다. 닫을까요?',
      detail: '닫으면 작성 중인 내용은 저장되지 않습니다.'
    })
    if (choice === 0) event.preventDefault()
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const indexHtml = join(__dirname, '../renderer/index.html')
  const appUrl = devUrl ?? pathToFileURL(indexHtml).href
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, appUrl)) event.preventDefault()
  })

  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(indexHtml)
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

  const recoveryUi: RecoveryUi = {
    askRestore: (latest) =>
      dialog.showMessageBoxSync({
        type: 'warning',
        buttons: ['최근 백업으로 복원', '종료'],
        defaultId: 0,
        cancelId: 1,
        title: 'VOCAL CRM',
        message: '데이터 파일에 문제가 있습니다. 최근 백업으로 복원할까요?',
        detail: `최근 백업: ${latest.createdAt} (${BACKUP_KIND_LABEL[latest.kind]})\n지금 파일은 지우지 않고 옆에 따로 보관합니다.`
      }) === 0,
    fatal: (title, message) => dialog.showErrorBox(title, message)
  }

  void app.whenReady().then(async () => {
    try {
      const userData = app.getPath('userData')
      const clock = (): Date => new Date()
      const files = createElectronFileAccess(() => mainWindow)
      const env: AppEnv = {
        version: app.getVersion(),
        dataDir: userData,
        dbPath: join(userData, 'vocal_crm.db'),
        backupDir: join(userData, 'backups'),
        openPath: async (path) => {
          if (await shell.openPath(path)) throw new AppError('OPEN_FAILED', '폴더를 열지 못했습니다.')
        },
        reload: () => {
          try {
            registerIpc(createHandlers(openDatabase(env.dbPath), clock, files, env), logError)
          } catch (err) {
            logError(err)
            dialog.showErrorBox('VOCAL CRM', '복원한 데이터를 열지 못했습니다. 앱을 다시 실행해 주세요.')
            app.exit(1)
            return
          }
          mainWindow?.webContents.reload()
        }
      }
      const backupDir = env.backupDir
      const opened = openWithRecovery(env.dbPath, backupDir, recoveryUi, new Date())
      if (!opened) {
        app.quit()
        return
      }
      const { db } = opened
      try {
        await runDailyBackup(db, backupDir, new Date())
      } catch (err) {
        logError(err) // 자동 백업 실패로 앱을 막지는 않는다
      }
      registerIpc(createHandlers(db, clock, files, env), logError)
      createWindow()
    } catch (err) {
      logError(err)
      dialog.showErrorBox('VOCAL CRM', '앱을 시작하지 못했습니다. 데이터 폴더의 logs 폴더에 기록을 남겼습니다.')
      app.quit()
    }
  })

  app.on('window-all-closed', () => app.quit())
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  47 passed`, `Tests  190 passed`.

- [ ] **Step 5: 타입 검사·빌드**

Run: `npm run build`
Expected: typecheck 오류 없음, `✓ built in …` 3번.

- [ ] **Step 6: 커밋**

```bash
git add src tests
git commit -m "feat: 작성 중 창 닫기 확인과 시작 오류 화면" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 실제 앱 E2E (Playwright Electron)

**Files:**
- Create: `playwright.config.ts`, `e2e/app.ts`, `e2e/smoke.spec.ts`, `e2e/backup.spec.ts`, `e2e/closeGuard.spec.ts`
- Modify: `package.json` (npm 과 script), `tsconfig.node.json`, `.gitignore`

**Interfaces:**
- Consumes: Task 1 의 `VOCAL_CRM_USER_DATA`, Task 4~7 의 화면 문구
- Produces (`e2e/app.ts`):
  - 테스트 fixture `test` 가 테스트마다 빈 임시 데이터 폴더로 앱을 띄우고 끝나면 지운다. 제공 값: `userDataDir`, `app`, `page`.
  - `VOCAL_CRM_E2E_EXE` 가 있으면 그 exe 를, 없으면 `out/` 을 실행한다.
  - 도우미: `stubSaveDialog(app, path)`, `stubOpenDialog(app, path)`, `onboard(page, 지점?)`, `nav(page, 메뉴)`, `modal(page)`
  - 대화상자는 `app.evaluate(({ dialog }) => …)` 로 Main 에서 바꿔 끼운다 (계획 2 후속 문서의 방식).
- 스크립트: `npm run test:e2e` = `npm run build && playwright test`

- [ ] **Step 1: 패키지 설치와 설정**

Run: `npm install -D @playwright/test@^1.63.0`

`package.json` 의 `scripts` 에서 `"test:watch": "vitest"` 끝에 쉼표를 붙이고, 그 다음 줄에 추가:

```json
    "test:e2e": "npm run build && playwright test"
```

`tsconfig.node.json` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/tsconfig.node.json
+++ b/tsconfig.node.json
@@ -3,6 +3,8 @@
   "include": [
     "electron.vite.config.ts",
     "vitest.config.ts",
+    "playwright.config.ts",
+    "e2e/**/*",
     "src/main/**/*",
     "src/preload/**/*",
     "src/shared/**/*",
```

`.gitignore` — 아래 변경만 적용 (`-` 줄을 지우고 `+` 줄을 넣는다)

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -6,3 +6,5 @@ coverage/
 *.log
 .DS_Store
 .superpowers/
+test-results/
+playwright-report/
```

`playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test'

// 실제 앱(Electron)을 띄워 확인한다. 먼저 `npm run build` 로 out/ 을 만든다 (npm run test:e2e 가 해 준다)
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' }
})
```

`e2e/app.ts`

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, type ElectronApplication, type Page, test as base } from '@playwright/test'

const ROOT = resolve(__dirname, '..')

/**
 * 앱을 띄운다. 데이터는 userDataDir 에 저장된다 (VOCAL_CRM_USER_DATA).
 * VOCAL_CRM_E2E_EXE 가 있으면 빌드된 exe(예: release/win-unpacked/VOCAL_CRM.exe)를, 없으면 out/ 을 실행한다.
 */
async function launchApp(userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const exe = process.env['VOCAL_CRM_E2E_EXE']
  const env = { ...process.env, VOCAL_CRM_USER_DATA: userDataDir }
  delete env['ELECTRON_RUN_AS_NODE']
  const app = exe
    ? await _electron.launch({ executablePath: exe, args: [], env })
    : await _electron.launch({ args: ['.'], cwd: ROOT, env })
  const page = await app.firstWindow()
  return { app, page }
}

/** 저장 대화상자가 path 를 고른 것처럼 만든다 */
export async function stubSaveDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog
  }, path)
}

/** 열기 대화상자가 path 를 고른 것처럼 만든다 */
export async function stubOpenDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog
  }, path)
}

/** 첫 실행 화면에서 지점 이름을 넣고 홈으로 간다 */
export async function onboard(page: Page, branchName = '강남점'): Promise<void> {
  await page.getByLabel('지점 이름').fill(branchName)
  await page.getByLabel('지점 이름').press('Enter')
  await page.getByText('전체 고객').waitFor()
}

export const nav = (page: Page, name: string) => page.locator('.mantine-AppShell-navbar').getByRole('link', { name })

export const modal = (page: Page) => page.locator('.mantine-Modal-content').last()

/** 테스트마다 빈 데이터 폴더와 앱을 준비하고, 끝나면 정리한다 */
export const test = base.extend<{ userDataDir: string; app: ElectronApplication; page: Page }>({
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'vocal-crm-e2e-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },
  app: async ({ userDataDir }, use) => {
    const { app } = await launchApp(userDataDir)
    await use(app)
    await app.close().catch(() => {})
  },
  page: async ({ app }, use) => {
    await use(await app.firstWindow())
  }
})

export { expect } from '@playwright/test'
```

- [ ] **Step 2: E2E 작성**

`e2e/smoke.spec.ts`

```ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, modal, nav, onboard, stubSaveDialog, test } from './app'

// 설계 9장 E2E 스모크: 첫 실행 → 고객 추가 → 예약(겹침 확인) → 수업 기록 → .vcrm 내보내기
test('첫 실행부터 수업 기록, 지점 이동 파일 내보내기까지', async ({ app, page, userDataDir }) => {
  await onboard(page)
  await expect(page.locator('.mantine-AppShell-navbar')).toContainText('강남점')
  // 데이터·로그는 데이터 폴더 안에 생긴다
  expect(existsSync(join(userDataDir, 'vocal_crm.db'))).toBe(true)
  expect(existsSync(join(userDataDir, 'logs', 'main.log'))).toBe(true)

  // 고객 추가
  await page.getByRole('button', { name: '새 고객' }).click()
  await modal(page).getByLabel(/이름/).fill('김민지')
  await modal(page).getByLabel('연락처').pressSequentially('01012345678')
  await modal(page).getByLabel(/공통메모/).fill('성대결절 이력')
  await modal(page).getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('heading', { name: '김민지' })).toBeVisible()

  // 오늘 15:00 예약
  await page.getByRole('button', { name: '예약' }).click()
  await modal(page).getByPlaceholder('예: 15:00').click()
  await page.getByRole('option', { name: '15:00', exact: true }).click()
  await modal(page).getByRole('button', { name: '예약 저장' }).click()
  await expect(page.getByText(/다음 예약 · 오늘 15:00/)).toBeVisible()

  // 두 번째 고객을 15:30 에 예약하면 겹침 확인 창이 뜬다
  await nav(page, '홈').click()
  await page.getByRole('button', { name: '새 고객' }).click()
  await modal(page).getByLabel(/이름/).fill('박서준')
  await modal(page).getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('heading', { name: '박서준' })).toBeVisible()
  await page.getByRole('button', { name: '예약' }).click()
  await modal(page).getByPlaceholder('예: 15:00').click()
  await page.getByRole('option', { name: '15:30', exact: true }).click()
  await expect(modal(page).getByText(/15:00 김민지 예약과 겹칩니다/)).toBeVisible()
  await modal(page).getByRole('button', { name: '예약 저장' }).click()
  await page.getByRole('button', { name: '그래도 저장' }).click()
  await expect(page.getByText(/다음 예약 · 오늘 15:30/)).toBeVisible()

  // 홈에서 수업 기록
  await nav(page, '홈').click()
  await expect(page.getByText('오늘 수업 2')).toBeVisible()
  await page.getByRole('button', { name: '수업 기록' }).first().click()
  await modal(page).getByLabel('메모').fill('브릿지 고음 개선됨')
  await modal(page).getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByText('✓ 기록됨')).toBeVisible()

  // .vcrm 내보내기
  const file = join(userDataDir, 'export.vcrm')
  await stubSaveDialog(app, file)
  await nav(page, '가져오기·내보내기').click()
  await page.getByRole('button', { name: '고객 선택' }).click()
  await modal(page).getByLabel('보이는 고객 전체 선택').click()
  await modal(page).getByRole('button', { name: '다음' }).click()
  await modal(page).getByRole('button', { name: '파일로 저장' }).click()
  await expect(modal(page)).toBeHidden()
  const exported = JSON.parse(readFileSync(file, 'utf-8')) as { sourceBranch: string; customers: { lessons: unknown[] }[] }
  expect(exported.sourceBranch).toBe('강남점')
  expect(exported.customers).toHaveLength(2)
  expect(exported.customers.flatMap((c) => c.lessons)).toHaveLength(1)
})
```

`e2e/backup.spec.ts`

```ts
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, modal, nav, onboard, stubOpenDialog, stubSaveDialog, test } from './app'

async function addCustomer(page: Page, name: string): Promise<void> {
  await nav(page, '홈').click()
  await page.getByRole('button', { name: '새 고객' }).click()
  await modal(page).getByLabel(/이름/).fill(name)
  await modal(page).getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

const customerRows = (page: Page) => page.locator('tbody tr')

test('자동 백업, 지금 백업, 백업 파일 내보내기와 외부 백업 안내', async ({ app, page, userDataDir }) => {
  await onboard(page)
  await expect(page.getByText(/마지막 외부 백업/)).toBeVisible()

  await nav(page, '설정·백업').click()
  await expect(page.getByText('자동', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '지금 백업' }).click()
  await expect(page.getByText('수동', { exact: true })).toBeVisible()

  const file = join(userDataDir, 'external.vcrmbak')
  await stubSaveDialog(app, file)
  await page.getByRole('button', { name: '백업 파일 내보내기' }).click()
  await expect(page.getByText('백업 파일을 저장했습니다.')).toBeVisible()
  expect(existsSync(file)).toBe(true)
  await expect(page.getByText('오늘', { exact: true })).toBeVisible()

  await nav(page, '홈').click()
  await expect(page.getByText('전체 고객')).toBeVisible()
  await expect(page.getByText(/마지막 외부 백업/)).toBeHidden()
})

test('이 시점으로 복원하면 그때 데이터로 돌아가고, 복원 전 백업이 남는다', async ({ page }) => {
  await onboard(page)
  await addCustomer(page, '김민지')
  await nav(page, '설정·백업').click()
  await page.getByRole('button', { name: '지금 백업' }).click()
  await expect(page.getByText('수동', { exact: true })).toBeVisible()
  await addCustomer(page, '박서준')

  await nav(page, '설정·백업').click()
  const manualRow = page.getByRole('row').filter({ hasText: '수동' })
  await manualRow.getByRole('button', { name: /백업으로 복원/ }).click()
  await modal(page).getByRole('button', { name: '복원' }).click()

  // 화면을 새로 불러오면 목록에 '복원 전' 백업이 보인다
  await expect(page.getByText('복원 전', { exact: true })).toBeVisible()
  await nav(page, '홈').click()
  await expect(customerRows(page)).toHaveCount(1)
  await expect(customerRows(page)).toContainText('김민지')

  // 복원한 DB 에 계속 저장할 수 있다
  await addCustomer(page, '최도윤')
  await nav(page, '홈').click()
  await expect(customerRows(page)).toHaveCount(2)
})

test('백업 파일 불러오기(PC 교체)로 다른 PC의 데이터를 가져온다', async ({ app, page, userDataDir }) => {
  await onboard(page, '홍대점')
  await addCustomer(page, '정유나')
  const file = join(userDataDir, 'from-old-pc.vcrmbak')
  await stubSaveDialog(app, file)
  await nav(page, '설정·백업').click()
  await page.getByRole('button', { name: '백업 파일 내보내기' }).click()
  await expect(page.getByText('백업 파일을 저장했습니다.')).toBeVisible()
  await addCustomer(page, '최도윤')

  await nav(page, '설정·백업').click()
  await stubOpenDialog(app, file)
  await page.getByRole('button', { name: '백업 파일 불러오기' }).click()
  await modal(page).getByRole('button', { name: '파일 고르기' }).click()

  await expect(page.getByText('복원 전', { exact: true })).toBeVisible()
  await nav(page, '홈').click()
  await expect(customerRows(page)).toHaveCount(1)
  await expect(customerRows(page)).toContainText('정유나')
})

test('백업이 아닌 파일을 불러오면 안내하고 데이터는 그대로다', async ({ app, page, userDataDir }) => {
  await onboard(page)
  await addCustomer(page, '김민지')
  await nav(page, '설정·백업').click()
  const notBackup = join(userDataDir, 'memo.vcrmbak')
  writeFileSync(notBackup, '백업 파일이 아닙니다')
  await stubOpenDialog(app, notBackup)
  await page.getByRole('button', { name: '백업 파일 불러오기' }).click()
  await modal(page).getByRole('button', { name: '파일 고르기' }).click()
  await expect(page.getByText(/백업 파일을 읽을 수 없습니다/)).toBeVisible()
  await nav(page, '홈').click()
  await expect(customerRows(page)).toHaveCount(1)
})
```

`e2e/closeGuard.spec.ts`

```ts
import type { ElectronApplication } from '@playwright/test'
import { expect, modal, onboard, test } from './app'

/** 닫기 확인 창이 choice 를 고른 것처럼 만들고, 띄운 문구를 모은다 */
async function stubCloseDialog(app: ElectronApplication, choice: number): Promise<void> {
  await app.evaluate(({ dialog }, c) => {
    const g = globalThis as unknown as { closeDialogMessages: string[] }
    g.closeDialogMessages = []
    dialog.showMessageBoxSync = ((...args: unknown[]) => {
      const options = args.find((a): a is { message: string } => typeof a === 'object' && a !== null && 'message' in a)
      g.closeDialogMessages.push(options?.message ?? '')
      return c
    }) as typeof dialog.showMessageBoxSync
  }, choice)
}

const closeDialogMessages = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as { closeDialogMessages: string[] }).closeDialogMessages)

const closeWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close()
  })

test('작성 중인 입력이 있으면 창을 닫기 전에 묻는다', async ({ app, page }) => {
  // Playwright 는 beforeunload 를 브라우저 대화상자로 보고 스스로 닫으려 한다. Electron 은 대화상자 대신
  // will-prevent-unload 를 보내므로(우리 확인 창), Playwright 가 손대지 않게 빈 처리기를 둔다
  page.on('dialog', () => {})
  await onboard(page)

  // "계속 작성"을 고르면 창과 입력이 그대로 남는다
  await page.getByRole('button', { name: '새 고객' }).click()
  await modal(page).getByLabel(/이름/).pressSequentially('김민지')
  await stubCloseDialog(app, 1)
  await closeWindow(app)
  await expect.poll(() => closeDialogMessages(app)).toEqual(['저장하지 않은 입력이 있습니다. 닫을까요?'])
  await expect(modal(page).getByLabel(/이름/)).toHaveValue('김민지')

  // "닫기"를 고르면 앱이 닫힌다
  await stubCloseDialog(app, 0)
  const closed = app.waitForEvent('close')
  await closeWindow(app)
  await closed
})

test('입력이 없으면 묻지 않고 닫힌다', async ({ app, page }) => {
  await onboard(page)
  await stubCloseDialog(app, 1)
  const closed = app.waitForEvent('close')
  await closeWindow(app)
  await closed
})
```

- [ ] **Step 3: 실행**

Run: `npm run test:e2e`
Expected: `7 passed`.
- 실행하는 동안 앱 창이 잠깐씩 열렸다 닫힌다.
- 브라우저 다운로드는 필요 없다 (Electron 만 쓴다).
- 실패하면 `test-results/` 에 trace 가 남는다: `npx playwright show-trace <경로>`.

- [ ] **Step 4: 단위 테스트가 E2E 파일을 건드리지 않는지 확인**

Run: `npx vitest run`
Expected: PASS — `Test Files  47 passed`, `Tests  190 passed`.

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json playwright.config.ts e2e tsconfig.node.json .gitignore
git commit -m "test: 실제 앱 E2E (스모크·백업·닫기 확인)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Windows 배포 파일, CI, 사용 안내

**Files:**
- Create: `electron-builder.yml`, `.github/workflows/build.yml`, `README.md`, `docs/user-guide.md`
- Modify: `package.json` (npm 과 script)

**Interfaces:**
- 스크립트: `npm run dist:win` = `npm run build && electron-builder --win --publish never`
- 결과 (`release/`):
  - `VOCAL_CRM-<버전>-portable.exe`
  - `VOCAL_CRM-<버전>-win.zip`
  - `win-unpacked/VOCAL_CRM.exe` (CI E2E 용)
- better-sqlite3:
  - N-API 미리 빌드 바이너리를 쓰므로 `npmRebuild: false` 로 다시 빌드하지 않는다.
  - `asarUnpack` 으로 asar 밖에 두고, `win32-x64.node` 만 넣는다.

- [ ] **Step 1: 패키지 설치와 script**

Run: `npm install -D electron-builder@^26.15.3`

`package.json` 의 `scripts` 에서 `"build"` 다음 줄에 추가:

```json
    "dist:win": "npm run build && electron-builder --win --publish never",
```

- [ ] **Step 2: 설정·CI·문서 작성**

`electron-builder.yml`

```yaml
# Windows 배포 파일 2개를 만든다 (설계 10장). 실행: npm run dist:win
appId: com.vocalcrm.app
productName: VOCAL_CRM
directories:
  output: release
  buildResources: build
files:
  - out/**
  - package.json
  # better-sqlite3 는 미리 빌드된 Windows 바이너리(prebuilds/win32-x64.node)만 있으면 된다
  - "!node_modules/better-sqlite3/{deps,src,build}/**"
  - "!node_modules/better-sqlite3/prebuilds/{darwin-arm64,darwin-x64,linux-arm64,linux-x64,linuxmusl-arm64,linuxmusl-x64,win32-arm64}.node"
# .node 파일은 asar 밖에 있어야 불러올 수 있다
asarUnpack:
  - node_modules/better-sqlite3/**
# better-sqlite3 는 N-API 바이너리라 Electron 용으로 다시 빌드하지 않는다
npmRebuild: false
win:
  target:
    - target: portable
      arch: [x64]
    - target: zip
      arch: [x64]
  # zip → VOCAL_CRM-0.1.0-win.zip
  artifactName: ${productName}-${version}-win.${ext}
portable:
  # 한 파일 실행용 → VOCAL_CRM-0.1.0-portable.exe
  artifactName: ${productName}-${version}-portable.${ext}
```

`.github/workflows/build.yml`

```yaml
# Windows 에서 테스트하고 배포 파일(portable exe, zip)을 만든다 (설계 9·10장)
name: Windows build

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
  workflow_dispatch:

jobs:
  windows:
    runs-on: windows-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: 단위·화면 테스트
        run: npm test

      - name: 배포 파일 만들기
        run: npm run dist:win

      - name: E2E (빌드된 exe 로 실행)
        run: npx playwright test
        env:
          VOCAL_CRM_E2E_EXE: ${{ github.workspace }}\release\win-unpacked\VOCAL_CRM.exe

      - name: 배포 파일 올리기
        uses: actions/upload-artifact@v4
        with:
          name: VOCAL_CRM-windows
          path: |
            release/*-portable.exe
            release/*-win.zip
          if-no-files-found: error

      - name: E2E 실패 기록 올리기
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-test-results
          path: test-results
          if-no-files-found: ignore
```

`README.md`

````markdown
# VOCAL CRM

보컬 트레이너 한 명이 여러 지점을 돌며 쓰는 고객·수업 관리 프로그램입니다. Windows PC에서 설치 없이 실행합니다.

- 설계: [docs/superpowers/specs/2026-09-28-vocal-crm-design.md](docs/superpowers/specs/2026-09-28-vocal-crm-design.md)
- 사용 안내(트레이너용): [docs/user-guide.md](docs/user-guide.md)

## 개발

Node 22.12 이상이 필요합니다.

```bash
npm install
npm run dev          # 앱 실행 (데이터: VOCAL_CRM-dev 폴더)
npm test             # 단위·DB·화면 테스트 (Vitest)
npm run typecheck
npm run test:e2e     # 빌드 후 실제 앱을 띄워 확인 (Playwright)
npm run dist:win     # Windows 배포 파일 → release/
```

- `npm run dist:win` 은 Mac 에서도 됩니다. better-sqlite3 는 미리 빌드된 Windows 바이너리를 쓰므로 다시 빌드하지 않습니다.
- E2E 는 테스트마다 임시 데이터 폴더(`VOCAL_CRM_USER_DATA`)를 씁니다. `VOCAL_CRM_E2E_EXE` 에 exe 경로를 주면 빌드된 앱으로 확인합니다.
- GitHub Actions(`.github/workflows/build.yml`)가 `windows-latest` 에서 테스트 → 배포 파일 → E2E 를 돌리고, exe 와 zip 을 아티팩트로 올립니다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/main` | Electron Main: DB(better-sqlite3), 저장소, IPC, 가져오기·내보내기, 백업 |
| `src/preload` | 화면에 `window.api.invoke` 만 열어 준다 |
| `src/renderer` | React + Mantine 화면 |
| `src/shared` | 양쪽이 같이 쓰는 타입, IPC 채널 목록, 계산 로직(`domain`) |
| `tests` | Vitest (`unit`, `db`, `transfer`, `backup`, `renderer`) |
| `e2e` | Playwright Electron |

## 데이터 위치

`%APPDATA%\VOCAL_CRM\` 에 `vocal_crm.db`(전체 데이터), `backups\`(자동 백업 최근 30개), `logs\`(오류 기록)가 있습니다. 앱의 설정·백업 화면에서 `데이터 폴더 열기`로 열 수 있습니다.
````

`docs/user-guide.md`

```markdown
# VOCAL CRM 사용 안내

## 받은 파일

둘 중 편한 것을 쓰면 됩니다. 데이터는 PC에 따로 저장되므로 어느 쪽으로 실행해도 같은 데이터가 보입니다.

| 파일 | 실행 방법 | 특징 |
|---|---|---|
| `VOCAL_CRM-버전-portable.exe` | 더블클릭 | 파일 하나. 켤 때 3~5초 걸립니다 |
| `VOCAL_CRM-버전-win.zip` | 압축을 풀고 폴더 안 `VOCAL_CRM.exe` 더블클릭 | 빨리 켜집니다 |

바탕화면에 두거나, `VOCAL_CRM.exe` 를 오른쪽 클릭 → `작업 표시줄에 고정` 하면 한 번에 열 수 있습니다.

## 처음 실행할 때 "Windows의 PC 보호" 창이 뜨면

서명하지 않은 프로그램이라 Windows가 확인 창을 띄울 수 있습니다.

1. 창의 `추가 정보` 를 누릅니다.
2. 아래에 생긴 `실행` 을 누릅니다.

한 번 실행하면 다음부터는 뜨지 않습니다.

## 지점 이름

처음 실행하면 이 PC의 지점 이름을 묻습니다. 나중에 `설정·백업` 에서 바꿀 수 있습니다.

## 백업

- **자동 백업**: 하루에 한 번(앱을 켤 때), 가져오기 직전, 복원 직전에 자동으로 만들어집니다. 최근 30개를 보관합니다.
- **되돌리기**: `설정·백업` → 백업 목록에서 `이 시점으로 복원`. 지금 상태도 `복원 전` 백업으로 남으므로 다시 되돌릴 수 있습니다. 복원하면 화면을 새로 불러옵니다.
- **외부 백업(권장)**: PC가 고장 나면 PC 안의 자동 백업도 함께 사라집니다. 한 달에 한 번은 `설정·백업` → `백업 파일 내보내기` 로 USB나 클라우드 폴더에 저장해 두세요. 30일이 지나면 홈 화면 위에 안내가 보입니다.

## PC를 바꿀 때

1. 쓰던 PC: `설정·백업` → `백업 파일 내보내기` (`.vcrmbak` 파일)
2. 새 PC: 앱을 실행하고 지점 이름을 넣은 뒤 `설정·백업` → `백업 파일 불러오기` 로 그 파일을 고릅니다.

## 고객이 다른 지점으로 옮길 때

1. 원래 지점 PC: `가져오기·내보내기` → `고객 선택` → 옮길 고객을 고르고 `.vcrm` 파일로 저장합니다.
2. 새 지점 PC: `가져오기·내보내기` → `파일 열기` 로 그 파일을 열고, 고객마다 `신규 추가` 또는 기존 고객과 `합치기` 를 고릅니다.

## 새 버전으로 바꿀 때

새로 받은 exe(또는 zip)로 바꿔서 실행하면 됩니다. 데이터는 PC의 `AppData\Roaming\VOCAL_CRM` 폴더에 있으므로 그대로 남습니다. 바꾸기 전에 외부 백업을 한 번 해 두면 안전합니다.

## 문제가 생기면

`설정·백업` → `데이터 폴더 열기` 에서 `logs` 폴더의 파일을 전달해 주세요. 오류 기록이 들어 있습니다.
```

- [ ] **Step 3: Windows 배포 파일 만들기** (Mac 에서도 된다. 처음에는 Windows 용 Electron 을 내려받는다)

Run: `npm run dist:win`
Expected: `release/VOCAL_CRM-0.1.0-portable.exe`(약 105MB), `release/VOCAL_CRM-0.1.0-win.zip`(약 165MB) 생성.
- `default Electron icon is used` 경고는 정상이다.
- `signing with signtool.exe` 줄이 보여도 인증서가 없으면 서명하지 않는다.

- [ ] **Step 4: 네이티브 모듈 확인**

Run: `ls release/win-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/prebuilds`
Expected: `win32-x64.node` 한 개만.

- [ ] **Step 5: 커밋** (`release/` 는 `.gitignore` 에 이미 있다)

```bash
git add package.json package-lock.json electron-builder.yml .github README.md docs/user-guide.md
git commit -m "build: Windows 배포 파일과 CI, 사용 안내" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 전체 확인

**Files:** 없음. 확인만 한다. 문제가 나오면 해당 Task 의 파일을 고치고, 그 Task 의 테스트부터 다시 돌린다.

- [ ] **Step 1: 자동 검사**

Run: `npm test && npm run test:e2e`
Expected: `Test Files  47 passed`, `Tests  190 passed`; typecheck 오류 없음; E2E `7 passed`.

- [ ] **Step 2: 실제 앱 흐름 확인** (`npm run dev`, 개발 데이터는 `~/Library/Application Support/VOCAL_CRM-dev`)

1. 처음 실행 → 지점 입력 → 홈 위에 노란 `마지막 외부 백업: 없음` 안내. `오늘은 닫기` 를 누르면 사라지고, 앱을 다시 켜도 오늘은 보이지 않는다.
2. 메뉴 `설정·백업` → 백업 목록에 `자동` 1개. `지금 백업` → `수동` 추가.
3. `백업 파일 내보내기` → 저장 창의 파일 이름이 `VOCAL_CRM_백업_<지점>_<오늘>.vcrmbak`. 저장하면 `마지막 외부 백업: 오늘`.
4. 고객 1명 추가 → `수동` 백업의 `이 시점으로 복원` → 확인. 화면을 새로 불러오고, 목록에 `복원 전` 이 생기며, 추가한 고객이 사라진다. `복원 전` 백업으로 다시 복원하면 돌아온다.
5. `.vcrm` 파일 가져오기를 적용하면 목록에 `가져오기 전` 백업이 생긴다.
6. `새 고객` 창에서 이름을 입력한 채 창의 X(닫기)를 누르면 `저장하지 않은 입력이 있습니다. 닫을까요?`. `계속 작성` 이면 그대로이고, `닫기` 면 앱이 닫힌다.
7. `데이터 폴더 열기` → Finder 에 `vocal_crm.db`, `backups`, `logs/main.log` 가 보인다.

- [ ] **Step 3: 개발 데이터 정리**

Run: `rm -rf "$HOME/Library/Application Support/VOCAL_CRM-dev"`

- [ ] **Step 4: Windows 실제 PC 확인** (사용자에게 요청. Mac 에서는 할 수 없다)

`release/` 의 portable exe 와 zip 을 Windows PC 에 복사해서 확인한다.
- SmartScreen `추가 정보` → `실행` 으로 실행된다.
- 데이터가 `%APPDATA%\VOCAL_CRM` 에 생긴다.
- **portable exe 로 복원이 되는지:** 설정·백업에서 복원 → 화면 새로 불러오기 → 데이터 확인.
- 앱을 닫았다 다시 켜도 데이터가 남아 있다.
- 손상 파일 복구: 앱을 끈다 → `vocal_crm.db` 를 메모장으로 열어 아무 글자나 저장 → 다시 켠다 → `최근 백업으로 복원` 창이 뜬다 → 복원하면 `vocal_crm.db.broken-…` 파일이 옆에 남는다.

- [ ] **Step 5: 마무리 커밋** (고친 것이 있을 때만)

```bash
git add -A
git commit -m "fix: 계획 3 전체 확인에서 발견한 문제 수정" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

GitHub Actions(`Windows build`)는 main 에 push 하면 돈다. push 는 사용자에게 묻고 한다.
