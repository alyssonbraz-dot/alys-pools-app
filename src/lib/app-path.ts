/** Only native browser URLs need this. Next Link/router already apply basePath. */
export const APP_BASE_PATH = process.env.NEXT_PUBLIC_ALYS_APP_BASE_PATH === '/app' ? '/app' : '';
export function appPath(path: string): string {
 if(!APP_BASE_PATH || !path.startsWith('/') || path.startsWith('//') || path===APP_BASE_PATH || path.startsWith(APP_BASE_PATH+'/') || path.startsWith(APP_BASE_PATH+'?') || path.startsWith(APP_BASE_PATH+'#')) return path;
 return APP_BASE_PATH+path;
}
export function stripBasePath(path: string): string {return APP_BASE_PATH && (path===APP_BASE_PATH || path.startsWith(APP_BASE_PATH+'/')) ? path.slice(APP_BASE_PATH.length)||'/' : path;}
export function appPathInput(input: RequestInfo | URL): RequestInfo | URL {return typeof input==='string'?appPath(input):input;}
