import { app, dialog, type BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '@shared/result'
import type { FileAccess } from './files'

const fileError = (err: unknown): AppError => {
  console.error(err)
  return new AppError('FILE_ERROR', '파일을 읽거나 쓰지 못했습니다. 위치와 권한(USB 연결 등)을 확인해 주세요.')
}

/** Electron 대화상자 + fs. 저장 창은 '문서' 폴더에서 시작한다 */
export function createElectronFileAccess(getWindow: () => BrowserWindow | null): FileAccess {
  return {
    async chooseSavePath(defaultName, filters) {
      const options = { defaultPath: join(app.getPath('documents'), defaultName), filters }
      const win = getWindow()
      const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      return result.canceled || !result.filePath ? null : result.filePath
    },
    async chooseOpenPath(filters) {
      const options = { properties: ['openFile' as const], filters }
      const win = getWindow()
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    },
    async readFile(path) {
      try {
        return await readFile(path)
      } catch (err) {
        throw fileError(err)
      }
    },
    async writeFile(path, data) {
      try {
        await writeFile(path, data)
      } catch (err) {
        throw fileError(err)
      }
    }
  }
}
