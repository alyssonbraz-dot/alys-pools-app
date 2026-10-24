"use server";
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabase/server';
import { requireManager } from '@/lib/auth';
import { customerSchema, poolSchema, propertySchema, idSchema, loginSchema, scheduleSchema } from '@/lib/validation';
export async function login(form:FormData) {
  const parsed=loginSchema.safeParse(Object.fromEntries(form));
  if(!parsed.success) redirect('/login?message=invalid');
  const db=await supabase();
  const {error}=await db.auth.signInWithPassword(parsed.data);
  if(error) redirect('/login?message=invalid');
  redirect('/');
}
export async function logout() {
  const db=await supabase();
  await db.auth.signOut(); redirect('/login');
}
export async function saveCustomer(form:FormData) {
  const {db,profile}=await requireManager();
  const parsed=customerSchema.safeParse({...Object.fromEntries(form),email_reports_enabled:form.get('email_reports_enabled')==='on'});
  const id=form.get('id');
  if(!parsed.success || (id && !idSchema.safeParse(id).success)) redirect('/customers?message=invalid');
  const row={...parsed.data,organization_id:profile.organization_id};
  const result=id ? await db.from('customers').update(row).eq('id',id).eq('organization_id',profile.organization_id).select('id') : await db.from('customers').insert(row).select('id');
  if(result.error || !result.data?.length) redirect('/customers?message=failed');
  revalidatePath('/customers'); redirect('/customers?message=saved');
}
export async function saveProperty(form:FormData) {
  const {db,profile}=await requireManager();
  const parsed=propertySchema.safeParse(Object.fromEntries(form));
  if(!parsed.success) redirect('/pools?message=invalid');
  const id=form.get('id');
  if(id&&!idSchema.safeParse(id).success)redirect('/pools?message=invalid');
  const row={...parsed.data,organization_id:profile.organization_id};
  const {error}=id?await db.from('properties').update(row).eq('id',id).eq('organization_id',profile.organization_id):await db.from('properties').insert(row);
  if(error) redirect('/pools?message=failed');
  revalidatePath('/pools');redirect('/pools?message=saved');
}
export async function savePool(form:FormData) {
  const {db,profile}=await requireManager();
  const parsed=poolSchema.safeParse({...Object.fromEntries(form),checklist:String(form.get('checklist')??'').split('\n').map(t=>t.trim()).filter(Boolean),required_readings:form.getAll('required_readings'),photo_required:form.get('photo_required')==='on'});
  const id=form.get('id');
  if(!parsed.success || (id && !idSchema.safeParse(id).success)) redirect('/pools?message=invalid');
  const row={...parsed.data,organization_id:profile.organization_id};
  const result=id ? await db.from('pools').update(row).eq('id',id).eq('organization_id',profile.organization_id).select('id') : await db.from('pools').insert(row).select('id');
  if(result.error || !result.data?.length) redirect('/pools?message=failed');
  revalidatePath('/pools');redirect('/pools?message=saved');
}
// Remoção lógica por status preserva histórico. Exclusão física exige confirmação e não é exposta.

export async function saveSchedule(form:FormData) {
 const {db,profile}=await requireManager();
 const parsed=scheduleSchema.safeParse({...Object.fromEntries(form),days_of_week:[...new Set(form.getAll('days_of_week'))],active:form.get('active')==='on'});
 const id=form.get('id');
 if(!parsed.success||(id&&!idSchema.safeParse(id).success))redirect('/settings?message=invalid');
 const row={...parsed.data,end_on:parsed.data.end_on||null,organization_id:profile.organization_id};
 const result=id?await db.from('recurring_schedules').update(row).eq('id',id).select('id'):await db.from('recurring_schedules').insert(row).select('id');
 if(result.error||!result.data?.length)redirect('/settings?message=failed');
 revalidatePath('/');revalidatePath('/settings');redirect('/settings?message=saved');
}
