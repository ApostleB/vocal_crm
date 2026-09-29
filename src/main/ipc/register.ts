import { ipcMain } from 'electron'
import { CHANNELS } from '@shared/api'
import type { Handlers } from './handlers'
import { invokeHandler } from './invoke'

export function registerIpc(handlers: Handlers, logError: (err: unknown) => void): void {
  for (const channel of CHANNELS) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => invokeHandler(handlers, channel, args, logError))
  }
}
