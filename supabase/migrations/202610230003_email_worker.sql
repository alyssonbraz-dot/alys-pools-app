-- Outbox claims are privileged and cannot be invoked with a browser/anon key.
-- Freeze request bytes across retries so a provider idempotency key always matches.
create or replace function public.claim_email_jobs(p_limit integer default 5)
returns setof public.email_delivery_logs language plpgsql security definer set search_path='' as $$
begin
  -- Resend deduplicates for 24h. Stop at 22h even if the original acknowledgement
  -- was lost; an operator must reconcile with the provider before any new send.
  update public.email_delivery_logs set status='failed', error='idempotency_window_expired',
    next_attempt_at='infinity', locked_until=null, claim_token=null
  where status<>'sent' and first_attempt_at < now()-interval '22 hours'
    and (locked_until is null or locked_until<now());
  return query
  with candidates as (
    select id from public.email_delivery_logs
    where status in ('pending','failed') and attempts<5 and next_attempt_at<=now()
      and (locked_until is null or locked_until<now())
      and (first_attempt_at is null or first_attempt_at>=now()-interval '22 hours')
    order by created_at for update skip locked limit least(greatest(p_limit,1),20)
  )
  update public.email_delivery_logs as job set
    status='pending', attempts=job.attempts+1,
    first_attempt_at=coalesce(job.first_attempt_at,now()),
    locked_until=now()+interval '5 minutes', claim_token=gen_random_uuid()
  from candidates where job.id=candidates.id returning job.*;
end $$;

create or replace function public.freeze_email_payload(p_id uuid,p_token uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare frozen jsonb;
begin
  if jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid provider request';end if;
  update public.email_delivery_logs set request_payload=coalesce(request_payload,p_payload),locked_until=now()+interval '5 minutes'
  where id=p_id and claim_token=p_token and status='pending' and locked_until>now() and first_attempt_at>=now()-interval '22 hours'
  returning request_payload into frozen;
  return frozen;
end $$;

create or replace function public.finish_email_job(p_id uuid,p_token uuid,p_success boolean,p_provider_id text default null,p_error text default null,p_retryable boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_success and coalesce(length(p_provider_id),0)=0 then raise exception 'Provider acknowledgement required';end if;
  update public.email_delivery_logs set
    status=case when p_success then 'sent' else 'failed' end,
    provider_id=case when p_success then p_provider_id else provider_id end,
    sent_at=case when p_success then now() else sent_at end,
    error=case when p_success then null else left(coalesce(p_error,'delivery_failed'),200) end,
    next_attempt_at=case when p_success or not p_retryable or attempts>=5 or first_attempt_at<now()-interval '22 hours'
      then 'infinity'::timestamptz else now()+make_interval(secs=>least(3600,(30*power(2,least(attempts,6)))::integer)) end,
    locked_until=null,claim_token=null
  where id=p_id and claim_token=p_token and status='pending';
  return found;
end $$;

-- Retry is an explicit administrator action, never a way to duplicate Sent mail.
create or replace function public.request_email_retry(p_visit_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare job public.email_delivery_logs;
begin
  select * into job from public.email_delivery_logs where visit_id=p_visit_id for update;
  if not found or not public.is_manager(job.organization_id) then raise exception 'Report not found or access denied' using errcode='42501';end if;
  if job.status='sent' then return 'sent';end if;
  if job.locked_until>now() then return 'pending';end if;
  if job.first_attempt_at<now()-interval '22 hours' then
    raise exception 'Confirm delivery with provider before another send; idempotency window expired' using errcode='22023';
  end if;
  update public.email_delivery_logs set status='pending',next_attempt_at=now(),attempts=0,error=null
  where id=job.id;
  return 'pending';
end $$;

revoke all on function public.claim_email_jobs(integer) from public,anon,authenticated;
revoke all on function public.freeze_email_payload(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finish_email_job(uuid,uuid,boolean,text,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_email_jobs(integer),public.freeze_email_payload(uuid,uuid,jsonb),public.finish_email_job(uuid,uuid,boolean,text,text,boolean) to service_role;
revoke all on function public.request_email_retry(uuid) from public,anon;
grant execute on function public.request_email_retry(uuid) to authenticated;
