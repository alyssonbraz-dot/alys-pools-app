export function reportStatus(mail:{status:string;locked_until?:string|null;delivery_outcome?:string|null;delivered_at?:string|null},now=Date.now()){
 if(mail.delivery_outcome&&['bounced','complained','failed'].includes(mail.delivery_outcome))return 'Failed';
 if(mail.delivered_at&&mail.delivery_outcome==='delivered')return 'Delivered';
 if(mail.status==='sent')return 'Accepted by provider';if(mail.status==='failed')return 'Failed';
 return mail.locked_until&&Date.parse(mail.locked_until)>now?'Sending':'Queued';
}

export function deliveryFailureExplanation(code?:string|null){
 if(!code)return null;
 if(['recipient_delivery_blocked','bounced','complained'].includes(code))return 'This address was bounced or reported as spam. Confirm and correct the customer email before further delivery.';
 if(code==='demo_delivery_blocked')return 'Customer email delivery is blocked in the demo organization.';
 if(code==='customer_reports_disabled_or_recipient_changed')return 'Reports are disabled or the customer email changed. Review the customer profile.';
 if(code.includes('uncertain')||code==='delivery_ack_uncertain')return 'Provider acceptance is uncertain. Retry the same report safely; do not create another visit.';
 if(code==='provider_reconciliation_required')return 'The safe retry window expired. Reconcile this report with the provider before sending again.';
 if(code==='provider_http_429')return 'The email provider rate limit was reached. The existing report can be retried safely.';
 if(code.startsWith('provider_http_4'))return 'The provider rejected the request. Check the verified sender and email configuration in System Health.';
 if(code.includes('photo'))return 'The service photo could not be prepared. The visit and photo remain saved; retry this report.';
 return 'Report delivery failed. Check System Health and retry this same report after correcting the cause.';
}
