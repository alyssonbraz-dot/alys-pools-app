import type { ProviderPayload } from './report';
export class DeliveryError extends Error {
  constructor(public code: string, public retryable: boolean) { super(code); }
}
/** Resend stores an idempotency key for 24 hours. Our worker stops earlier (22h). */
export async function sendReport(payload: ProviderPayload, idempotencyKey: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetcher('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000)
    });
  } catch { throw new DeliveryError('provider_network_uncertain', true); }
  if (!response.ok) throw new DeliveryError(`provider_http_${response.status}`, response.status === 429 || response.status >= 500);
  let result: unknown;
  try { result = await response.json(); } catch { throw new DeliveryError('provider_ack_uncertain', true); }
  if (!result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string' || !result.id) throw new DeliveryError('provider_ack_uncertain', true);
  return result.id;
}
