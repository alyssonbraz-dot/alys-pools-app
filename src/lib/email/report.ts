import { z } from 'zod';
const readingSchema = z.object({ fc: z.number().optional(), ph: z.number().optional(), ta: z.number().optional(), cya: z.number().optional(), ch: z.number().optional(), salt: z.number().optional(), cc: z.number().optional(), tc: z.number().optional(), temperature_f: z.number().optional() });
export const reportSnapshotSchema = z.object({
  property_name: z.string(), customer_name: z.string(), notes: z.string().optional().default(''),
  pools: z.array(z.object({ pool_id: z.string(), pool_name: z.string(), tasks: z.array(z.string()), readings: readingSchema, dosages: z.array(z.object({ product: z.string(), quantity: z.number().nonnegative(), unit: z.string() })) }))
});
export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;
export type ReportPhoto = { content: string; filename: string };
export type ProviderPayload = { from: string; to: string[]; subject: string; html: string; text: string; attachments: { content: string; filename: string; content_type: string; content_id: string }[] };
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const readings: [keyof z.infer<typeof readingSchema>, string, string][] = [['fc','Free Chlorine',' ppm'],['ph','pH',''],['ta','Alkalinity',' ppm'],['cya','Cyanuric Acid',' ppm'],['ch','Calcium Hardness',' ppm'],['salt','Salt',' ppm'],['cc','Combined Chlorine',' ppm'],['tc','Total Chlorine',' ppm'],['temperature_f','Water temperature',' °F']];

export function createServiceReport(input: { snapshot: unknown; completedAt: string; recipient: string; from: string; photos?: ReportPhoto[] }): ProviderPayload {
  const snapshot = reportSnapshotSchema.parse(input.snapshot);
  const recipient = z.email().parse(input.recipient);
  // Only controlled public snapshot fields are rendered. Gate/access/internal notes are ignored.
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'long' }).format(new Date(input.completedAt));
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeStyle: 'short' }).format(new Date(input.completedAt));
  const photos = (input.photos ?? []).slice(0, 3);
  const text: string[] = ['ALYS POOL SERVICES', 'Your pool has been serviced successfully!', `Property: ${snapshot.property_name}`, `Date: ${date}`, `Service Time: ${time} (America/New_York)`];
  const poolHtml = snapshot.pools.map(pool => {
    text.push(`\n${pool.pool_name}`, 'SERVICE COMPLETED', ...pool.tasks.map(task => `✓ ${task}`));
    const measures = readings.filter(([key]) => pool.readings[key] !== undefined).map(([key, name, unit]) => {
      const value = pool.readings[key]; text.push(`${name}: ${value}${unit}`);
      return `<tr><td style="padding:7px 0;color:#526770">${name}</td><td style="padding:7px;text-align:right;font-weight:700">${escapeHtml(value)}${unit}</td></tr>`;
    }).join('');
    const doses = pool.dosages.map(dose => { const label = `${dose.product}: ${dose.quantity} ${dose.unit}`; text.push(label); return `<li>${escapeHtml(label)}</li>`; }).join('');
    return `<h2 style="font-size:20px;color:#0b2332">${escapeHtml(pool.pool_name)}</h2><h3 style="font-size:12px;letter-spacing:1px;color:#0b948d">SERVICE COMPLETED</h3>${pool.tasks.length ? `<ul style="padding-left:20px;line-height:1.8">${pool.tasks.map(task => `<li>✓ ${escapeHtml(task)}</li>`).join('')}</ul>` : '<p>No checklist tasks recorded.</p>'}${measures ? `<h3 style="font-size:12px;color:#0b948d">WATER TEST RESULTS</h3><table role="presentation" width="100%" style="border-collapse:collapse">${measures}</table>` : ''}${doses ? `<h3 style="font-size:12px;color:#0b948d">CHEMICALS ADDED</h3><ul style="padding-left:20px;line-height:1.8">${doses}</ul>` : ''}`;
  }).join('');
  if (snapshot.notes) text.push(`Service notes: ${snapshot.notes}`);
  text.push('Thank you for choosing ALYS Pool Services!', 'Professional Pool Maintenance');
  const images = photos.map((photo, index) => `<p><img src="cid:service-photo-${index + 1}" alt="Service photo ${index + 1}" width="552" style="width:100%;max-width:552px;height:auto;border-radius:8px"></p>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f7f8;color:#203a46;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 10px"><table role="presentation" width="600" cellpadding="24" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff"><tr><td style="background:#0b2332;color:white"><div style="font-size:28px;font-weight:700;letter-spacing:1px">≋ ALYS <span style="color:#54d4c0">POOLS</span></div><div style="font-size:11px;letter-spacing:2px;color:#b7d1da">POOL SERVICES</div></td></tr><tr><td><h1 style="font-size:24px">Your pool has been serviced successfully!</h1><p><strong>Property:</strong> ${escapeHtml(snapshot.property_name)}<br><strong>Date:</strong> ${escapeHtml(date)}<br><strong>Service time:</strong> ${escapeHtml(time)} · Florida time</p>${poolHtml}${snapshot.notes ? `<h3 style="font-size:12px;color:#0b948d">SERVICE NOTES</h3><p>${escapeHtml(snapshot.notes).replace(/\n/g, '<br>')}</p>` : ''}${images ? `<h3 style="font-size:12px;color:#0b948d">SERVICE PHOTO${photos.length > 1 ? 'S' : ''}</h3>${images}` : ''}<p style="margin-top:28px">Thank you for choosing ALYS Pool Services!</p><p style="font-size:12px;color:#738792">Professional Pool Maintenance</p></td></tr></table></td></tr></table></body></html>`;
  return { from: input.from, to: [recipient], subject: `ALYS Pool Services — Service Completed — ${date}`, html, text: text.join('\n'), attachments: photos.map((photo,index) => ({ content: photo.content, filename: photo.filename, content_type: 'image/jpeg', content_id: `service-photo-${index + 1}` })) };
}
