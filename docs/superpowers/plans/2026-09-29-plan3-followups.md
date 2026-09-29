# 계획 3 실행 후 남은 항목

계획 3(안전장치·배포)은 2026-09-29 main 에 완료되었다.
- 테스트 48개 파일 206개가 통과하고, 실제 앱 E2E 7개도 통과한다.
- Mac 에서 `npm run dist:win` 으로 Windows portable exe(약 105MB)와 zip(약 163MB)을 만들었다. 압축을 푼 앱에는 네이티브 모듈 `win32-x64.node` 만 들어 있다.

## 트레이너에게 전달하기 전에 반드시 할 것

- **GitHub Actions `Windows build` 가 초록인지 확인한다.**
  - `windows-latest` 에서 테스트 → 배포 파일 → 빌드된 exe 로 E2E 순서로 돈다.
  - Windows 의 파일 잠금·rename 경로를 자동으로 확인하는 곳은 여기뿐이다.
- **실제 Windows PC 에서 portable exe 로 확인한다.**
  - SmartScreen `추가 정보` → `실행`
  - 데이터 폴더 위치: `%APPDATA%\VOCAL_CRM` 에 `vocal_crm.db`, `backups`, `logs\main.log`
  - `지금 백업` → `이 시점으로 복원` 을 하면 화면을 새로 불러오고, `복원 전` 백업이 생긴다
  - 백업 파일 내보내기·불러오기
  - 작성 중 창 닫기 확인
  - 손상 파일 복구: 앱을 끄고 `vocal_crm.db` 를 메모장으로 망가뜨린 뒤 켜면 `최근 백업으로 복원` 창이 뜨고, 복원 뒤 `vocal_crm.db.broken-…` 가 남는다

## 계획 문서와 달라진 점

- **Task 4 — 복원 준비 코드 하나로 합침:** 리뷰에서 복원·불러오기의 준비 코드가 두 번 똑같이 들어 있다는 지적이 나왔다. 사용자가 판단을 맡겨, `prepareRestore` 하나로 합쳤다.
- **최종 리뷰 수정 (F1~F7):**
  - 켤 때 오류를 "손상"(SQLITE_CORRUPT*, SQLITE_NOTADB, 무결성 실패)과 "그 밖의 오류"로 나눈다. 그 밖의 오류는 파일을 건드리지 않고 "PC를 다시 켠 뒤 실행해 주세요"만 안내한다.
  - 켤 때 복원:
    - 쓸 수 있는 가장 최근 백업을 검사해서 고른다.
    - 순서는 백업 복사 → 원본(과 `-journal`)을 `.broken` 으로 이동 → tmp 이동이다.
    - 복원한 뒤 무결성을 다시 검사한다.
  - 백업은 `.tmp` 에 쓴 뒤 정식 이름으로 옮긴다. 실패하면 `BACKUP_FAILED`.
  - 복원 중 rename 은 EPERM/EBUSY/EACCES 이면 최대 3초 재시도한다(`renameWithRetry`).
  - `AppEnv.reload` 를 `reopen` 과 `reloadWindow` 로 나눴다. 복원에 실패하면 원래 DB 로 계속 쓰면서 `복원하지 못했습니다…` 알림이 남는다.
  - 임시 파일 정리 실패가 원래 결과나 오류를 덮지 않는다.
  - 백업·내보내기 중에는 복원 버튼을 잠근다. 설정 재조회가 실패해도 이미 떠 있는 앱이 오류 화면으로 바뀌지 않는다.
  - 사용 안내 두 줄 추가.
- **잔여 수정 (R1~R5):**
  - 복원 실패 경로에서 정리 실패가 reopen 을 막지 않는다.
  - 켤 때 복원의 마지막 rename 이 실패하면 원래 파일로 되돌린다.
  - 백업 tmp rename 도 재시도한다.
  - 무결성 검사가 예외를 던져도 DB 를 닫는다.
