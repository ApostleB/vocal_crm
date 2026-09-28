# VOCAL_CRM 설계 문서

- 작성일: 2026-09-28
- 상태: 설계 확정 (구현 계획 작성 전)

## 1. 개요

보컬 트레이너 한 명이 여러 지점을 순회하며 쓰는 고객관리 프로그램.

- **사용 환경**: 각 지점에 놓인 Windows PC. 지점 PC는 트레이너만 사용한다.
- **데이터**: 지점 PC마다 따로 저장한다. 인터넷이 필요 없다.
- **지점 이동**: 고객이 지점을 옮기면 원래 지점에서 파일로 내보내고, 새 지점에서 가져온다. 가져올 때 고객마다 "신규 추가 / 기존 고객에 합치기 / 건너뛰기"를 트레이너가 직접 고른다.
- **주요 용도**: 수업 회차별 메모, 고객 공통메모, 고객별 목표(진도) 체크, 수업 예약, 가벼운 수강권 관리.
- **설치 없음**: exe 파일 하나를 더블클릭하면 실행된다.

## 2. 핵심 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 앱 형태 | Electron 데스크톱 앱 | 사용자 선택. JS 생태계, 자료가 가장 많음 |
| UI | React + TypeScript + Mantine | 깔끔한 기본 디자인, CRM에 필요한 컴포넌트(표, 날짜, 폼, 알림, 모달) 제공 |
| 저장소 | SQLite (better-sqlite3), 앱에 포함 | 별도 DB 설치 없음. 파일 하나 |
| 데이터 위치 | `%APPDATA%\VOCAL_CRM\` | exe 교체·이동과 무관하게 데이터 유지. 실수로 지울 위험 낮음 |
| 배포 | portable exe 1개 + zip 폴더 버전 | 설치 없음. zip 버전은 실행 속도가 빠름 |
| 빌드 | GitHub Actions `windows-latest` | better-sqlite3가 네이티브 모듈이라 Windows에서 빌드 |
| 지점 간 이동 | `.vcrm` 전용 파일 (JSON) | 회차 기록·목표·수강권·이력까지 빠짐없이 이동 |
| 엑셀 | 내보내기(보관·인쇄용) + 명단 등록(첫 시작용) | 엑셀은 지점 이동에 쓰지 않음 |
| 잠금 | 없음 | 트레이너 전용 PC |
| 고객정보 항목 | 고정 항목 | 단순함. 필요하면 다음 버전에서 항목 추가 |

## 3. 아키텍처

### 3.1 프로세스 구조

```
┌─ Renderer (화면) ─────────────┐        ┌─ Main (Node) ─────────────────────┐
│ React + Mantine               │  IPC   │ db/        better-sqlite3, 마이그레이션 │
│ TanStack Query (조회·갱신)     │◀──────▶│ services/  가져오기·합치기, 엑셀, 백업  │
│ window.api.* 만 호출           │preload │ ipc/       도메인별 핸들러            │
└───────────────────────────────┘        └───────────────────────────────────┘
                 ▲                                        ▲
                 └──────── shared/ (타입, API 계약, 순수 도메인 로직, zod 스키마) ┘
