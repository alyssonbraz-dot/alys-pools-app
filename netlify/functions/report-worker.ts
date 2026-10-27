// Netlify runs schedules on the published production deploy, not deploy previews.
// Completion already triggers delivery; this invocation recovers due/abandoned jobs.
export const config = { schedule: '*/15 * * * *' };

export default async function scheduledReports() {
  if (process.env.EMAIL_DELIVERY_ENABLED !== 'true') return new Response(null, { status: 204 });
  const secret = process.env.REPORT_WORKER_SECRET;
  const site = process.env.URL; // Netlify's production site URL; no extra hostname setting.
  if (!secret || secret.length < 32 || secret.startsWith('replace-') || !site) {
    throw new Error('Scheduled reports require the production URL and worker secret.');
  }
  const base = new URL(site);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('Scheduled reports require an HTTPS site origin.');
  }
  const response = await fetch(new URL('/api/email/worker', base), {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    redirect: 'error',
    signal: AbortSignal.timeout(25_000),
  });
  // Never log secrets, report content or the provider response. The durable queue
  // owns retries and idempotency even if this request times out after acceptance.
  if (!response.ok) throw new Error(`Scheduled report worker returned HTTP ${response.status}.`);
  return new Response(null, { status: 204 });
}