- **`.npmrc` 에 `ignore-scripts=true`:**
  - Windows ARM64 PC 에서 `npm ci` 가 실패했다. better-sqlite3 의 `binding.gyp` 때문에 npm 이 node-gyp 를 실행하는데, Python 이 없었다.
  - 이 프로젝트는 미리 빌드된 바이너리를 쓰고, Electron 은 처음 실행할 때 내려받는다. 그래서 설치 스크립트가 필요 없다.
  - 새로 복제한 저장소에서 설치·테스트·빌드·E2E·dist:win 이 모두 통과하는 것을 확인했다.
  - 설치 스크립트를 끄면 Electron 바이너리도 받지 않아 `electron-vite` 가 `Electron uninstall` 오류를 낸다. 그래서 `dev`·`start` 스크립트 앞에 `install-electron` 을 붙였다(이미 받았으면 바로 넘어간다).

## 보강 후보

### 데이터 안전 (드문 경우)

- **켤 때 복원의 되돌리기 자체가 실패할 때:** `startup.ts` 에서 되돌리는 rename 도 실패하면(백신 잠금이 연속으로 걸린 경우) DB 파일이 없는 채로 끝난다. 다음 실행에서 빈 DB 가 새로 생긴다.
  - 데이터는 `.broken-…` 과 `.restore-tmp` 로 남아 있다.
  - 되돌리기를 try 로 감싸고, 실패하면 `copyFileSync` 로 다시 시도한 뒤, 파일 이름을 적어 안내한다.
  - journal 되돌리기가 실패할 때도 안내가 일반 문구로 바뀐다.
- **DB 파일이 없고 백업만 있을 때:** 지금은 빈 DB 로 새로 시작한다. 복원할지 묻는 편이 낫다.
- **`createBackup` 의 catch 안 `rmSync`:** 감싸져 있지 않아서, 정리가 실패하면 `BACKUP_FAILED` 대신 fs 오류가 나간다.
- **자동 백업 최소 보존:** "종류와 상관없이 30개"라서, 하루에 가져오기를 여러 번 하면 며칠치 자동 백업이 밀려난다. 자동 백업은 최소 7~14개 남기는 규칙을 검토한다.
- **PC 시계가 과거로 돌아간 경우:** 새 백업이 만들자마자 정리될 수 있다.

### 사용성

- **외부 백업 알림:** 복원하면 `last_external_backup_at` 도 백업 시점 값으로 돌아간다. 그래서 오늘 외부 백업을 했어도 알림이 다시 뜰 수 있다. 복원 뒤에는 두 값 중 최신을 남긴다.
- **켤 때 복원 알림:** 켤 때 복원했으면, 창이 뜬 뒤 "○○ 백업으로 복원했습니다" 를 한 번 보여준다(`restoredFrom` 값이 이미 있다).
- **화면 오류 기록:** 화면(renderer) 오류는 logs 에 남지 않고, ErrorBoundary 도 없다. electron-log 의 renderer 연결이나 최상위 ErrorBoundary 를 추가한다.
- **앱 아이콘:** 지금은 기본 Electron 아이콘이다. `build/icon.ico` 를 넣으면 바뀐다.

### 코드 정리·테스트

- `security.ts` 의 지역 변수 `app` 이 Electron `app` 과 이름이 겹친다.
- `BackupSection` 의 `try { await mutateAsync } catch { return }` 가 여러 번 반복된다.
- `createBackup` 이 반환값을 만들려고 목록을 다시 조회한다.
- `/settings` 경로 문자열을 하드코딩했다.
- `e2e/app.ts` 의 fixture 가 `firstWindow()` 를 두 번 부른다.
- App 테스트가 모듈 전역 QueryClient 때문에 파일 두 개로 나뉘어 있다. QueryClient 를 주입받게 바꾸면 합칠 수 있다.
- 테스트 보강 후보:
  - RESTORE_FAILED 의 `cause`
  - before-restore 경로의 정리 실패
  - 외부 백업 안내 문장
