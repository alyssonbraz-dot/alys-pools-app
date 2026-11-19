import {defineConfig} from '@playwright/test';
import existing from './playwright.v4-real.config';
export default defineConfig({...existing,outputDir:'test-results/owner-access',testMatch:['owner-access-recovery.spec.ts','v4-live-roles.spec.ts']});
