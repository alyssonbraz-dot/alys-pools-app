export type Contract = { source:'own'|'subcontract'; billing_model:'monthly'|'per_visit'|'fixed_contract'; price_cents:number; status:'active'|'inactive' };
export function revenue(contracts:Contract[]) {
  const active=contracts.filter(c=>c.status==='active');
  return {
    ownMrrCents:active.filter(c=>c.source==='own'&&c.billing_model==='monthly').reduce((n,c)=>n+c.price_cents,0),
    subcontractMonthlyCents:active.filter(c=>c.source==='subcontract'&&c.billing_model==='monthly').reduce((n,c)=>n+c.price_cents,0)
  };
}
export const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export const floridaDate=(date:Date)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'full'}).format(date);
// 0 = domingo. Frequência deriva dos dias, sem contagem duplicada.
export function recurringDays(days:number[]) {
  if (days.some(d=>!Number.isInteger(d)||d<0||d>6)) throw new Error('Invalid weekday');
  return [...new Set(days)].sort((a,b)=>a-b);
}
