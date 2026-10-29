import {translate,languageTag} from '../i18n/core';
import {displayDose,fahrenheitToCelsius,readableNumber} from '../units';
import { z } from 'zod';
import {ISSUE_FLAGS,ISSUE_LABELS} from '../field/issues';
const readingSchema = z.object({ fc: z.number().optional(), ph: z.number().optional(), ta: z.number().optional(), cya: z.number().optional(), ch: z.number().optional(), salt: z.number().optional(), cc: z.number().optional(), tc: z.number().optional(), temperature_f: z.number().optional() });
export const reportSnapshotSchema = z.object({
  service_timezone:z.string().optional(),unit_system:z.enum(['imperial','metric']).optional(),report_language:z.enum(['en','pt','es']).optional(),
  technician_name:z.string().optional(),
  issue_flags:z.array(z.enum(ISSUE_FLAGS)).default([]),
  property_name: z.string(), customer_name: z.string(), notes: z.string().optional().default(''),
  pools: z.array(z.object({ pool_id: z.string(), pool_name: z.string(), tasks: z.array(z.string()), readings: readingSchema, dosages: z.array(z.object({ product: z.string(), quantity: z.number().nonnegative(), unit: z.string() })) }))
});
export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;
export type ReportPhoto = { content: string; filename: string };
export type ProviderPayload = { reply_to?:string; from: string; to: string[]; subject: string; html: string; text: string; attachments: { content: string; filename: string; content_type: string; content_id: string }[] };
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const readings: [keyof z.infer<typeof readingSchema>, string, string][] = [['fc','Free Chlorine',' ppm'],['ph','pH',''],['ta','Alkalinity',' ppm'],['cya','Cyanuric Acid',' ppm'],['ch','Calcium Hardness',' ppm'],['salt','Salt',' ppm'],['cc','Combined Chlorine',' ppm'],['tc','Total Chlorine',' ppm'],['temperature_f','Water temperature',' °F']];

export function createServiceReport(input:{snapshot:unknown;completedAt:string;recipient:string;from:string;replyTo?:string;photos?:ReportPhoto[]}):ProviderPayload{
 const snapshot=reportSnapshotSchema.parse(input.snapshot),recipient=z.email().parse(input.recipient);
 const lang=snapshot.report_language??'en',zone=snapshot.service_timezone??'America/New_York',units=snapshot.unit_system??'imperial';
 const t=(s:string)=>translate(s,lang),h=(s:string)=>escapeHtml(t(s));
 const date=new Intl.DateTimeFormat(languageTag(lang),{timeZone:zone,dateStyle:'long'}).format(new Date(input.completedAt));
 const time=new Intl.DateTimeFormat(languageTag(lang),{timeZone:zone,timeStyle:'short'}).format(new Date(input.completedAt));
 const photos=(input.photos??[]).slice(0,3),heading=t(snapshot.issue_flags.length?'Pool service visit recorded':'Your pool has been serviced successfully!');
 const text=['ALYS POOL SERVICES',heading,`${t('Property')}: ${snapshot.property_name}`,`${t('Date')}: ${date}`,`${t('Service time')}: ${time} (${zone})`];
 if(snapshot.technician_name)text.push(`${t('Technician')}: ${snapshot.technician_name}`);
 const body=snapshot.pools.map(pool=>{
 text.push('\n'+pool.pool_name,t('SERVICE COMPLETED'),...pool.tasks.map(task=>'✓ '+t(task)));
 const measures=readings.filter(([key])=>pool.readings[key]!==undefined).map(([key,name,unit])=>{
 const value=key==='temperature_f'&&units==='metric'?readableNumber(fahrenheitToCelsius(pool.readings[key]!)):pool.readings[key];
 const label=key==='temperature_f'&&units==='metric'?' °C':unit;text.push(`${t(name)}: ${value}${label}`);
 return `<tr><td style="padding:7px">${h(name)}</td><td style="padding:7px;text-align:right">${escapeHtml(value)}${label}</td></tr>`;
 }).join('');
 const doses=pool.dosages.map(d=>{const shown=displayDose(d,units),label=`${t(d.product)}: ${readableNumber(shown.quantity)} ${shown.unit}`;text.push(label);return `<li>${escapeHtml(label)}</li>`;}).join('');
 const tasks=pool.tasks.length?`<ul>${pool.tasks.map(task=>`<li>✓ ${h(task)}</li>`).join('')}</ul>`:`<p>${h('No checklist tasks recorded.')}</p>`;
 return `<h2>${escapeHtml(pool.pool_name)}</h2><h3>${h('SERVICE COMPLETED')}</h3>${tasks}${measures?`<h3>${h('WATER TEST RESULTS')}</h3><table role="presentation" width="100%">${measures}</table>`:''}${doses?`<h3>${h('CHEMICALS ADDED')}</h3><ul>${doses}</ul>`:''}`;
 }).join('');
 if(snapshot.issue_flags.length)text.push(t('Service issues')+': '+snapshot.issue_flags.map(f=>t(ISSUE_LABELS[f])).join(', '));
 if(snapshot.notes)text.push(`${t('Service notes')}: ${snapshot.notes}`);text.push(t('Thank you for choosing ALYS Pool Services!'),t('Professional Pool Maintenance'));
 const images=photos.map((_,i)=>`<p><img src="cid:service-photo-${i+1}" alt="${h('Service photo')} ${i+1}" width="552" style="width:100%;max-width:552px;height:auto;border-radius:8px"></p>`).join('');
 const html=`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f7f8;color:#203a46;font-family:Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:20px 10px"><main style="max-width:600px;background:white;padding:24px;text-align:left"><header style="background:#0b2332;color:white;padding:20px;font-size:26px">≋ ALYS POOLS</header><h1>${escapeHtml(heading)}</h1><p><strong>${h('Property')}:</strong> ${escapeHtml(snapshot.property_name)}<br><strong>${h('Date')}:</strong> ${escapeHtml(date)}<br><strong>${h('Service time')}:</strong> ${escapeHtml(time)} · ${escapeHtml(zone)}</p>${snapshot.technician_name?`<p><strong>${h('Technician')}:</strong> ${escapeHtml(snapshot.technician_name)}</p>`:''}${body}${snapshot.issue_flags.length?`<h3>${h('SERVICE ISSUES')}</h3><p>${snapshot.issue_flags.map(f=>h(ISSUE_LABELS[f])).join(', ')}</p>`:''}${snapshot.notes?`<h3>${h('SERVICE NOTES')}</h3><p>${escapeHtml(snapshot.notes).replace(/\n/g,'<br>')}</p>`:''}${images?`<h3>${h('SERVICE PHOTOS')}</h3>${images}`:''}<p>${h('Thank you for choosing ALYS Pool Services!')}</p><p>${h('Professional Pool Maintenance')}</p></main></td></tr></table></body></html>`;
 return {from:input.from,to:[recipient],...(input.replyTo?{reply_to:input.replyTo}:{}),subject:`ALYS Pool Services — ${t(snapshot.issue_flags.length?'Visit Recorded':'Service Completed')} — ${date}`,html,text:text.join('\n'),attachments:photos.map((photo,i)=>({content:photo.content,filename:photo.filename,content_type:'image/jpeg',content_id:`service-photo-${i+1}`}))};
}
