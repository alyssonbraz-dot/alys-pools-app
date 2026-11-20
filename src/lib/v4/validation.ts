import { z } from 'zod';
import { CHEMICAL_UNITS } from '@/lib/chemical-entry';
import type { VisitInput } from './types';

const distinct = (items: string[]) => new Set(items).size === items.length;
export const v4Day = z.iso.date();

const dose = z.strictObject({
  product: z.string().min(1).max(120),
  amount: z.number().positive().max(10000),
  unit: z.string().min(1).max(24),
}).refine(({product, unit}) =>
  Object.hasOwn(CHEMICAL_UNITS, product) && product !== 'Other' && CHEMICAL_UNITS[product].includes(unit)
);
const body = z.strictObject({
  bodyId: z.uuid(),
  ph: z.number().min(0).max(14),
  fc: z.number().min(0).max(100),
  alkalinity: z.number().min(0).max(2000).nullable(),
  chemicals: z.array(dose).max(16),
  tasks: z.array(z.enum(['Skim surface', 'Brush walls', 'Empty baskets'])).max(3).refine(distinct),
});
export const visitSchema = z.strictObject({
  id: z.uuid(), stopId: z.uuid(), date: v4Day,
  bodies: z.array(body).min(1).max(32).refine(items => distinct(items.map(item => item.bodyId))),
  notes: z.string().max(2000),
}) satisfies z.ZodType<VisitInput>;
export const orderSchema = z.strictObject({
  date: v4Day,
  ids: z.array(z.uuid()).max(500).refine(distinct),
  mode: z.enum(['save', 'reset']),
});
