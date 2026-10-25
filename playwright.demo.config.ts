import { defineConfig,devices } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
 testDir:'./tests/demo',workers:1,timeout:30000,reporter:'list',
 webServer:process.env.DEMO_TEST_URL?undefined:{command:'python3 -m http.server 8123 --bind 127.0.0.1 --directory demo',url:'http://127.0.0.1:8123',reuseExistingServer:false,timeout:10000},
 use:{baseURL:process.env.DEMO_TEST_URL??'http://127.0.0.1:8123',...devices['iPhone 13'],defaultBrowserType:'chromium',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)},trace:'off'},
});
