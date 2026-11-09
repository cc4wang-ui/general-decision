import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  // 只跑 Playwright 規格：裸 `npx playwright test` 不再誤載 vitest 單元測試
  //（tests/unit/* 用 `npm test` 跑；Playwright 載入它們會直接報錯）。
  testMatch: ['tests/e2e/**/*.spec.ts', 'tests/shots/**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    ...devices['iPhone 13'],
    // devices['iPhone 13'] 的 defaultBrowserType 是 webkit；不寫死 chromium 的話，
    // runner 會拿 chromium binary 配 webkit 參數啟動，瀏覽器直接退出（tests round 14 F5）。
    // 寫在 spread 之後，避免將來 descriptor 多了 browserName 把它蓋掉。
    browserName: 'chromium',
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
