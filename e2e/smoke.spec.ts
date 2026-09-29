import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, modal, nav, onboard, stubSaveDialog, test } from './app'

// 설계 9장 E2E 스모크: 첫 실행 → 고객 추가 → 예약(겹침 확인) → 수업 기록 → .vcrm 내보내기
test('첫 실행부터 수업 기록, 지점 이동 파일 내보내기까지', async ({ app, page, userDataDir }) => {
  await onboard(page)
  await expect(page.locator('.mantine-AppShell-navbar')).toContainText('강남점')
  // 데이터·로그는 데이터 폴더 안에 생긴다
  expect(existsSync(join(userDataDir, 'vocal_crm.db'))).toBe(true)
  expect(existsSync(join(userDataDir, 'logs', 'main.log'))).toBe(true)

  // 고객 추가
  await page.getByRole('button', { name: '새 고객' }).click()
  await modal(page).getByLabel(/이름/).fill('김민지')
  await modal(page).getByLabel('연락처').pressSequentially('01012345678')
  await modal(page).getByLabel(/공통메모/).fill('성대결절 이력')
  await modal(page).getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('heading', { name: '김민지' })).toBeVisible()

  // 오늘 15:00 예약
  await page.getByRole('button', { name: '예약' }).click()
  await modal(page).getByPlaceholder('예: 15:00').click()
  await page.getByRole('option', { name: '15:00', exact: true }).click()
  await modal(page).getByRole('button', { name: '예약 저장' }).click()
  await expect(page.getByText(/다음 예약 · 오늘 15:00/)).toBeVisible()

  // 두 번째 고객을 15:30 에 예약하면 겹침 확인 창이 뜬다
  await nav(page, '홈').click()
  await page.getByRole('button', { name: '새 고객' }).click()
  await modal(page).getByLabel(/이름/).fill('박서준')
  await modal(page).getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('heading', { name: '박서준' })).toBeVisible()
  await page.getByRole('button', { name: '예약' }).click()
  await modal(page).getByPlaceholder('예: 15:00').click()
  await page.getByRole('option', { name: '15:30', exact: true }).click()
  await expect(modal(page).getByText(/15:00 김민지 예약과 겹칩니다/)).toBeVisible()
  await modal(page).getByRole('button', { name: '예약 저장' }).click()
  await page.getByRole('button', { name: '그래도 저장' }).click()
  await expect(page.getByText(/다음 예약 · 오늘 15:30/)).toBeVisible()

  // 홈에서 수업 기록
  await nav(page, '홈').click()
  await expect(page.getByText('오늘 수업 2')).toBeVisible()
  await page.getByRole('button', { name: '수업 기록' }).first().click()
  await modal(page).getByLabel('메모').fill('브릿지 고음 개선됨')
  await modal(page).getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByText('✓ 기록됨')).toBeVisible()

  // .vcrm 내보내기
  const file = join(userDataDir, 'export.vcrm')
  await stubSaveDialog(app, file)
  await nav(page, '가져오기·내보내기').click()
  await page.getByRole('button', { name: '고객 선택' }).click()
  await modal(page).getByLabel('보이는 고객 전체 선택').click()
  await modal(page).getByRole('button', { name: '다음' }).click()
  await modal(page).getByRole('button', { name: '파일로 저장' }).click()
  await expect(modal(page)).toBeHidden()
  const exported = JSON.parse(readFileSync(file, 'utf-8')) as { sourceBranch: string; customers: { lessons: unknown[] }[] }
  expect(exported.sourceBranch).toBe('강남점')
  expect(exported.customers).toHaveLength(2)
  expect(exported.customers.flatMap((c) => c.lessons)).toHaveLength(1)
})
