import { redirect } from 'next/navigation';
import { V4App } from '@/components/v4/app';
import { v4Day } from '@/lib/v4/validation';
import { serviceDay } from '@/lib/service-time';
import { loadV4Route, v4Operator } from '@/lib/v4/server';

export const metadata = {title: 'Route dashboard · ALYS Pools'};

export default async function V4Page({searchParams}: {searchParams:Promise<{date?: string}>}) {
  const { operator, error } = await v4Operator();
  if (!operator) {
    if (error.status === 503) redirect('/v4/login?message=setup');
    redirect(error.status === 403 ? '/v4/login?message=membership' : '/v4/login');
  }
  const date = v4Day.safeParse((await searchParams).date);
  const route = await loadV4Route(operator, date.success ? date.data : serviceDay());
  return <V4App key={operator.orgId + '/' + operator.userId + '/' + route.date} initial={route} userId={operator.userId} orgId={operator.orgId} canAdd={operator.role === 'owner'} />;
}