```

- 화면은 DB·파일에 직접 접근하지 않는다. preload가 `contextBridge`로 노출한 `window.api`만 호출한다.
- Electron 보안 기본값 유지: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- 계산 규칙(회차, 남은 수강권, 예약 겹침, 합치기)은 `shared/domain/`의 **순수 함수**로 만든다. Electron 없이 테스트할 수 있다.
- 단일 실행: `app.requestSingleInstanceLock()`. exe를 다시 누르면 이미 열린 창을 앞으로 가져온다.

### 3.2 기술 스택

- 빌드·개발: electron-vite, electron-builder
- 화면: React, TypeScript, Mantine (core, dates, notifications, modals), React Router, TanStack Query, dayjs(ko)
- 저장: better-sqlite3
- 파일: exceljs (엑셀), zod (`.vcrm` 검증)
- 로그: electron-log
- 폰트: Pretendard (앱에 포함, 오프라인)
- 테스트: Vitest, Playwright(Electron)

### 3.3 폴더 구조

```
VOCAL_CRM/
  electron.vite.config.ts
  electron-builder.yml
  src/
    main/
      index.ts            창 생성, 단일 실행, 종료 확인
      db/                 connection.ts, migrations/, repositories/
      services/           transfer.ts(내보내기·가져오기), excel.ts, backup.ts
      ipc/                도메인별 핸들러 등록
      logger.ts
    preload/
      index.ts            window.api 노출
    shared/
      types.ts            도메인 타입
      api.ts              IPC API 계약 (채널, 입력, 출력 타입)
      result.ts           Result<T> = { ok: true, data } | { ok: false, error: { code, message } }
      domain/             회차, 수강권, 예약 겹침, 합치기 계획(merge plan) — 순수 함수
      vcrm-schema.ts      .vcrm 파일 zod 스키마
    renderer/
      main.tsx, App.tsx, theme.ts
      pages/              Onboarding, Home, CustomerDetail, Schedule, Transfer, Settings
      components/         LessonModal, ReservationModal, CustomerFormModal, StatusChangeModal, ...
      api/                TanStack Query 훅 (window.api 래핑)
      assets/fonts/
  tests/
    unit/  db/  e2e/
  .github/workflows/build.yml
