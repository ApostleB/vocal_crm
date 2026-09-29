/** 백업·데이터 폴더 기능이 쓰는 앱 환경 (Main 은 Electron 값, 테스트는 임시 폴더) */
export interface AppEnv {
  version: string
  /** userData 폴더 (%APPDATA%\VOCAL_CRM) */
  dataDir: string
  dbPath: string
  backupDir: string
  /** 탐색기(파인더)로 폴더를 연다 */
  openPath(path: string): Promise<void>
  /** 복원한 DB 파일을 다시 열고 IPC 를 새로 등록한다 (앱은 켜진 그대로). 실패하면 오류 창을 띄우고 앱을 종료한다 */
  reopen(): void
  /** 화면(webContents)을 새로 불러온다 */
  reloadWindow(): void
}
