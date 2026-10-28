import type { ChemistryEntry } from "./field/chemistry";
import type { ReadingKey } from "./field/types";
import { csvCell } from "./customer-management";
export const CHEMISTRY_COLUMNS: [ReadingKey, string][] = [
  ["fc", "FC"],
  ["tc", "TC"],
  ["cc", "CC"],
  ["ph", "pH"],
  ["ta", "TA"],
  ["ch", "CH"],
  ["cya", "CYA"],
  ["salt", "Salt"],
  ["temperature_f", "Water °F"],
];
export type LedgerRow = ChemistryEntry & {
  pool_id?: string;
  pool_name?: string;
  technician_name?: string;
  can_view_visit?: boolean;
  reference_ranges?: Partial<Record<ReadingKey, { min: number; max: number }>>;
};
export function outsideRange(
  value: number | undefined,
  range: { min: number; max: number } | undefined,
) {
  return (
    value !== undefined &&
    range !== undefined &&
    (value < range.min || value > range.max)
  );
}
export function chemistryCsv(rows: LedgerRow[], dosages = false) {
  const table: unknown[][] = dosages
    ? [
        ["Date", "Pool", "Chemical", "Quantity", "Unit", "Technician"],
        ...rows.flatMap((r) =>
          r.dosages.map((d) => [
            r.completed_at,
            r.pool_name ?? "",
            d.product,
            d.quantity,
            d.unit,
            r.technician_name ?? "",
          ]),
        ),
      ]
    : [
        [
          "Date",
          "Pool",
          ...CHEMISTRY_COLUMNS.map(
            ([k, label]) =>
              label + (k === "ph" || k === "temperature_f" ? "" : " (ppm)"),
          ),
          "Technician",
        ],
        ...rows.map((r) => [
          r.completed_at,
          r.pool_name ?? "",
          ...CHEMISTRY_COLUMNS.map(([key]) => r.readings[key] ?? ""),
          r.technician_name ?? "",
        ]),
      ];
  return "\ufeff" + table.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