```

### 3.4 IPC API

- `window.api.<도메인>.<동작>()` 형태. 도메인: `customers`, `goals`, `lessons`, `passes`, `reservations`, `transfer`, `excel`, `backup`, `settings`, `app`.
- 모든 호출은 `Promise<Result<T>>`를 돌려준다. 화면 쪽 래퍼가 실패를 예외로 바꾸고, TanStack Query의 onError에서 한국어 알림을 띄운다.
- 저장 후에는 관련 쿼리를 무효화해서 목록이 자동으로 갱신된다.

### 3.5 데이터 위치

| 경로 (`%APPDATA%\VOCAL_CRM\`) | 내용 |
|---|---|
| `vocal_crm.db` | 전체 데이터 |
| `backups\` | 자동 백업 (최근 30개) |
| `logs\` | 오류 로그 |

Mac 개발 환경에서는 `~/Library/Application Support/VOCAL_CRM/`에 같은 구조로 만들어진다.

## 4. 데이터 모델

공통 규칙:
- 모든 `id`는 UUID v4 (`crypto.randomUUID()`). 지점 간 기록이 섞여도 충돌하지 않고, 같은 기록을 두 번 가져와도 중복되지 않는다.
- 날짜는 `YYYY-MM-DD`, 시각은 `HH:mm`, 생성·수정 시각(`created_at`, `updated_at`)은 ISO 8601 문자열.
- 외래 키는 `ON DELETE CASCADE` (예외는 표에 적음).
- 스키마 버전은 `PRAGMA user_version`으로 관리. 앱 시작 시 마이그레이션을 순서대로 적용한다.

### customers (고객)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | TEXT PK | |
| name | TEXT NOT NULL | 이름 |
| phone | TEXT | 숫자만 저장 (`01012345678`). 화면에서 하이픈 표시 |
| birth_date | TEXT | 생년월일 |
| gender | TEXT | `F` / `M` / NULL |
| purpose | TEXT | `hobby`(취미) / `exam`(입시) / `audition`(오디션) / `pro`(직업) / `other`(기타) / NULL |
| status | TEXT NOT NULL | `active`(수강중) / `paused`(휴강) / `ended`(종료) / `moved`(타지점 이동) |
| registered_at | TEXT NOT NULL | 등록일 (기본: 오늘) |
| vocal_range | TEXT | 음역대 (자유 입력, 예: `F3 ~ C5`) |
| preferred_music | TEXT | 선호 장르·목표곡 (자유 입력) |
| pinned_note | TEXT NOT NULL DEFAULT '' | **공통메모** (고정 영역) |
| pause_until | TEXT | 휴강 종료 예정일 (선택) |
| created_at, updated_at | TEXT | |

### goals (목표 체크리스트, 고객마다 직접 구성)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | TEXT PK | |
| customer_id | TEXT FK | |
| title | TEXT NOT NULL | 목표 내용 |
| done_at | TEXT | 완료일. NULL이면 미완료 |
| completed_lesson_id | TEXT FK → lessons, ON DELETE SET NULL | 수업 기록 창에서 완료 처리한 경우 그 수업 |
| created_at, updated_at | TEXT | 목록은 `created_at` 순 |

### lessons (회차별 수업 기록)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | TEXT PK | |
| customer_id | TEXT FK | |
| lesson_date | TEXT NOT NULL | 수업일 |
| memo | TEXT NOT NULL DEFAULT '' | **메모 (메인 항목)** |
| practice | TEXT | 연습 곡·내용 (선택) |
| homework | TEXT | 다음 과제 (선택) |
| deduct_pass | INTEGER NOT NULL DEFAULT 1 | 수강권 차감 여부 |
| reservation_id | TEXT FK → reservations, ON DELETE SET NULL | 예약에서 기록한 경우. 내보내지 않음 |
| created_at, updated_at | TEXT | |

### passes (수강권 구매 내역)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | TEXT PK | |
| customer_id | TEXT FK | |
| count | INTEGER NOT NULL (> 0) | 횟수 |
| purchased_at | TEXT NOT NULL | 결제일 |
| amount | INTEGER | 금액(원), 선택 |
| note | TEXT | 비고 |
| created_at, updated_at | TEXT | |

### reservations (수업 예약, 지점 전용 — 내보내지 않음)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | TEXT PK | |
| customer_id | TEXT FK | |
| date | TEXT NOT NULL | |
| time | TEXT NOT NULL | `HH:mm`, 10분 단위 |
| status | TEXT NOT NULL | `scheduled`(예정) / `done`(기록 완료) / `canceled`(취소) |
| note | TEXT | 비고 |
| created_at, updated_at | TEXT | |

### status_logs (상태 변경 이력)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | TEXT PK | |
| customer_id | TEXT FK | |
| date | TEXT NOT NULL | |
| from_status | TEXT | 첫 등록이면 NULL |
| to_status | TEXT NOT NULL | |
| reason | TEXT | 사유 또는 자동 문구 (예: `강남점에서 이동해 옴`) |
| created_at | TEXT | |

### customer_aliases (합치기 기록)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| alias_id | TEXT PK | 다른 지점에서 쓰던 고객 id |
| customer_id | TEXT FK | 이 PC의 고객 |

가져오기 미리보기에서 "🔗 이전에 합친 고객" 힌트를 보여주는 데만 쓴다.

### settings (key-value)

| key | 기본값 | 설명 |
|---|---|---|
| branch_name | (첫 실행 시 입력) | 이 PC의 지점 이름 |
| lesson_minutes | `60` | 기본 수업 길이(분). 예약 겹침 판단에 사용 |
| last_auto_backup_date | | 하루 1회 자동 백업 판단 |
| last_external_backup_at | | 외부 백업 알림 판단 |

### 계산 규칙

- **회차**: 저장하지 않는다. 고객의 lessons를 `lesson_date ASC, created_at ASC`로 정렬한 순번. 지난 수업을 끼워 넣거나 합쳐도 자동으로 다시 매겨진다.
- **남은 수강권** = `SUM(passes.count) − COUNT(lessons WHERE deduct_pass = 1)`. 음수 가능 (빨간색 `-2회`). 수강권 구매 기록이 하나도 없으면 `–`로 표시하고 경고하지 않는다.
- **목표 진행** = 완료 목표 수 / 전체 목표 수.
- **예약 겹침**: 같은 날짜에서 두 예약의 시작 시각 차이가 `lesson_minutes`보다 작으면 겹침. 취소된 예약은 제외.
- **예약 없는 수강생**: `status = active`이면서 오늘 이후(오늘 포함) `scheduled` 예약이 없는 고객.
- **지난 미기록 예약**: `status = scheduled`이면서 `date < 오늘`.

## 5. 화면

공통: 왼쪽 메뉴(지점 이름 표시) + 본문. 최소 창 크기 1100×680. 라이트 모드.

메뉴: **홈 / 일정 / 가져오기·내보내기 / 설정·백업**

### 5.1 첫 실행 (Onboarding)

`branch_name`이 없으면 "이 PC는 어느 지점인가요?" 입력 화면을 띄운다. 입력하면 홈으로 이동한다.

### 5.2 홈

- 상단 버튼: `+ 예약`, `+ 새 고객`
- **요약 숫자 4개**: 수강중 / 오늘 수업 / 예약 없음 / 수강권 소진(수강권 기록이 있고 남은 횟수 ≤ 0인 수강중 고객)
- **오늘 수업 패널**: 오늘 예약(취소 제외)을 시간순으로 보여준다. 각 줄에 시간, 이름, 공통메모 표시(●), 다음 회차, 수강권 경고를 표시한다. 기록되지 않은 예약은 `수업 기록` 버튼, 기록된 예약은 `✓ 기록됨`.
  - 지난 미기록 예약이 있으면 패널 하단에 빨간 줄: "지난 예약 중 기록 안 된 수업 N건 · 보기" → 목록에서 수업 기록 / 취소.
- **예약 없는 수강생 패널**: 마지막 수업이 오래된 순 (수업 기록 없는 고객이 맨 위). 마지막 수업이 14일 이상 지났으면 빨간색. 각 줄에 `예약` 버튼.
- **전체 고객 표**: 필터 칩(수강중 / 휴강 / 종료·이동 / 전체) + 이름·연락처 검색.
  - 열: 이름(공통메모 있으면 ●, 마우스를 올리면 내용 표시) / 목적 / 목표 진행(막대 + n/m) / 최근 수업 / 다음 예약 / 회차 / 남은 수강권
  - 열 제목 클릭으로 정렬. 행 클릭 → 고객 상세.

### 5.3 고객 상세 (2단)

- 상단: `← 홈`, 이름, 상태 배지 메뉴(`수강중 ▾`), 버튼 `정보 수정` / `+ 예약` / `+ 수업 기록`
- **왼쪽 (고정 정보)**
  - 공통 고객정보: 연락처, 생년월일(나이)·성별, 목적, 등록일, 음역대, 선호 장르·목표곡
  - 📌 **공통메모**: 노란 박스, 바로 수정 가능
  - **목표 체크리스트**: 진행 막대, 체크/해제(체크하면 완료일 = 오늘), 추가(입력 후 Enter), 이름 수정, 삭제
  - **수강권**: 남은 횟수, 총 구매 횟수, 최근 구매 1건. `+ 구매 추가`, `내역 보기`(수정·삭제)
- **오른쪽 (기록)**
  - 다음 예약 (변경/취소)
  - 회차 카드 최신순: `N회차 · 날짜` 제목, **메모를 가장 크게**, 그 아래 연습 곡·다음 과제를 작은 글씨로, 이 수업에서 완료한 목표 태그, 수강권 차감 표시, 수정/삭제
  - 상태 이력(status_logs)은 날짜 위치에 한 줄 구분선으로 끼워 넣는다. 예: `── 2026-09-28 · 수강 종료 (이사) ──`

### 5.4 수업 기록 창 (메모 중심)

- 제목: `이름 · N회차 · 수업일 ✎` (수업일은 기본 오늘, 예약에서 열면 예약 날짜. ✎로 변경)
- 맨 위 한 줄: 지난 과제 (직전 회차의 homework, 비어 있으면 표시하지 않음)
- **메모**: 가장 큰 입력 칸. 창이 열리면 커서가 여기에 있다. `Ctrl+Enter` = 저장
- 연습 곡·내용 (선택), 다음 과제 (선택)
- 완료한 목표: 미완료 목표를 칩으로 표시, 클릭해서 체크 → 저장 시 `done_at = 수업일`, `completed_lesson_id = 이 수업`
- 수강권 1회 차감 스위치 (기본 켜짐) + "차감 후 N회 남음"
- 버튼: `취소` / `저장 후 다음 예약` / `저장`
- 예약 연결: 예약에서 열었으면 그 예약과 연결. `+ 수업 기록`으로 열었을 때 같은 고객·같은 날짜에 `scheduled` 예약이 있으면 자동으로 연결. 연결된 예약은 `done`이 되고, 수업 기록을 삭제하면 다시 `scheduled`로 돌아간다.
- 메모를 입력한 상태에서 닫으려 하면 "작성 중인 메모가 있습니다. 닫을까요?" 확인.

### 5.5 예약 창

- 고객(검색 선택), 날짜, 시간(10분 단위 선택 + 직접 입력 시 10분 단위로 맞춤), 비고
- 고른 날짜의 이 지점 예약 목록을 함께 보여준다.
- 겹치면 입력 중에 빨간 안내 문구. 저장을 누르면 확인 창("10/6 (화) 15:00에 이하은 예약이 이미 있습니다. 그래도 저장할까요?") → `그래도 저장`하면 저장. **막지 않는다.**

### 5.6 일정 (주간)

- 월~일 7칸, 예약을 시간순으로 표시. `지난주 / 이번 주 / 다음 주`, `+ 예약`
- 색: 예정(파랑), 기록 완료(초록), 지났는데 미기록(빨강), 취소(취소선)
- 예약 클릭 → 수업 기록 / 변경 / 취소

### 5.7 상태 변경 (휴강·종료·재등록·타지점 이동)

상태 배지 메뉴에서 고른다. 모든 변경은 status_logs에 기록된다. 고객을 새로 등록할 때도 `수강 시작` 이력(from NULL → active)을 남긴다.

| 동작 | 입력 | 효과 |
|---|---|---|
| 휴강 | 사유(선택), 휴강 종료 예정일(선택) | 수강중 목록·예약 없음 패널·요약에서 빠짐. 예약은 유지 |
| 종료 | 종료일, 사유(목표 달성 / 개인 사정 / 이사 / 기타) + 한 줄 메모 | 위와 같이 빠짐. **앞으로 잡힌 예약을 함께 취소**(확인 창에 건수 표시). 남은 수강권은 참고로만 표시 |
| 타지점 이동 | 이동할 지점 이름(선택) | 종료와 같은 효과. 이력: `홍대점으로 이동` |
| 재등록 | 없음 | 수강중으로 복귀. 회차는 이어서 매겨짐 |

자동으로 상태를 바꾸지 않는다. 데이터는 지우지 않는다. 고객 삭제는 정보 수정 창의 `고객 삭제`(확인 창)로만 가능하며 모든 관련 기록이 함께 삭제된다.

### 5.8 가져오기·내보내기

첫 화면에 카드 4개: **고객 내보내기(.vcrm)**, **고객 가져오기(.vcrm)**, **엑셀로 내보내기**, **엑셀 명단 등록**.

**고객 선택 창** (내보내기 두 종류 공통)
- 상태 필터 칩 + 검색 + 표. 맨 위 체크박스 = 현재 필터에 보이는 고객 전체 선택.

**.vcrm 내보내기**
- 선택한 고객, 보낼 지점 이름(선택), "내보낸 고객을 '타지점 이동' 상태로 바꾸기"(체크박스, 기본 꺼짐)
- 파일 이름: 1명이면 `김민지_강남점_2026-09-28.vcrm`, 여러 명이면 `고객18명_강남점_2026-09-28.vcrm`
- 저장 위치는 파일 저장 대화상자로 고른다.

**.vcrm 가져오기**
1. 파일 열기 → 검증 (6장). 실패하면 안내만 하고 아무것도 바꾸지 않는다.
2. 미리보기: "홍대점에서 보낸 파일 · 고객 N명 · 내보낸 날짜"
   - 행마다: 가져올 고객(이름, 연락처, 기록 건수) / 이 PC에서 찾은 비슷한 고객(힌트) / 처리 방법 선택
   - 처리 방법: `신규 추가` / `기존 고객에 합치기`(고객 검색 선택) / `건너뛰기`. **기본값은 "선택 안 됨"**
   - 힌트 종류:
     - 🔗 **같은 고객**: 가져올 고객의 id 또는 그 고객의 aliases가 이 PC의 고객 id나 customer_aliases와 일치
     - **비슷한 고객**: 연락처(숫자) 또는 이름(공백 제거)이 같은 고객. 최대 3명. 힌트 옆 `이 고객에 합치기` 버튼으로 바로 선택
   - **한 번에 지정** 버튼 2개 (누를 때만 채워지고 이후 줄마다 변경 가능):
     - `🔗 같은 고객 힌트가 있는 고객 → 그 고객에 합치기`
     - `선택 안 된 나머지 → 신규 추가`
   - 모든 행이 선택되어야 `적용하기`가 활성화된다.
3. 적용: **자동 백업(종류: 가져오기 전)** → 하나의 트랜잭션으로 적용 → 결과 요약("신규 2명, 합침 1명, 건너뜀 0명").

**신규 추가 규칙**
- 고객 id를 그대로 유지한다. 단, 이 PC에 같은 id가 이미 있으면 새 id를 발급하고, 딸린 기록 중 id가 겹치는 것도 새 id로 바꾼다. 바뀐 id를 가리키는 참조(목표의 `completedLessonId`)도 함께 바꾼다.
- 상태는 수강중. 이력 추가: `{보낸 지점}에서 이동해 옴`.

**합치기 규칙** (대상: 이 PC의 고객 T)

| 대상 | 규칙 |
|---|---|
| 회차 기록 | 이 PC에 없는 id만 추가. 같은 id가 있으면 `updated_at`이 더 최신인 쪽 내용으로 갱신 |
| 목표 | 같은 id → 최신 쪽으로 갱신. id가 달라도 제목이 같으면(앞뒤 공백 제거, 대소문자 무시) 하나로 보고, 어느 쪽이든 완료면 완료(이른 완료일 유지). 그 밖에는 추가 |
| 수강권 | 없는 id만 추가 (남은 횟수 자동 재계산) |
| 상태 이력 | 없는 id만 추가 |
| 공통메모 | 가져온 메모가 비어 있지 않고 T의 메모에 이미 포함되어 있지 않으면 아래에 이어 붙임: `\n\n── 홍대점에서 가져옴 (2026-09-28) ──\n{가져온 메모}` |
| 기본정보 | T의 값 유지. T에서 비어 있는 칸만 가져온 값으로 채움 |
| aliases | 가져온 고객 id(와 그 aliases) 중 T.id가 아닌 것을 T의 alias로 추가 |
| 상태 | 이력 `{보낸 지점}에서 이동해 옴` 추가. T가 수강중이 아니면 수강중으로 바꾸고 그 변경도 기록 |
| 예약 | 파일에 없음 (지점 전용) |

같은 파일을 두 번 가져와도 기록이 중복되지 않아야 한다 (멱등).

**엑셀로 내보내기** (보관·인쇄용, 다시 가져올 수 없음)
- 고객 선택 창으로 범위 선택 → `.xlsx` 저장
- 시트: `고객 목록`(모든 기본 항목 + 공통메모 + 회차 수 + 최근 수업일 + 남은 수강권) / `회차 기록`(고객명, 회차, 날짜, 메모, 연습 곡, 다음 과제, 차감 여부) / `수강권`(고객명, 결제일, 횟수, 금액, 비고)

**엑셀 명단 등록** (첫 시작용)
- `양식 받기`: 열 = 이름*, 연락처, 생년월일(YYYY-MM-DD), 성별(여/남), 수강 목적(취미/입시/오디션/직업/기타), 등록일, 음역대, 선호 장르·목표곡, 공통메모
- `파일 열기` → 미리보기: 행마다 `추가`(기본) / `건너뛰기`. 이름이 없는 행은 오류로 표시하고 추가할 수 없다. 형식이 틀린 칸(날짜, 성별, 목적)은 비우고 경고를 표시한다. 이 PC에 이름이나 연락처가 같은 고객이 있으면 힌트를 표시한다.
- 적용 전 자동 백업, 하나의 트랜잭션으로 추가. 상태는 수강중, 등록일이 비어 있으면 오늘.

### 5.9 설정·백업

- 지점 이름 변경, 기본 수업 길이(분), 데이터 폴더 열기, 앱 버전
- **백업 목록**: 날짜·종류(자동 / 가져오기 전 / 복원 전) · `이 시점으로 복원`
- **백업 파일 내보내기**: DB 전체(예약 포함)를 `VOCAL_CRM_백업_강남점_2026-09-28.vcrmbak`으로 저장. 저장하면 `last_external_backup_at` 갱신
- **백업 파일 불러오기**: PC 교체용. 확인 창 → 현재 상태 자동 백업(복원 전) → 교체 → 마이그레이션 → 화면 다시 불러오기

## 6. .vcrm 파일 형식

UTF-8 JSON.

```json
{
  "format": "vocal-crm",
  "version": 1,
  "exportedAt": "2026-09-28T15:30:00+09:00",
  "sourceBranch": "강남점",
  "targetBranch": "홍대점",
  "customers": [
    {
      "customer": { "id": "…", "name": "김민지", "phone": "01012345678", "...": "customers 컬럼 전체" },
      "aliases": ["…"],
      "goals": [ { "id": "…", "title": "…", "doneAt": null, "completedLessonId": null, "createdAt": "…", "updatedAt": "…" } ],
      "lessons": [ { "id": "…", "lessonDate": "2026-09-28", "memo": "…", "practice": "…", "homework": "…", "deductPass": true, "createdAt": "…", "updatedAt": "…" } ],
      "passes": [ { "id": "…", "count": 10, "purchasedAt": "2026-09-01", "amount": 550000, "note": null, "createdAt": "…", "updatedAt": "…" } ],
      "statusLogs": [ { "id": "…", "date": "…", "fromStatus": null, "toStatus": "active", "reason": null, "createdAt": "…" } ]
    }
  ]
}
```

- `targetBranch`는 선택 (없으면 `null`).
- 예약과 lessons의 `reservation_id`는 포함하지 않는다.
- 가져올 때 zod로 검증한다. `format`이 다르거나 구조가 맞지 않으면 "이 파일은 읽을 수 없습니다". `version`이 앱이 아는 버전보다 크면 "새 버전 앱에서 만든 파일입니다. 앱을 새 버전으로 바꿔주세요".

## 7. 백업

- **자동 백업**: 앱 시작 시 `last_auto_backup_date`가 오늘이 아니면 1회. 가져오기(.vcrm, 엑셀) 적용 직전과 복원 직전에도 1회.
- 방식: better-sqlite3의 `db.backup()` (앱 사용 중에도 일관된 복사본).
- 파일: `backups/vocal_crm_20260928_153000_auto.db` (`auto` / `before-import` / `before-restore`)
- 보관: 종류와 상관없이 최근 30개. 넘으면 오래된 것부터 삭제.
- **외부 백업 알림**: `last_external_backup_at`이 없거나 30일이 지나면 홈 상단에 닫을 수 있는 작은 안내 ("마지막 외부 백업: 34일 전 · 백업하기"). 닫으면 그날은 다시 표시하지 않는다.

## 8. 오류 처리

- **IPC 오류**: Main은 예외를 잡아 `{ ok: false, error: { code, message } }`로 돌려주고 로그를 남긴다. 화면은 한국어 알림을 띄운다 ("저장하지 못했습니다. 다시 시도해 주세요").
- **트랜잭션**: 가져오기, 엑셀 명단 등록, 상태 변경(예약 일괄 취소 포함), 고객 삭제는 하나의 트랜잭션. 실패하면 전부 취소.
- **입력 검증**: 이름 필수. 연락처는 숫자만 저장하고 화면에서 하이픈을 자동으로 넣는다. 예약 시간은 10분 단위. 수강권 횟수는 1 이상.
- **작성 중인 내용 보호**: 수업 기록 창·고객 정보 창에 저장하지 않은 입력이 있을 때 창을 닫거나 앱을 종료하면 확인 창을 띄운다.
- **DB 무결성**: 시작 시 `PRAGMA integrity_check`. 실패하면 "데이터 파일에 문제가 있습니다. 최근 백업으로 복원할까요?"와 함께 백업 목록을 보여준다.
- **파일 오류**: 파일을 읽거나 쓰지 못하면(권한, USB 분리 등) 원인을 한국어로 안내한다.
- **로그**: electron-log, `logs/`에 기록. 설정 화면의 "데이터 폴더 열기"로 접근한다.

## 9. 테스트

- **단위 (Vitest, `shared/domain`)**: 회차 계산, 남은 수강권 계산(구매 기록 없음 포함), 예약 겹침 판단, 예약 없는 수강생 판단, 합치기 계획(회차 중복 제거, 최신 우선 갱신, 목표 제목 병합, 공통메모 이어 붙이기, 빈 칸만 채우기, alias 추가, id 충돌 시 새 id 발급), `.vcrm` 스키마 검증, 엑셀 명단 행 검증.
- **DB (Vitest)**: 메모리 DB에서 마이그레이션 → 저장소별 CRUD. better-sqlite3는 Electron용으로 빌드되므로 DB 테스트는 `ELECTRON_RUN_AS_NODE=1`로 Electron의 Node에서 실행한다.
- **왕복 (Vitest)**: DB A에서 내보내기 → DB B로 신규/합치기 → 같은 파일을 한 번 더 가져와도 변화 없음(멱등) → B에서 다시 내보내 A로 가져와도 중복 없음.
- **E2E 스모크 (Playwright Electron)**: 첫 실행(지점 입력) → 고객 추가 → 예약(겹침 확인 창 포함) → 수업 기록 → .vcrm 내보내기.
- **CI**: GitHub Actions `windows-latest`에서 테스트 → portable exe와 zip 빌드 → 아티팩트 업로드.
- **수동 확인**: 전달 전에 실제 Windows PC에서 portable exe를 실행해 확인한다.

## 10. 빌드·배포

- electron-builder, Windows x64 대상 2개:
  - `portable` → `VOCAL_CRM-{버전}-portable.exe` (한 파일, 실행 시 3~5초)
  - `zip` → `VOCAL_CRM-{버전}-win.zip` (압축을 풀고 폴더 안 exe 실행, 빠름)
- 코드 서명 없음. 처음 실행하면 Windows SmartScreen("Windows의 PC 보호")이 뜰 수 있다 → `추가 정보` → `실행`. 전달 시 안내문에 포함한다.
- 업데이트: 자동 업데이트 없음. 새 exe로 교체한다. 데이터는 AppData에 있으므로 유지된다.
- 개발: Mac에서 `npm run dev`.

## 11. 범위 제외

- 지점 실시간 통합 (아래 참고)
- 자동 업데이트, 코드 서명
- 잠금·암호화
- 카톡 알림 자동 발송
- 매출·통계 리포트
- 모바일·태블릿
- 목표 순서 변경 (추가한 순서로 표시)
- 고객정보 항목 직접 추가
- 다크 모드

## 12. 참고: 나중에 지점 실시간 통합을 한다면

필요한 것: 중앙 DB(클라우드), 인터넷, 로그인, 개인정보 보호조치, 오프라인 시 충돌 처리. 지점은 DB를 나누는 단위가 아니라 고객(과 예약)의 속성이 된다.

이번 설계에서 미리 해 둔 것: 모든 기록의 UUID와 `updated_at`, 화면과 저장소 사이의 `window.api` 경계. 통합 시 화면은 유지하고 Main의 저장소 계층만 바꾸는 방향으로 갈 수 있다.
