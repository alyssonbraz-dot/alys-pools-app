import { z } from "zod";
import { customerManagementSchema as customer } from "./customer-management";
import { poolSchema as pool, scheduleSchema as schedule } from "./validation";
export const customerManagementSchema = customer;
export const poolSchema = pool
  .omit({ property_id: true })
  .extend({ water_type: z.enum(["chlorine", "salt", "bromine", "other"]) });
export const scheduleSchema = z
  .object(schedule.shape)
  .omit({ property_id: true })
  .safeExtend({ id: z.uuid().optional(), service_notes: z.string().max(2000) })
  .refine((s) => new Set(s.days_of_week).size === s.days_of_week.length)
  .refine((s) => !s.end_on || s.end_on >= s.start_on);
