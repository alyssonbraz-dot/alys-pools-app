import { z } from "zod";
import { ISSUE_FLAGS } from "./issues";
export const daySchema = z.iso.date();
const optionalNumber = (max: number) =>
  z.number().finite().min(0).max(max).optional();
export const readingSchema = z
  .object({
    fc: optionalNumber(30),
    ph: optionalNumber(14),
    ta: optionalNumber(500),
    cya: optionalNumber(1000),
    ch: optionalNumber(5000),
    salt: optionalNumber(10000),
    cc: optionalNumber(30),
    tc: optionalNumber(30),
    temperature_f: optionalNumber(140),
  })
  .strict();
export const dosageSchema = z
  .object({
    product: z.string().trim().min(1).max(100),
    quantity: z.number().finite().positive().max(10000),
    unit: z.string().trim().min(1).max(20),
  })
  .strict();
export const completionSchema = z
  .object({
    id: z.uuid(),
    stop_id: z.uuid(),
    started_at: z.iso.datetime({ offset: true }).optional(),
    completed_at: z.iso.datetime({ offset: true }).optional(),
    pools: z
      .array(
        z
          .object({
            pool_id: z.uuid(),
            tasks: z.array(z.string().min(1).max(100)).max(30),
            readings: readingSchema,
            dosages: z.array(dosageSchema).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    issue_flags: z
      .array(z.enum(ISSUE_FLAGS))
      .max(5)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    photo_assignments: z.record(z.string().max(200), z.uuid()).optional(),
    notes: z.string().max(2000),
    service_details: z
      .object({
        technician_notes: z.string().max(2000),
        equipment_problems: z.string().max(2000),
        filter_cleaning: z.string().max(2000),
        repairs_performed: z.string().max(2000),
      })
      .strict()
      .optional(),
    photo_paths: z
      .array(
        z
          .string()
          .max(200)
          .regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/),
      )
      .max(3),
  })
  .strict();
export const stopMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reassign"),
    stop_id: z.uuid(),
    technician_id: z.uuid(),
  }),
  z.object({ action: z.literal("start"), stop_id: z.uuid() }),
  z.object({ action: z.literal("skip"), stop_id: z.uuid() }),
  z.object({ action: z.literal("restore"), stop_id: z.uuid() }),
  z.object({
    action: z.literal("reorder"),
    stop_ids: z.array(z.uuid()).min(1).max(300),
  }),
  z.object({
    action: z.literal("add"),
    property_id: z.uuid(),
    technician_id: z.uuid().optional(),
    date: daySchema,
  }),
]);
