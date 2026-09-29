import { defineConfig } from '@playwright/test'

// 실제 앱(Electron)을 띄워 확인한다. 먼저 `npm run build` 로 out/ 을 만든다 (npm run test:e2e 가 해 준다)
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' }
})
