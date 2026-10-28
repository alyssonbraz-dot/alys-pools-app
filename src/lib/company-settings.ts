import { z } from "zod";
import { DEFAULT_CHECKLIST } from "./field/types";
export const defaultsSchema = z.object({
  photo_required: z.boolean().default(true),
  required_readings: z
    .array(
      z.enum([
        "fc",
        "ph",
        "tc",
        "cc",
        "ta",
        "ch",
        "cya",
        "salt",
        "temperature_f",
      ]),
    )
    .max(9)
    .default(["fc", "ph"]),
  checklist: z
    .array(z.string().trim().min(1).max(100))
    .min(1)
    .max(30)
    .default(DEFAULT_CHECKLIST),
  reference_ranges: z
    .partialRecord(
      z.enum([
        "fc",
        "ph",
        "tc",
        "cc",
        "ta",
        "ch",
        "cya",
        "salt",
        "temperature_f",
      ]),
      z
        .object({ min: z.number(), max: z.number() })
        .refine((r) => r.min <= r.max),
    )
    .default({}),
  show_issue_reminders: z.boolean().default(true),
});
export type CompanyDefaults = z.infer<typeof defaultsSchema>;
