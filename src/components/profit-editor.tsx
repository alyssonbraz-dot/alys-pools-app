'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {profitEstimate,type ProfitCosts} from '@/lib/profitability';
type Props={customerId:string;customerName:string;revenueCents:number;initial:ProfitCosts|null};
const fields:[keyof ProfitCosts,string,boolean][]=[
 ['visits_per_month','Expected visits/month',false],
 ['technician_cost_per_visit_cents','Technician per visit ($)',true],
 ['chemicals_per_visit_cents','Company chemicals per visit ($)',true],
 ['fuel_vehicle_per_visit_cents','Company fuel/vehicle per visit ($)',true],
 ['other_per_visit_cents','Other direct costs per visit ($)',true],
 ['monthly_overhead_cents','Allocated monthly overhead ($)',true],
];
const defaults:ProfitCosts={visits_per_month:4.33,technician_cost_per_visit_cents:0,chemicals_per_visit_cents:0,fuel_vehicle_per_visit_cents:0,other_per_visit_cents:0,monthly_overhead_cents:0};
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function ProfitEditor({customerId,customerName,revenueCents,initial}:Props){
 const router=useRouter();
 const [values,setValues]=useState<ProfitCosts>(initial??defaults);
 const [saved,setSaved]=useState(!!initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const estimate=saved?profitEstimate(revenueCents,values):null;
 async function save(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/profitability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customer_id:customerId,...values})});
   if(!response.ok){const data=await response.json();throw new Error(data.error||'Could not save costs.');}
   setSaved(true);setMessage('Cost assumptions saved.');router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:'Could not save costs.');}finally{setBusy(false);}
 }
 return <section className="panel" style={{padding:16,marginBottom:14}}>
  <details><summary style={{cursor:'pointer',minHeight:44}}><strong>{customerName}</strong> · Monthly contract {money(revenueCents)} · {estimate?<span style={{color:estimate.contributionCents<0?'#b42318':'#16805a'}}>{money(estimate.contributionCents)} estimated contribution ({estimate.marginPct?.toFixed(1)??'—'}%)</span>:'Costs not configured'}</summary>
   <p className="note">Estimates use your assumptions, not recorded expenses or collected payments. Enter 0 only when the company actually has no cost in that category.</p>
   <form onSubmit={save}>
    <div className="form-grid">{fields.map(([key,label,isMoney])=><label className="form-field" key={key}>{label}
     <input type="number" min="0" max={isMoney?100000:62} step={isMoney?'0.01':'0.01'} required value={isMoney?(values[key]/100).toFixed(2):values[key]}
      onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setValues(v=>({...v,[key]:isMoney?Math.round(n*100):n}));}}/>
    </label>)}</div>
    {error&&<p role="alert" className="notice">{error}</p>}{message&&<p role="status" className="note">{message}</p>}
    <button className="btn btn-primary" type="submit" disabled={busy}>{busy?'Saving…':'Save cost assumptions'}</button>
   </form>
  </details>
 </section>;
}
