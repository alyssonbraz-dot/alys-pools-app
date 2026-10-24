-- Privileged worker assertions: no network provider or real recipient is used.
begin;
insert into auth.users(id) values ('a1000000-0000-4000-8000-000000000001');
insert into public.organizations(id,name) values('a2000000-0000-4000-8000-000000000001','Fictional email test');
insert into public.profiles values('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','owner','Test Manager');
insert into public.customers(id,organization_id,name,email,email_reports_enabled) values('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Fictional Client','nobody@example.test',true);
insert into public.properties(id,organization_id,customer_id,address) values('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','Fictional address');
insert into public.route_stops(id,organization_id,property_id,technician_id,service_date,status) values('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',current_date,'completed');
insert into public.visits(id,organization_id,route_stop_id,technician_id,snapshot) values('a6000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','{"property_name":"Fictional address","customer_name":"Fictional Client","pools":[]}');
insert into public.email_delivery_logs(id,organization_id,visit_id,recipient,idempotency_key) values('a7000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','nobody@example.test','a6000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform public.claim_email_jobs(1); raise exception 'Browser may claim worker jobs'; exception when insufficient_privilege then null;end;
 begin perform public.finish_email_job('a7000000-0000-4000-8000-000000000001',gen_random_uuid(),true,'fake'); raise exception 'Browser may forge Sent'; exception when insufficient_privilege then null;end;
end $$;
set local role service_role;
do $$ declare job public.email_delivery_logs; payload jsonb; begin
 select * into job from public.claim_email_jobs(1);
 if job.id is null or job.attempts<>1 or job.status<>'pending' then raise exception 'Job not claimed';end if;
 if exists(select 1 from public.claim_email_jobs(1)) then raise exception 'Lease allowed duplicate claim';end if;
 payload:=public.freeze_email_payload(job.id,job.claim_token,'{"html":"immutable-report","to":["nobody@example.test"]}');
 if payload->>'html'<>'immutable-report' then raise exception 'Payload not frozen';end if;
 payload:=public.freeze_email_payload(job.id,job.claim_token,'{"html":"changed-report"}');
 if payload->>'html'<>'immutable-report' then raise exception 'Retry altered provider request';end if;
 begin perform public.finish_email_job(job.id,job.claim_token,true,null);raise exception 'Sent without provider acknowledgement';exception when others then if sqlerrm='Sent without provider acknowledgement' then raise;end if;end;
 if not public.finish_email_job(job.id,job.claim_token,true,'provider-confirmed-id') then raise exception 'Acknowledgement failed';end if;
 if public.finish_email_job(job.id,job.claim_token,true,'another-provider-id') then raise exception 'Settlement token reused';end if;
end $$;
set local role authenticated;
do $$ begin
 if public.request_email_retry('a6000000-0000-4000-8000-000000000001')<>'sent' then raise exception 'Sent report requeued';end if;
end $$;
reset role;
update public.email_delivery_logs set status='failed',first_attempt_at=now()-interval '25 hours',next_attempt_at=now() where id='a7000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ begin
 if exists(select 1 from public.claim_email_jobs(1)) then raise exception 'Expired provider key reused';end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform public.request_email_retry('a6000000-0000-4000-8000-000000000001');raise exception 'Expired key retry allowed';exception when invalid_parameter_value then null;end;
end $$;
rollback;
select 'Email worker permissions, claims, frozen payload, provider acknowledgement and retry window passed' as result;
