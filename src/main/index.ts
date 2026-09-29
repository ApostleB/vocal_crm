import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BACKUP_KIND_LABEL } from '@shared/backupTypes'
import { AppError } from '@shared/result'
import type { AppEnv } from './backup/env'
import { openWithRecovery, runDailyBackup, type RecoveryUi } from './backup/startup'
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
  // 화면에 저장하지 않은 입력이 있어 닫기가 멈추면(useLeaveGuard) 여기서 확인한다. preventDefault 는 "그래도 닫기"
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    if (!mainWindow) return
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['닫기', '계속 작성'],
      defaultId: 1,
      cancelId: 1,
      title: 'VOCAL CRM',
      message: '저장하지 않은 입력이 있습니다. 닫을까요?',
      detail: '닫으면 작성 중인 내용은 저장되지 않습니다.'
    })
    if (choice === 0) event.preventDefault()
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

  const recoveryUi: RecoveryUi = {
    askRestore: (latest) =>
      dialog.showMessageBoxSync({
        type: 'warning',
        buttons: ['최근 백업으로 복원', '종료'],
        defaultId: 0,
        cancelId: 1,
        title: 'VOCAL CRM',
        message: '데이터 파일에 문제가 있습니다. 최근 백업으로 복원할까요?',
        detail: `최근 백업: ${latest.createdAt} (${BACKUP_KIND_LABEL[latest.kind]})\n지금 파일은 지우지 않고 옆에 따로 보관합니다.`
      }) === 0,
    fatal: (title, message) => dialog.showErrorBox(title, message),
    log: (err) => logError(err)
  }

  void app.whenReady().then(async () => {
    try {
      const userData = app.getPath('userData')
      const clock = (): Date => new Date()
      const files = createElectronFileAccess(() => mainWindow)
      const env: AppEnv = {
        version: app.getVersion(),
        dataDir: userData,
        dbPath: join(userData, 'vocal_crm.db'),
        backupDir: join(userData, 'backups'),
        openPath: async (path) => {
          if (await shell.openPath(path)) throw new AppError('OPEN_FAILED', '폴더를 열지 못했습니다.')
        },
        reopen: () => {
          try {
            registerIpc(createHandlers(openDatabase(env.dbPath), clock, files, env), logError)
          } catch (err) {
            logError(err)
            dialog.showErrorBox('VOCAL CRM', '복원한 데이터를 열지 못했습니다. 앱을 다시 실행해 주세요.')
            app.exit(1)
          }
        },
        reloadWindow: () => {
          mainWindow?.webContents.reload()
        }
      }
      const backupDir = env.backupDir
      const opened = openWithRecovery(env.dbPath, backupDir, recoveryUi, new Date())
      if (!opened) {
        app.quit()
        return
      }
      const { db } = opened
      try {
        await runDailyBackup(db, backupDir, new Date())
      } catch (err) {
        logError(err) // 자동 백업 실패로 앱을 막지는 않는다
      }
      registerIpc(createHandlers(db, clock, files, env), logError)
      createWindow()
    } catch (err) {
      logError(err)
      dialog.showErrorBox('VOCAL CRM', '앱을 시작하지 못했습니다. 데이터 폴더의 logs 폴더에 기록을 남겼습니다.')
      app.quit()
    }
  })

  app.on('window-all-closed', () => app.quit())
}
