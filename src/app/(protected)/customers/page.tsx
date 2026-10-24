import Link from 'next/link';
import { requireManager } from '@/lib/auth';
import { saveCustomer } from '@/app/actions';
import { Heading,Panel,Field,Status,Feedback } from '@/components/ui';
type Customer={id:string;name:string;email:string;phone:string;status:string;email_reports_enabled:boolean};
function CustomerForm({customer}:{customer?:Customer}) {return <form action={saveCustomer} className="form-grid">{customer&&<input type="hidden" name="id" value={customer.id}/>}<Field label="Client name" name="name" required value={customer?.name}/><Field label="Customer email" name="email" type="email" value={customer?.email}/><Field label="Phone" name="phone" type="tel" value={customer?.phone}/><Status value={customer?.status}/><label className="check-setting"><input type="checkbox" name="email_reports_enabled" defaultChecked={customer?.email_reports_enabled}/>Enable service report emails for this client</label><button className="btn btn-primary">{customer?'Save client':'Add client'}</button></form>;}
export default async function Customers({searchParams}:{searchParams:Promise<{message?:string}>}) {
 const {db}=await requireManager();const {message}=await searchParams;
 const {data,error}=await db.from('customers').select('id,name,email,phone,status,email_reports_enabled').order('name');
 if(error)throw new Error('Unable to load clients');
 return <><Heading title="Clients" description="Manage service contacts. Inactivate a client to preserve their history."/><div className="header-actions mb-5"><Link href="/pools" className="btn btn-secondary">Properties & pools →</Link></div><Feedback message={message}/><Panel title="New client"><CustomerForm/></Panel><Panel title="Your clients"><div className="records">{data?.length?data.map(c=><details className="record" key={c.id}><summary>{c.name} · {c.status==='active'?'Active':'Inactive'}</summary><CustomerForm customer={c}/><Link href={'/history?customer_id='+c.id} className="btn btn-secondary mt-4">Visit history</Link></details>):<p>No clients yet.</p>}</div></Panel></>;
}
