import { z } from "zod";
export const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const cents = z.number().int().min(0).max(1_000_000_000).nullable();
const party = z.enum(["alys", "technician"]);
export const termSchema = z.object({
  scope: z.enum(["default", "technician", "contract"]),
  target: z.string().default(""),
  model: z.enum(["per_visit", "monthly"]),
  rate_cents: cents,
  extra_visit_cents: cents,
  additional_service_cents: cents,
  chemicals: party,
  fuel: party,
  vehicle: party,
  tools: party,
});
export const categoryNames = [
  "General Liability Insurance",
  "Software / Hosting / Email",
  "Marketing",
  "Administration",
  "Other company costs",
];
export const configSchema = z
  .object({
    currency: z.literal("USD").default("USD"),
    allocation: z.enum(["revenue", "pools"]),
    costs: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          label: z.string().trim().min(1).max(100),
          model: z.enum(["monthly", "per_visit"]),
          cents,
        }),
      )
      .min(1)
      .max(30),
    processing_bps: z.number().int().min(0).max(10000).nullable(),
    processing_fixed_cents: cents,
    terms: z.array(termSchema).min(1).max(200),
    bands: z
      .array(
        z.object({
          label: z.string().min(1).max(40),
          minimum_bps: z.number().int().min(0).max(10000),
          action: z.enum(["Review", "Adjust price", "Maintain"]),
        }),
      )
      .min(1)
      .max(10),
  })
  .superRefine((v, c) => {
    if (new Set(v.costs.map((x) => x.id)).size !== v.costs.length)
      c.addIssue({ code: "custom", message: "Duplicate cost category" });
    if (
      v.terms.filter((x) => x.scope === "default").length !== 1 ||
      new Set(v.terms.map((x) => x.scope + ":" + x.target)).size !==
        v.terms.length
    )
      c.addIssue({
        code: "custom",
        message: "Duplicate or missing payout terms",
      });
    for (const t of v.terms)
      if (
        (t.scope === "default" && t.target !== "") ||
        (t.scope !== "default" && !z.uuid().safeParse(t.target).success)
      )
        c.addIssue({ code: "custom", message: "Invalid terms scope" });
    if (
      !v.bands.some((x) => x.minimum_bps === 0) ||
      new Set(v.bands.map((x) => x.minimum_bps)).size !== v.bands.length
    )
      c.addIssue({ code: "custom", message: "Invalid margin bands" });
  });
export type FinanceConfig = z.infer<typeof configSchema>;
export const emptyConfig = (): FinanceConfig => ({
  currency: "USD",
  allocation: "revenue",
  costs: categoryNames.map((label, id) => ({
    id: String(id),
    label,
    model: "monthly",
    cents: null,
  })),
  processing_bps: null,
  processing_fixed_cents: null,
  terms: [
    {
      scope: "default",
      target: "",
      model: "per_visit",
      rate_cents: null,
      extra_visit_cents: null,
      additional_service_cents: null,
      chemicals: "technician",
      fuel: "technician",
      vehicle: "technician",
      tools: "technician",
    },
  ],
  bands: [
    { label: "Critical", minimum_bps: 0, action: "Review" },
    { label: "Low", minimum_bps: 1500, action: "Adjust price" },
    { label: "Healthy", minimum_bps: 2500, action: "Maintain" },
    { label: "Very Good", minimum_bps: 3500, action: "Maintain" },
    { label: "Excellent", minimum_bps: 4500, action: "Maintain" },
  ],
});
// Monthly totals replace the previous revision; they are never added to it.
export const recordsSchema = z
  .object({
    company: z
      .array(z.object({ category: z.string().min(1).max(80), cents }))
      .max(30),
    receipts: z
      .array(
        z.object({
          customer_id: z.uuid(),
          cents,
          transactions: z.number().int().min(0).max(100000).nullable(),
        }),
      )
      .max(1000),
    direct: z
      .array(
        z.object({
          id: z.uuid(),
          pool_id: z.uuid(),
          category: z.enum(["chemicals", "fuel", "vehicle", "tools", "other"]),
          label: z.string().trim().min(1).max(100),
          cents: z.number().int().min(0).max(1_000_000_000),
          basis: z.enum(["forecast", "recorded"]),
        }),
      )
      .max(1000),
    direct_complete: z.array(z.uuid()).max(1000),
    additional: z
      .array(
        z.object({
          stop_id: z.uuid(),
          count: z.number().int().min(1).max(100),
        }),
      )
      .max(1000),
  })
  .superRefine((v, c) => {
    for (const rows of [
      v.company.map((x) => x.category),
      v.receipts.map((x) => x.customer_id),
      v.direct.map((x) => x.id),
      v.additional.map((x) => x.stop_id),
    ])
      if (new Set(rows).size !== rows.length)
        c.addIssue({ code: "custom", message: "Duplicate financial record" });
  });
export type FinanceRecords = z.infer<typeof recordsSchema>;
export const emptyRecords = (): FinanceRecords => ({
  company: [],
  receipts: [],
  direct: [],
  direct_complete: [],
  additional: [],
});
export function parseMoney(text: string): number | null {
  if (!text.trim()) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text.trim()))
    throw new Error("Enter an amount with up to two decimals.");
  const [whole, fraction = ""] = text.trim().replace(",", ".").split(".");
  const value = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
  if (!Number.isSafeInteger(value) || value > 1_000_000_000)
    throw new Error("Amount too large.");
  return value;
}
