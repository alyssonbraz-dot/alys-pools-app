import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/integration',
  testMatch:'**/*.spec.ts',
  fullyParallel:false,
  workers:1,
  timeout:60000,
  retries:0,
  reporter:'list',
  use:{baseURL:process.env.TEST_BASE_URL??'http://127.0.0.1:3000',trace:'retain-on-failure',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)}},
  projects:[{name:'mobile-chromium',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}},{name:'android-chromium',testMatch:['**/v211-*.spec.ts','**/v212-*.spec.ts','**/v22-*.spec.ts'],use:{...devices['Pixel 5']}},{name:'desktop-chromium',testMatch:'**/v211-localization.spec.ts',use:{...devices['Desktop Chrome']}}],
});
