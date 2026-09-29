import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, type ElectronApplication, type Page, test as base } from '@playwright/test'

const ROOT = resolve(__dirname, '..')

/**
 * 앱을 띄운다. 데이터는 userDataDir 에 저장된다 (VOCAL_CRM_USER_DATA).
 * VOCAL_CRM_E2E_EXE 가 있으면 빌드된 exe(예: release/win-unpacked/VOCAL_CRM.exe)를, 없으면 out/ 을 실행한다.
 */
async function launchApp(userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const exe = process.env['VOCAL_CRM_E2E_EXE']
  const env = { ...process.env, VOCAL_CRM_USER_DATA: userDataDir }
  delete env['ELECTRON_RUN_AS_NODE']
  const app = exe
    ? await _electron.launch({ executablePath: exe, args: [], env })
    : await _electron.launch({ args: ['.'], cwd: ROOT, env })
  const page = await app.firstWindow()
  return { app, page }
}

/** 저장 대화상자가 path 를 고른 것처럼 만든다 */
export async function stubSaveDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog
  }, path)
}

/** 열기 대화상자가 path 를 고른 것처럼 만든다 */
export async function stubOpenDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog
  }, path)
}

/** 첫 실행 화면에서 지점 이름을 넣고 홈으로 간다 */
export async function onboard(page: Page, branchName = '강남점'): Promise<void> {
  await page.getByLabel('지점 이름').fill(branchName)
  await page.getByLabel('지점 이름').press('Enter')
  await page.getByText('전체 고객').waitFor()
}

export const nav = (page: Page, name: string) => page.locator('.mantine-AppShell-navbar').getByRole('link', { name })

export const modal = (page: Page) => page.locator('.mantine-Modal-content').last()

/** 테스트마다 빈 데이터 폴더와 앱을 준비하고, 끝나면 정리한다 */
export const test = base.extend<{ userDataDir: string; app: ElectronApplication; page: Page }>({
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'vocal-crm-e2e-'))
    await use(dir)
    // Windows 는 앱이 막 종료된 직후 파일을 잠깐 잡고 있을 수 있어 몇 번 다시 시도한다
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  },
  app: async ({ userDataDir }, use) => {
    const { app } = await launchApp(userDataDir)
    await use(app)
    await app.close().catch(() => {})
  },
  page: async ({ app }, use) => {
    await use(await app.firstWindow())
  }
})

export { expect } from '@playwright/test'
