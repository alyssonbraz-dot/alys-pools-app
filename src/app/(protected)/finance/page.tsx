import {redirect} from 'next/navigation';
import {requireOperator} from '@/lib/auth';
import {allRows} from '@/lib/pagination';
import {PageHeader,Card,StatCard,SectionHeader} from '@/components/design/primitives';
import {T,CurrencyText} from '@/components/i18n';
import {ProfitEditor} from '@/components/profit-editor';
import {profitEstimate,type ProfitCosts} from '@/lib/profitability';

type Contract={id:string;customer_id:string;source:string;billing_model:string;price_cents:number;status:string};
type Customer={id:string;name:string};
type Costs=ProfitCosts&{customer_id:string};
export default async function Finance(){
 const {profile,db}=await requireOperator();
 if(profile.role!=='owner')redirect('/stops');
 const [overview,contracts,customers,costs]=await Promise.all([
  db.rpc('owner_overview'),
  allRows((from,to)=>db.from('contracts').select('id,customer_id,source,billing_model,price_cents,status').eq('status','active').order('id').range(from,to)),
  allRows((from,to)=>db.from('customers').select('id,name').is('archived_at',null).order('name').range(from,to)),
  allRows((from,to)=>db.from('customer_profit_costs').select('customer_id,visits_per_month,technician_cost_per_visit_cents,chemicals_per_visit_cents,fuel_vehicle_per_visit_cents,other_per_visit_cents,monthly_overhead_cents').order('customer_id').range(from,to))
 ]);
 if(overview.error)throw new Error('Finance unavailable.');
 const visibleCustomers=new Set((customers as Customer[]).map(c=>c.id));
 const revenue=new Map<string,number>();
 for(const c of contracts as Contract[]){
  if(c.source==='own'&&c.billing_model==='monthly'&&visibleCustomers.has(c.customer_id))
   revenue.set(c.customer_id,(revenue.get(c.customer_id)??0)+Number(c.price_cents));
 }
 const byId=new Map((costs as Costs[]).map(c=>[c.customer_id,c]));
 const eligible=(customers as Customer[]).filter(c=>revenue.has(c.id));
 const configured=eligible.filter(c=>byId.has(c.id));
 let estimatedRevenue=0,estimatedContribution=0;
 for(const customer of configured){
  const monthly=revenue.get(customer.id)??0;
  estimatedRevenue+=monthly;
  estimatedContribution+=profitEstimate(monthly,byId.get(customer.id)!).contributionCents;
 }
 const cash=(cents:number)=>(cents/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
 return <>
  <PageHeader title="Profitability" description="Estimated monthly contribution by customer, based on your cost assumptions."/>
  <div className="stat-grid">
   <StatCard label="Own-customer MRR" value={<CurrencyText value={(overview.data?.mrr_cents??0)/100}/>} icon="finance"/>
   <StatCard label="Configured customers" value={configured.length+' / '+eligible.length} icon="reports"/>
   <StatCard label="Estimated contribution (configured only)" value={cash(estimatedContribution)} icon="finance"/>
   <StatCard label="Estimated margin (configured only)" value={estimatedRevenue>0?(estimatedContribution/estimatedRevenue*100).toFixed(1)+'%':'—'} icon="reports"/>
  </div>
  <Card>
   <h2><T text="Revenue is not profit"/></h2>
   <p className="note">This is an estimated contribution, not accounting net profit or cash collected. Only active own monthly agreements with saved cost assumptions are included in the estimate. The MRR metric uses the application's existing active-schedule eligibility rule, so it can differ from the contract amounts shown below.</p>
   <p className="note">Enter monthly visits and costs paid by ALYS. If the technician pays for gas, chemicals, insurance or vehicle expenses, do not charge those costs to ALYS again. Account for company overhead separately. Months with five visits may reduce margin.</p>
   <p className="note">Subcontract agreements, actual invoices, taxes, payment processing, and unallocated fixed operating costs are not included. A zero entered cost is treated as zero, not as missing.</p>
  </Card>
  <SectionHeader title="Customer profitability assumptions"/>
  {!eligible.length&&<p className="note">No active own monthly customer contracts found.</p>}
  {eligible.map(c=><ProfitEditor key={c.id} customerId={c.id} customerName={c.name} revenueCents={revenue.get(c.id)??0} initial={byId.get(c.id)??null}/>)}
  <SectionHeader title="Subcontract agreements"/>
  <p className="note">{(contracts as Contract[]).filter(c=>c.source==='subcontract').length} active agreements. Excluded from profitability until a separate billing-frequency and service-volume model is configured.</p>
 </>;
}
