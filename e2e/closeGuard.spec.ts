import type { ElectronApplication } from '@playwright/test'
import { expect, modal, onboard, test } from './app'

/** 닫기 확인 창이 choice 를 고른 것처럼 만들고, 띄운 문구를 모은다 */
async function stubCloseDialog(app: ElectronApplication, choice: number): Promise<void> {
  await app.evaluate(({ dialog }, c) => {
    const g = globalThis as unknown as { closeDialogMessages: string[] }
    g.closeDialogMessages = []
    dialog.showMessageBoxSync = ((...args: unknown[]) => {
      const options = args.find((a): a is { message: string } => typeof a === 'object' && a !== null && 'message' in a)
      g.closeDialogMessages.push(options?.message ?? '')
      return c
    }) as typeof dialog.showMessageBoxSync
  }, choice)
}

const closeDialogMessages = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as { closeDialogMessages: string[] }).closeDialogMessages)

const closeWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close()
  })

test('작성 중인 입력이 있으면 창을 닫기 전에 묻는다', async ({ app, page }) => {
  // Playwright 는 beforeunload 를 브라우저 대화상자로 보고 스스로 닫으려 한다. Electron 은 대화상자 대신
  // will-prevent-unload 를 보내므로(우리 확인 창), Playwright 가 손대지 않게 빈 처리기를 둔다
  page.on('dialog', () => {})
  await onboard(page)

  // "계속 작성"을 고르면 창과 입력이 그대로 남는다
  await page.getByRole('button', { name: '새 고객' }).click()
  await modal(page).getByLabel(/이름/).pressSequentially('김민지')
  await stubCloseDialog(app, 1)
  await closeWindow(app)
  await expect.poll(() => closeDialogMessages(app)).toEqual(['저장하지 않은 입력이 있습니다. 닫을까요?'])
  await expect(modal(page).getByLabel(/이름/)).toHaveValue('김민지')

  // "닫기"를 고르면 앱이 닫힌다
  await stubCloseDialog(app, 0)
  const closed = app.waitForEvent('close')
  await closeWindow(app)
  await closed
})

test('입력이 없으면 묻지 않고 닫힌다', async ({ app, page }) => {
  await onboard(page)
  await stubCloseDialog(app, 1)
  const closed = app.waitForEvent('close')
  await closeWindow(app)
  await closed
})
