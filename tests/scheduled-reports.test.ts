import { afterEach, describe, expect, it, vi } from 'vitest';
import scheduledReports, { config } from '../netlify/functions/report-worker';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function environment() {
  vi.stubEnv('EMAIL_DELIVERY_ENABLED', 'true');
  vi.stubEnv('URL', 'https://fictional-alys.netlify.app');
  vi.stubEnv('REPORT_WORKER_SECRET', 'a'.repeat(48));
}

describe('production report recovery schedule', () => {
  it('runs every fifteen minutes and never contacts a server with delivery disabled', async () => {
    vi.stubEnv('EMAIL_DELIVERY_ENABLED', 'false');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(config.schedule).toBe('*/15 * * * *');
    expect((await scheduledReports()).status).toBe(204);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('calls the protected worker once without putting its secret in the URL', async () => {
    environment();
    const fetcher = vi.fn(async () => Response.json({ processed: 1, sent: 1 }));
    vi.stubGlobal('fetch', fetcher);
    expect((await scheduledReports()).status).toBe(204);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe('https://fictional-alys.netlify.app/api/email/worker');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${'a'.repeat(48)}`);
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it.each(['http://fictional-alys.netlify.app', 'https://user:password@example.test', 'https://example.test/path'])('rejects invalid origin %s before contacting it', async site => {
    environment(); vi.stubEnv('URL', site);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(scheduledReports()).rejects.toThrow('HTTPS site origin');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects a missing worker secret before contacting the server', async () => {
    environment(); vi.stubEnv('REPORT_WORKER_SECRET', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(scheduledReports()).rejects.toThrow('worker secret');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('surfaces server failure without exposing its body or claiming delivery', async () => {
    environment(); vi.stubGlobal('fetch', vi.fn(async () => new Response('private details', { status: 503 })));
    await expect(scheduledReports()).rejects.toThrow('HTTP 503');
  });
});
