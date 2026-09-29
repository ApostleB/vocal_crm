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
