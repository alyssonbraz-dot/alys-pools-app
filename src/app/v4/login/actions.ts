'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { v4Client } from '@/lib/v4/server';

const credentials = z.object({email:z.email().max(254), password:z.string().min(1).max(256)});

export async function signIn(form: FormData) {
  const input = credentials.safeParse({email: String(form.get('email') ?? '').trim(), password: form.get('password')});
  if (!input.success) redirect('/v4/login?message=invalid');
  const db = await v4Client();
  if (!db) redirect('/v4/login?message=setup');
  const { error } = await db.auth.signInWithPassword(input.data);
  if (error) redirect(error.status && error.status >= 500 ? '/v4/login?message=setup' : '/v4/login?message=invalid');
  redirect('/v4');
}
