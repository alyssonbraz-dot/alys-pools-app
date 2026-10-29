import { z } from 'zod';
export const idSchema=z.uuid();
export const customerSchema=z.object({
 name:z.string().trim().min(2).max(100),email:z.union([z.literal(''),z.email().max(254)]),phone:z.string().trim().max(30),status:z.enum(['active','inactive']),email_reports_enabled:z.boolean()
}).refine(c=>!c.email_reports_enabled||!!c.email,{message:'Email is required when reports are enabled'});
export const propertySchema=z.object({customer_id:idSchema,name:z.string().trim().max(100),address:z.string().trim().min(5).max(300),gate_notes:z.string().trim().max(1000)});
export const poolSchema=z.object({
 property_id:idSchema,name:z.string().trim().min(2).max(100),gallons:z.coerce.number().positive().max(10000000),water_type:z.enum(['chlorine','salt','bromine','other']),type:z.enum(['residential','commercial','spa']),status:z.enum(['active','inactive']),
 checklist:z.array(z.string().trim().min(1).max(100)).min(1).max(30),required_readings:z.array(z.enum(['fc','ph','ta','cya','ch','salt','cc','tc','temperature_f'])).max(9),photo_required:z.boolean()
});
export const scheduleSchema=z.object({property_id:idSchema,technician_id:idSchema,days_of_week:z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),start_on:z.iso.date(),end_on:z.union([z.literal(''),z.iso.date()]),active:z.boolean()}).refine(s=>!s.end_on||s.end_on>=s.start_on,{message:'End date must follow start date'});
export const loginSchema=z.object({email:z.email().max(254),password:z.string().min(1).max(128)});
// Legacy shape kept for foundational unit tests; operational completion validates all readings separately.
export const visitSchema=z.object({pool_id:idSchema,free_chlorine_ppm:z.number().min(0).max(30),ph:z.number().min(0).max(14),alkalinity_ppm:z.number().min(0).max(500)});
