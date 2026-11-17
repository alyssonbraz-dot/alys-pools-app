import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
it('prefixes native paths once, leaves external and hash URLs alone',async()=>{
 vi.stubEnv('NEXT_PUBLIC_ALYS_APP_BASE_PATH','/app');vi.resetModules();const {appPath,stripBasePath,appPathInput}=await import('../src/lib/app-path');
 for(const path of ['/api/photos','/login?message=invalid','/offline','/visit/id#photo'])expect(appPath(path)).toBe('/app'+path);
 for(const path of ['/app','/app/route','/app?date=now','https://maps.google.com/','//cdn.test/a','#photo','mailto:x@example.test'])expect(appPath(path)).toBe(path);
 expect(stripBasePath('/app/stops')).toBe('/stops');expect(stripBasePath('/application')).toBe('/application');expect(appPathInput('/api/session')).toBe('/app/api/session');
});
it('preserves root deployment',async()=>{vi.stubEnv('NEXT_PUBLIC_ALYS_APP_BASE_PATH','');vi.resetModules();expect((await import('../src/lib/app-path')).appPath('/api/photos')).toBe('/api/photos');});
