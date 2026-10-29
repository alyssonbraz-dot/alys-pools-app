import { z } from "zod";
import {
  customerManagementSchema,
  poolSchema,
  scheduleSchema,
} from "./onboarding-shared";
export { customerManagementSchema, poolSchema, scheduleSchema };
const ranges = z.partialRecord(
  z.enum(["fc", "ph", "ta", "cya", "ch", "salt", "cc", "tc", "temperature_f"]),
  z
    .object({ min: z.number().finite(), max: z.number().finite() })
    .refine((r) => r.min <= r.max),
);
export const bundleSchema = z.object({
  request_id: z.uuid(),
  customer: customerManagementSchema,
  properties: z
    .array(
      z
        .object({
          id: z.uuid().optional(),
          name: z.string().max(120),
          address: z.string().trim().min(5).max(300),
          gate_notes: z.string().max(1000),
          latitude: z.number().min(-90).max(90).nullable(),
          longitude: z.number().min(-180).max(180).nullable(),
          location_confirmed: z.boolean(),
          country_code:z.enum(["US","BR"]).optional(),
          unit_system:z.enum(["inherit","imperial","metric"]).optional(),
          service_timezone: z
            .string()
            .max(80)
            .refine((v) => {
              try {
                new Intl.DateTimeFormat("en", { timeZone: v });
                return true;
              } catch {
                return false;
              }
            }),
          pools: z
            .array(
              poolSchema.extend({
                id: z.uuid().optional(),
                photo_scope_required: z.boolean().default(false),
                equipment_notes: z.string().max(2000),
                reference_ranges: ranges,
              }),
            )
            .min(1)
            .max(30),
          schedules: z.array(scheduleSchema).max(10),
        })
        .refine((p) => (p.latitude === null) === (p.longitude === null))
        .refine((p) => !p.location_confirmed || p.latitude !== null)
        .refine(
          (p) =>
            p.pools.filter(
              (pool) => pool.photo_scope_required && pool.photo_required,
            ).length <= 3,
          {
            message:
              "A stop supports up to three photos; require at most three body-specific photos",
          },
        ),
    )
    .min(1)
    .max(10),
  agreement: z
    .object({
      id: z.uuid().optional(),
      source: z.enum(["own", "subcontract"]),
      billing_model: z.enum(["monthly", "per_visit", "fixed_contract"]),
      price_cents: z.number().int().min(0).max(100000000),
      status: z.enum(["active", "inactive"]),
    })
    .refine((a) => a.source !== "own" || a.billing_model === "monthly"),
});
export type CustomerBundle = z.infer<typeof bundleSchema>;
