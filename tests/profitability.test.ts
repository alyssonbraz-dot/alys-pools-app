import {describe,it,expect} from 'vitest';
import {profitEstimate} from '@/lib/profitability';
describe('profitability assumptions',()=>{
 it('computes monthly contribution after technician and company costs',()=>{
  const r=profitEstimate(14000,{visits_per_month:4,technician_cost_per_visit_cents:2500,chemicals_per_visit_cents:0,fuel_vehicle_per_visit_cents:0,other_per_visit_cents:0,monthly_overhead_cents:0});
  expect(r.monthlyCostsCents).toBe(10000);
  expect(r.contributionCents).toBe(4000);
  expect(r.marginPct).toBeCloseTo(28.5714,3);
 });
 it('reflects five-visit months and overhead',()=>{
  const r=profitEstimate(14000,{visits_per_month:5,technician_cost_per_visit_cents:2500,chemicals_per_visit_cents:0,fuel_vehicle_per_visit_cents:0,other_per_visit_cents:0,monthly_overhead_cents:1000});
  expect(r.contributionCents).toBe(500);
 });
 it('does not invent a margin when revenue is zero',()=>{
  const r=profitEstimate(0,{visits_per_month:4.33,technician_cost_per_visit_cents:0,chemicals_per_visit_cents:0,fuel_vehicle_per_visit_cents:0,other_per_visit_cents:0,monthly_overhead_cents:0});
  expect(r.marginPct).toBeNull();
 });
});