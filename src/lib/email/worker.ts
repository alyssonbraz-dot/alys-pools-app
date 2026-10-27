import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { emailConfiguration } from './config';
import { createServiceReport, type ProviderPayload, type ReportPhoto } from './report';
import { DeliveryError, sendReport } from './provider';

type Job = { id: string; visit_id: string; recipient: string; claim_token: string; idempotency_key: string; request_payload: ProviderPayload | null };
export async function processEmailQueue(options: { limit?: number } = {}) {
  const config = emailConfiguration();
  // An unconfigured provider never consumes attempts, never pretends mail was sent.
  if (!config) return { enabled: false, processed: 0, sent: 0 };
  const db = createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc('claim_email_jobs', { p_limit: options.limit ?? 5 });
  if (error) throw new Error('Unable to claim email jobs. Check worker migrations.');
  let sent = 0;
  const jobs = (data ?? []) as Job[];
  for (const job of jobs) {
    try {
      const { data: visit, error: visitError } = await db.from('visits').select('snapshot,completed_at,route_stop_id').eq('id', job.visit_id).single();
      if (visitError || !visit) throw new DeliveryError('visit_not_found', false);
      const { data: stop } = await db.from('route_stops').select('property_id').eq('id', visit.route_stop_id).single();
      const { data: property } = await db.from('properties').select('customer_id').eq('id', stop?.property_id ?? '').single();
      const { data: customer } = await db.from('customers').select('email,email_reports_enabled').eq('id', property?.customer_id ?? '').single();
      if (!customer?.email_reports_enabled || customer.email !== job.recipient) throw new DeliveryError('customer_reports_disabled_or_recipient_changed', false);
      let payload = job.request_payload;
      if (!payload) {
        const {data:issue,error:issueError}=await db.from('visit_issue_flags').select('flags').eq('visit_id',job.visit_id).maybeSingle();
        if(issueError)throw new DeliveryError('issue_metadata_unavailable',true);
        const { data: photos, error: photoError } = await db.from('visit_photos').select('storage_path').eq('visit_id', job.visit_id).order('id');
        if (photoError) throw new DeliveryError('photo_metadata_unavailable', true);
        const attachments: ReportPhoto[] = [];
        for (const [index, photo] of (photos ?? []).entries()) {
          const { data: image, error: imageError } = await db.storage.from('visit-photos').download(photo.storage_path);
          if (imageError || !image || image.size > 2 * 1024 * 1024) throw new DeliveryError('photo_download_unavailable', true);
          attachments.push({ content: Buffer.from(await image.arrayBuffer()).toString('base64'), filename: `service-photo-${index + 1}.jpg` });
        }
        payload = createServiceReport({ snapshot: {...visit.snapshot,issue_flags:issue?.flags??[]}, completedAt: visit.completed_at, recipient: job.recipient, from: config.from, photos: attachments });
      }
      // Revalidate and renew the lease immediately before every send, including
      // retries with an already frozen payload. Slow downloads or a stale batch
      // cannot send after another worker has taken the job.
      const { data: frozen, error: freezeError } = await db.rpc('freeze_email_payload', { p_id: job.id, p_token: job.claim_token, p_payload: payload });
      if (freezeError || !frozen) continue;
      payload = frozen as ProviderPayload;
      const providerId = await sendReport(payload, `alys-service-${job.idempotency_key}`, config.apiKey);
      const { data: recorded, error: recordError } = await db.rpc('finish_email_job', { p_id: job.id, p_token: job.claim_token, p_success: true, p_provider_id: providerId });
      // If the acknowledgement write fails, retain the claim; the identical request
      // and provider idempotency key are reused by the next worker after lease expiry.
      if (recordError) throw new Error('Provider accepted report; database acknowledgement unavailable.');
      if (recorded) sent++;
    } catch (failure) {
      if (!(failure instanceof DeliveryError)) {
        // Unknown/local failures may occur after provider acceptance. Keep payload
        // and retry with its original key; never create a new delivery row.
        await db.rpc('finish_email_job', { p_id: job.id, p_token: job.claim_token, p_success: false, p_error: 'delivery_ack_uncertain', p_retryable: true });
      } else {
        await db.rpc('finish_email_job', { p_id: job.id, p_token: job.claim_token, p_success: false, p_error: failure.code, p_retryable: failure.retryable });
      }
    }
  }
  return { enabled: true, processed: jobs.length, sent };
}
