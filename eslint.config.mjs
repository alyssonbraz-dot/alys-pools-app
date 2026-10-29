import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
export default defineConfig([...next,...ts,globalIgnores(['test-results/**','playwright-report/**','.netlify/**','.next/**','node_modules/**','app.js','sw.js','next-env.d.ts'])]);
