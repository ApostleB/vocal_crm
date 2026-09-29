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
