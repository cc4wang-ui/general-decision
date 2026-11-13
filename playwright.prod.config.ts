// 正式站瀏覽器 E2E（pending-tests，2026-11-13）：不攔截 API，打真的 general-decision.vercel.app。
// 跑法：npx playwright test -c playwright.prod.config.ts（會真的呼叫 Google Places／Routes）。
// WEBKIT=1 時加跑 WebKit（需要另外裝好 WebKit 瀏覽器）。
import { defineConfig, devices } from '@playwright/test'

const OUT = process.env.E2E_OUT || 'runs/pending-tests'
const chromium = { browserName: 'chromium' as const }

export default defineConfig({
  testDir: 'tests/prod',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list'], ['json', { outputFile: `${OUT}/reports/e2e-report.json` }]],
  outputDir: `${OUT}/test-results`,
  use: {
    baseURL: process.env.PROD_URL || 'https://general-decision.vercel.app',
    trace: 'off',
    video: 'on',
    locale: 'zh-TW',
    timezoneId: 'Asia/Tokyo',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], ...chromium } },
    { name: 'ipad', use: { ...devices['iPad Pro 11'], ...chromium } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    ...(process.env.WEBKIT ? [{ name: 'webkit-iphone', use: { ...devices['iPhone 13'] } }] : []),
  ],
})
