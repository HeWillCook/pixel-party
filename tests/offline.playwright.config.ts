import { defineConfig } from '@playwright/test'
import { chromiumLaunchOptions } from 'deepspace/testing'

// Run after npm run build. All HTTP and WebSocket traffic is intercepted locally;
// no dev server, DeepSpace account, credentials, or integration calls are involved.
export default defineConfig({
  testDir: './offline',
  timeout: 15_000,
  retries: 0,
  use: { headless: true, launchOptions: chromiumLaunchOptions() },
})
