export type ProfitCosts={
 visits_per_month:number;
 technician_cost_per_visit_cents:number;
 chemicals_per_visit_cents:number;
 fuel_vehicle_per_visit_cents:number;
 other_per_visit_cents:number;
 monthly_overhead_cents:number;
};
export function profitEstimate(revenueCents:number,costs:ProfitCosts){
 const perVisitCents=costs.technician_cost_per_visit_cents+costs.chemicals_per_visit_cents+costs.fuel_vehicle_per_visit_cents+costs.other_per_visit_cents;
 const monthlyCostsCents=Math.round(perVisitCents*costs.visits_per_month)+costs.monthly_overhead_cents;
 const contributionCents=revenueCents-monthlyCostsCents;
 const marginPct=revenueCents>0?contributionCents/revenueCents*100:null;
 return {perVisitCents,monthlyCostsCents,contributionCents,marginPct};
}
