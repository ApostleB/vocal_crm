import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, modal, nav, onboard, stubOpenDialog, stubSaveDialog, test } from './app'

async function addCustomer(page: Page, name: string): Promise<void> {
  await nav(page, '홈').click()
  await page.getByRole('button', { name: '새 고객' }).click()
  await modal(page).getByLabel(/이름/).fill(name)
  await modal(page).getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

const customerRows = (page: Page) => page.locator('tbody tr')

test('자동 백업, 지금 백업, 백업 파일 내보내기와 외부 백업 안내', async ({ app, page, userDataDir }) => {
  await onboard(page)
  await expect(page.getByText(/마지막 외부 백업/)).toBeVisible()

  await nav(page, '설정·백업').click()
  await expect(page.getByText('자동', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '지금 백업' }).click()
  await expect(page.getByText('수동', { exact: true })).toBeVisible()

  const file = join(userDataDir, 'external.vcrmbak')
  await stubSaveDialog(app, file)
  await page.getByRole('button', { name: '백업 파일 내보내기' }).click()
  await expect(page.getByText('백업 파일을 저장했습니다.')).toBeVisible()
  expect(existsSync(file)).toBe(true)
  await expect(page.getByText('오늘', { exact: true })).toBeVisible()

  await nav(page, '홈').click()
  await expect(page.getByText('전체 고객')).toBeVisible()
  await expect(page.getByText(/마지막 외부 백업/)).toBeHidden()
})

test('이 시점으로 복원하면 그때 데이터로 돌아가고, 복원 전 백업이 남는다', async ({ page }) => {
  await onboard(page)
  await addCustomer(page, '김민지')
  await nav(page, '설정·백업').click()
  await page.getByRole('button', { name: '지금 백업' }).click()
  await expect(page.getByText('수동', { exact: true })).toBeVisible()
  await addCustomer(page, '박서준')

  await nav(page, '설정·백업').click()
  const manualRow = page.getByRole('row').filter({ hasText: '수동' })
  await manualRow.getByRole('button', { name: /백업으로 복원/ }).click()
  await modal(page).getByRole('button', { name: '복원' }).click()

  // 화면을 새로 불러오면 목록에 '복원 전' 백업이 보인다
  await expect(page.getByText('복원 전', { exact: true })).toBeVisible()
  await nav(page, '홈').click()
  await expect(customerRows(page)).toHaveCount(1)
  await expect(customerRows(page)).toContainText('김민지')

  // 복원한 DB 에 계속 저장할 수 있다
  await addCustomer(page, '최도윤')
  await nav(page, '홈').click()
  await expect(customerRows(page)).toHaveCount(2)
})

test('백업 파일 불러오기(PC 교체)로 다른 PC의 데이터를 가져온다', async ({ app, page, userDataDir }) => {
  await onboard(page, '홍대점')
  await addCustomer(page, '정유나')
  const file = join(userDataDir, 'from-old-pc.vcrmbak')
  await stubSaveDialog(app, file)
  await nav(page, '설정·백업').click()
  await page.getByRole('button', { name: '백업 파일 내보내기' }).click()
  await expect(page.getByText('백업 파일을 저장했습니다.')).toBeVisible()
  await addCustomer(page, '최도윤')

  await nav(page, '설정·백업').click()
  await stubOpenDialog(app, file)
  await page.getByRole('button', { name: '백업 파일 불러오기' }).click()
  await modal(page).getByRole('button', { name: '파일 고르기' }).click()

  await expect(page.getByText('복원 전', { exact: true })).toBeVisible()
  await nav(page, '홈').click()
  await expect(customerRows(page)).toHaveCount(1)
  await expect(customerRows(page)).toContainText('정유나')
})

test('백업이 아닌 파일을 불러오면 안내하고 데이터는 그대로다', async ({ app, page, userDataDir }) => {
  await onboard(page)
  await addCustomer(page, '김민지')
  await nav(page, '설정·백업').click()
  const notBackup = join(userDataDir, 'memo.vcrmbak')
  writeFileSync(notBackup, '백업 파일이 아닙니다')
  await stubOpenDialog(app, notBackup)
  await page.getByRole('button', { name: '백업 파일 불러오기' }).click()
  await modal(page).getByRole('button', { name: '파일 고르기' }).click()
  await expect(page.getByText(/백업 파일을 읽을 수 없습니다/)).toBeVisible()
  await nav(page, '홈').click()
  await expect(customerRows(page)).toHaveCount(1)
})
