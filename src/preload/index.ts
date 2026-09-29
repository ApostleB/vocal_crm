import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type Channel } from '@shared/api'

const allowed = new Set<string>(CHANNELS)

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: Channel, ...args: unknown[]) => {
    if (!allowed.has(channel)) return Promise.reject(new Error(`허용되지 않은 요청: ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  }
})
