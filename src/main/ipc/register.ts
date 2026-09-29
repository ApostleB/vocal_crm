import { ipcMain } from 'electron'
import { CHANNELS } from '@shared/api'
import type { Handlers } from './handlers'
import { invokeHandler } from './invoke'

/** 채널마다 처리 함수를 연결한다. 다시 부르면(복원 뒤 DB 를 새로 열 때) 새 처리 함수로 바꾼다 */
export function registerIpc(handlers: Handlers, logError: (err: unknown) => void): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (_event, ...args: unknown[]) => invokeHandler(handlers, channel, args, logError))
  }
}
