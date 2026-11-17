import type { NextConfig } from 'next';
if(process.env.ALYS_APP_BASE_PATH && process.env.ALYS_APP_BASE_PATH!=='/app')throw new Error('ALYS_APP_BASE_PATH must be empty or /app.');
const appBasePath = process.env.ALYS_APP_BASE_PATH === '/app' ? '/app' : undefined;
const config: NextConfig = {
  ...(appBasePath ? {basePath:appBasePath} : {}),
  env:{NEXT_PUBLIC_ALYS_APP_BASE_PATH:appBasePath??''},
  experimental:{serverActions:{allowedOrigins:process.env.APP_URL?[new URL(process.env.APP_URL).host]:[]}},
  ...(appBasePath?{skipTrailingSlashRedirect:true}:{}),
  poweredByHeader: false,
  async headers() { return [{source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache, no-store, must-revalidate'},{key:'Service-Worker-Allowed',value:(appBasePath??'')+'/'}]}, { source: '/:path*', headers: [
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    {key:'X-Frame-Options',value:'DENY'}
  ]}]; }
};
export default config;
