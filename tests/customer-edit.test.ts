import {describe,it,expect,vi,afterEach} from 'vitest';
import {customerEditPayload,scheduleTerms} from '../src/lib/customer-edit';
import {bundleSchema} from '../src/lib/onboarding';
import {validationFieldLabel,customerValidationMessage} from '../src/lib/customer-errors';
const id='a0000000-0000-4000-8000-000000000001';
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

describe('customer changes independent of service schedules',()=>{
 function initial(){const b=bundleSchema.parse(bundle());b.customer.id=id;b.properties[0].id=id;b.properties[0].schedules[0].id=id;return b;}
 it('omits unchanged schedules for contact, name, price and address edits without mutating input',()=>{for(const field of ['phone','name','price','address']){const original=initial(),edited=structuredClone(original);if(field==='phone')edited.customer.phone='555-0101';if(field==='name')edited.customer.first_name='Changed';if(field==='price')edited.agreement.price_cents=17000;if(field==='address')edited.properties[0].address='Fictional changed address';const payload=customerEditPayload(edited,original);expect(payload.properties[0].schedules).toEqual([]);expect(edited.properties[0].schedules).toHaveLength(1);}});
 it('compares weekdays semantically, preserves actual day/technician/date/note changes and new schedules',()=>{const original=initial(),edited=structuredClone(original);edited.properties[0].schedules[0].days_of_week.reverse();expect(scheduleTerms(edited.properties[0].schedules[0])).toBe(scheduleTerms(original.properties[0].schedules[0]));expect(customerEditPayload(edited,original).properties[0].schedules).toEqual([]);edited.properties[0].schedules[0].days_of_week=[2];expect(customerEditPayload(edited,original).properties[0].schedules).toHaveLength(1);delete edited.properties[0].schedules[0].id;expect(customerEditPayload(edited,original).properties[0].schedules).toHaveLength(1);});
 it('retains all schedules for new customer activation and rejects invalid names/dates/weekdays',()=>{const b=bundleSchema.parse(bundle());expect(customerEditPayload(b)).toEqual(b);b.customer.first_name='x'.repeat(100);b.customer.last_name='extra';expect(bundleSchema.safeParse(b).success).toBe(false);b.customer.first_name='Test';b.properties[0].schedules[0].days_of_week=[5,5];expect(bundleSchema.safeParse(b).success).toBe(false);b.properties[0].schedules[0].days_of_week=[5];b.properties[0].schedules[0].end_on='2020-01-01';expect(bundleSchema.safeParse(b).success).toBe(false);});
 it('identifies the exact property, service and field without reflecting SQL internals',()=>{expect(validationFieldLabel('properties.0.schedules.1.days_of_week')).toBe('Property 1 → Schedule 2 → Service days');expect(customerValidationMessage('customer.email')).toContain('valid email');});
});

const apiState=vi.hoisted(()=>({role:'owner',rpc:vi.fn()}));
vi.mock('@/lib/auth',()=>({getOperator:async()=>({db:{rpc:apiState.rpc},user:{id:'owner'},profile:{role:apiState.role,organization_id:'org'}})}));
import {POST as saveCustomer} from '../src/app/api/customers/onboard/route';
afterEach(()=>{apiState.role='owner';vi.clearAllMocks();});
function request(payload:unknown){return new Request('https://app.example.test/api/customers/onboard',{method:'POST',headers:{Origin:'https://app.example.test','Content-Type':'application/json'},body:JSON.stringify(payload)});}
it('returns exact validation paths without performing a database write',async()=>{const p=bundle();p.properties[0].schedules[0].days_of_week=[];const response=await saveCustomer(request(p));expect(response.status).toBe(422);expect((await response.json()).fieldErrors[0].path).toBe('properties.0.schedules.0.days_of_week');expect(apiState.rpc).not.toHaveBeenCalled();});
it('maps real schedule conflicts safely and blocks technicians before RPC',async()=>{apiState.rpc.mockResolvedValueOnce({data:null,error:{code:'22023',message:'ALYS_SCHEDULE_CONFLICT',details:'ALYS_FIELD:properties.0.schedules.0.days_of_week'}});const result=await saveCustomer(request(bundle()));expect(result.status).toBe(422);expect((await result.json()).fieldErrors[0].path).toBe('properties.0.schedules.0.days_of_week');apiState.role='technician';apiState.rpc.mockClear();expect((await saveCustomer(request(bundle()))).status).toBe(403);expect(apiState.rpc).not.toHaveBeenCalled();});
it('never reflects unknown SQL details or submitted private values into the error',async()=>{apiState.rpc.mockResolvedValueOnce({data:null,error:{code:'22023',message:'Private database constraint',details:'private@example.test'}});const response=await saveCustomer(request(bundle()));expect(JSON.stringify(await response.json())).not.toMatch(/private@example.test|Private database constraint/);});

import {nextCustomerSubmission} from '../src/lib/customer-edit';
it('retains the original request ID after uncertain acceptance even if fields change; rotates only after a definite rejection',()=>{const makeId=vi.fn().mockReturnValueOnce('first').mockReturnValueOnce('second');const first=nextCustomerSubmission('original',null,makeId);expect(nextCustomerSubmission('original',first,makeId)).toBe(first);first.uncertain=true;expect(nextCustomerSubmission('edited',first,makeId).id).toBe('first');first.rejected=true;expect(nextCustomerSubmission('edited',first,makeId).id).toBe('first');const rejected={...first,uncertain:false};expect(nextCustomerSubmission('edited',rejected,makeId).id).toBe('second');});
