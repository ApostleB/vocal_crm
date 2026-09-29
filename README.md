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
