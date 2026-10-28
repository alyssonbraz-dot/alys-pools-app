import { describe, expect, it } from "vitest";
import { bundleSchema } from "../src/lib/onboarding";
import { chemistryCsv, outsideRange } from "../src/lib/chemistry-table";
import { defaultsSchema } from "../src/lib/company-settings";
const id = "a0000000-0000-4000-8000-000000000001";
function bundle() {
  return {
    request_id: id,
    customer: {
      property_id: null,
      first_name: "Test",
      last_name: "Person",
      email: "",
      phone: "",
      status: "active",
      service_address: "Fictional address",
      property_name: "",
      billing_address: "",
      internal_notes: "",
      monthly_price_cents: 10000,
      service_frequency: 2,
      assigned_technician_id: id,
      tags: [],
      email_reports_enabled: false,
      latitude: null,
      longitude: null,
    },
    properties: [
      {
        name: "Home",
        address: "Fictional address",
        gate_notes: "",
        latitude: null,
        longitude: null,
        location_confirmed: false,
        service_timezone: "America/New_York",
        pools: [
          {
            name: "Pool",
            gallons: 15000,
            water_type: "chlorine",
            type: "residential",
            status: "active",
            checklist: ["Test Water"],
            required_readings: ["fc", "ph"],
            photo_required: true,
            equipment_notes: "",
            reference_ranges: {},
          },
        ],
        schedules: [
          {
            technician_id: id,
            days_of_week: [2, 5],
            start_on: "2026-10-27",
            end_on: "",
            active: true,
            service_notes: "",
          },
        ],
      },
    ],
    agreement: {
      source: "own",
      billing_model: "monthly",
      price_cents: 10000,
      status: "active",
    },
  };
}
describe("V2 onboarding and history", () => {
  it("accepts multiple properties/pools, no end date and two service days", () => {
    const b = bundle();
    b.properties.push(structuredClone(b.properties[0]));
    b.properties[0].pools.push({ ...b.properties[0].pools[0], name: "Spa" });
    expect(bundleSchema.parse(b).properties).toHaveLength(2);
  });
  it("rejects duplicate weekdays and reversed service dates", () => {
    const b = bundle();
    b.properties[0].schedules[0].days_of_week = [2, 2];
    expect(bundleSchema.safeParse(b).success).toBe(false);
    b.properties[0].schedules[0].days_of_week = [2];
    b.properties[0].schedules[0].end_on = "2026-01-01";
    expect(bundleSchema.safeParse(b).success).toBe(false);
  });
  it("rejects a reported location without coordinates", () => {
    const b = bundle();
    b.properties[0].location_confirmed = true;
    expect(bundleSchema.safeParse(b).success).toBe(false);
  });
  it("never permits per-visit own contracts to be counted as monthly", () => {
    const b = bundle();
    b.agreement.billing_model = "per_visit";
    expect(bundleSchema.safeParse(b).success).toBe(false);
    b.agreement.source = "subcontract";
    expect(bundleSchema.safeParse(b).success).toBe(true);
  });
  it("does not use missing readings as zero or invent default target ranges", () => {
    expect(outsideRange(undefined, { min: 1, max: 3 })).toBe(false);
    expect(outsideRange(0, { min: 1, max: 3 })).toBe(true);
    expect(outsideRange(5, undefined)).toBe(false);
    expect(defaultsSchema.parse({}).reference_ranges).toEqual({});
  });
  it("exports separate chemical rows and neutralizes spreadsheet formulas", () => {
    const rows = [
      {
        visit_id: id,
        completed_at: "2026-10-27T14:00:00Z",
        pool_name: "=SUM(A1)",
        technician_name: "Tech",
        readings: { fc: 0 },
        dosages: [
          { product: "Chlorine", quantity: 1, unit: "gal" },
          { product: "Acid", quantity: 8, unit: "fl oz" },
        ],
      },
    ];
    const csv = chemistryCsv(rows);
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain('"0","","",""');
    expect(chemistryCsv(rows, true).split("\r\n")).toHaveLength(3);
  });
});
